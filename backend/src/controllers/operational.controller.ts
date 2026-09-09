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
import { invalidatePartSearchCaches } from '../services/part-search.service';
import { invalidateChatResponseCache } from '../services/chat.service';
import {
    resolveEngineCatalogRoute,
    findMachinesForEngine,
    findEngineApplications,
    classifyPartKind,
    getCorrelatedMaintenanceTerms,
    getBasicMaintenanceKitTerms,
} from '../services/husqvarna-domain-knowledge';

const homeCountsCache = new LRUCache<string, { parts: number; documents: number }>({
    max: 200,
    ttl: 30 * 1000, // 30 seconds
});

const homeRecentDocsCache = new LRUCache<string, any[]>({
    max: 200,
    ttl: 30 * 1000, // 30 seconds
});

interface CachedSearchResult {
    parts: any[];
    documents: any[];
}

const searchResponseCache = new LRUCache<string, CachedSearchResult>({
    max: 1000,
    ttl: 60 * 1000, // 60 seconds
});

interface CachedPartBase {
    resolvedPart: any;
    related: any[];
    compatibility: any[];
}

const partDetailCache = new LRUCache<string, CachedPartBase>({
    max: 1000,
    ttl: 2 * 60 * 1000, // 2 minutes
});

export function invalidateHomeCountsCache(tenantId?: string): void {
    if (tenantId) {
        homeCountsCache.delete(tenantId);
        homeRecentDocsCache.delete(tenantId);
        for (const key of searchResponseCache.keys()) {
            if (key.startsWith(`${tenantId}:`)) searchResponseCache.delete(key);
        }
        for (const key of partDetailCache.keys()) {
            if (key.startsWith(`${tenantId}:`)) partDetailCache.delete(key);
        }
    } else {
        homeCountsCache.clear();
        homeRecentDocsCache.clear();
        searchResponseCache.clear();
        partDetailCache.clear();
    }
    invalidatePartSearchCaches(tenantId);
    invalidateChatResponseCache(tenantId);
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

            let recentDocuments = homeRecentDocsCache.get(tenantId);
            if (!recentDocuments) {
                const docs = await prisma.document.findMany({
                    where: { tenantId, archivedAt: null, status: 'COMPLETED' },
                    orderBy: { createdAt: 'desc' },
                    take: 5,
                    select: {
                        id: true, filename: true, manufacturer: true, model: true, pnc: true, createdAt: true,
                        _count: { select: { parts: { where: { active: true } } } },
                    },
                });
                recentDocuments = docs.map((item) => ({ ...item, partCount: item._count.parts, _count: undefined }));
                homeRecentDocsCache.set(tenantId, recentDocuments);
            }

            const [recentSearches, favorites] = await Promise.all([
                prisma.searchHistory.findMany({ where: { tenantId, userId }, orderBy: { createdAt: 'desc' }, take: 6 }),
                prisma.favorite.findMany({ where: { tenantId, userId }, orderBy: { createdAt: 'desc' }, take: 6 }),
            ]);

            res.json({
                home: {
                    counts,
                    recentSearches,
                    favorites,
                    recentDocuments,
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

        const tenantId = req.user.tenantId;
        const searchCacheKey = `${tenantId}:${q.toLowerCase().trim()}`;
        const cachedSearch = searchResponseCache.get(searchCacheKey);
        if (cachedSearch) {
            res.json(cachedSearch);
            return;
        }

        try {

        const normalized = normalizeText(q);
        const intent = buildFallbackIntent(q);
        const detectedCode = intent.partNumber || '';
        const codeIdentifier = normalizeIdentifier(detectedCode);
        const fullIdentifier = normalizeIdentifier(q);
        const targetCode = codeIdentifier || fullIdentifier;
        const relatedCodes = targetCode ? allRelatedPartNumbers(targetCode).map(normalizeIdentifier).filter(Boolean) : [];
        const normalizedModel = normalizeIdentifier(intent.model);
        const normalizedManufacturer = normalizeIdentifier(intent.manufacturer);
        const normalizedPnc = normalizeIdentifier(intent.pnc);

        // Vinculação Giro Zero -> Motor Kawasaki / HS / HV: se for busca de peças internas de motor,
        // permite que a busca encontre tanto no catálogo da máquina quanto no do motor correspondente.
        const engineRoute = resolveEngineCatalogRoute(intent.model, intent.pnc, q);
        const modelFilters = [normalizedModel].filter(Boolean);
        if (engineRoute?.status === 'ROUTE' && engineRoute.engineModel) {
            const normEngine = normalizeIdentifier(engineRoute.engineModel);
            if (normEngine && !modelFilters.includes(normEngine)) {
                modelFilters.push(normEngine);
                const baseEngine = normEngine.replace(/v$/i, '');
                if (baseEngine && !modelFilters.includes(baseEngine)) {
                    modelFilters.push(baseEngine);
                }
            }
        }
        if (normalizedModel && /^(fx|fr|fs|hv|hs)\d+/i.test(normalizedModel)) {
            const base = normalizedModel.replace(/v$/i, '');
            if (base && !modelFilters.includes(base)) modelFilters.push(base);
        }

        // Isola texto descritivo removendo código e modelo identificados
        let descriptiveText = q;
        if (detectedCode) descriptiveText = descriptiveText.replace(detectedCode, ' ');
        if (intent.model) descriptiveText = descriptiveText.replace(intent.model, ' ');
        descriptiveText = descriptiveText.trim();

        const groups = descriptiveText.length >= 2
            ? buildSearchGroups(descriptiveText, [intent.manufacturer, intent.model, intent.pnc])
            : (intent.partNumber ? [] : buildSearchGroups(q, [intent.manufacturer, intent.model, intent.pnc]));

        const descriptiveFilters: Prisma.PartWhereInput[] = groups.map(group => ({
            OR: group.variants.flatMap(variant => [
                { normalizedName: { contains: variant } },
                { searchText: { contains: variant, mode: 'insensitive' as const } },
            ]),
        }));
        if (normalizedManufacturer) descriptiveFilters.push({ OR: [{ normalizedManufacturer }, { normalizedManufacturer: null }] });
        if (normalizedPnc) descriptiveFilters.push({ OR: [{ normalizedPnc }, { universalAcrossPnc: true }] });

        const modelCondition: Prisma.PartWhereInput = modelFilters.length > 1
            ? { normalizedModel: { in: modelFilters } }
            : (modelFilters.length === 1 ? { normalizedModel: modelFilters[0] } : {});

        const searchClauses: Prisma.PartWhereInput[] = [];

        // Cláusulas de código de peça (código direto ou substituições oficiais)
        if (relatedCodes.length) {
            searchClauses.push({ normalizedPartNumber: { in: relatedCodes } });
        } else if (targetCode && targetCode.length >= 5) {
            searchClauses.push({ normalizedPartNumber: { contains: targetCode } });
        }

        // Cláusulas de busca descritiva / modelo
        if (groups.length) {
            searchClauses.push({
                ...modelCondition,
                AND: descriptiveFilters,
            });
        }

        // Fallback amplo se nem código claro nem grupos descritivos foram isolados
        if (!searchClauses.length) {
            searchClauses.push({
                OR: [
                    { partNumber: { contains: q, mode: 'insensitive' } },
                    ...(normalized ? [{ normalizedName: { contains: normalized } }] : []),
                    ...(targetCode ? [{ normalizedPartNumber: { contains: targetCode } }] : []),
                    ...(modelFilters.length ? [{ normalizedModel: { in: modelFilters } }] : []),
                    ...(normalizedManufacturer ? [{ normalizedManufacturer: { contains: normalizedManufacturer } }] : []),
                    ...(normalizedPnc ? [{ normalizedPnc: { contains: normalizedPnc } }] : []),
                ],
            });
        }

        const partWhere: Prisma.PartWhereInput = {
            active: true,
            document: { tenantId, archivedAt: null, status: 'COMPLETED' },
            OR: searchClauses,
        };

        const relatedDocKeywords: string[] = [];
        const targetModelKey = intent.model || q;
        const engineApps = findEngineApplications(targetModelKey, intent.pnc);
        for (const app of engineApps) {
            if (app.engineModel && !relatedDocKeywords.includes(app.engineModel)) relatedDocKeywords.push(app.engineModel);
        }
        const machineApps = findMachinesForEngine(targetModelKey, q);
        for (const m of machineApps) {
            if (m.machineModel && !relatedDocKeywords.includes(m.machineModel)) relatedDocKeywords.push(m.machineModel);
        }

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
                        ...(descriptiveText ? [{ model: { contains: descriptiveText, mode: 'insensitive' as const } }] : []),
                        ...(relatedDocKeywords.map(keyword => ({ model: { contains: keyword, mode: 'insensitive' as const } }))),
                        ...(relatedDocKeywords.map(keyword => ({ filename: { contains: keyword, mode: 'insensitive' as const } }))),
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
                if (targetCode && part.normalizedPartNumber === targetCode) score += 1000;
                else if (relatedCodes.length && relatedCodes.includes(part.normalizedPartNumber)) score += 800;
                else if (targetCode && targetCode.length >= 5 && part.normalizedPartNumber.includes(targetCode)) score += 600;
                if (modelFilters.length && modelFilters.includes(part.normalizedModel)) score += 200;
                if (normalizedPnc && part.normalizedPnc === normalizedPnc) score += 150;
                return { part, score };
            })
            .sort((a, b) => b.score - a.score || a.part.name.localeCompare(b.part.name, 'pt-BR'))
            .filter(({ part }) => {
                const identity = `${part.normalizedPartNumber}|${part.normalizedModel}|${part.universalAcrossPnc ? '*' : (part.normalizedPnc || '')}|${normalizeText(part.section || '')}|${normalizeText(part.position || '')}`;
                if (seen.has(identity)) return false;
                seen.add(identity);
                return true;
            })
            .slice(0, 40)
            .map(({ part }) => {
                const { document, normalizedName: _normalizedName, normalizedPartNumber: _normalizedPartNumber, normalizedModel: _normalizedModel, normalizedPnc: _normalizedPnc, alternativeNames: _alternativeNames, ...publicPart } = part;
                return {
                    ...publicPart,
                    filename: document.filename,
                    pnc: part.universalAcrossPnc ? 'Qualquer um' : part.pnc,
                    classification: classifyPartKind(part.name, part.section, part.notes),
                };
            });

            const searchResponsePayload = {
                parts: rankedParts,
                documents: documents.map((item) => ({ ...item, partCount: item._count.parts, _count: undefined })),
            };
            searchResponseCache.set(searchCacheKey, searchResponsePayload);
            res.json(searchResponsePayload);
        } catch (error) {
            console.error('❌ Erro na busca operacional:', error);
            res.status(500).json({ error: 'Erro ao processar a busca de peças.', parts: [], documents: [] });
        }
    }

    async part(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!req.user) return;
        const id = String(req.params.id);
        const tenantId = req.user.tenantId;
        const detailCacheKey = `${tenantId}:${id}`;

        try {
            let cachedBase = partDetailCache.get(detailCacheKey);
            if (!cachedBase) {
                const part = await prisma.part.findFirst({
                    where: { id, active: true, document: { tenantId, archivedAt: null, status: 'COMPLETED' } },
                    include: { document: { select: { id: true, filename: true, manufacturer: true, model: true, pnc: true } } },
                });
                if (!part) {
                    res.status(404).json({ error: 'Peça não encontrada.' });
                    return;
                }

                const relatedCodes = allRelatedPartNumbers(part.normalizedPartNumber).map(normalizeIdentifier).filter(Boolean);
                const compatibilityCodes = relatedCodes.length ? relatedCodes : [part.normalizedPartNumber];

                const [related, compatibility] = await Promise.all([
                    prisma.part.findMany({
                        where: {
                            id: { not: part.id }, normalizedModel: part.normalizedModel, active: true,
                            document: { tenantId, archivedAt: null, status: 'COMPLETED' },
                            ...(part.section ? { section: part.section } : {}),
                        },
                        take: 8,
                        select: { id: true, name: true, partNumber: true, model: true, pnc: true, section: true, position: true, page: true },
                    }),
                    prisma.part.findMany({
                        where: {
                            normalizedPartNumber: { in: compatibilityCodes },
                            active: true,
                            document: { tenantId, archivedAt: null, status: 'COMPLETED' },
                        },
                        distinct: ['normalizedModel', 'normalizedPnc'],
                        take: 50,
                        select: { model: true, pnc: true, universalAcrossPnc: true },
                    }),
                ]);

                const [resolvedPart] = preferCurrentPartNumbers([part]);

                // Enriquecimento de compatibilidade cruzada Máquina <-> Motor (ex: Kawasaki FR691V -> Giro Zero Z248F / Z254F)
                const extraCompatibility: { model: string; pnc: string }[] = [];
                const engineMachines = findMachinesForEngine(part.normalizedModel);
                for (const app of engineMachines) {
                    extraCompatibility.push({
                        model: `${app.machineModel} (Giro Zero / Trator c/ motor ${part.model})`,
                        pnc: app.machinePnc || 'Chassi',
                    });
                }
                const machineEngines = findEngineApplications(part.normalizedModel);
                for (const app of machineEngines) {
                    extraCompatibility.push({
                        model: `Motor ${app.engineModel} (Equipamento original)`,
                        pnc: app.engineArticle ? `Artigo ${app.engineArticle}` : 'Motor',
                    });
                }

                const mergedCompatibility = [
                    ...compatibility.map((item) => ({ model: item.model, pnc: item.universalAcrossPnc ? 'Qualquer um' : item.pnc })),
                    ...extraCompatibility,
                ];

                cachedBase = {
                    resolvedPart,
                    related,
                    compatibility: mergedCompatibility,
                };
                partDetailCache.set(detailCacheKey, cachedBase);
            }

            const favorite = await prisma.favorite.findFirst({
                where: { userId: req.user.id, partId: id },
                select: { id: true },
            });

            const maintenanceInfo = getCorrelatedMaintenanceTerms(cachedBase.resolvedPart.name);
            let suggestedAddons: { reason: string; items: any[] } = { reason: '', items: [] };
            if (maintenanceInfo.suggestedTerms.length > 0) {
                const candidateParts = await prisma.part.findMany({
                    where: {
                        documentId: cachedBase.resolvedPart.documentId,
                        active: true,
                        id: { not: cachedBase.resolvedPart.id },
                        OR: maintenanceInfo.suggestedTerms.map(term => ({
                            name: { contains: term, mode: 'insensitive' as const },
                        })),
                    },
                    take: 6,
                    select: { id: true, name: true, partNumber: true, model: true, pnc: true, section: true, position: true, page: true },
                });
                suggestedAddons = {
                    reason: maintenanceInfo.reason,
                    items: candidateParts.map(p => ({
                        ...p,
                        classification: classifyPartKind(p.name, p.section),
                    })),
                };
            }

            res.json({
                part: {
                    ...cachedBase.resolvedPart,
                    pnc: cachedBase.resolvedPart.universalAcrossPnc ? 'Qualquer um' : cachedBase.resolvedPart.pnc,
                    classification: classifyPartKind(cachedBase.resolvedPart.name, cachedBase.resolvedPart.section, cachedBase.resolvedPart.notes),
                    suggestedAddons,
                    related: cachedBase.related.map(r => ({
                        ...r,
                        classification: classifyPartKind(r.name, r.section),
                    })),
                    compatibility: cachedBase.compatibility,
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

    async crossReference(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!req.user) return;
        const { tenantId } = req.user;
        const rawCode = String(req.params.code || '').trim();
        const code = normalizeIdentifier(rawCode);
        if (!code || code.length < 3) {
            res.status(400).json({ error: 'Código de peça inválido.' });
            return;
        }

        try {
            const relatedCodes = allRelatedPartNumbers(code).map(normalizeIdentifier).filter(Boolean);
            const searchCodes = relatedCodes.length ? relatedCodes : [code];

            const usages = await prisma.part.findMany({
                where: {
                    normalizedPartNumber: { in: searchCodes },
                    active: true,
                    document: { tenantId, archivedAt: null, status: 'COMPLETED' },
                },
                select: {
                    id: true,
                    partNumber: true,
                    name: true,
                    model: true,
                    pnc: true,
                    universalAcrossPnc: true,
                    section: true,
                    position: true,
                    page: true,
                    notes: true,
                    document: {
                        select: {
                            id: true,
                            filename: true,
                            category: { select: { name: true } },
                        },
                    },
                },
                orderBy: [{ model: 'asc' }, { section: 'asc' }],
                take: 100,
            });

            const modelMap = new Map<string, {
                model: string;
                filename: string;
                category: string;
                pncs: string[];
                sections: string[];
                usages: Array<{ id: string; partNumber: string; name: string; position: string | null; page: number | null }>;
            }>();

            for (const u of usages) {
                const key = u.model;
                let entry = modelMap.get(key);
                if (!entry) {
                    entry = {
                        model: u.model,
                        filename: u.document?.filename || '',
                        category: u.document?.category?.name || 'Geral',
                        pncs: [],
                        sections: [],
                        usages: [],
                    };
                    modelMap.set(key, entry);
                }
                const pncLabel = u.universalAcrossPnc ? 'Todos PNCs' : (u.pnc || 'PNC não esp.');
                if (!entry.pncs.includes(pncLabel)) entry.pncs.push(pncLabel);
                if (u.section && !entry.sections.includes(u.section)) entry.sections.push(u.section);
                entry.usages.push({
                    id: u.id,
                    partNumber: u.partNumber,
                    name: u.name,
                    position: u.position,
                    page: u.page,
                });
            }

            res.json({
                code: rawCode,
                totalModels: modelMap.size,
                totalUsages: usages.length,
                models: Array.from(modelMap.values()),
            });
        } catch (error) {
            console.error(`❌ Erro ao buscar referência cruzada para ${code}:`, error);
            res.status(500).json({ error: 'Erro ao buscar referência cruzada da peça.' });
        }
    }

    async maintenanceKit(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!req.user) return;
        const { tenantId } = req.user;
        const modelParam = String(req.params.model || '').trim();
        if (!modelParam) {
            res.status(400).json({ error: 'Modelo não especificado.' });
            return;
        }
        const normModel = normalizeIdentifier(modelParam);

        try {
            const kitTerms = getBasicMaintenanceKitTerms();
            const results: Array<{
                category: string;
                label: string;
                part: any | null;
            }> = [];

            for (const kitItem of kitTerms) {
                const matchingPart = await prisma.part.findFirst({
                    where: {
                        active: true,
                        document: { tenantId, archivedAt: null, status: 'COMPLETED' },
                        normalizedModel: normModel,
                        OR: kitItem.searchTerms.map(term => ({
                            name: { contains: term, mode: 'insensitive' as const },
                        })),
                    },
                    select: {
                        id: true,
                        partNumber: true,
                        name: true,
                        model: true,
                        pnc: true,
                        section: true,
                        position: true,
                        page: true,
                        notes: true,
                        document: { select: { id: true, filename: true } },
                    },
                });

                if (matchingPart) {
                    results.push({
                        category: kitItem.category,
                        label: kitItem.label,
                        part: {
                            ...matchingPart,
                            filename: matchingPart.document?.filename,
                            classification: classifyPartKind(matchingPart.name, matchingPart.section, matchingPart.notes),
                        },
                    });
                }
            }

            res.json({
                model: modelParam,
                kitCount: results.length,
                items: results,
            });
        } catch (error) {
            console.error(`❌ Erro ao buscar combo de revisão para ${modelParam}:`, error);
            res.status(500).json({ error: 'Erro ao buscar combo de revisão do modelo.' });
        }
    }
}
