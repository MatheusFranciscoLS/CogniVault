import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { normalizeIdentifier, normalizeText } from '../utils/normalize';
import { LRUCache } from 'lru-cache';
import { buildFallbackIntent } from '../services/chat-reliability';
import { buildSearchGroups, scorePartText } from '../services/part-vocabulary';
import { allRelatedPartNumbers, preferCurrentPartNumbers } from '../services/part-supersession';
import { filterCandidatesByMarket } from '../services/catalog-market';

const homeCountsCache = new LRUCache<string, { parts: number; documents: number }>({
    max: 200,
    ttl: 30 * 1000, // 30 seconds
});

export function invalidateHomeCountsCache(tenantId?: string): void {
    if (tenantId) {
        homeCountsCache.delete(tenantId);
    } else {
        homeCountsCache.clear();
    }
}

export class OperationalController {
    async home(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!req.user) return;
        const { tenantId, id: userId } = req.user;

        try {
            let counts = homeCountsCache.get(tenantId);
            if (!counts) {
                const [parts, documents] = await Promise.all([
                    prisma.part.count({ where: { active: true, document: { tenantId, archivedAt: null, status: 'COMPLETED' } } }),
                    prisma.document.count({ where: { tenantId, archivedAt: null, status: 'COMPLETED' } }),
                ]);
                counts = { parts, documents };
                homeCountsCache.set(tenantId, counts);
            }

            const [recentSearches, favorites, recentDocuments] = await Promise.all([
                prisma.searchHistory.findMany({ where: { tenantId, userId }, orderBy: { createdAt: 'desc' }, take: 6 }),
                prisma.favorite.findMany({ where: { tenantId, userId }, orderBy: { createdAt: 'desc' }, take: 6 }),
                prisma.document.findMany({ where: { tenantId, archivedAt: null, status: 'COMPLETED' }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, filename: true, manufacturer: true, model: true, pnc: true, createdAt: true, _count: { select: { parts: { where: { active: true } } } } } }),
            ]);

