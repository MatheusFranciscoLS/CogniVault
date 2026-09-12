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
import { PartSearchService, invalidatePartSearchCaches } from '../services/part-search.service';
import { invalidateChatResponseCache } from '../services/chat.service';
import { invalidateHomeResponseCache } from './home.controller';
import { invalidatePartDetailResponseCache } from './part-detail.controller';
import {
    resolveEngineCatalogRoute,
    findMachinesForEngine,
    findEngineApplications,
    classifyPartKind,
    getBasicMaintenanceKitTerms,
} from '../services/husqvarna-domain-knowledge';
import { HusqvarnaScraperService } from '../services/husqvarna-scraper.service';

interface CachedSearchResult {
    parts: any[];
    documents: any[];
}

const searchResponseCache = new LRUCache<string, CachedSearchResult>({
    max: 1000,
    ttl: 60 * 1000,
});

// Mantém o export legado para chamadas antigas, mas invalida somente os caches
// que continuam ativos após a separação dos controllers dedicados.
export function invalidateHomeCountsCache(tenantId?: string): void {
    if (tenantId) {
        for (const key of searchResponseCache.keys()) {
            if (key.startsWith(`${tenantId}:`)) searchResponseCache.delete(key);
        }
    } else {
        searchResponseCache.clear();
    }

    invalidateHomeResponseCache(tenantId);
    invalidatePartDetailResponseCache(tenantId);
    invalidatePartSearchCaches(tenantId);
    invalidateChatResponseCache(tenantId);
}

export class OperationalController {
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

            const relatedCodes = targetCode
                ? allRelatedPartNumbers(targetCode)
                    .map(normalizeIdentifier)
                    .filter(Boolean)
                : [];

            const normalizedModel = normalizeIdentifier(intent.model);
            const normalizedManufacturer = normalizeIdentifier(intent.manufacturer);
            const normalizedPnc = normalizeIdentifier(intent.pnc);

            const engineRoute = resolveEngineCatalogRoute(
                intent.model,
                intent.pnc,
                q
            );

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

