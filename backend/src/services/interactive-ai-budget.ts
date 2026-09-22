import { LRUCache } from 'lru-cache';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

const INTERACTIVE_ACTIONS = [
  'AI_TELEMETRY_CHAT_INTENT_PARSE',
  'AI_TELEMETRY_CHAT_INTENT_CHOOSE',
  'AI_TELEMETRY_PART_PICK',
  'AI_TELEMETRY_REACT_AGENT_DECISION',
] as const;

export type InteractiveAiBudgetStatus = {
  budgetTokens: number;
  usedTokens: number;
  remainingTokens: number;
  allowed: boolean;
};

export type InteractiveAiBudgetReservation = {
  id: string;
  reservedTokens: number;
};

const usageCache = new LRUCache<string, InteractiveAiBudgetStatus>({
  max: 200,
  ttl: 30_000,
});
const pendingStatus = new Map<string, Promise<InteractiveAiBudgetStatus>>();

function dailyBudgetTokens(): number {
  const configured = Number(process.env.AI_INTERACTIVE_DAILY_TOKEN_BUDGET || '120000');
  if (!Number.isFinite(configured)) return 120_000;
  return Math.max(10_000, Math.trunc(configured));
}

function startOfUtcDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function reservationTokens(): number {
  const configured = Number(process.env.AI_INTERACTIVE_RESERVATION_TOKENS || '12000');
  if (!Number.isFinite(configured)) return 12_000;
  return Math.max(1_000, Math.trunc(configured));
}

function invalidateBudget(tenantId: string): void {
  usageCache.delete(tenantId);
}

export function interactiveAiReservationFitsBudget(
  usedTokens: number,
  budgetTokens: number,
  reservationTokens: number,
): boolean {
  return Number.isFinite(usedTokens)
    && Number.isFinite(budgetTokens)
    && Number.isFinite(reservationTokens)
    && usedTokens >= 0
    && budgetTokens >= 0
    && reservationTokens > 0
    && usedTokens + reservationTokens <= budgetTokens;
}

/**
 * Se a falha aconteceu antes de qualquer tentativa contra o Gemini, a reserva
 * pode ser liquidada em zero. Depois que uma chamada foi tentada, timeout,
 * conexão interrompida ou 5xx não provam consumo zero: manter `null` conserva o
 * teto reservado até o fim do dia e evita estourar silenciosamente a cota free.
 */
export function interactiveAiFailureSettlementTokens(requestAttempted: boolean): 0 | null {
  return requestAttempted ? null : 0;
}

export async function interactiveAiBudgetStatus(tenantId: string): Promise<InteractiveAiBudgetStatus> {
  const cached = usageCache.get(tenantId);
  if (cached) return cached;
  const pending = pendingStatus.get(tenantId);
  if (pending) return pending;

  const load = (async () => {
    const [row] = await prisma.$queryRaw<Array<{ usedTokens: number | null }>>`
    SELECT (
      COALESCE(SUM(
      CASE
        WHEN ("metadata"->>'totalTokens') ~ '^[0-9]+$'
        THEN ("metadata"->>'totalTokens')::numeric
        ELSE 0
      END
      ) FILTER (WHERE NOT ("metadata" ? 'reservationId')), 0)
      + COALESCE((
        SELECT SUM(CASE WHEN "actualTokens" IS NULL THEN "reservedTokens" ELSE "actualTokens" END)
        FROM "InteractiveAiBudgetReservation"
        WHERE "tenantId" = ${tenantId} AND "day" = ${startOfUtcDay()}
      ), 0)
    )::float8 AS "usedTokens"
    FROM "AuditLog"
    WHERE "tenantId" = ${tenantId}
      AND "action" IN (${Prisma.join(INTERACTIVE_ACTIONS)})
      AND "createdAt" >= ${startOfUtcDay()}
    `;

    const budgetTokens = dailyBudgetTokens();
    const totalUsedTokens = row?.usedTokens ?? 0;
    const usedTokens = Number.isFinite(totalUsedTokens) ? Math.max(0, Math.trunc(totalUsedTokens)) : 0;
    const remainingTokens = Math.max(0, budgetTokens - usedTokens);
    const status = { budgetTokens, usedTokens, remainingTokens, allowed: remainingTokens > 0 };
    usageCache.set(tenantId, status);
    return status;
  })();
  pendingStatus.set(tenantId, load);
  try {
    return await load;
  } finally {
    if (pendingStatus.get(tenantId) === load) pendingStatus.delete(tenantId);
  }
}

