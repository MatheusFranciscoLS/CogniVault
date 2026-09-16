const CART_KEY = 'cognivault_quote_cart';
const HISTORY_KEY = 'cognivault_quote_history';
const ACTIVE_SCOPE_KEY = 'cognivault_quote_active_scope';
const ANONYMOUS_SCOPE = 'anonymous';

const QUOTE_KEYS = [CART_KEY, HISTORY_KEY] as const;

function scopedKey(baseKey: string, scope: string) {
  return `${baseKey}:${scope}`;
}

function copyCurrentIntoScope(scope: string) {
  if (!scope || scope === ANONYMOUS_SCOPE) return;
  for (const baseKey of QUOTE_KEYS) {
    const current = localStorage.getItem(baseKey);
    const destination = scopedKey(baseKey, scope);
    if (current === null) localStorage.removeItem(destination);
    else localStorage.setItem(destination, current);
  }
}

function loadScopeIntoCurrent(scope: string) {
  for (const baseKey of QUOTE_KEYS) {
    if (!scope || scope === ANONYMOUS_SCOPE) {
      localStorage.removeItem(baseKey);
      continue;
    }
    const stored = localStorage.getItem(scopedKey(baseKey, scope));
    if (stored === null) localStorage.removeItem(baseKey);
    else localStorage.setItem(baseKey, stored);
  }
}

export function quoteStorageScopeFromSession() {
  const email = localStorage.getItem('cognivault_email')?.trim().toLocaleLowerCase('pt-BR');
  return email || ANONYMOUS_SCOPE;
}

/**
 * QuoteCartContext ainda usa as chaves históricas por compatibilidade. Esta
 * barreira troca o conteúdo dessas chaves antes de o provider montar e mantém
 * uma cópia definitiva por usuário. Assim duas contas no mesmo navegador nunca
 * herdam o orçamento ou o histórico uma da outra.
 */
export function activateQuoteStorageScope(scope: string) {
  try {
    const nextScope = scope || ANONYMOUS_SCOPE;
    const previousScope = localStorage.getItem(ACTIVE_SCOPE_KEY);
    if (previousScope === nextScope) return;

    // Primeira execução em uma tela de login: preserve o carrinho legado até
    // sabermos qual usuário autenticado deve recebê-lo.
    if (!previousScope && nextScope === ANONYMOUS_SCOPE) return;

    if (previousScope && previousScope !== ANONYMOUS_SCOPE) {
      copyCurrentIntoScope(previousScope);
    } else if (!previousScope && nextScope !== ANONYMOUS_SCOPE) {
      // Migração única das chaves antigas para o usuário que já estava logado
      // quando esta versão entrou em produção.
      for (const baseKey of QUOTE_KEYS) {
        const legacy = localStorage.getItem(baseKey);
        const destination = scopedKey(baseKey, nextScope);
        if (legacy !== null && localStorage.getItem(destination) === null) {
          localStorage.setItem(destination, legacy);
        }
      }
    }

    loadScopeIntoCurrent(nextScope);
    localStorage.setItem(ACTIVE_SCOPE_KEY, nextScope);
  } catch {
    // Armazenamento local é conveniência operacional; falha de storage não deve
    // impedir login, busca ou orçamento em memória durante a sessão atual.
  }
}
