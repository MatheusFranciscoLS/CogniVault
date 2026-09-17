// Cliente do Portal Parceiro Husqvarna (parceirohusqvarna.com).
//
// Não faz login. Não guarda usuário nem senha em lugar nenhum. Usa uma
// sessão que um humano já criou logando manualmente no portal — o cookie
// fica só numa variável de ambiente (PARCEIRO_HUSQVARNA_COOKIE), colada
// direto no Render, nunca commitada nem passada por código.
//
// Só faz GET. Não existe, neste arquivo, nenhuma chamada capaz de adicionar
// item ao carrinho ou fechar pedido — a rota de compra do portal (POST em
// /Product/AddToCart ou parecido) nunca é referenciada aqui.
import { LRUCache } from 'lru-cache';
import { buildProductDetailUrl, parseConsumerPriceFromProductDetail } from './parceiro-husqvarna-price.service';

const REQUEST_TIMEOUT_MS = 8_000;

// Toda peça vista nas buscas de exemplo veio com a mesma unidade de
// negócio ("SSP"), então tratamos como padrão fixo do catálogo desta
// revenda em vez de descobrir de novo a cada consulta. Se algum código
// específico não existir nessa unidade, a consulta volta `null` (peça não
// encontrada) em vez de quebrar — o chamador decide o que fazer com isso.
const DEFAULT_PRODUCT_BUSINESS_UNIT = 'SSP';

// Preço muda pouco de um dia pro outro, e cada consulta é uma requisição a
// mais na sessão de outra pessoa: cachear por um tempo reduz tanto a carga
// no portal quanto o risco de parecer tráfego automatizado repetitivo.
const PRICE_CACHE_TTL_MS = 60 * 60 * 1000;
// A lib de cache não aceita `null` como valor direto, então embrulhamos o
// resultado — inclusive quando o resultado é "não achei o preço", que
// também vale a pena cachear (evita bater de novo numa peça sem preço).
type CachedPrice = { price: number | null };
const priceCache = new LRUCache<string, CachedPrice>({ max: 2_000, ttl: PRICE_CACHE_TTL_MS });

function getSessionCookie(): string | null {
  const cookie = process.env.PARCEIRO_HUSQVARNA_COOKIE;
  return cookie && cookie.trim() ? cookie.trim() : null;
}

/** true quando a variável de ambiente existe — permite a UI perguntar "essa função está configurada?" sem tentar buscar nada. */
export function parceiroHusqvarnaConfigured(): boolean {
  return getSessionCookie() !== null;
}

/**
 * Busca o PREÇO CONSUMIDOR (o mesmo valor que a tela do Portal Parceiro
 * mostra como "Preço Consumidor (R$)") para um código de peça. Nunca lança
 * exceção: sessão expirada, portal fora do ar, peça não encontrada, layout
 * mudou — tudo isso vira `null`. Quem chama decide se isso é "não achei o
 * preço, segue sem ele" (o certo, para uma tela de balcão) ou motivo de
 * alarme (não é).
 */
export async function fetchConsumerPrice(
  productId: string,
  productBusinessUnit: string = DEFAULT_PRODUCT_BUSINESS_UNIT,
): Promise<number | null> {
  const cookie = getSessionCookie();
  if (!cookie) return null;

  const cacheKey = `${productId}:${productBusinessUnit}`;
  const cached = priceCache.get(cacheKey);
  if (cached !== undefined) return cached.price;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(buildProductDetailUrl(productId, productBusinessUnit), {
      method: 'GET',
      redirect: 'manual', // uma sessão expirada normalmente redireciona pro login; tratamos isso como "não achei", nunca seguimos o redirect.
      signal: controller.signal,
      headers: {
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        Cookie: cookie,
      },
    });

    if (!response.ok) {
      priceCache.set(cacheKey, { price: null });
      return null;
    }

    const body = await response.json();
    const price = parseConsumerPriceFromProductDetail(body);
    priceCache.set(cacheKey, { price });
    return price;
  } catch (error) {
    console.warn(`[Portal Parceiro] Não foi possível consultar o preço de ${productId}:`, error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
