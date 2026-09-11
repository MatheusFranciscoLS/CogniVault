import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { normalizeIdentifier } from '../utils/normalize';

const HUSQVARNA_SPARE_PARTS_URL = 'https://www.husqvarna.com/br/pecas-sobressalentes/';
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const SEARCH_DEDUP_MS = 2 * 60 * 1000;

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

export class WorkContextController {
  async get(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) return;

    const partNumber = cleanCode(req.params.code);
    const normalizedPartNumber = normalizeIdentifier(partNumber);
    const model = String(req.query.model || '').trim();
    const tenantId = req.user.tenantId;

    if (!normalizedPartNumber) {
      res.status(400).json({ error: 'Código da peça inválido.' });
      return;
    }

    try {
      const [location, masterPart, technicalPart, approvedVerification] = await Promise.all([
        prisma.partLocation.findUnique({
          where: { tenantId_normalizedPartNumber: { tenantId, normalizedPartNumber } },
          select: { location: true, note: true, updatedAt: true, updatedBy: { select: { email: true } } },
        }),
        prisma.masterPart.findUnique({
          where: { tenantId_normalizedNumber: { tenantId, normalizedNumber: normalizedPartNumber } },
          include: { sections: true },
        }),
        prisma.part.findFirst({
          where: {
            normalizedPartNumber,
            active: true,
            document: { tenantId, archivedAt: null, status: 'COMPLETED' },
            ...(model ? { model: { contains: model, mode: 'insensitive' } } : {}),
          },
          select: { id: true, name: true, partNumber: true, model: true, pnc: true, document: { select: { filename: true } } },
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
          select: { id: true, officialUrl: true, status: true, reviewedAt: true },
        }),
      ]);

      // Mantém a telemetria de uso sem duplicar cliques repetidos do mesmo atendente.
      if (technicalPart) {
        const recent = await prisma.searchHistory.findFirst({
          where: {
            tenantId,
            userId: req.user.id,
            resultCode: cleanCode(technicalPart.partNumber),
            createdAt: { gte: new Date(Date.now() - SEARCH_DEDUP_MS) },
          },
          select: { id: true },
        });
        if (!recent) {
          await prisma.searchHistory.create({
            data: {
              tenantId,
              userId: req.user.id,
              query: model || cleanCode(technicalPart.partNumber),
              status: 'FOUND',
              resultPartId: technicalPart.id,
              resultLabel: technicalPart.name,
              resultCode: cleanCode(technicalPart.partNumber),
              resultModel: technicalPart.model,
              resultPnc: technicalPart.pnc,
              sourceFilename: technicalPart.document.filename,
            },
          });
        }
      }

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

      const [popularRows, sampleRows, togetherRows] = await Promise.all([
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

      const sources = [
        ...(technicalPart ? [{ type: 'CATALOG', label: 'CATÁLOGO', detail: technicalPart.document.filename }] : []),
        ...(masterPart ? [{ type: 'PRICE_LIST', label: 'LISTA DE PREÇOS', detail: masterPart.sections.map(section => section.section).join(' · ') }] : []),
        ...(approvedVerification ? [{ type: 'OFFICIAL', label: 'OFICIAL', detail: 'Conferido e aprovado' }] : []),
      ];

      res.json({
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
          priceSections: masterPart?.sections.map(section => section.section) || [],
          applications: masterPart?.sections.map(section => section.application).filter((value): value is string => Boolean(value)) || [],
          application: masterPart?.sections.map(section => section.application).find(Boolean) || masterPart?.description || masterPart?.brand || null,
          sources,
          officialFallback: {
            url: approvedVerification?.officialUrl || HUSQVARNA_SPARE_PARTS_URL,
            automatic: Boolean(approvedVerification),
          },
        },
      });
    } catch (error) {
      console.error('❌ Erro ao carregar inteligência da peça:', error);
      res.status(500).json({ error: 'Não foi possível carregar o contexto operacional da peça.' });
    }
  }
}
