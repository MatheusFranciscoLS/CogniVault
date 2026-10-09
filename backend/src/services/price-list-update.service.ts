import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { COMMERCIAL_PRICE_DIVISOR } from '../scripts/price-list-rules';
import type { HtmlPriceList } from '../scripts/price-list-html';
import { diffPriceList, percentBuckets, type PriceListDiff, type StoredPart } from '../scripts/price-list-diff';
import { buildNewRecords, HTML_IMPORT_SOURCE } from '../scripts/price-list-plan';
import { diffServiceParts, type ServicePartLink, type ServicePartsDiff } from '../scripts/service-parts';

/**
 * Atualização da lista de preços da Husqvarna (.html): relatório e gravação.
 *
 * É o mesmo caminho do importador de linha de comando (`scripts/import-price-list-html.ts`), com as mesmas travas, para a tela do
 * administrador. Duas fases, e a segunda só vale com o que a primeira mostrou:
 *   1. `buildPriceListReport` só LÊ: compara a lista com o banco e devolve os números.
 *   2. `applyPriceList` recalcula a comparação e só grava se os números ainda forem EXATAMENTE os aprovados (preços que mudam e códigos novos).
 *
 * Nunca apaga nada e nunca mexe em código que a lista não traz: esses ficam com o preço que têm (decisão do dono).
 */

const BATCH_SIZE = 400;
const TX_OPTIONS = { maxWait: 15_000, timeout: 300_000 };

export class PriceListApprovalError extends Error {}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

export async function loadStoredParts(prisma: PrismaClient, tenantId: string): Promise<StoredPart[]> {
  return prisma.masterPart.findMany({
    where: { tenantId },
    select: { normalizedNumber: true, partNumber: true, name: true, price: true, ncm: true, ean: true, category: true },
  });
}

export type PriceListReportRow = { partNumber: string; name: string; before: number | null; after: number; percent: number | null };

export type PriceListReport = {
  divisor: number;
  file: { rows: number; uniqueCodes: number; rowsWithoutCode: number; rowsWithBadPrice: number };
  rejected: Array<{ normalizedNumber: string; prices: number[] }>;
  /** Conflitos que o dono já decidiu: entram com o preço decidido. */
  resolved: Array<{ normalizedNumber: string; chosen: number; ignored: number[] }>;
  stored: number;
  unchanged: number;
  changed: number;
  added: number;
  /** Códigos que só o banco tem: o preço deles NÃO é atualizado. */
  missingFromList: number;
  buckets: Array<{ label: string; count: number }>;
  topIncreases: PriceListReportRow[];
  topDrops: PriceListReportRow[];
  addedBySection: Array<{ label: string; count: number }>;
  /** Peças de revisão por máquina (campo "reparo"). `incoming` 0 = a lista não traz o campo: nada muda. */
  service: ServicePartsDiff;
};

const toRow = (change: PriceListDiff['changed'][number]): PriceListReportRow => ({
  partNumber: change.partNumber,
  name: change.name,
  before: change.before,
  after: change.after,
  percent: change.percent,
});

export function summarizeDiff(list: HtmlPriceList, diff: PriceListDiff, service: ServicePartsDiff): PriceListReport {
  const withPercent = diff.changed.filter(change => change.percent !== null);
  const sections = new Map<string, number>();
  for (const item of diff.added) sections.set(item.section, (sections.get(item.section) ?? 0) + 1);
  return {
    divisor: COMMERCIAL_PRICE_DIVISOR,
    file: {
      rows: list.stats.rows,
      uniqueCodes: list.stats.uniqueCodes,
      rowsWithoutCode: list.stats.rowsWithoutCode,
      rowsWithBadPrice: list.stats.rowsWithBadPrice,
    },
    rejected: list.rejected.map(item => ({ normalizedNumber: item.normalizedNumber, prices: item.prices })),
    resolved: list.resolved.map(item => ({ normalizedNumber: item.normalizedNumber, chosen: item.chosen, ignored: item.ignored })),
    stored: diff.stored,
    unchanged: diff.unchanged,
    changed: diff.changed.length,
    added: diff.added.length,
    missingFromList: diff.missingFromList.length,
    buckets: percentBuckets(diff.changed),
    topIncreases: [...withPercent].sort((a, b) => (b.percent as number) - (a.percent as number)).slice(0, 15).map(toRow),
    topDrops: [...withPercent].sort((a, b) => (a.percent as number) - (b.percent as number)).slice(0, 15).map(toRow),
    addedBySection: [...sections].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    service,
  };
}

