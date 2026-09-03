import { Response } from 'express';
import { prisma } from '../config/prisma';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { normalizeText } from '../utils/normalize';
import { invalidateSearchFeedbackCache } from '../services/part-search.service';

export class AdminFeedbackController {
    async list(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            if (!req.user) return;

            const feedback = await prisma.searchFeedback.findMany({
                where: { tenantId: req.user.tenantId },
                orderBy: { createdAt: 'desc' },
                take: 200,
                select: {
                    id: true,
                    query: true,
                    normalizedQuery: true,
                    correct: true,
                    reason: true,
                    pnc: true,
                    resultPartId: true,
                    correctedPartId: true,
                    createdAt: true,
                    user: { select: { id: true, email: true } },
                    resultPart: { select: { name: true, partNumber: true, model: true } },
                    correctedPart: { select: { name: true, partNumber: true, model: true } },
                },
            });

            const total = feedback.length;
            const correct = feedback.filter((item) => item.correct).length;
            const corrected = feedback.filter((item) => !item.correct && item.correctedPartId).length;
            const uniqueSignals = new Set(feedback.map((item) => [
                item.user?.id || `legacy:${item.id}`,
                item.normalizedQuery,
                item.resultPartId,
                item.correctedPartId || '',
                item.correct ? '1' : '0',
            ].join('|'))).size;
            const learningLevel = uniqueSignals >= 20 ? 'ESTABLISHED' : uniqueSignals >= 5 ? 'LEARNING' : 'COLD_START';
            const reasons = feedback.reduce<Record<string, number>>((acc, item) => {
                if (item.reason) acc[item.reason] = (acc[item.reason] || 0) + 1;
                return acc;
            }, {});

            res.json({
                summary: {
                    total,
                    uniqueSignals,
                    positive: correct,
                    corrected,
                    negativeWithoutCorrection: total - correct - corrected,
                    accuracy: total ? correct / total : null,
                    reasons,
                    learningLevel,
                    nextMilestone: learningLevel === 'COLD_START' ? 5 : learningLevel === 'LEARNING' ? 20 : null,
                },
                feedback,
            });
        } catch (error) {
            console.error('❌ Erro ao listar histórico de feedback:', error);
            res.status(500).json({ error: 'Não foi possível carregar a lista de feedbacks.' });
        }
    }

    async delete(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            if (!req.user) return;
            const id = String(req.params.id);
            const item = await prisma.searchFeedback.findFirst({
                where: { id, tenantId: req.user.tenantId },
            });
            if (!item) {
                res.status(404).json({ error: 'Feedback não encontrado.' });
                return;
            }
            await prisma.searchFeedback.delete({ where: { id } });
            invalidateSearchFeedbackCache(req.user.tenantId);
            res.json({ message: 'Feedback removido com sucesso.' });
        } catch (error) {
            console.error('❌ Erro ao remover feedback:', error);
            res.status(500).json({ error: 'Não foi possível remover o feedback.' });
        }
    }

    async seedKnowledge(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            if (!req.user) return;
            const tenantId = req.user.tenantId;
            const userId = req.user.id;

            const categories = [
                { keywords: ['carburador', 'carburettor', 'carburetor'], template: 'qual o código do carburador da {model}' },
                { keywords: ['filtro de ar', 'filtro ar', 'air filter'], template: 'filtro de ar da {model}' },
                { keywords: ['vela', 'spark plug', 'ignicao', 'ignição'], template: 'vela de ignição {model}' },
                { keywords: ['filtro de combustivel', 'filtro combustivel', 'fuel filter'], template: 'filtro de combustível da {model}' },
                { keywords: ['pistao', 'pistão', 'piston'], template: 'pistão da {model}' },
                { keywords: ['anel de segmento', 'piston ring'], template: 'anel de segmento {model}' },
                { keywords: ['sabre', 'barra', 'bar'], template: 'sabre da {model}' },
                { keywords: ['corrente', 'chain'], template: 'corrente da {model}' },
                { keywords: ['lamina', 'lâmina', 'blade'], template: 'lâmina de corte {model}' },
                { keywords: ['correia', 'belt'], template: 'correia de corte da {model}' },
                { keywords: ['partida', 'starter', 'arranque', 'corda'], template: 'mola de partida {model}' },
                { keywords: ['embreagem', 'clutch'], template: 'embreagem da {model}' },
            ];

            const parts = await prisma.part.findMany({
                where: {
                    active: true,
                    document: { tenantId, archivedAt: null, status: 'COMPLETED' },
                },
                select: {
                    id: true,
                    name: true,
                    normalizedName: true,
                    partNumber: true,
                    model: true,
                    normalizedModel: true,
                    pnc: true,
                    normalizedPnc: true,
                },
                take: 2500,
            });

            if (!parts.length) {
                res.status(400).json({ error: 'Nenhuma peça ativa encontrada nos catálogos deste tenant.' });
                return;
            }

            const partsByModel = new Map<string, typeof parts>();
            for (const part of parts) {
                if (!part.normalizedModel || part.normalizedModel.length < 2) continue;
                const list = partsByModel.get(part.normalizedModel) || [];
                list.push(part);
                partsByModel.set(part.normalizedModel, list);
            }

            const existingFeedbacks = await prisma.searchFeedback.findMany({
                where: { tenantId },
                select: { normalizedQuery: true, resultPartId: true },
            });
            const existingSet = new Set(existingFeedbacks.map((f) => `${f.normalizedQuery}|${f.resultPartId}`));

            let createdCount = 0;
            for (const [modelNorm, modelParts] of partsByModel.entries()) {
                const displayModel = modelParts[0].model || modelNorm.toUpperCase();

                for (const cat of categories) {
                    const matchedPart = modelParts.find((p) => {
                        const norm = (p.normalizedName || p.name || '').toLowerCase();
                        return cat.keywords.some((kw) => norm.includes(kw));
                    });

                    if (!matchedPart) continue;

                    const queryText = cat.template.replace('{model}', displayModel);
                    const normQ = normalizeText(queryText);
                    const key = `${normQ}|${matchedPart.id}`;

                    if (existingSet.has(key)) continue;

                    await prisma.searchFeedback.create({
                        data: {
                            tenantId,
                            userId,
                            query: queryText,
                            normalizedQuery: normQ,
                            model: matchedPart.model,
                            normalizedModel: matchedPart.normalizedModel,
                            pnc: matchedPart.pnc,
                            normalizedPnc: matchedPart.normalizedPnc,
                            resultPartId: matchedPart.id,
                            correct: true,
                            reason: 'TREINAMENTO_INICIAL',
                        },
                    });
                    existingSet.add(key);
                    createdCount += 1;
                }
            }

            invalidateSearchFeedbackCache(tenantId);

            res.json({
                message: `Treinamento realizado com sucesso: ${createdCount} novos sinais de alta relevância registrados.`,
                createdCount,
            });
        } catch (error) {
            console.error('❌ Erro ao semear aprendizado:', error);
            res.status(500).json({ error: 'Não foi possível semear o aprendizado da busca.' });
        }
    }
}
