import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../lib';

// Consultas do painel do dono (Negócio) que mais de um cartão usa: o cartão da lista e o resumo "Precisa de você" leem a MESMA chave de cache,
// então o servidor é consultado uma vez só. Uma única `queryFn` por chave (duas funções para a mesma chave fazem o React Query usar a que montou primeiro).

export type SearchMiss = { id: string; query: string; count: number; firstSeenAt: string; lastSeenAt: string };
export const SEARCH_MISSES_DAYS = 30;
export const SEARCH_MISSES_KEY = ['search-misses', SEARCH_MISSES_DAYS] as const;

export function useSearchMissesData() {
  return useQuery({
    queryKey: SEARCH_MISSES_KEY,
    staleTime: 60_000,
    queryFn: () => apiJson<{ total: number; items: SearchMiss[] }>(`/api/admin/search-misses?days=${SEARCH_MISSES_DAYS}&limit=50`, { timeoutMs: 25_000 }),
  });
}

export type EnginePartWithoutPrice = { partNumber: string; name: string; sources: string[]; engines: number; engineExamples: string[] };

export function useEnginePartsWithoutPriceData() {
  return useQuery({
    queryKey: ['engine-parts-without-price'],
    staleTime: 60_000,
    queryFn: () => apiJson<{ total: number; items: EnginePartWithoutPrice[] }>('/api/admin/engine-parts-without-price?limit=50', { timeoutMs: 25_000 }),
  });
}

export type LastPriceListUpdate = { runId: string; filename: string; at: string; prices: number; added: number; skipped: number };

export function usePriceListLast() {
  return useQuery({
    queryKey: ['price-list-last'],
    staleTime: 30_000,
    retry: false,
    queryFn: async () => (await apiJson<{ last: LastPriceListUpdate | null }>('/api/admin/price-list/last', { timeoutMs: 20_000 })).last,
  });
}

/** Dias inteiros desde `iso` (hoje = 0). */
export function daysSince(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  return Number.isFinite(time) ? Math.max(0, Math.floor((now - time) / (24 * 3600 * 1000))) : null;
}