                if (base && !modelFilters.includes(base)) {
                    modelFilters.push(base);
                }
            }

            let descriptiveText = q;

            if (detectedCode) {
                descriptiveText = descriptiveText.replace(detectedCode, ' ');
            }

            if (intent.model) {
                descriptiveText = descriptiveText.replace(intent.model, ' ');
            }

            descriptiveText = descriptiveText.trim();

            const groups = descriptiveText.length >= 2
                ? buildSearchGroups(
                    descriptiveText,
                    [intent.manufacturer, intent.model, intent.pnc]
                )
                : (
                    intent.partNumber
                        ? []
                        : buildSearchGroups(
                            q,
                            [intent.manufacturer, intent.model, intent.pnc]
                        )
                );

            const descriptiveFilters: Prisma.PartWhereInput[] = groups.map(
                group => ({
                    OR: group.variants.flatMap(variant => [
                        {
                            normalizedName: {
                                contains: variant,
                            },
                        },
                        {
                            searchText: {
                                contains: variant,
                                mode: 'insensitive' as const,
                            },
                        },
                    ]),
                })
            );

            if (normalizedManufacturer) {
                descriptiveFilters.push({
                    OR: [
                        { normalizedManufacturer },
                        { normalizedManufacturer: null },
                    ],
                });
            }

            if (normalizedPnc) {
                descriptiveFilters.push({
                    OR: [
                        { normalizedPnc },
                        { universalAcrossPnc: true },
                    ],
                });
            }

            const modelCondition: Prisma.PartWhereInput =
                modelFilters.length > 1
                    ? {
                        normalizedModel: {
                            in: modelFilters,
                        },
                    }
                    : (
                        modelFilters.length === 1
                            ? {
                                normalizedModel: modelFilters[0],
                            }
                            : {}
                    );

            const searchClauses: Prisma.PartWhereInput[] = [];

            if (relatedCodes.length) {
                searchClauses.push({
                    normalizedPartNumber: {
                        in: relatedCodes,
                    },
                });
            } else if (targetCode && targetCode.length >= 5) {
                searchClauses.push({
                    normalizedPartNumber: {
                        contains: targetCode,
                    },
                });
            }

            if (groups.length) {
                searchClauses.push({
                    ...modelCondition,
                    AND: descriptiveFilters,
                });
            }

            if (!searchClauses.length) {
                searchClauses.push({
                    OR: [
                        {
                            partNumber: {
                                contains: q,
                                mode: 'insensitive',
                            },
                        },
                        ...(normalized
                            ? [{
                                normalizedName: {
                                    contains: normalized,
                                },
                            }]
                            : []),
                        ...(targetCode
                            ? [{
                                normalizedPartNumber: {
                                    contains: targetCode,
                                },
                            }]
                            : []),
                        ...(modelFilters.length
                            ? [{
                                normalizedModel: {
                                    in: modelFilters,
                                },
                            }]
                            : []),
                        ...(normalizedManufacturer
                            ? [{
                                normalizedManufacturer: {
                                    contains: normalizedManufacturer,
                                },
                            }]
                            : []),
                        ...(normalizedPnc
                            ? [{
                                normalizedPnc: {
                                    contains: normalizedPnc,
                                },
                            }]
                            : []),
                    ],
                });
            }

            const partWhere: Prisma.PartWhereInput = {
                active: true,
                document: {
                    tenantId,
                    archivedAt: null,
                    status: 'COMPLETED',
                },
                OR: searchClauses,
            };

            const relatedDocKeywords: string[] = [];
            const targetModelKey = intent.model || q;

            const engineApps = findEngineApplications(
                targetModelKey,
                intent.pnc
            );

            for (const app of engineApps) {
                if (
                    app.engineModel &&
                    !relatedDocKeywords.includes(app.engineModel)
                ) {
                    relatedDocKeywords.push(app.engineModel);
                }
            }

            const machineApps = findMachinesForEngine(targetModelKey, q);

            for (const app of machineApps) {
                if (
                    app.machineModel &&
                    !relatedDocKeywords.includes(app.machineModel)
                ) {
                    relatedDocKeywords.push(app.machineModel);
                }
            }

            const [parts, documents] = await Promise.all([
                prisma.part.findMany({
                    where: partWhere,
                    orderBy: [
                        { model: 'asc' },
                        { name: 'asc' },
                    ],
                    take: 200,
                    select: {
                        id: true,
                        name: true,
                        partNumber: true,
                        manufacturer: true,
                        model: true,
                        pnc: true,
                        universalAcrossPnc: true,
                        section: true,
                        position: true,
                        page: true,
                        documentId: true,
                        normalizedName: true,
                        normalizedPartNumber: true,
                        normalizedModel: true,
                        normalizedPnc: true,
                        alternativeNames: true,
                        notes: true,
                        document: {
                            select: {
                                filename: true,
                            },
                        },
                    },
                }),
                prisma.document.findMany({
                    where: {
                        tenantId,
                        archivedAt: null,
                        status: 'COMPLETED',
                        OR: [
                            {
                                filename: {
                                    contains: q,
                                    mode: 'insensitive',
                                },
                            },
                            {
                                manufacturer: {
                                    contains: q,
                                    mode: 'insensitive',
                                },
                            },
                            {
                                model: {
                                    contains: q,
                                    mode: 'insensitive',
                                },
                            },
                            {
                                pnc: {
                                    contains: q,
                                    mode: 'insensitive',
                                },
                            },
                            ...(intent.manufacturer
                                ? [{
                                    manufacturer: {
                                        contains: intent.manufacturer,
                                        mode: 'insensitive' as const,
                                    },
                                }]
                                : []),
                            ...(intent.model
                                ? [{
                                    model: {
                                        contains: intent.model,
                                        mode: 'insensitive' as const,
                                    },
                                }]
                                : []),
                            ...(intent.pnc
                                ? [{
                                    pnc: {
                                        contains: intent.pnc,
                                        mode: 'insensitive' as const,
                                    },
                                }]
                                : []),
                            ...(descriptiveText
                                ? [{
                                    model: {
                                        contains: descriptiveText,
                                        mode: 'insensitive' as const,
                                    },
                                }]
                                : []),
                            ...relatedDocKeywords.map(keyword => ({
                                model: {
                                    contains: keyword,
                                    mode: 'insensitive' as const,
                                },
                            })),
                            ...relatedDocKeywords.map(keyword => ({
                                filename: {
                                    contains: keyword,
                                    mode: 'insensitive' as const,
                                },
                            })),
                        ],
                    },
                    orderBy: {
                        createdAt: 'desc',
                    },
                    take: 12,
                    select: {
                        id: true,
                        filename: true,
                        manufacturer: true,
                        model: true,
                        pnc: true,
                        createdAt: true,
                        _count: {
                            select: {
                                parts: {
                                    where: {
                                        active: true,
                                    },
                                },
                            },
                        },
                    },
                }),
            ]);

            const marketFiltered = filterCandidatesByMarket(parts);
            const resolvedParts = preferCurrentPartNumbers(marketFiltered);
            const seen = new Set<string>();

            const rankedParts = resolvedParts
                .map(part => {
                    let score = groups.length
                        ? scorePartText(q, {
                            name: part.name,
                            section: part.section,
                            aliases: part.alternativeNames,
                            notes: part.notes,
                        })
                        : 0;

                    if (
                        targetCode &&
                        part.normalizedPartNumber === targetCode
                    ) {
                        score += 1000;
                    } else if (
                        relatedCodes.length &&
                        relatedCodes.includes(part.normalizedPartNumber)
                    ) {
                        score += 800;
                    } else if (
                        targetCode &&
                        targetCode.length >= 5 &&
                        part.normalizedPartNumber.includes(targetCode)
                    ) {
                        score += 600;
                    }

                    if (
                        modelFilters.length &&
                        modelFilters.includes(part.normalizedModel)
                    ) {
                        score += 200;
                    }

                    if (
                        normalizedPnc &&
                        part.normalizedPnc === normalizedPnc
                    ) {
                        score += 150;
                    }

                    return { part, score };
                })
                .sort(
                    (a, b) =>
                        b.score - a.score ||
                        a.part.name.localeCompare(b.part.name, 'pt-BR')
                )
                .filter(({ part }) => {
                    const identity =
                        `${part.normalizedPartNumber}|` +
                        `${part.normalizedModel}|` +
                        `${part.universalAcrossPnc
                            ? '*'
                            : (part.normalizedPnc || '')}|` +
                        `${normalizeText(part.section || '')}|` +
                        `${normalizeText(part.position || '')}`;

                    if (seen.has(identity)) {
                        return false;
                    }

                    seen.add(identity);
                    return true;
                })
                .slice(0, 40);

            const normalizedNumbers = Array.from(
                new Set(
                    rankedParts.map(
                        ({ part }) => part.normalizedPartNumber
                    )
                )
            );

            const masterParts = normalizedNumbers.length
                ? await prisma.masterPart.findMany({
                    where: {
                        tenantId,
                        normalizedNumber: {
                            in: normalizedNumbers,
                        },
                    },
                })
                : [];

            const masterPartMap = new Map(
                masterParts.map(master => [
                    master.normalizedNumber,
                    master,
                ])
            );

            const enrichedParts = rankedParts.map(({ part }) => {
                const master = masterPartMap.get(
                    part.normalizedPartNumber
                );

                return {
                    id: part.id,
                    name: part.name,
                    partNumber: part.partNumber,
                    manufacturer: part.manufacturer,
                    model: part.model,
                    pnc: part.universalAcrossPnc
                        ? 'Qualquer um'
                        : part.pnc,
                    universalAcrossPnc: part.universalAcrossPnc,
                    section: part.section,
                    position: part.position,
                    page: part.page,
                    documentId: part.documentId,
                    notes: part.notes,
                    filename: part.document.filename,
                    classification: classifyPartKind(
                        part.name,
                        part.section,
                        part.notes
                    ),
                    price: master?.price ?? null,
                    ean: master?.ean ?? null,
                    ncm: master?.ncm ?? null,
                    officialName: master?.name ?? null,
                    masterCategory: master?.category ?? null,
                    brand: master?.brand ?? null,
                };
            });

            const searchResponsePayload = {
                parts: enrichedParts,
                documents: documents.map(item => ({
                    id: item.id,
                    filename: item.filename,
                    manufacturer: item.manufacturer,
                    model: item.model,
                    pnc: item.pnc,
                    createdAt: item.createdAt,
                    partCount: item._count.parts,
                })),
            };

            searchResponseCache.set(
                searchCacheKey,
                searchResponsePayload
            );

            res.json(searchResponsePayload);
        } catch (error) {
            console.error(
                '❌ Erro na busca operacional:',
                error
            );

            res.status(500).json({
                error: 'Erro ao processar a busca de peças.',
                parts: [],
                documents: [],
            });
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

            const normalizedStreamQuery = normalizeIdentifier(q);
            const exactNumericIdentifier =
                /^[\d\s-]+$/.test(q) &&
                /^\d{6,14}$/.test(normalizedStreamQuery);

            if (exactNumericIdentifier) {
                // PNCs e códigos numéricos exatos já possuem caminhos estruturados.
                // Embedding/semântica só adiciona latência e não melhora a precisão aqui.
                send({
                    type: 'done',
                });
                return;
            }

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
                                    id: candidate.id,
                                    documentId: candidate.documentId,
                                    filename: candidate.filename,
                                    manufacturer: candidate.manufacturer,
                                    model: candidate.model,
                                    pnc: candidate.universalAcrossPnc
                                        ? 'Qualquer um'
                                        : candidate.pnc,
                                    universalAcrossPnc: candidate.universalAcrossPnc,
                                    section: candidate.section,
                                    position: candidate.position,
                                    name: candidate.name,
                                    partNumber: candidate.partNumber,
                                    page: candidate.page,
                                    notes: candidate.notes,
                                    classification: classifyPartKind(
                                        candidate.name,
                                        candidate.section,
                                        candidate.notes
                                    ),
                                    price: master?.price ?? null,
                                    ean: master?.ean ?? null,
                                    ncm: master?.ncm ?? null,
                                    officialName: master?.name ?? null,
                                    masterCategory: master?.category ?? null,
                                    brand: master?.brand ?? null,
                                };
                            });

                    send({
                        type: 'semantic',
                        parts: semanticParts,
                    });
                }
            } catch (semanticError) {
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
            res.status(500).json({ error: 'Erro ao remover o favorito.' });
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
