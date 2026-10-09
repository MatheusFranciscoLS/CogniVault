import { Prisma, type PrismaClient } from '@prisma/client';

/**
 * Desfazer a ÚLTIMA atualização da lista de preços (pedido do dono, 2026-10-09: "deixar o sistema sem erros").
 *
 * Cada atualização guarda o preço de antes e o de depois de cada código que tocou, e quais códigos ela criou (`PriceListChange`). Desfazer devolve o preço de
 * antes e remove os códigos criados, **mas só os que ainda estão como a atualização deixou**: um preço que alguém ajustou depois fica como está (conta como
 * "ficam como estão"), porque desfazer por cima de um ajuste manual seria apagar trabalho. Uma atualização só se desfaz uma vez, e só a mais recente.
 *
 * Não desfaz a lista de peças de revisão (ela é espelho da lista; a próxima atualização a corrige) nem o que não passa pela atualização.
 */

const TX_OPTIONS = { maxWait: 15_000, timeout: 300_000 };
const BATCH = 400;
/** Só as últimas 5 atualizações ficam guardadas: o histórico não cresce sem limite no Supabase free. */
export const PRICE_LIST_HISTORY_RUNS = 5;

export class PriceListUndoError extends Error {}

export type UndoPreview = {
  runId: string;
  filename: string;
  at: string;
  /** Preços que voltam ao valor de antes. */
  prices: number;
  /** Códigos criados pela atualização que serão removidos. */
  added: number;
  /** Códigos que ficam como estão porque o preço mudou depois da atualização. */
  skipped: number;
};

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

const sameMoney = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Math.abs(a - b) < 0.005);

type Plan = {
  runId: string;
  filename: string;
  at: Date;
  revert: Array<{ normalizedNumber: string; before: number | null; after: number }>;
  remove: Array<{ normalizedNumber: string }>;
  skipped: number;
};

async function planUndo(prisma: PrismaClient | Prisma.TransactionClient, tenantId: string): Promise<Plan | null> {
  const latest = await prisma.priceListChange.findFirst({
    where: { tenantId, undoneAt: null },
    orderBy: { createdAt: 'desc' },
    select: { runId: true },
  });
  if (!latest) return null;
  const rows = await prisma.priceListChange.findMany({ where: { tenantId, runId: latest.runId, undoneAt: null } });
  if (!rows.length) return null;

  const current = new Map<string, number | null>();
  for (const batch of chunk(rows.map(row => row.normalizedNumber), 1000)) {
    const parts = await prisma.masterPart.findMany({ where: { tenantId, normalizedNumber: { in: batch } }, select: { normalizedNumber: true, price: true } });
    for (const part of parts) current.set(part.normalizedNumber, part.price);
  }

  const revert: Plan['revert'] = [];
  const remove: Plan['remove'] = [];
  let skipped = 0;
  for (const row of rows) {
    const stillThere = current.has(row.normalizedNumber) && sameMoney(current.get(row.normalizedNumber) ?? null, row.after);
    if (!stillThere) {
      skipped += 1;
      continue;
    }
    if (row.kind === 'ADDED') remove.push({ normalizedNumber: row.normalizedNumber });
    else revert.push({ normalizedNumber: row.normalizedNumber, before: row.before, after: row.after });
  }
  return { runId: latest.runId, filename: rows[0].filename, at: rows[0].createdAt, revert, remove, skipped };
}

/** Só LÊ: o que desfazer a última atualização faria agora. `null` quando não há o que desfazer. */
export async function previewUndo(prisma: PrismaClient, tenantId: string): Promise<UndoPreview | null> {
  const plan = await planUndo(prisma, tenantId);
  if (!plan) return null;
  return { runId: plan.runId, filename: plan.filename, at: plan.at.toISOString(), prices: plan.revert.length, added: plan.remove.length, skipped: plan.skipped };
}

/** Desfaz a última atualização, numa transação só, e só se os números forem os que o administrador viu. */
export async function undoLastPriceListUpdate(
  prisma: PrismaClient,
  tenantId: string,
  approved: { runId: string; prices: number; added: number },
): Promise<UndoPreview> {
  return prisma.$transaction(async tx => {
    // Mesma trava das atualizações: uma operação de lista por vez.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`cognivault:commercial-import:${tenantId}`}, 0))`;
    const plan = await planUndo(tx, tenantId);
    if (!plan) throw new PriceListUndoError('Não há atualização para desfazer.');
    if (plan.runId !== approved.runId || plan.revert.length !== approved.prices || plan.remove.length !== approved.added) {
      throw new PriceListUndoError(
        `Os números mudaram desde que você viu: preços ${plan.revert.length} (visto ${approved.prices}), códigos novos ${plan.remove.length} (visto ${approved.added}). Nada foi desfeito.`,
      );
    }
    const now = new Date();

    let reverted = 0;
    for (const batch of chunk(plan.revert, BATCH)) {
      const values = Prisma.join(batch.map(item => Prisma.sql`(${item.normalizedNumber}::text, ${item.before}::float8, ${item.after}::float8)`));
      reverted += await tx.$executeRaw(Prisma.sql`
        UPDATE "MasterPart" AS p
        SET "price" = v."before", "updatedAt" = ${now}
        FROM (VALUES ${values}) AS v("normalizedNumber", "before", "after")
        WHERE p."tenantId" = ${tenantId}
          AND p."normalizedNumber" = v."normalizedNumber"
          AND p."price" IS NOT NULL
          AND ABS(p."price" - v."after") < 0.005
      `);
    }
    if (reverted !== plan.revert.length) throw new PriceListUndoError(`Voltou ${reverted} preços, esperava ${plan.revert.length}. Nada foi desfeito.`);

    let removed = 0;
    for (const batch of chunk(plan.remove.map(item => item.normalizedNumber), BATCH)) {
      // Só o que a atualização criou: a seção marcada como vinda da lista. Código de outra origem com o mesmo número não é tocado.
      await tx.masterPartSection.deleteMany({ where: { tenantId, normalizedNumber: { in: batch }, sourceSheet: { startsWith: 'LISTA_HTML' } } });
      removed += (await tx.masterPart.deleteMany({ where: { tenantId, normalizedNumber: { in: batch } } })).count;
    }
    if (removed !== plan.remove.length) throw new PriceListUndoError(`Removeu ${removed} códigos, esperava ${plan.remove.length}. Nada foi desfeito.`);

    await tx.priceListChange.updateMany({ where: { tenantId, runId: plan.runId }, data: { undoneAt: now } });
    return { runId: plan.runId, filename: plan.filename, at: plan.at.toISOString(), prices: reverted, added: removed, skipped: plan.skipped };
  }, TX_OPTIONS);
}