/**
 * Reserve the whole request allowance in PostgreSQL before calling Gemini.
 * The advisory lock makes the check-and-insert atomic across Render instances.
 * An abandoned reservation remains conservative until the UTC day changes.
 */
export async function reserveInteractiveAiBudget(
  tenantId: string,
): Promise<InteractiveAiBudgetReservation | null> {
  const budgetTokens = dailyBudgetTokens();
  const reservedTokens = Math.min(budgetTokens, reservationTokens());
  const day = startOfUtcDay();
  const lockKey = `interactive-ai-budget:${tenantId}:${day.toISOString().slice(0, 10)}`;

  const reservation = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
    const [row] = await tx.$queryRaw<Array<{ usedTokens: number | null }>>`
      SELECT (
        COALESCE(SUM(
          CASE
            WHEN ("metadata"->>'totalTokens') ~ '^[0-9]+$'
            THEN ("metadata"->>'totalTokens')::numeric
            ELSE 0
          END
        ) FILTER (WHERE NOT ("metadata" ? 'reservationId')), 0)
        + COALESCE((
          SELECT SUM(CASE WHEN "actualTokens" IS NULL THEN "reservedTokens" ELSE "actualTokens" END)
          FROM "InteractiveAiBudgetReservation"
          WHERE "tenantId" = ${tenantId} AND "day" = ${day}
        ), 0)
      )::float8 AS "usedTokens"
      FROM "AuditLog"
      WHERE "tenantId" = ${tenantId}
        AND "action" IN (${Prisma.join(INTERACTIVE_ACTIONS)})
        AND "createdAt" >= ${day}
    `;
    const usedTokens = Math.max(0, Math.trunc(Number(row?.usedTokens || 0)));
    if (!interactiveAiReservationFitsBudget(usedTokens, budgetTokens, reservedTokens)) return null;
    return tx.interactiveAiBudgetReservation.create({
      data: { tenantId, day, reservedTokens },
      select: { id: true, reservedTokens: true },
    });
  }, { maxWait: 10_000, timeout: 20_000 });

  invalidateBudget(tenantId);
  return reservation;
}

export async function settleInteractiveAiBudget(
  tenantId: string,
  reservationId: string,
  tokens: unknown,
): Promise<void> {
  const actualTokens = Math.max(0, Math.trunc(Number(tokens) || 0));
  await prisma.interactiveAiBudgetReservation.updateMany({
    where: { id: reservationId, tenantId, actualTokens: null },
    data: { actualTokens, settledAt: new Date() },
  });
  invalidateBudget(tenantId);
}

export async function canUseInteractiveAi(tenantId: string): Promise<boolean> {
  return (await interactiveAiBudgetStatus(tenantId)).allowed;
}

export function consumeInteractiveAiBudget(tenantId: string, tokens: unknown): void {
  const amount = Number(tokens || 0);
  if (!Number.isFinite(amount) || amount <= 0) return;
  const cached = usageCache.get(tenantId);
  if (!cached) return;
  const usedTokens = cached.usedTokens + Math.trunc(amount);
  const remainingTokens = Math.max(0, cached.budgetTokens - usedTokens);
  usageCache.set(tenantId, {
    ...cached,
    usedTokens,
    remainingTokens,
    allowed: remainingTokens > 0,
  });
}
