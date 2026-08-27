import { GoogleGenAI } from '@google/genai';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { normalizeIdentifier, normalizeText } from '../utils/normalize';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    throw new Error('❌ GEMINI_API_KEY não encontrada nas variáveis de ambiente.');
}

const ai = new GoogleGenAI({ apiKey });

export class FeedbackService {
    static async register(params: {
        tenantId: string;
        userId: string;
        query: string;
        resultPartId: string;
        correct: boolean;
        correctedPartId?: string;
        pnc?: string;
    }) {
        const { tenantId, userId, query, resultPartId, correct, correctedPartId, pnc } = params;

        const resultPart = await prisma.part.findFirst({
            where: {
                id: resultPartId,
                document: { tenantId, archivedAt: null },
            },
            include: {
                document: { select: { filename: true } },
            },
        });

        if (!resultPart) {
            throw new Error('A peça avaliada não pertence a esta empresa.');
        }

        let correctedPart = null;
        if (correctedPartId) {
            correctedPart = await prisma.part.findFirst({
                where: {
                    id: correctedPartId,
                    document: { tenantId, archivedAt: null },
                },
                include: {
                    document: { select: { filename: true } },
                },
            });

            if (!correctedPart) {
                throw new Error('A peça correta selecionada não pertence a esta empresa.');
            }
        }

        const embeddingResult = await ai.models.embedContent({
            model: 'gemini-embedding-001',
            contents: query,
            config: {
                outputDimensionality: 768,
                taskType: 'RETRIEVAL_QUERY',
            },
        });

        const embedding = embeddingResult.embeddings?.[0]?.values;
        if (!embedding || embedding.length !== 768) {
            throw new Error('Falha ao gerar embedding do feedback.');
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
                correctedPartId: correctedPart?.id,
            },
        });

        const vectorString = `[${embedding.join(',')}]`;
        await prisma.$executeRaw(Prisma.sql`
            UPDATE "SearchFeedback"
            SET "queryEmbedding" = ${vectorString}::vector
            WHERE "id" = ${feedback.id}
        `);

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
}
