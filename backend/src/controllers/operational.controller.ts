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
import { PartSearchService, invalidatePartSearchCaches, } from '../services/part-search.service';
import { invalidateChatResponseCache } from '../services/chat.service';
import {
    resolveEngineCatalogRoute,
    findMachinesForEngine,
    findEngineApplications,
    classifyPartKind,
    getCorrelatedMaintenanceTerms,
    getBasicMaintenanceKitTerms,
} from '../services/husqvarna-domain-knowledge';
import { HusqvarnaScraperService } from '../services/husqvarna-scraper.service';

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

    async searchStream(
        req: AuthenticatedRequest,
        res: Response
    ): Promise<void> {
        if (!req.user) {
            res.status(401).end();
            return;
        }

        const q = String(req.query.q || '').trim();

        res.setHeader(
            'Content-Type',
            'text/event-stream; charset=utf-8'
        );
        res.setHeader(
            'Cache-Control',
            'no-cache, no-transform'
        );
        res.setHeader(
            'Connection',
            'keep-alive'
        );

        // Evita buffering por proxies como nginx.
        res.setHeader(
            'X-Accel-Buffering',
            'no'
        );

        res.flushHeaders();

        let clientClosed = false;

        req.on('close', () => {
            clientClosed = true;
        });

        const send = (data: unknown) => {
            if (
                clientClosed ||
                res.writableEnded
            ) {
                return;
            }

            res.write(
                `data: ${JSON.stringify(data)}\n\n`
            );
        };

        if (q.length < 2) {
            send({
                type: 'lexical',
                parts: [],
                documents: [],
            });

            send({
                type: 'done',
            });

            res.end();
            return;
        }

        try {
            /*
             * Primeiro reutilizamos exatamente a busca operacional
             * já existente. Assim /search e /search/stream não passam
             * a ter regras diferentes de ranking.
             */
            let capturedStatus = 200;

            let capturedPayload:
                CachedSearchResult & {
                    error?: string;
                } = {
                parts: [],
                documents: [],
            };

            const captureResponse = {
                status(code: number) {
                    capturedStatus = code;
                    return this;
                },

                json(body: unknown) {
                    if (
                        body &&
                        typeof body === 'object'
                    ) {
                        const result =
                            body as Partial<CachedSearchResult> & {
                                error?: string;
                            };

                        capturedPayload = {
                            parts:
                                Array.isArray(result.parts)
                                    ? result.parts
                                    : [],

                            documents:
                                Array.isArray(result.documents)
                                    ? result.documents
                                    : [],

                            error:
                                typeof result.error === 'string'
                                    ? result.error
                                    : undefined,
                        };
                    }

                    return this;
                },
            } as unknown as Response;

            await this.search(
                req,
                captureResponse
            );

            if (clientClosed) {
                return;
            }

            if (capturedStatus >= 400) {
                send({
                    type: 'lexical',
                    error:
                        capturedPayload.error ||
                        'Erro ao realizar a busca.',
                    parts: [],
                    documents: [],
                });

                send({
                    type: 'done',
                });

                res.end();
                return;
            }

            /*
             * PRIMEIRA RESPOSTA:
             * resultados rápidos da busca operacional.
             */
            send({
                type: 'lexical',
                parts:
                    capturedPayload.parts,
                documents:
                    capturedPayload.documents,
            });

            if (clientClosed) {
                return;
            }

            /*
             * SEGUNDA ETAPA:
             * recuperação híbrida / semântica.
             *
             * O PartSearchService já combina lexical,
             * full-text, fuzzy, vetorial e código direto.
             */
            try {
                const intent =
                    buildFallbackIntent(q);

                const semanticCandidates =
                    await PartSearchService.semantic(
                        req.user.tenantId,
                        q,
                        intent
                    );

                if (clientClosed) {
                    return;
                }

                const lexicalIds =
                    new Set(
                        capturedPayload.parts
                            .map(part =>
                                String(
                                    part?.id || ''
                                )
                            )
                            .filter(Boolean)
                    );

                const additionalCandidates =
                    semanticCandidates.filter(
                        candidate =>
                            !lexicalIds.has(
                                candidate.id
                            )
                    );

                if (
                    additionalCandidates.length
                ) {
                    const normalizedNumbers =
                        Array.from(
                            new Set(
                                additionalCandidates
                                    .map(candidate =>
                                        candidate
                                            .normalizedPartNumber
                                    )
                                    .filter(Boolean)
                            )
                        );

                    const masterParts =
                        normalizedNumbers.length
                            ? await prisma.masterPart.findMany(
                                {
                                    where: {
                                        tenantId:
                                            req.user
                                                .tenantId,

                                        normalizedNumber:
                                        {
                                            in: normalizedNumbers,
                                        },
                                    },
                                }
                            )
                            : [];

                    const masterPartMap =
                        new Map(
                            masterParts.map(
                                master => [
                                    master.normalizedNumber,
                                    master,
                                ]
                            )
                        );

                    const semanticParts =
                        additionalCandidates
                            .slice(0, 40)
                            .map(candidate => {
                                const master =
                                    masterPartMap.get(
                                        candidate
                                            .normalizedPartNumber
                                    );

                                return {
                                    id:
                                        candidate.id,

                                    documentId:
                                        candidate.documentId,

                                    filename:
                                        candidate.filename,

                                    manufacturer:
                                        candidate.manufacturer,

                                    model:
                                        candidate.model,

                                    pnc:
                                        candidate
                                            .universalAcrossPnc
                                            ? 'Qualquer um'
                                            : candidate.pnc,

                                    universalAcrossPnc:
                                        candidate
                                            .universalAcrossPnc,

                                    section:
                                        candidate.section,

                                    position:
                                        candidate.position,

                                    name:
                                        candidate.name,

                                    partNumber:
                                        candidate.partNumber,

                                    page:
                                        candidate.page,

                                    notes:
                                        candidate.notes,

                                    classification:
                                        classifyPartKind(
                                            candidate.name,
                                            candidate.section,
                                            candidate.notes
                                        ),

                                    price:
                                        master?.price ??
                                        null,

                                    ean:
                                        master?.ean ??
                                        null,

                                    ncm:
                                        master?.ncm ??
                                        null,

                                    officialName:
                                        master?.name ??
                                        null,

                                    masterCategory:
                                        master?.category ??
                                        null,

                                    brand:
                                        master?.brand ??
                                        null,
                                };
                            });

                    send({
                        type: 'semantic',
                        parts:
                            semanticParts,
                    });
                }
            } catch (semanticError) {
                /*
                 * A busca semântica é melhoria progressiva.
                 * Se Gemini/pgvector/fuzzy estiver indisponível,
                 * os resultados lexicais continuam válidos.
                 */
                console.warn(
                    '⚠️ Busca semântica indisponível no stream:',
                    semanticError instanceof Error
                        ? semanticError.message
                        : semanticError
                );
            }

            send({
                type: 'done',
            });
        } catch (error) {
            console.error(
                '❌ Erro na busca streaming:',
                error
            );

            send({
                type: 'lexical',
                error:
                    'Erro ao processar a busca de peças.',
                parts: [],
                documents: [],
            });

            send({
                type: 'done',
            });
        } finally {
            if (
                !clientClosed &&
                !res.writableEnded
            ) {
                res.end();
            }
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

                const masterPart = await prisma.masterPart.findUnique({
                    where: { tenantId_normalizedNumber: { tenantId: tenantId, normalizedNumber: resolvedPart.normalizedPartNumber } }
                });

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
                    resolvedPart: {
                        ...resolvedPart,
                        price: masterPart?.price || null,
                        ean: masterPart?.ean || null,
                        ncm: masterPart?.ncm || null,
                        officialName: masterPart?.name || null,
                        masterCategory: masterPart?.category || null,
                        brand: masterPart?.brand || null,
                    },
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

    async liveData(req: AuthenticatedRequest, res: Response): Promise<void> {
        if (!req.user) return;
        const code = String(req.params.code || '').trim();
        if (!code) {
            res.status(400).json({ error: 'Código de peça não informado.' });
            return;
        }

        try {
            const livePart = await HusqvarnaScraperService.fetchLiveData(code);
            if (!livePart) {
                res.status(404).json({ error: 'Dados em tempo real não encontrados na Husqvarna para este código.' });
                return;
            }

            res.json({ livePart });
        } catch (error) {
            console.error(`❌ Erro ao buscar dados ao vivo para ${code}:`, error);
            res.status(500).json({ error: 'Erro ao conectar ao portal oficial da Husqvarna.' });
        }
    }
}
