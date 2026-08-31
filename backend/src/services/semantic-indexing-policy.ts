function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, Math.trunc(parsed))) : fallback;
}

export function semanticIndexingEnabled(): boolean {
  return ['1', 'true', 'yes', 'on'].includes((process.env.ENABLE_SEMANTIC_INDEXING || 'false').trim().toLowerCase());
}

export function semanticPartBudgetPerDocument(): number {
  return boundedInteger(process.env.SEMANTIC_PARTS_PER_DOCUMENT, 120, 0, 500);
}

export function semanticChunkBudgetPerDocument(): number {
  return boundedInteger(process.env.SEMANTIC_CHUNKS_PER_DOCUMENT, 24, 0, 120);
}

export function semanticAdminBatchLimit(): number {
  return boundedInteger(process.env.SEMANTIC_ADMIN_BATCH_LIMIT, 120, 10, 500);
}

export function semanticDailyAdminRuns(): number {
  return boundedInteger(process.env.SEMANTIC_DAILY_ADMIN_RUNS, 2, 0, 12);
}

export function semanticQueryLimitPerHour(): number {
  return boundedInteger(process.env.SEMANTIC_QUERY_LIMIT_PER_HOUR, 120, 0, 5000);
}

let queryWindow = '';
let queryCount = 0;

/**
 * Freio de custo local por instância. Se o limite acabar, os recuperadores
 * textual e fuzzy continuam funcionando normalmente, sem erro para o balcão.
 */
export function consumeSemanticQueryBudget(now = new Date()): boolean {
  const limit = semanticQueryLimitPerHour();
  if (!semanticIndexingEnabled() || limit === 0) return false;
  const window = now.toISOString().slice(0, 13);
  if (window !== queryWindow) {
    queryWindow = window;
    queryCount = 0;
  }
  if (queryCount >= limit) return false;
  queryCount += 1;
  return true;
}

export function resetSemanticQueryBudgetForTests(): void {
  queryWindow = '';
  queryCount = 0;
}
