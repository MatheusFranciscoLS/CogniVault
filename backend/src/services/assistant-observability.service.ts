import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { interactiveAiBudgetStatus } from './interactive-ai-budget';
import { buildPortfolioCoverage } from './portfolio-coverage';

type CacheCountRow = { purpose: string; count: bigint | number };

type ActionMetrics = {
  action: string;
  calls: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
};

function numberFromMetadata(metadata: Prisma.JsonValue | null, key: string): number {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return 0;
  const value = Number((metadata as Record<string, Prisma.JsonValue>)[key] || 0);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function startOfUtcDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export class AssistantObservabilityService {
  static async snapshot(tenantId: string) {
    const since = startOfUtcDay();
    const [logs, budget, cacheRows, officialCacheCount, portfolio] = await Promise.all([
      prisma.auditLog.findMany({
        where: {
          tenantId,
          action: { startsWith: 'AI_TELEMETRY_' },
          createdAt: { gte: since },
        },
        select: { action: true, metadata: true },
        take: 5000,
      }),
      interactiveAiBudgetStatus(tenantId),
      prisma.$queryRaw<CacheCountRow[]>`
        SELECT "purpose", COUNT(*)::bigint AS "count"
        FROM "AiDecisionCache"
        WHERE "tenantId" = ${tenantId} AND "expiresAt" > NOW()
        GROUP BY "purpose"
        ORDER BY "purpose"
      `.catch(() => [] as CacheCountRow[]),
      prisma.officialSourceCache.count({ where: { source: 'HUSQVARNA', staleUntil: { gt: new Date() } } }),
      buildPortfolioCoverage(tenantId).catch(() => null),
    ]);

    const byAction = new Map<string, ActionMetrics>();
    for (const log of logs) {
      const current = byAction.get(log.action) || {
        action: log.action.replace(/^AI_TELEMETRY_/, ''),
        calls: 0,
        totalTokens: 0,
        promptTokens: 0,
        completionTokens: 0,
      };
      current.calls += 1;
      current.totalTokens += numberFromMetadata(log.metadata, 'totalTokens');
      current.promptTokens += numberFromMetadata(log.metadata, 'promptTokens');
      current.completionTokens += numberFromMetadata(log.metadata, 'completionTokens');
      byAction.set(log.action, current);
    }

    const actions = [...byAction.values()].sort((a, b) => b.totalTokens - a.totalTokens || b.calls - a.calls);
    const totals = actions.reduce((acc, item) => ({
      calls: acc.calls + item.calls,
      totalTokens: acc.totalTokens + item.totalTokens,
      promptTokens: acc.promptTokens + item.promptTokens,
      completionTokens: acc.completionTokens + item.completionTokens,
    }), { calls: 0, totalTokens: 0, promptTokens: 0, completionTokens: 0 });

    const interactiveActions = new Set(['CHAT_INTENT_PARSE', 'REACT_AGENT_DECISION']);
    const interactive = actions
      .filter(item => interactiveActions.has(item.action))
      .reduce((acc, item) => ({ calls: acc.calls + item.calls, totalTokens: acc.totalTokens + item.totalTokens }), { calls: 0, totalTokens: 0 });

    const portfolioCoverage = portfolio ? {
      totalModels: portfolio.total,
      localIplModels: portfolio.localIpl,
      withoutLocalIpl: portfolio.unverified,
      localCoveragePercent: portfolio.total ? Math.round((portfolio.localIpl / portfolio.total) * 1000) / 10 : 0,
    } : null;

    return {
      window: { since: since.toISOString(), timezone: 'UTC' },
      totals,
      interactive: {
        ...interactive,
        budgetTokens: budget.budgetTokens,
        remainingTokens: budget.remainingTokens,
        allowed: budget.allowed,
        usedBudgetTokens: budget.usedTokens,
      },
      actions,
      reusableDecisionCache: cacheRows.map(row => ({ purpose: row.purpose, entries: Number(row.count) })),
      officialHusqvarnaCacheEntries: officialCacheCount,
      portfolioCoverage,
    };
  }
}