async function loadStoredServiceParts(prisma: PrismaClient, tenantId: string) {
  return prisma.machineServicePart.findMany({ where: { tenantId }, select: { pnc: true, normalizedNumber: true, kind: true } });
}

/** Fase 1: SÓ LEITURA. */
export async function buildPriceListReport(prisma: PrismaClient, tenantId: string, list: HtmlPriceList, service: ServicePartLink[] = []): Promise<PriceListReport> {
  const diff = diffPriceList(await loadStoredParts(prisma, tenantId), list.items);
  return summarizeDiff(list, diff, diffServiceParts(await loadStoredServiceParts(prisma, tenantId), service));
}

/** Grava o plano aprovado, numa transação só: ou entra tudo ou não entra nada. */
export async function writePriceListPlan(
  prisma: PrismaClient,
  tenantId: string,
  diff: PriceListDiff,
  sourceFilename: string,
  sourceHash: string,
  occurrenceCount: number,
  service: ServicePartLink[] = [],
): Promise<void> {
  const { masters, sections } = buildNewRecords(diff.added);
  const now = new Date();

  await prisma.$transaction(async tx => {
    // Mesma trava do importador da planilha: uma importação por vez.
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${`cognivault:commercial-import:${tenantId}`}, 0))
    `;

    let updated = 0;
    for (const batch of chunk(diff.changed, BATCH_SIZE)) {
      const values = Prisma.join(
        batch.map(
          change => Prisma.sql`(${change.normalizedNumber}::text, ${change.after}::float8, ${change.before}::float8)`,
        ),
      );
      // "before" é a trava: só atualiza se o preço ainda for o que o relatório mostrou, até o centavo. Igualdade exata de ponto
      // flutuante reprovava linhas boas (337 de 446 no teste): dinheiro se compara por tolerância.
      updated += await tx.$executeRaw(Prisma.sql`
        UPDATE "MasterPart" AS p
        SET "price" = v."after", "updatedAt" = ${now}
        FROM (VALUES ${values}) AS v("normalizedNumber", "after", "before")
        WHERE p."tenantId" = ${tenantId}
          AND p."normalizedNumber" = v."normalizedNumber"
          AND (
            (p."price" IS NULL AND v."before" IS NULL)
            OR ABS(p."price" - v."before") < 0.005
          )
      `);
    }
    if (updated !== diff.changed.length) {
      throw new Error(`Atualizou ${updated} preços, esperava ${diff.changed.length}. Nada foi gravado.`);
    }

    let inserted = 0;
    for (const batch of chunk(masters, BATCH_SIZE)) {
      const values = Prisma.join(
        batch.map(
          record => Prisma.sql`(
            ${randomUUID()}, ${tenantId}, ${record.partNumber}, ${record.normalizedNumber}, ${record.name},
            ${record.name}, ${record.price}, ${record.ncm}, ${record.ean}, ${record.category}, ${record.brand}, ${now}
          )`,
        ),
      );
      // DO NOTHING: nunca sobrescreve um código que apareceu depois do relatório.
      inserted += await tx.$executeRaw(Prisma.sql`
        INSERT INTO "MasterPart" (
          "id", "tenantId", "partNumber", "normalizedNumber", "name", "description",
          "price", "ncm", "ean", "category", "brand", "updatedAt"
        )
        VALUES ${values}
        ON CONFLICT ("tenantId", "normalizedNumber") DO NOTHING
      `);
    }
    if (inserted !== masters.length) {
      throw new Error(`Criou ${inserted} códigos, esperava ${masters.length}. Nada foi gravado.`);
    }

    for (const batch of chunk(sections, BATCH_SIZE)) {
      const values = Prisma.join(
        batch.map(
          record => Prisma.sql`(
            ${randomUUID()}, ${tenantId}, ${record.normalizedNumber}, ${record.section}, ${record.application},
            ${record.applicationKey}, ${record.reference}, ${record.productCategory}, ${null}, ${null},
            ${record.sourceSheet}, ${now}
          )`,
        ),
      );
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "MasterPartSection" (
          "id", "tenantId", "normalizedNumber", "section", "application", "applicationKey",
          "reference", "productCategory", "itemType", "groupCode", "sourceSheet", "updatedAt"
        )
        VALUES ${values}
        ON CONFLICT ("tenantId", "normalizedNumber", "section", "applicationKey") DO NOTHING
      `);
    }

    // Peças de revisão: espelho da lista, na MESMA transação. Lista sem o campo (nenhuma ligação) não apaga nada.
    if (service.length > 0) {
      await tx.machineServicePart.deleteMany({ where: { tenantId } });
      for (const batch of chunk(service, 1000)) {
        await tx.machineServicePart.createMany({
          data: batch.map(link => ({ tenantId, pnc: link.pnc, partNumber: link.partNumber, normalizedNumber: link.normalizedNumber, name: link.name, kind: link.kind })),
        });
      }
      const stored = await tx.machineServicePart.count({ where: { tenantId } });
      if (stored !== service.length) throw new Error(`Gravou ${stored} peças de revisão, esperava ${service.length}. Nada foi gravado.`);
    }

    const [masterCount, sectionCount] = await Promise.all([
      tx.masterPart.count({ where: { tenantId } }),
      tx.masterPartSection.count({ where: { tenantId } }),
    ]);
    await tx.commercialImportRun.create({
      data: {
        tenantId,
        sourceFilename,
        sourceHash,
        priceDivisor: COMMERCIAL_PRICE_DIVISOR,
        occurrenceCount,
        masterCount,
        sectionCount,
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });
  }, TX_OPTIONS);
}

