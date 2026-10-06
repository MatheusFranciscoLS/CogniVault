import { apiJson, cleanErpCode } from '../../lib';

type UsageItem = { partNumber: string; model?: string | null };
const SESSION_KEY = 'cognivault_quote_usage_session';

function createSessionId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Plano B para navegador sem `randomUUID`. Este id só agrupa a sessão nas
  // estatísticas de uso (COUNT DISTINCT) e nunca autentica nada, mas
  // `getRandomValues` existe onde `randomUUID` falta e não tem o defeito de
  // aleatoriedade previsível que o CodeQL apontava no `Math.random`.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
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
