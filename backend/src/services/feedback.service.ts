import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { GEMINI_EMBEDDING_MODEL, getGeminiClient } from '../config/gemini';
import { normalizeIdentifier, normalizeText } from '../utils/normalize';
import { invalidateSearchFeedbackCache } from './part-search.service';

export class FeedbackService {
    static async register(params: {
        tenantId: string;
        userId: string;
        query: string;
        resultPartId: string;
        correct: boolean;
        correctedPartId?: string;
        pnc?: string;
        reason?: string;
    }) {
        const { tenantId, userId, query, resultPartId, correct, correctedPartId, pnc, reason } = params;

        const resultPart = await prisma.part.findFirst({
            where: { id: resultPartId, active: true, document: { tenantId, archivedAt: null } },
            include: { document: { select: { filename: true } } },
        });

        if (!resultPart) throw new Error('A peça avaliada não pertence a esta empresa.');

        let correctedPart = null;
        if (correctedPartId) {
            correctedPart = await prisma.part.findFirst({
                where: { id: correctedPartId, active: true, document: { tenantId, archivedAt: null } },
                include: { document: { select: { filename: true } } },
            });
            if (!correctedPart) throw new Error('A peça correta selecionada não pertence a esta empresa.');
        }

        const effectiveModel = correctedPart?.model || resultPart.model;
        const effectiveNormalizedModel = correctedPart?.normalizedModel || resultPart.normalizedModel;
        const effectivePnc = pnc?.trim() || correctedPart?.pnc || resultPart.pnc;

        const feedback = await prisma.searchFeedback.create({
            data: {
                tenantId,
                userId,
                query,
                normalizedQuery: normalizeText(query),
                model: effectiveModel,
                normalizedModel: effectiveNormalizedModel,
                pnc: effectivePnc,
                normalizedPnc: normalizeIdentifier(effectivePnc),
                resultPartId,
                correct,
                reason,
                correctedPartId: correctedPart?.id,
            },
        });

        invalidateSearchFeedbackCache(tenantId);

        // O voto é o dado importante e já está salvo. O embedding é apenas uma
        // otimização opcional; quota/indisponibilidade do Gemini nunca pode
        // impedir o registro do feedback do balcão.
        if (this.semanticFeedbackEnabled()) {
            void this.attachOptionalEmbedding(feedback.id, query).catch((error) => {
                console.warn('⚠️ Feedback salvo sem embedding opcional.', error instanceof Error ? error.message : error);
            });
        }

        return {
            feedbackId: feedback.id,
            correctedPart: correctedPart ? {
                id: correctedPart.id,
                name: correctedPart.name,
                partNumber: correctedPart.partNumber,
                model: correctedPart.model,
                pnc: correctedPart.universalAcrossPnc ? 'Qualquer um' : (correctedPart.pnc || 'Não informado'),
                section: correctedPart.section,
                position: correctedPart.position,
                page: correctedPart.page,
                documentId: correctedPart.documentId,
                filename: correctedPart.document.filename,
            } : undefined,
        };
    }

    static async update(params: {
        tenantId: string;
        userId: string;
        feedbackId: string;
        correctedPartId?: string;
        reason?: string;
    }) {
        const feedback = await prisma.searchFeedback.findFirst({
            where: { id: params.feedbackId, tenantId: params.tenantId, userId: params.userId },
        });
        if (!feedback) throw new Error('Feedback não encontrado para este usuário.');

        let correctedPart = null;
        if (params.correctedPartId) {
            correctedPart = await prisma.part.findFirst({
                where: {
                    id: params.correctedPartId,
                    active: true,
                    document: { tenantId: params.tenantId, archivedAt: null },
                },
                include: { document: { select: { filename: true } } },
            });
            if (!correctedPart) throw new Error('A peça correta selecionada não pertence a esta empresa.');
        }

        await prisma.searchFeedback.update({
            where: { id: feedback.id },
            data: {
                reason: params.reason ?? feedback.reason,
                correctedPartId: correctedPart?.id ?? feedback.correctedPartId,
                ...(correctedPart ? {
                    model: correctedPart.model,
                    normalizedModel: correctedPart.normalizedModel,
                    pnc: correctedPart.pnc,
                    normalizedPnc: correctedPart.normalizedPnc,
                } : {}),
            },
        });

        return {
            feedbackId: feedback.id,
            correctedPart: correctedPart ? {
                id: correctedPart.id,
                name: correctedPart.name,
                partNumber: correctedPart.partNumber,
                model: correctedPart.model,
                pnc: correctedPart.universalAcrossPnc ? 'Qualquer um' : (correctedPart.pnc || 'Não informado'),
                section: correctedPart.section,
                position: correctedPart.position,
                page: correctedPart.page,
                documentId: correctedPart.documentId,
                filename: correctedPart.document.filename,
            } : undefined,
        };
    }

    private static semanticFeedbackEnabled(): boolean {
        // A pontuação de aprendizado usa sinais estruturados e não consulta este
        // vetor hoje. Mantê-lo separado evita custo sem benefício quando a busca
        // semântica de peças estiver habilitada.
        return ['1', 'true', 'yes', 'on'].includes((process.env.ENABLE_FEEDBACK_EMBEDDINGS || 'false').trim().toLowerCase());
    }

    private static async attachOptionalEmbedding(feedbackId: string, query: string): Promise<void> {
        const ai = await getGeminiClient();
        const embeddingResult = await ai.models.embedContent({
            model: GEMINI_EMBEDDING_MODEL,
            contents: query,
            config: { outputDimensionality: 768, taskType: 'RETRIEVAL_QUERY' },
        });
        const embedding = embeddingResult.embeddings?.[0]?.values;
        if (!embedding || embedding.length !== 768) throw new Error('Embedding de feedback inválido.');
        const vectorString = `[${embedding.join(',')}]`;
        await prisma.$executeRaw(Prisma.sql`
            UPDATE "SearchFeedback"
            SET "queryEmbedding" = ${vectorString}::vector
            WHERE "id" = ${feedbackId}
        `);
    }
}