export type PriceListApplyResult = { updated: number; added: number; stored: number; serviceAdded: number; serviceRemoved: number };

/**
 * Fase 2: recalcula a comparação e só grava se os números forem os APROVADOS. Depois de gravar, relê o banco e confere que não sobrou diferença.
 * Se algo mudou desde o relatório (a lista, o banco, outro importador), recusa sem gravar nada.
 */
export async function applyPriceList(
  prisma: PrismaClient,
  tenantId: string,
  list: HtmlPriceList,
  approved: { changed: number; added: number; serviceAdded?: number; serviceRemoved?: number },
  source: { filename: string; hash: string },
  service: ServicePartLink[] = [],
): Promise<PriceListApplyResult> {
  const diff = diffPriceList(await loadStoredParts(prisma, tenantId), list.items);
  const serviceDiff = diffServiceParts(await loadStoredServiceParts(prisma, tenantId), service);
  const approvedServiceAdded = approved.serviceAdded ?? 0;
  const approvedServiceRemoved = approved.serviceRemoved ?? 0;
  if (
    diff.changed.length !== approved.changed || diff.added.length !== approved.added ||
    serviceDiff.added !== approvedServiceAdded || serviceDiff.removed !== approvedServiceRemoved
  ) {
    throw new PriceListApprovalError(
      `Os números mudaram desde o relatório: preços ${diff.changed.length} (aprovado ${approved.changed}), ` +
        `códigos novos ${diff.added.length} (aprovado ${approved.added}), ` +
        `peças de revisão +${serviceDiff.added} -${serviceDiff.removed} (aprovado +${approvedServiceAdded} -${approvedServiceRemoved}). Nada foi gravado.`,
    );
  }
  const none = { updated: 0, added: 0, stored: diff.stored, serviceAdded: 0, serviceRemoved: 0 };
  if (diff.changed.length === 0 && diff.added.length === 0 && serviceDiff.added === 0 && serviceDiff.removed === 0) return none;

  await writePriceListPlan(prisma, tenantId, diff, source.filename, source.hash, list.stats.rows, service);

  const after = diffPriceList(await loadStoredParts(prisma, tenantId), list.items);
  const serviceAfter = diffServiceParts(await loadStoredServiceParts(prisma, tenantId), service);
  if (after.changed.length !== 0 || after.added.length !== 0 || serviceAfter.added !== 0 || serviceAfter.removed !== 0) {
    throw new Error('A conferência final achou diferença: revise o banco antes de seguir.');
  }
  return { updated: diff.changed.length, added: diff.added.length, stored: after.stored, serviceAdded: serviceDiff.added, serviceRemoved: serviceDiff.removed };
}

export { HTML_IMPORT_SOURCE };
