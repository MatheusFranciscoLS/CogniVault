import { prisma } from '../config/prisma';
import { endOfStoreDay, shiftStoreDay, startOfStoreDay, todayInStore } from '../utils/store-day';

/**
 * Métricas de negócio do painel do dono. Diferente de `quality.controller` e
 * `admin-overview.controller`, que medem a saúde técnica do catálogo e o uso da
 * IA, aqui só entra o que responde perguntas comerciais: quanto foi cotado,
 * quais peças o balcão mais pede, o que não tem preço e quem atendeu.
 *
 * Fonte é sempre `Quote` com `status = 'SAVED'` — a cesta aberta (`DRAFT`) é
 * rascunho vivo do atendente e contaminaria qualquer série temporal.
 */

export type BucketGranularity = 'day' | 'week' | 'month';

export interface BusinessInsightsRange {
  from: Date;
  to: Date;
  granularity: BucketGranularity;
}

export interface QuoteBucket {
  bucket: string;
  quotes: number;
  items: number;
  grossTotal: number;
  netTotal: number;
}

export interface TopQuotedPart {
  normalizedPartNumber: string;
  partNumber: string;
  name: string;
  quotedQuantity: number;
  quoteCount: number;
  lastQuotedAt: string | null;
  registeredPrice: number | null;
  /** Preço médio digitado pelo balcão, quando ele preencheu na mão. */
  averageQuotedPrice: number | null;
}

export interface UnpricedPart {
  normalizedPartNumber: string;
  partNumber: string;
  name: string;
  quoteCount: number;
  quotedQuantity: number;
  lastQuotedAt: string | null;
  /** `true` quando a peça existe em `MasterPart` mas com `price` nulo. */
  inPriceList: boolean;
}

export interface AttendantActivity {
  userId: string | null;
  email: string;
  quotes: number;
  items: number;
  netTotal: number;
  averageTicket: number;
  lastQuoteAt: string | null;
}

export interface BusinessInsightsPayload {
  range: { from: string; to: string; granularity: BucketGranularity };
  summary: {
    quotes: number;
    items: number;
    grossTotal: number;
    discountTotal: number;
    netTotal: number;
    averageTicket: number;
    quotesWithPrice: number;
    /** Orçamentos salvos sem nenhum preço preenchido — cotação "só de código". */
    quotesWithoutPrice: number;
    previousQuotes: number;
    previousNetTotal: number;
  };
  buckets: QuoteBucket[];
  topParts: TopQuotedPart[];
  unpricedParts: UnpricedPart[];
  attendants: AttendantActivity[];
  priceListCoverage: {
    masterParts: number;
    masterPartsWithoutPrice: number;
  };
}

export function parseGranularity(value: unknown): BucketGranularity {
  return value === 'week' || value === 'month' ? value : 'day';
}

/**
 * Janela padrão: últimos 30 dias comerciais encerrando hoje.
 *
 * Os limites são dias da loja (America/Sao_Paulo), nunca do fuso do processo —
 * o Render roda em UTC e, com a conversão ingênua, "até hoje" terminava às
 * 23:59 de ontem e escondia do dono tudo que o balcão cotou no dia. Ver
 * utils/store-day.ts.
 */
export function resolveRange(fromRaw: unknown, toRaw: unknown, granularity: BucketGranularity): BusinessInsightsRange {
  const today = todayInStore();
  const to = endOfStoreDay(toRaw) ?? endOfStoreDay(today)!;
  const from = startOfStoreDay(fromRaw) ?? startOfStoreDay(shiftStoreDay(today, -29))!;

  if (from > to) return { from: to, to, granularity };
  return { from, to, granularity };
}

const MAX_TOP_PARTS = 25;
const MAX_UNPRICED_PARTS = 40;

interface BucketRow {
  bucket: Date;
  quotes: number;
  items: number;
  grossTotal: number | null;
  netTotal: number | null;
}

