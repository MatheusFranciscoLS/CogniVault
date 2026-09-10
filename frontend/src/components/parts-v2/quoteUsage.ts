import { apiJson, cleanErpCode } from '../../lib';

type UsageItem = { partNumber: string; model?: string | null };
const SESSION_KEY = 'cognivault_quote_usage_session';

function createSessionId() {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getSessionId(reset = false) {
  try {
    if (!reset) {
      const current = sessionStorage.getItem(SESSION_KEY);
      if (current) return current;
    }
    const id = createSessionId();
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return createSessionId();
  }
}

export function recordQuoteUsage(items: UsageItem[], resetSession = false) {
  const normalized = new Map<string, UsageItem>();
  for (const item of items) {
    const code = cleanErpCode(item.partNumber);
    if (!code) continue;
    normalized.set(code, { partNumber: code, model: item.model || null });
  }
  if (!normalized.size) return;
  void apiJson('/api/analytics/quote-usage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: getSessionId(resetSession), items: [...normalized.values()] }),
    timeoutMs: 8_000,
  }).catch(() => undefined);
}
