export function isVisualQuotaFailure(error: string | null | undefined): boolean {
  if (!error) return false;
  return /(?:cota|quota).*(?:ia|gemini)|(?:ia|gemini).*(?:cota|quota)/i.test(error)
    && /(?:visual|pdf|leitura|modelo)/i.test(error);
}

export function normalizeVisualRetryLimit(value: unknown, fallback = 1): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return Math.min(3, Math.max(1, Math.trunc(fallback) || 1));
  return Math.min(3, Math.max(1, Math.trunc(parsed)));
}