/**
 * Série temporal por dia, semana ou mês comercial.
 *
 * As três variantes estão escritas por extenso, sem interpolar a granularidade
 * na string. `utils/source-safety.test.ts` proíbe as variantes "Unsafe" de
 * queryRaw/executeRaw em todo o backend — e o guard casa por texto, inclusive
 * em comentário, então nem o nome proibido pode aparecer aqui. A repetição
 * abaixo é o preço de não montar `date_trunc` em runtime, e é um preço barato.
 *
 * `savedAt` é `timestamp(3)` sem fuso guardando UTC (convenção do Prisma).
 * Converter para o fuso da loja antes de truncar é o que faz uma venda das 22h
 * em Limeira cair no dia dela, e não no dia seguinte em UTC.
 */
function bucketQuery(
  granularity: BucketGranularity,
  tenantId: string,
  from: Date,
  to: Date,
): Promise<BucketRow[]> {
  if (granularity === 'month') {
    return prisma.$queryRaw<BucketRow[]>`
      SELECT
        date_trunc('month', "savedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo') AS "bucket",
        COUNT(*)::int AS "quotes",
        COALESCE(SUM("totalItems"), 0)::int AS "items",
        COALESCE(SUM("grossTotal"), 0)::float8 AS "grossTotal",
        COALESCE(SUM("netTotal"), 0)::float8 AS "netTotal"
      FROM "Quote"
      WHERE "tenantId" = ${tenantId}
        AND "status" = 'SAVED'
        AND "savedAt" BETWEEN ${from} AND ${to}
      GROUP BY 1
      ORDER BY 1 ASC
    `;
  }

  if (granularity === 'week') {
    return prisma.$queryRaw<BucketRow[]>`
      SELECT
        date_trunc('week', "savedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo') AS "bucket",
        COUNT(*)::int AS "quotes",
        COALESCE(SUM("totalItems"), 0)::int AS "items",
        COALESCE(SUM("grossTotal"), 0)::float8 AS "grossTotal",
        COALESCE(SUM("netTotal"), 0)::float8 AS "netTotal"
      FROM "Quote"
      WHERE "tenantId" = ${tenantId}
        AND "status" = 'SAVED'
        AND "savedAt" BETWEEN ${from} AND ${to}
      GROUP BY 1
      ORDER BY 1 ASC
    `;
  }

  return prisma.$queryRaw<BucketRow[]>`
    SELECT
      date_trunc('day', "savedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo') AS "bucket",
      COUNT(*)::int AS "quotes",
      COALESCE(SUM("totalItems"), 0)::int AS "items",
      COALESCE(SUM("grossTotal"), 0)::float8 AS "grossTotal",
      COALESCE(SUM("netTotal"), 0)::float8 AS "netTotal"
    FROM "Quote"
    WHERE "tenantId" = ${tenantId}
      AND "status" = 'SAVED'
      AND "savedAt" BETWEEN ${from} AND ${to}
    GROUP BY 1
    ORDER BY 1 ASC
  `;
}

