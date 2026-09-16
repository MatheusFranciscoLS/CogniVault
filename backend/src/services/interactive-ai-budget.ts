import { LRUCache } from 'lru-cache';
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

function dailyBudgetTokens(): number {
  const configured = Number(process.env.AI_INTERACTIVE_DAILY_TOKEN_BUDGET || '120000');
  if (!Number.isFinite(configured)) return 120_000;
  return Math.max(10_000, Math.trunc(configured));
}

function startOfUtcDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function tokensFromMetadata(metadata: unknown): number {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return 0;
  const value = Number((metadata as Record<string, unknown>).totalTokens || 0);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

export async function interactiveAiBudgetStatus(tenantId: string): Promise<InteractiveAiBudgetStatus> {
  const cached = usageCache.get(tenantId);
  if (cached) return cached;

  const rows = await prisma.auditLog.findMany({
    where: {
      tenantId,
      action: { in: [...INTERACTIVE_ACTIONS] },
      createdAt: { gte: startOfUtcDay() },
    },
    select: { metadata: true },
    take: 1000,
  });

  const budgetTokens = dailyBudgetTokens();
  const usedTokens = rows.reduce((sum, row) => sum + tokensFromMetadata(row.metadata), 0);
  const remainingTokens = Math.max(0, budgetTokens - usedTokens);
  const status = {
    budgetTokens,
    usedTokens,
    remainingTokens,
    allowed: remainingTokens > 0,
  };
  usageCache.set(tenantId, status);
  return status;
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
