import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { LRUCache } from 'lru-cache';
import { prisma } from '../config/prisma';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { normalizeIdentifier } from '../utils/normalize';

const HUSQVARNA_SPARE_PARTS_URL = 'https://www.husqvarna.com/br/pecas-sobressalentes/';
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const SEARCH_DEDUP_MS = 2 * 60 * 1000;
const WORK_CONTEXT_FRESH_MS = Math.max(
  10_000,
  Number(process.env.WORK_CONTEXT_CACHE_FRESH_MS || '30000') || 30_000,
);
const WORK_CONTEXT_STALE_MS = Math.max(
  WORK_CONTEXT_FRESH_MS,
  Number(process.env.WORK_CONTEXT_CACHE_STALE_MS || '300000') || 300_000,
);

function cleanCode(value: unknown): string {
  return String(value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

type PopularRow = {
  partNumber: string;
  name: string;
  model: string | null;
  count: number | string;
};

type TogetherRow = {
  normalizedPartNumber: string;
  partNumber: string;
  model: string | null;
  name: string | null;
  count: number | string;
};

type CountRow = { count: number | string };

type TelemetryPart = {
  id: string;
  name: string;
  partNumber: string;
  model: string;
  pnc: string | null;
  document: { filename: string };
};

type WorkContextPayload = {
  context: Record<string, unknown>;
};

type WorkContextCacheEntry = {
  payload: WorkContextPayload;
  telemetryPart: TelemetryPart | null;
  refreshedAt: number;
};

const workContextCache = new LRUCache<string, WorkContextCacheEntry>({
  max: 3000,
  ttl: WORK_CONTEXT_STALE_MS,
});

const refreshes = new Map<string, Promise<WorkContextCacheEntry>>();
const telemetryDedupe = new LRUCache<string, true>({
  max: 5000,
  ttl: SEARCH_DEDUP_MS,
});

function contextCacheKey(tenantId: string, normalizedPartNumber: string, model: string): string {
  return `${tenantId}:${normalizedPartNumber}:${normalizeIdentifier(model) || '-'}`;
}

function cacheHeaders(res: Response, status: 'HIT' | 'MISS' | 'STALE'): void {
  res.set('Cache-Control', 'private, max-age=10, stale-while-revalidate=60');
  res.set('X-CogniVault-Cache', status);
}

export function invalidateWorkContextCache(tenantId?: string, normalizedPartNumber?: string): void {
  if (!tenantId) {
    workContextCache.clear();
    return;
  }

  const prefix = normalizedPartNumber
    ? `${tenantId}:${normalizeIdentifier(normalizedPartNumber)}:`
    : `${tenantId}:`;

  for (const key of workContextCache.keys()) {
    if (key.startsWith(prefix)) workContextCache.delete(key);
  }
}

async function recordTechnicalUsage(
  tenantId: string,
  userId: string,
  model: string,
  technicalPart: TelemetryPart | null,
): Promise<void> {
  if (!technicalPart) return;

  const resultCode = cleanCode(technicalPart.partNumber);
  const dedupeKey = `${tenantId}:${userId}:${resultCode}`;
  if (telemetryDedupe.has(dedupeKey)) return;
  telemetryDedupe.set(dedupeKey, true);

  try {
    const recent = await prisma.searchHistory.findFirst({
      where: {
        tenantId,
        userId,
        resultCode,
        createdAt: { gte: new Date(Date.now() - SEARCH_DEDUP_MS) },
      },
      select: { id: true },
    });

    if (recent) return;

    await prisma.searchHistory.create({
      data: {
        tenantId,
        userId,
        query: model || resultCode,
        status: 'FOUND',
        resultPartId: technicalPart.id,
        resultLabel: technicalPart.name,
        resultCode,
        resultModel: technicalPart.model,
        resultPnc: technicalPart.pnc,
        sourceFilename: technicalPart.document.filename,
      },
    });
  } catch (error) {
    telemetryDedupe.delete(dedupeKey);
    console.warn('⚠️ Não foi possível registrar telemetria da peça em segundo plano:', error);
  }
}

async function loadWorkContext(
  tenantId: string,
  normalizedPartNumber: string,
  model: string,
): Promise<Omit<WorkContextCacheEntry, 'refreshedAt'>> {
  const quoteCutoff = new Date(Date.now() - ONE_YEAR_MS);

  const popularPromise = model
    ? prisma.$queryRaw<PopularRow[]>(Prisma.sql`
        SELECT
          regexp_replace(upper(COALESCE(h."resultCode", '')), '[^A-Z0-9]', '', 'g') AS "partNumber",
          COALESCE(MAX(h."resultLabel"), regexp_replace(upper(COALESCE(h."resultCode", '')), '[^A-Z0-9]', '', 'g')) AS "name",
          MAX(h."resultModel") AS "model",
          COUNT(*)::int AS "count"
        FROM "SearchHistory" h
        WHERE h."tenantId" = ${tenantId}
          AND h."resultCode" IS NOT NULL
          AND lower(COALESCE(h."resultModel", '')) LIKE lower(${`%${model}%`})
          AND regexp_replace(upper(h."resultCode"), '[^A-Z0-9]', '', 'g') <> ${normalizedPartNumber}
        GROUP BY regexp_replace(upper(COALESCE(h."resultCode", '')), '[^A-Z0-9]', '', 'g')
        ORDER BY COUNT(*) DESC, MAX(h."createdAt") DESC
        LIMIT 8
      `)
    : Promise.resolve([] as PopularRow[]);

  const samplePromise = prisma.$queryRaw<CountRow[]>(Prisma.sql`
    SELECT COUNT(DISTINCT q."sessionId")::int AS "count"
    FROM "QuoteUsage" q
    WHERE q."tenantId" = ${tenantId}
      AND q."normalizedPartNumber" = ${normalizedPartNumber}
      AND q."createdAt" >= ${quoteCutoff}
  `);

  const togetherPromise = prisma.$queryRaw<TogetherRow[]>(Prisma.sql`
    WITH sessions AS (
      SELECT DISTINCT q."sessionId"
      FROM "QuoteUsage" q
      WHERE q."tenantId" = ${tenantId}
        AND q."normalizedPartNumber" = ${normalizedPartNumber}
        AND q."createdAt" >= ${quoteCutoff}
    ), ranked AS (
      SELECT
        q."normalizedPartNumber",
        MIN(q."partNumber") AS "partNumber",
        MAX(q."model") AS "model",
        COUNT(DISTINCT q."sessionId")::int AS "count"
      FROM "QuoteUsage" q
      INNER JOIN sessions s ON s."sessionId" = q."sessionId"
      WHERE q."tenantId" = ${tenantId}
        AND q."normalizedPartNumber" <> ${normalizedPartNumber}
        AND q."createdAt" >= ${quoteCutoff}
      GROUP BY q."normalizedPartNumber"
      ORDER BY COUNT(DISTINCT q."sessionId") DESC
      LIMIT 8
    )
    SELECT
      r."normalizedPartNumber",
      r."partNumber",
      r."model",
      m."name",
      r."count"
    FROM ranked r
    LEFT JOIN "MasterPart" m
      ON m."tenantId" = ${tenantId}
     AND m."normalizedNumber" = r."normalizedPartNumber"
    ORDER BY r."count" DESC, r."partNumber" ASC
  `);

  // Todas as leituras independentes saem juntas. Isso reduz o impacto da
  // distância Render (EUA) -> Supabase (São Paulo) quando o cache está frio.
  const [
    location,
    masterPart,
    technicalPart,
    approvedVerification,
    popularRows,
    sampleRows,
    togetherRows,
  ] = await Promise.all([
    prisma.partLocation.findUnique({
      where: { tenantId_normalizedPartNumber: { tenantId, normalizedPartNumber } },
      select: { location: true, note: true, updatedAt: true, updatedBy: { select: { email: true } } },
    }),
    prisma.masterPart.findUnique({
      where: { tenantId_normalizedNumber: { tenantId, normalizedNumber: normalizedPartNumber } },
      select: {
        description: true,
        brand: true,
        sections: {
          select: { section: true, application: true },
        },
      },
    }),
    prisma.part.findFirst({
      where: {
        normalizedPartNumber,
        active: true,
        document: { tenantId, archivedAt: null, status: 'COMPLETED' },
        ...(model ? { model: { contains: model, mode: 'insensitive' } } : {}),
      },
      select: {
        id: true,
        name: true,
        partNumber: true,
        model: true,
        pnc: true,
        document: { select: { filename: true } },
      },
    }),
    prisma.officialPartVerification.findFirst({
      where: {
        tenantId,
        approvalStatus: 'APPROVED',
        OR: [
          { normalizedQueriedNumber: normalizedPartNumber },
          { normalizedCurrentNumber: normalizedPartNumber },
        ],
      },
      orderBy: { reviewedAt: 'desc' },
      select: { officialUrl: true },
    }),
    popularPromise,
    samplePromise,
    togetherPromise,
  ]);

  const popularParts = popularRows.map(item => ({
    partNumber: cleanCode(item.partNumber),
    name: item.name || cleanCode(item.partNumber),
    model: item.model,
    count: Number(item.count) || 0,
  }));

  const togetherSampleSize = Number(sampleRows[0]?.count || 0);
  const frequentlyTogether = togetherRows.map(item => {
    const count = Number(item.count) || 0;
    return {
      partNumber: cleanCode(item.partNumber),
      name: item.name || cleanCode(item.partNumber),
      model: item.model,
      count,
      percentage: togetherSampleSize ? Math.round((count / togetherSampleSize) * 100) : 0,
    };
  });

  const priceSections = masterPart
    ? [...new Set(masterPart.sections.map(section => section.section))]
    : [];
  const applications = masterPart
    ? [...new Set(masterPart.sections.map(section => section.application).filter((value): value is string => Boolean(value)))]
    : [];

  const sources = [
    ...(technicalPart ? [{ type: 'CATALOG', label: 'CATÁLOGO', detail: technicalPart.document.filename }] : []),
    ...(masterPart ? [{ type: 'PRICE_LIST', label: 'LISTA DE PREÇOS', detail: priceSections.join(' · ') }] : []),
    ...(approvedVerification ? [{ type: 'OFFICIAL', label: 'OFICIAL', detail: 'Conferido e aprovado' }] : []),
  ];

  return {
    telemetryPart: technicalPart,
    payload: {
      context: {
        location: location ? {
          value: location.location,
          note: location.note,
          updatedAt: location.updatedAt,
          updatedBy: location.updatedBy?.email || null,
        } : null,
        popularParts,
        frequentlyTogether,
        togetherSampleSize,
        togetherReady: togetherSampleSize >= 3,
        priceSections,
        applications,
        application: applications[0] || masterPart?.description || masterPart?.brand || null,
        sources,
        officialFallback: {
          url: approvedVerification?.officialUrl || HUSQVARNA_SPARE_PARTS_URL,
          automatic: Boolean(approvedVerification),
        },
      },
    },
  };
}

async function refreshWorkContext(
  cacheKey: string,
  tenantId: string,
  normalizedPartNumber: string,
  model: string,
): Promise<WorkContextCacheEntry> {
  const existing = refreshes.get(cacheKey);
  if (existing) return existing;

  const refresh = loadWorkContext(tenantId, normalizedPartNumber, model)
    .then((loaded) => {
      const entry: WorkContextCacheEntry = { ...loaded, refreshedAt: Date.now() };
      workContextCache.set(cacheKey, entry);
      return entry;
    })
    .finally(() => {
      refreshes.delete(cacheKey);
    });

  refreshes.set(cacheKey, refresh);
  return refresh;
}

export class WorkContextController {
  async get(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;

    const partNumber = cleanCode(req.params.code);
    const normalizedPartNumber = normalizeIdentifier(partNumber);
    const model = String(req.query.model || '').trim();
    const tenantId = req.user.tenantId;
    const userId = req.user.id;

    if (!normalizedPartNumber) {
      res.status(400).json({ error: 'Código da peça inválido.' });
      return;
    }

    const cacheKey = contextCacheKey(tenantId, normalizedPartNumber, model);
    const cached = workContextCache.get(cacheKey);

    if (cached) {
      void recordTechnicalUsage(tenantId, userId, model, cached.telemetryPart);

      const age = Date.now() - cached.refreshedAt;
      if (age <= WORK_CONTEXT_FRESH_MS) {
        cacheHeaders(res, 'HIT');
        res.json(cached.payload);
        return;
      }

      cacheHeaders(res, 'STALE');
      res.json(cached.payload);
      void refreshWorkContext(cacheKey, tenantId, normalizedPartNumber, model).catch((error) => {
        console.warn('⚠️ Não foi possível atualizar o contexto operacional em segundo plano:', error);
      });
      return;
    }

    try {
      const loaded = await refreshWorkContext(cacheKey, tenantId, normalizedPartNumber, model);
      void recordTechnicalUsage(tenantId, userId, model, loaded.telemetryPart);
      cacheHeaders(res, 'MISS');
      res.json(loaded.payload);
    } catch (error) {
      console.error('❌ Erro ao carregar inteligência da peça:', error);
      res.status(500).json({ error: 'Não foi possível carregar o contexto operacional da peça.' });
    }
  }
}