export class BusinessInsightsService {
  static async load(tenantId: string, range: BusinessInsightsRange): Promise<BusinessInsightsPayload> {
    const { from, to, granularity } = range;
    const spanMs = to.getTime() - from.getTime();
    const previousFrom = new Date(from.getTime() - spanMs - 1);
    const previousTo = new Date(from.getTime() - 1);

    const [
      summaryRows,
      bucketRows,
      topPartRows,
      unpricedRows,
      attendantRows,
      masterParts,
      masterPartsWithoutPrice,
      previousRows,
    ] = await Promise.all([
      prisma.$queryRaw<Array<{
        quotes: number;
        items: number;
        grossTotal: number | null;
        discountTotal: number | null;
        netTotal: number | null;
        quotesWithPrice: number;
      }>>`
        SELECT
          COUNT(*)::int AS "quotes",
          COALESCE(SUM("totalItems"), 0)::int AS "items",
          COALESCE(SUM("grossTotal"), 0)::float8 AS "grossTotal",
          COALESCE(SUM("discountAmount"), 0)::float8 AS "discountTotal",
          COALESCE(SUM("netTotal"), 0)::float8 AS "netTotal",
          COUNT(*) FILTER (WHERE "grossTotal" > 0)::int AS "quotesWithPrice"
        FROM "Quote"
        WHERE "tenantId" = ${tenantId}
          AND "status" = 'SAVED'
          AND "savedAt" BETWEEN ${from} AND ${to}
      `,

      bucketQuery(granularity, tenantId, from, to),

      prisma.$queryRaw<Array<{
        normalizedPartNumber: string;
        partNumber: string;
        name: string;
        quotedQuantity: number;
        quoteCount: number;
        lastQuotedAt: Date | null;
        registeredPrice: number | null;
        averageQuotedPrice: number | null;
      }>>`
        SELECT
          i."normalizedPartNumber",
          (array_agg(i."partNumber" ORDER BY q."savedAt" DESC))[1] AS "partNumber",
          (array_agg(i."name" ORDER BY q."savedAt" DESC))[1] AS "name",
          SUM(i."quantity")::int AS "quotedQuantity",
          COUNT(DISTINCT q."id")::int AS "quoteCount",
          MAX(q."savedAt") AS "lastQuotedAt",
          MAX(m."price")::float8 AS "registeredPrice",
          AVG(NULLIF(i."unitPrice", 0))::float8 AS "averageQuotedPrice"
        FROM "QuoteItem" i
        JOIN "Quote" q ON q."id" = i."quoteId"
        LEFT JOIN "MasterPart" m
          ON m."tenantId" = q."tenantId"
         AND m."normalizedNumber" = i."normalizedPartNumber"
        WHERE q."tenantId" = ${tenantId}
          AND q."status" = 'SAVED'
          AND q."savedAt" BETWEEN ${from} AND ${to}
          AND i."isService" = false
        GROUP BY i."normalizedPartNumber"
        ORDER BY "quotedQuantity" DESC, "quoteCount" DESC
        LIMIT ${MAX_TOP_PARTS}
      `,

      // Peça que o balcão cotou sem preço. É a lista acionável: o dono cadastra
      // o preço destas primeiro, porque são as que travaram um atendimento real.
      prisma.$queryRaw<Array<{
        normalizedPartNumber: string;
        partNumber: string;
        name: string;
        quoteCount: number;
        quotedQuantity: number;
        lastQuotedAt: Date | null;
        inPriceList: boolean;
      }>>`
        SELECT
          i."normalizedPartNumber",
          (array_agg(i."partNumber" ORDER BY q."savedAt" DESC))[1] AS "partNumber",
          (array_agg(i."name" ORDER BY q."savedAt" DESC))[1] AS "name",
          COUNT(DISTINCT q."id")::int AS "quoteCount",
          SUM(i."quantity")::int AS "quotedQuantity",
          MAX(q."savedAt") AS "lastQuotedAt",
          bool_or(m."normalizedNumber" IS NOT NULL) AS "inPriceList"
        FROM "QuoteItem" i
        JOIN "Quote" q ON q."id" = i."quoteId"
        LEFT JOIN "MasterPart" m
          ON m."tenantId" = q."tenantId"
         AND m."normalizedNumber" = i."normalizedPartNumber"
        WHERE q."tenantId" = ${tenantId}
          AND q."status" = 'SAVED'
          AND q."savedAt" BETWEEN ${from} AND ${to}
          AND i."isService" = false
          AND COALESCE(i."unitPrice", 0) = 0
          AND COALESCE(m."price", 0) = 0
        GROUP BY i."normalizedPartNumber"
        ORDER BY "quoteCount" DESC, "quotedQuantity" DESC
        LIMIT ${MAX_UNPRICED_PARTS}
      `,

      prisma.$queryRaw<Array<{
        userId: string | null;
        email: string | null;
        quotes: number;
        items: number;
        netTotal: number | null;
        lastQuoteAt: Date | null;
      }>>`
        SELECT
          q."userId",
          u."email",
          COUNT(*)::int AS "quotes",
          COALESCE(SUM(q."totalItems"), 0)::int AS "items",
          COALESCE(SUM(q."netTotal"), 0)::float8 AS "netTotal",
          MAX(q."savedAt") AS "lastQuoteAt"
        FROM "Quote" q
        LEFT JOIN "User" u ON u."id" = q."userId"
        WHERE q."tenantId" = ${tenantId}
          AND q."status" = 'SAVED'
          AND q."savedAt" BETWEEN ${from} AND ${to}
        GROUP BY q."userId", u."email"
        ORDER BY "quotes" DESC
      `,

      prisma.masterPart.count({ where: { tenantId } }),
      prisma.masterPart.count({ where: { tenantId, OR: [{ price: null }, { price: 0 }] } }),

      prisma.$queryRaw<Array<{ quotes: number; netTotal: number | null }>>`
        SELECT
          COUNT(*)::int AS "quotes",
          COALESCE(SUM("netTotal"), 0)::float8 AS "netTotal"
        FROM "Quote"
        WHERE "tenantId" = ${tenantId}
          AND "status" = 'SAVED'
          AND "savedAt" BETWEEN ${previousFrom} AND ${previousTo}
      `,
    ]);

    const summary = summaryRows[0] ?? {
      quotes: 0, items: 0, grossTotal: 0, discountTotal: 0, netTotal: 0, quotesWithPrice: 0,
    };
    const previous = previousRows[0] ?? { quotes: 0, netTotal: 0 };
    const quotes = Number(summary.quotes || 0);
    const netTotal = Number(summary.netTotal || 0);

    return {
      range: { from: from.toISOString(), to: to.toISOString(), granularity },
      summary: {
        quotes,
        items: Number(summary.items || 0),
        grossTotal: Number(summary.grossTotal || 0),
        discountTotal: Number(summary.discountTotal || 0),
        netTotal,
        averageTicket: quotes > 0 ? netTotal / quotes : 0,
        quotesWithPrice: Number(summary.quotesWithPrice || 0),
        quotesWithoutPrice: Math.max(0, quotes - Number(summary.quotesWithPrice || 0)),
        previousQuotes: Number(previous.quotes || 0),
        previousNetTotal: Number(previous.netTotal || 0),
      },
      buckets: bucketRows.map(row => ({
        bucket: row.bucket instanceof Date ? row.bucket.toISOString() : String(row.bucket),
        quotes: Number(row.quotes || 0),
        items: Number(row.items || 0),
        grossTotal: Number(row.grossTotal || 0),
        netTotal: Number(row.netTotal || 0),
      })),
      topParts: topPartRows.map(row => ({
        normalizedPartNumber: row.normalizedPartNumber,
        partNumber: row.partNumber,
        name: row.name,
        quotedQuantity: Number(row.quotedQuantity || 0),
        quoteCount: Number(row.quoteCount || 0),
        lastQuotedAt: row.lastQuotedAt ? new Date(row.lastQuotedAt).toISOString() : null,
        registeredPrice: row.registeredPrice === null ? null : Number(row.registeredPrice),
        averageQuotedPrice: row.averageQuotedPrice === null ? null : Number(row.averageQuotedPrice),
      })),
      unpricedParts: unpricedRows.map(row => ({
        normalizedPartNumber: row.normalizedPartNumber,
        partNumber: row.partNumber,
        name: row.name,
        quoteCount: Number(row.quoteCount || 0),
        quotedQuantity: Number(row.quotedQuantity || 0),
        lastQuotedAt: row.lastQuotedAt ? new Date(row.lastQuotedAt).toISOString() : null,
        inPriceList: row.inPriceList === true,
      })),
      attendants: attendantRows.map(row => {
        const attendantQuotes = Number(row.quotes || 0);
        const attendantNet = Number(row.netTotal || 0);
        return {
          userId: row.userId,
          // Orçamento de atendente já removido continua contando no histórico.
          email: row.email || 'Atendente removido',
          quotes: attendantQuotes,
          items: Number(row.items || 0),
          netTotal: attendantNet,
          averageTicket: attendantQuotes > 0 ? attendantNet / attendantQuotes : 0,
          lastQuoteAt: row.lastQuoteAt ? new Date(row.lastQuoteAt).toISOString() : null,
        };
      }),
      priceListCoverage: {
        masterParts,
        masterPartsWithoutPrice,
      },
    };
  }
}
