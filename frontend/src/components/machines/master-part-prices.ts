import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../../lib';

/**
 * `FRESH`: compra do mês corrente, preço vale como está.
 * `STALE`: compra de mês anterior — mostra, mas manda conferir.
 * `UNKNOWN`: sem data de compra; não dá para afirmar que está atual.
 */
export type PriceFreshness = 'FRESH' | 'STALE' | 'UNKNOWN';

export type MasterPrice = {
  partNumber: string;
  name: string;
  price: number | null;
  stock: number | null;
  /** Prateleira, como a loja escreve: "P13-A1", "PF". */
  location: string | null;
  freshness: PriceFreshness;
};
export type MasterPriceMap = Record<string, MasterPrice>;

/** Mesma normalização do servidor: maiúscula, sem traço e sem espaço. */
export function normalizeCode(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/** Quantas peças da lista têm preço na loja. */
export function priceCoverage(codes: string[], prices: MasterPriceMap | undefined): string | null {
  if (!prices) return null;
  const comPreco = codes.filter(code => {
    const hit = prices[normalizeCode(code)];
    return hit && hit.price != null;
  }).length;
  if (!comPreco) return null;
  return `${comPreco} de ${codes.length} com preço`;
}

export function formatPrice(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

/**
 * Preço da lista comercial para os códigos de um catálogo de fabricante.
 *
 * Kawasaki e Briggs devolvem código e descrição, mas **preço nenhuma das duas
 * dá** — a Kawasaki escreve "Please Contact a Dealer" em toda linha. O preço é
 * da loja, e mora em `master_parts`. Sem isto o atendente achava o código e
 * precisava começar outra busca para saber quanto custa.
 *
 * Uma chamada para a lista inteira, não uma por peça: catálogo de motor Briggs
 * tem 150–283 linhas, e 283 idas ao Render free por atendimento é o tipo de
 * coisa que faz a tela travar justamente com o cliente na frente.
 *
 * O resultado fica em cache por 5 minutos por conjunto de códigos. A chave
 * inclui os códigos ordenados para dois conjuntos iguais em ordem diferente
 * aproveitarem o mesmo cache.
 */
export function useMasterPrices(codes: string[]) {
  const normalized = [...new Set(codes.map(normalizeCode).filter(code => code.length >= 4))].sort();

  return useQuery({
    queryKey: ['master-part-prices', normalized.join(',')],
    enabled: normalized.length > 0,
    staleTime: 5 * 60 * 1000,
    // Preço ausente não é erro que valha repetir: ou a peça não está no
    // cadastro, ou a lista não foi importada ainda. Repetir só gastaria.
    retry: false,
    queryFn: async () => {
      const data = await apiJson<{ prices: MasterPriceMap }>('/api/master-parts/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codes: normalized }),
        timeoutMs: 20_000,
      });
      return data.prices;
    },
  });
}
