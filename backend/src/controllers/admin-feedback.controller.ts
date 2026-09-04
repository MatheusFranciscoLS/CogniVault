import { Response } from 'express';
import { prisma } from '../config/prisma';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { normalizeText } from '../utils/normalize';
import { invalidateSearchFeedbackCache } from '../services/part-search.service';

export class AdminFeedbackController {
    async list(req: AuthenticatedRequest, res: Response): Promise<void> {
        try {
            if (!req.user) return;
            const tenantId = req.user.tenantId;

            const [feedback, dbTotal, dbPositive, dbCorrected] = await Promise.all([
                prisma.searchFeedback.findMany({
                    where: { tenantId },
                    orderBy: { createdAt: 'desc' },
                    take: 1000,
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
                }),
                prisma.searchFeedback.count({ where: { tenantId } }),
                prisma.searchFeedback.count({ where: { tenantId, correct: true } }),
                prisma.searchFeedback.count({ where: { tenantId, correct: false, correctedPartId: { not: null } } }),
            ]);

            const total = dbTotal;
            const correct = dbPositive;
            const corrected = dbCorrected;
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

            const categories: Array<{
                keywords: string[];
                excludeKeywords?: string[];
                templates: string[];
            }> = [
                {
                    keywords: ['filtro de ar', 'filtro ar', 'air filter', 'airfilter', 'elemento filtrante'],
                    templates: ['filtro de ar da {model}', 'qual o código do filtro de ar da {model}', 'elemento filtrante {model}'],
                },
                {
                    keywords: ['filtro de combustivel', 'filtro combustível', 'filtro combustivel', 'fuel filter', 'pescador de combustivel', 'pescador'],
                    templates: ['filtro de combustível da {model}', 'qual o filtro de combustivel da {model}', 'pescador de combustível {model}'],
                },
                {
                    keywords: ['vela de ignicao', 'vela de ignição', 'vela ignicao', 'spark plug', 'bujia', 'bujía'],
                    templates: ['vela de ignição da {model}', 'qual a vela da {model}', 'vela de ignição {model}'],
                },
                {
                    keywords: ['cachimbo da vela', 'caximbo da vela', 'cachimbo', 'caximbo', 'spark plug cap', 'terminal da vela'],
                    templates: ['caximbo da vela {model}', 'cachimbo da vela da {model}', 'terminal da vela {model}'],
                },
                {
                    keywords: ['carburador', 'carburettor', 'carburetor'],
                    excludeKeywords: ['reparo', 'kit', 'membrana', 'diafragma', 'junta'],
                    templates: ['qual o código do carburador da {model}', 'carburador completo da {model}', 'carburador {model}'],
                },
                {
                    keywords: ['kit membrana', 'kit de reparo', 'diafragma', 'diaphragm', 'reparo do carburador', 'reparo carburador', 'membrana'],
                    templates: ['kit de reparo do carburador {model}', 'membrana do carburador {model}', 'kit reparo carburador da {model}'],
                },
                {
                    keywords: ['purge', 'primer', 'purga', 'bulbo', 'cebolinha', 'pera injetora'],
                    templates: ['cebolinha da {model}', 'pera injetora {model}', 'bulbo primer da {model}'],
                },
                {
                    keywords: ['cilindro', 'cylinder'],
                    excludeKeywords: ['parafuso', 'screw', 'junta', 'gasket'],
                    templates: ['cilindro da {model}', 'kit cilindro {model}', 'qual o cilindro da {model}'],
                },
                {
                    keywords: ['pistao', 'pistão', 'piston'],
                    excludeKeywords: ['anel', 'ring', 'segmento'],
                    templates: ['pistão da {model}', 'qual o código do pistão da {model}', 'conjunto do pistão {model}'],
                },
                {
                    keywords: ['anel de segmento', 'piston ring', 'anel do pistao', 'anel do pistão', 'segmento do pistao'],
                    templates: ['anel de segmento {model}', 'anel do pistão da {model}'],
                },
                {
                    keywords: ['sabre', 'guide bar', 'barra guia', 'barra-guia', 'espada'],
                    templates: ['sabre da {model}', 'qual o sabre da {model}', 'espada da {model}'],
                },
                {
                    keywords: ['corrente', 'chain', 'saw chain'],
                    excludeKeywords: ['tampa', 'cover', 'freio', 'brake', 'tensor', 'guia'],
                    templates: ['corrente da {model}', 'corrente de corte {model}', 'qual a corrente da {model}'],
                },
                {
                    keywords: ['pinhao', 'pinhão', 'sprocket', 'rim'],
                    templates: ['pinhão da {model}', 'pinhão rim da {model}', 'pinhao spur da {model}'],
                },
                {
                    keywords: ['carretel', 'cabeçote de nylon', 'cabecote de nylon', 'trimmer head', 'cabecote de corte', 'cabeçote de corte'],
                    templates: ['carretel de nylon {model}', 'cabeçote de corte da {model}', 'carretel da {model}'],
                },
                {
                    keywords: ['lamina', 'lâmina', 'blade', 'faca'],
                    excludeKeywords: ['suporte', 'adaptador', 'parafuso', 'flange', 'copo'],
                    templates: ['lâmina de corte {model}', 'faca de corte da {model}'],
                },
                {
                    keywords: ['copo', 'copinho', 'blade cup', 'support cup', 'prato de apoio'],
                    templates: ['copinho da lâmina {model}', 'copo de proteção da lâmina {model}', 'copinho {model}'],
                },
                {
                    keywords: ['flange', 'drive disc', 'support flange', 'acionador'],
                    templates: ['flange da lâmina {model}', 'flange dentada {model}'],
                },
                {
                    keywords: ['corda', 'rope', 'starter cord', 'cordinha'],
                    excludeKeywords: ['mola', 'spring', 'polia', 'pulley', 'tampa'],
                    templates: ['cordinha de puxar {model}', 'corda de arranque da {model}', 'cordinha da partida {model}'],
                },
                {
                    keywords: ['starter assy', 'starter assembly', 'recoil starter', 'partida retratil', 'partida retrátil', 'arranque completo', 'tampa de partida'],
                    templates: ['tampa da cordinha {model}', 'conjunto de partida {model}', 'arranque completo da {model}'],
                },
                {
                    keywords: ['mola de partida', 'recoil spring', 'mola do arranque', 'starter spring', 'mola retratil'],
                    templates: ['mola de partida {model}', 'mola de recuo da {model}'],
                },
                {
                    keywords: ['embreagem', 'clutch', 'embraiagem'],
                    excludeKeywords: ['mola', 'spring', 'parafuso', 'screw', 'tambor', 'drum'],
                    templates: ['embreagem da {model}', 'conjunto da embreagem {model}', 'patim de embreagem {model}'],
                },
                {
                    keywords: ['correia', 'belt', 'drive belt', 'deck belt'],
                    templates: ['correia de corte da {model}', 'correia do deck {model}'],
                },
                {
                    keywords: ['volute', 'scroll', 'caracol', 'voluta', 'blower housing'],
                    templates: ['caracol do {model}', 'voluta do soprador {model}'],
                },
                {
                    keywords: ['chain tensioner', 'chain adjuster', 'esticador da corrente', 'tensor da corrente', 'parafuso esticador'],
                    templates: ['esticador da corrente {model}', 'tensor de corrente da {model}'],
                },
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
                take: 50000,
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

            const toCreate: Array<{
                tenantId: string;
                userId: string;
                query: string;
                normalizedQuery: string;
                model: string;
                normalizedModel: string;
                pnc: string | null;
                normalizedPnc: string | null;
                resultPartId: string;
                correct: boolean;
                reason: string;
            }> = [];

            for (const [modelNorm, modelParts] of partsByModel.entries()) {
                const displayModel = modelParts[0].model || modelNorm.toUpperCase();

                for (const cat of categories) {
                    const matchedPart = modelParts.find((p) => {
                        const norm = (p.normalizedName || p.name || '').toLowerCase();
                        const matchesKeyword = cat.keywords.some((kw) => norm.includes(kw));
                        if (!matchesKeyword) return false;
                        if (cat.excludeKeywords && cat.excludeKeywords.some((ex) => norm.includes(ex))) {
                            return false;
                        }
                        return true;
                    });

                    if (!matchedPart) continue;

                    for (const template of cat.templates) {
                        const queryText = template.replace('{model}', displayModel);
                        const normQ = normalizeText(queryText);
                        const key = `${normQ}|${matchedPart.id}`;

                        if (existingSet.has(key)) continue;

                        toCreate.push({
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
                        });
                        existingSet.add(key);
                    }
                }
            }

            let createdCount = 0;
            if (toCreate.length > 0) {
                const batchSize = 200;
                for (let i = 0; i < toCreate.length; i += batchSize) {
                    const chunk = toCreate.slice(i, i + batchSize);
                    const res = await prisma.searchFeedback.createMany({
                        data: chunk,
                        skipDuplicates: true,
                    });
                    createdCount += res.count;
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
