import { LRUCache } from 'lru-cache';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

const INTERACTIVE_ACTIONS = [
  'AI_TELEMETRY_CHAT_INTENT_PARSE',
  'AI_TELEMETRY_REACT_AGENT_DECISION',
] as const;

export type InteractiveAiBudgetStatus = {
  budgetTokens: number;
  usedTokens: number;
  remainingTokens: number;
  allowed: boolean;
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

export async function interactiveAiBudgetStatus(tenantId: string): Promise<InteractiveAiBudgetStatus> {
  const cached = usageCache.get(tenantId);
  if (cached) return cached;
  const pending = pendingStatus.get(tenantId);
  if (pending) return pending;

  const load = (async () => {
    const [row] = await prisma.$queryRaw<Array<{ usedTokens: number | null }>>`
    SELECT COALESCE(SUM(
      CASE
        WHEN ("metadata"->>'totalTokens') ~ '^[0-9]+$'
        THEN ("metadata"->>'totalTokens')::numeric
        ELSE 0
      END
    ), 0)::float8 AS "usedTokens"
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