            res.json({
                home: {
                    counts,
                    recentSearches,
                    favorites,
                    recentDocuments: recentDocuments.map((item) => ({ ...item, partCount: item._count.parts, _count: undefined })),
                },
            });
        } catch (error) {
            console.error('❌ Erro na consulta do painel inicial:', error);
            res.status(500).json({ error: 'Não foi possível carregar as informações do painel inicial.' });
        }
    }

    async search(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!req.user) return;
        const q = String(req.query.q || '').trim();
        if (q.length < 2) {
            res.json({ parts: [], documents: [] });
            return;
        }

        try {

        const normalized = normalizeText(q);
        const identifier = normalizeIdentifier(q);
        const relatedCodes = identifier ? allRelatedPartNumbers(identifier).map(normalizeIdentifier).filter(Boolean) : [];
        const tenantId = req.user.tenantId;
        const intent = buildFallbackIntent(q);
        const normalizedModel = normalizeIdentifier(intent.model);
        const normalizedManufacturer = normalizeIdentifier(intent.manufacturer);
        const normalizedPnc = normalizeIdentifier(intent.pnc);
        const groups = intent.partNumber ? [] : buildSearchGroups(q, [intent.manufacturer, intent.model, intent.pnc]);

        const descriptiveFilters: Prisma.PartWhereInput[] = groups.map(group => ({
            OR: group.variants.flatMap(variant => [
                { normalizedName: { contains: variant } },
                { searchText: { contains: variant, mode: 'insensitive' as const } },
            ]),
        }));
        if (normalizedManufacturer) descriptiveFilters.push({ OR: [{ normalizedManufacturer }, { normalizedManufacturer: null }] });
        if (normalizedPnc) descriptiveFilters.push({ OR: [{ normalizedPnc }, { universalAcrossPnc: true }] });

        const partWhere: Prisma.PartWhereInput = {
            active: true,
            document: { tenantId, archivedAt: null, status: 'COMPLETED' },
            ...(groups.length ? {
                ...(normalizedModel ? { normalizedModel } : {}),
                AND: descriptiveFilters,
            } : {
                OR: [
                    { partNumber: { contains: q, mode: 'insensitive' } },
                    ...(normalized ? [{ normalizedName: { contains: normalized } }] : []),
                    ...(relatedCodes.length ? [{ normalizedPartNumber: { in: relatedCodes } }] : (identifier ? [{ normalizedPartNumber: { contains: identifier } }] : [])),
                    ...(identifier ? [
                        { normalizedModel: { contains: identifier } },
                        { normalizedPnc: { contains: identifier } },
                    ] : []),
                    ...(normalizedModel ? [{ normalizedModel: { contains: normalizedModel } }] : []),
                    ...(normalizedManufacturer ? [{ normalizedManufacturer: { contains: normalizedManufacturer } }] : []),
                    ...(normalizedPnc ? [{ normalizedPnc: { contains: normalizedPnc } }] : []),
                ],
            }),
        };

        const [parts, documents] = await Promise.all([
            prisma.part.findMany({
                where: partWhere,
                orderBy: [{ model: 'asc' }, { name: 'asc' }],
                take: 200,
                select: {
                    id: true, name: true, partNumber: true, manufacturer: true, model: true, pnc: true,
                    universalAcrossPnc: true, section: true, position: true, page: true, documentId: true,
                    normalizedName: true, normalizedPartNumber: true, normalizedModel: true, normalizedPnc: true,
                    alternativeNames: true, notes: true,
                    document: { select: { filename: true } },
                },
            }),
            prisma.document.findMany({
                where: {
                    tenantId, archivedAt: null, status: 'COMPLETED',
                    OR: [
                        { filename: { contains: q, mode: 'insensitive' } },
                        { manufacturer: { contains: q, mode: 'insensitive' } },
                        { model: { contains: q, mode: 'insensitive' } },
                        { pnc: { contains: q, mode: 'insensitive' } },
                        ...(intent.manufacturer ? [{ manufacturer: { contains: intent.manufacturer, mode: 'insensitive' as const } }] : []),
                        ...(intent.model ? [{ model: { contains: intent.model, mode: 'insensitive' as const } }] : []),
                        ...(intent.pnc ? [{ pnc: { contains: intent.pnc, mode: 'insensitive' as const } }] : []),
                    ],
                },
                orderBy: { createdAt: 'desc' },
                take: 12,
                select: { id: true, filename: true, manufacturer: true, model: true, pnc: true, createdAt: true, _count: { select: { parts: { where: { active: true } } } } },
            }),
        ]);

        const marketFiltered = filterCandidatesByMarket(parts);
        const resolvedParts = preferCurrentPartNumbers(marketFiltered);

        const seen = new Set<string>();
        const rankedParts = resolvedParts
            .map(part => {
                let score = groups.length ? scorePartText(q, { name: part.name, section: part.section, aliases: part.alternativeNames, notes: part.notes }) : 0;
                if (identifier && part.normalizedPartNumber === identifier) score += 1000;
                else if (relatedCodes.length && relatedCodes.includes(part.normalizedPartNumber)) score += 800;
                if (normalizedModel && part.normalizedModel === normalizedModel) score += 200;
                if (normalizedPnc && part.normalizedPnc === normalizedPnc) score += 150;
                return { part, score };
            })
            .sort((a, b) => b.score - a.score || a.part.name.localeCompare(b.part.name, 'pt-BR'))
            .filter(({ part }) => {
                const identity = `${part.normalizedPartNumber}|${part.normalizedModel}|${part.universalAcrossPnc ? '*' : (part.normalizedPnc || '')}`;
                if (seen.has(identity)) return false;
                seen.add(identity);
                return true;
            })
            .slice(0, 40)
            .map(({ part }) => {
                const { document, normalizedName: _normalizedName, normalizedPartNumber: _normalizedPartNumber, normalizedModel: _normalizedModel, normalizedPnc: _normalizedPnc, alternativeNames: _alternativeNames, ...publicPart } = part;
                return { ...publicPart, filename: document.filename, pnc: part.universalAcrossPnc ? 'Qualquer um' : part.pnc };
            });

            res.json({
                parts: rankedParts,
                documents: documents.map((item) => ({ ...item, partCount: item._count.parts, _count: undefined })),
            });
        } catch (error) {
            console.error('❌ Erro na busca operacional:', error);
            res.status(500).json({ error: 'Erro ao processar a busca de peças.', parts: [], documents: [] });
        }
    }

    async part(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!req.user) return;
        const id = String(req.params.id);

        try {
            const part = await prisma.part.findFirst({
                where: { id, active: true, document: { tenantId: req.user.tenantId, archivedAt: null, status: 'COMPLETED' } },
                include: { document: { select: { id: true, filename: true, manufacturer: true, model: true, pnc: true } } },
            });
            if (!part) {
                res.status(404).json({ error: 'Peça não encontrada.' });
                return;
            }

            const relatedCodes = allRelatedPartNumbers(part.normalizedPartNumber).map(normalizeIdentifier).filter(Boolean);
            const compatibilityCodes = relatedCodes.length ? relatedCodes : [part.normalizedPartNumber];

            const [related, compatibility, favorite] = await Promise.all([
                prisma.part.findMany({
                    where: {
                        id: { not: part.id }, normalizedModel: part.normalizedModel, active: true,
                        document: { tenantId: req.user.tenantId, archivedAt: null, status: 'COMPLETED' },
                        ...(part.section ? { section: part.section } : {}),
                    },
                    take: 8,
                    select: { id: true, name: true, partNumber: true, model: true, pnc: true, section: true, position: true, page: true },
                }),
                prisma.part.findMany({
                    where: {
                        normalizedPartNumber: { in: compatibilityCodes },
                        active: true,
                        document: { tenantId: req.user.tenantId, archivedAt: null, status: 'COMPLETED' },
                    },
                    distinct: ['normalizedModel', 'normalizedPnc'],
                    take: 50,
                    select: { model: true, pnc: true, universalAcrossPnc: true },
                }),
                prisma.favorite.findFirst({ where: { userId: req.user.id, partId: part.id }, select: { id: true } }),
            ]);

            const [resolvedPart] = preferCurrentPartNumbers([part]);

            res.json({
                part: {
                    ...resolvedPart,
                    pnc: resolvedPart.universalAcrossPnc ? 'Qualquer um' : resolvedPart.pnc,
                    related,
                    compatibility: compatibility.map((item) => ({ model: item.model, pnc: item.universalAcrossPnc ? 'Qualquer um' : item.pnc })),
                    favoriteId: favorite?.id || null,
                },
            });
        } catch (error) {
            console.error(`❌ Erro ao buscar detalhe da peça ${id}:`, error);
            res.status(500).json({ error: 'Erro ao carregar detalhes da peça.' });
        }
    }

    async history(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!req.user) return;
        try {
            const history = await prisma.searchHistory.findMany({
                where: { tenantId: req.user.tenantId, userId: req.user.id },
                orderBy: { createdAt: 'desc' },
                take: 100,
            });
            res.json({ history });
        } catch (error) {
            console.error('❌ Erro ao carregar histórico:', error);
            res.status(500).json({ error: 'Erro ao carregar o histórico de buscas.', history: [] });
        }
    }

    async favorites(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!req.user) return;
        try {
            const favorites = await prisma.favorite.findMany({
                where: { tenantId: req.user.tenantId, userId: req.user.id },
                orderBy: { createdAt: 'desc' },
                take: 100,
                select: {
                    id: true,
                    kind: true,
                    label: true,
                    reference: true,
                    model: true,
                    pnc: true,
                    partId: true,
                    documentId: true,
                    createdAt: true,
                    part: {
                        select: {
                            documentId: true,
                            section: true,
                            position: true,
                            page: true,
                            document: { select: { filename: true } },
                        },
                    },
                    document: { select: { filename: true } },
                },
            });
            res.json({
                favorites: favorites.map(({ part, document, ...favorite }) => ({
                    ...favorite,
                    documentId: favorite.documentId || part?.documentId || null,
                    sourceFilename: part?.document.filename || document?.filename || null,
                    section: part?.section || null,
                    position: part?.position || null,
                    page: part?.page || null,
                })),
            });
        } catch (error) {
            console.error('❌ Erro ao carregar favoritos:', error);
            res.status(500).json({ error: 'Erro ao carregar os itens favoritos.', favorites: [] });
        }
    }

    async addFavorite(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!req.user) return;
        const { partId, documentId } = req.body;
        if ((partId && documentId) || (!partId && !documentId)) {
            res.status(400).json({ error: 'Informe uma peça ou um catálogo.' });
            return;
        }

        try {
            if (partId) {
                const part = await prisma.part.findFirst({
                    where: { id: String(partId), active: true, document: { tenantId: req.user.tenantId, archivedAt: null } },
                    include: { document: { select: { filename: true } } },
                });
                if (!part) { res.status(404).json({ error: 'Peça não encontrada.' }); return; }
                const favorite = await prisma.favorite.upsert({
                    where: { userId_partId: { userId: req.user.id, partId: part.id } },
                    update: { label: part.name, reference: part.partNumber, model: part.model, pnc: part.pnc },
                    create: { tenantId: req.user.tenantId, userId: req.user.id, kind: 'PART', label: part.name, reference: part.partNumber, model: part.model, pnc: part.pnc, partId: part.id },
                });
                res.status(201).json({ favorite });
                return;
            }

            const document = await prisma.document.findFirst({ where: { id: String(documentId), tenantId: req.user.tenantId, archivedAt: null } });
            if (!document) { res.status(404).json({ error: 'Catálogo não encontrado.' }); return; }
            const favorite = await prisma.favorite.upsert({
                where: { userId_documentId: { userId: req.user.id, documentId: document.id } },
                update: { label: document.filename, model: document.model, pnc: document.pnc },
                create: { tenantId: req.user.tenantId, userId: req.user.id, kind: 'DOCUMENT', label: document.filename, model: document.model, pnc: document.pnc, documentId: document.id },
            });
            res.status(201).json({ favorite });
        } catch (error) {
            console.error('❌ Erro ao adicionar favorito:', error);
            res.status(500).json({ error: 'Erro ao salvar favorito.' });
        }
    }

    async removeFavorite(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!req.user) return;
        try {
            const favorite = await prisma.favorite.findFirst({ where: { id: String(req.params.id), tenantId: req.user.tenantId, userId: req.user.id } });
            if (!favorite) { res.status(404).json({ error: 'Favorito não encontrado.' }); return; }
            await prisma.favorite.delete({ where: { id: favorite.id } });
            res.json({ message: 'Favorito removido.' });
        } catch (error) {
            console.error('❌ Erro ao remover favorito:', error);
            res.status(500).json({ error: 'Erro ao remover favorito.' });
        }
    }

    async notifications(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!req.user) return;
        const tenantId = req.user.tenantId;
        const isAdmin = req.user.role === 'ADMIN';
        try {
            const [documents, audits, verifications] = await Promise.all([
                prisma.document.findMany({
                    where: { tenantId, archivedAt: null, status: { in: ['FAILED', 'PROCESSING', 'PENDING'] } },
                    orderBy: { createdAt: 'desc' }, take: 8,
                    select: { id: true, filename: true, status: true, createdAt: true },
                }),
                isAdmin ? prisma.auditLog.findMany({
                    where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 12,
                    select: { id: true, action: true, targetType: true, createdAt: true, user: { select: { email: true } } },
                }) : Promise.resolve([]),
                isAdmin ? prisma.officialPartVerification.findMany({
                    where: { tenantId, approvalStatus: 'PENDING' },
                    orderBy: { createdAt: 'desc' }, take: 8,
                    select: { id: true, queriedPartNumber: true, currentPartNumber: true, status: true, user: { select: { email: true } }, createdAt: true },
                }) : Promise.resolve([]),
            ]);

            const items = [
                ...verifications.map((item) => {
                    const isSuperseded = item.status === 'SUPERSEDED' || item.queriedPartNumber.replace(/\W/g, '') !== item.currentPartNumber.replace(/\W/g, '');
                    const label = isSuperseded
                        ? `Substituição ${item.queriedPartNumber} → ${item.currentPartNumber}`
                        : `Conferência da peça ${item.queriedPartNumber}`;
                    return {
                        id: `verification-${item.id}`,
                        type: 'warning' as const,
                        title: 'Conferência pendente de aprovação',
                        description: `${label} (por ${item.user.email})`,
                        createdAt: item.createdAt,
                    };
                }),
                ...documents.map((item) => ({ id: `doc-${item.id}`, type: item.status === 'FAILED' ? 'error' as const : 'processing' as const, title: item.status === 'FAILED' ? 'Falha no processamento' : 'Catálogo em processamento', description: item.filename, createdAt: item.createdAt })),
                ...audits.map((item) => ({ id: `audit-${item.id}`, type: 'info' as const, title: item.action.replaceAll('_', ' '), description: item.user?.email || 'Sistema', createdAt: item.createdAt })),
            ].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 20);

            res.json({ notifications: items });
        } catch (error) {
            console.error('❌ Erro ao carregar notificações:', error);
            res.status(500).json({ error: 'Erro ao carregar notificações.', notifications: [] });
        }
    }
}
