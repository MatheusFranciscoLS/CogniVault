import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiJson } from '../lib';
import { formatBRL } from './quote-message';
import { useDebounced } from './use-item-lookup';

/** Uma linha que a loja já orçou no conserto (calculada no servidor a partir das OS arquivadas). */
export interface HistorySuggestion {
  name: string;
  partNumber: string | null;
  /** Em quantas OS apareceu. */
  count: number;
  /** Valor de referência (mediana das últimas vezes). */
  price: number | null;
  leadTime: string | null;
  isService: boolean;
}

export interface TogetherSuggestion extends HistorySuggestion {
  percent: number;
}

/** "R$ 15,00 · 8 vezes · Pronta entrega": o que a loja já fez com esta linha. Só texto de ação: sem explicar de onde veio. */
export function suggestionDetail(item: HistorySuggestion): string {
  return [
    item.price !== null ? formatBRL(item.price) : null,
    item.count === 1 ? '1 vez' : `${item.count} vezes`,
    item.leadTime,
  ].filter(Boolean).join(' · ');
}

const STOP_WORDS = new Set(['DE', 'DO', 'DA', 'DOS', 'DAS']);
// Mesma chave do servidor (`backend/src/utils/repair-history.ts`): sem acento, sem "de/do/da" e sem a quantidade quebrada "(0,3)" no fim.
const lineKey = (text: string) => text
  .normalize('NFD').replace(/\p{M}/gu, '').toUpperCase()
  .replace(/\(\s*\d+(?:[.,]\d+)?\s*\)\s*$/, ' ')
  .replace(/[^A-Z0-9]+/g, ' ').trim().split(' ')
  .filter(word => word && !STOP_WORDS.has(word)).join(' ');

/** É a MESMA linha que o histórico guarda? ("Filtro de gasolina" e "FILTRO GASOLINA" são; mesma regra de chave do servidor.) */
export function sameHistoryLine(a: string, b: string): boolean {
  const left = lineKey(a);
  return left !== '' && left === lineKey(b);
}

/**
 * O valor digitado foge do que a loja costuma cobrar nesta linha? Só avisa com base (5 vezes ou mais) e quando é pelo menos o TRIPLO ou menos de um terço
 * da referência: o que pega o zero a mais ou a menos ("150" digitado como "15" ou "1500"), sem reclamar de desconto ou de peça mais cara.
 */
export function priceLooksOff(typed: number | undefined, reference: { price: number | null; count: number } | undefined): boolean {
  if (!reference || reference.price === null || reference.price <= 0 || reference.count < 5) return false;
  if (typed === undefined || !Number.isFinite(typed) || typed <= 0) return false;
  const ratio = typed / reference.price;
  return ratio >= 3 || ratio <= 1 / 3;
}

/** Aceita só o formato esperado: resposta torta do servidor vira lista vazia, nunca derruba a tela do orçamento. */
export function cleanSuggestions<T extends HistorySuggestion>(value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is T => !!item && typeof item === 'object'
    && typeof (item as T).name === 'string' && (item as T).name.trim() !== ''
    && (typeof (item as T).price === 'number' ? Number.isFinite((item as T).price) : (item as T).price === null)
    && typeof (item as T).count === 'number');
}

/** Linhas parecidas com o que o balcão digitou (descrição ou código). Sem erro na tela: sem histórico, sem sugestão. */
export function useRepairSuggestions(text: string) {
  const query = useDebounced(text.trim(), 200);
  const enabled = query.length >= 2;
  const result = useQuery({
    queryKey: ['repair-suggestions', query],
    enabled,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => cleanSuggestions<HistorySuggestion>((await apiJson<{ items?: unknown }>(`/api/quotes/repair-suggestions?q=${encodeURIComponent(query)}`, { timeoutMs: 10_000 })).items),
  });
  return { items: enabled ? (result.data ?? []) : [], asked: query };
}

/** Acorda o histórico no servidor ao abrir a aba (a primeira leitura leva ~1,5 s; as teclas seguintes já acham tudo pronto). */
export function useRepairHistoryWarmup() {
  useQuery({
    queryKey: ['repair-history-warmup'],
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => { await apiJson(`/api/quotes/repair-suggestions?q=`, { timeoutMs: 15_000 }); return true; },
  });
}

/** O que costuma ir junto com a última peça lançada, sem o que o orçamento já tem. */
export function useRepairTogether(name: string | null, exclude: readonly string[]) {
  const key = [...exclude].map(item => item.trim().toLowerCase()).sort().join('|');
  const result = useQuery({
    queryKey: ['repair-together', name, key],
    enabled: !!name,
    staleTime: 60_000,
    retry: false,
    placeholderData: keepPreviousData,
    queryFn: async () => cleanSuggestions<TogetherSuggestion>((await apiJson<{ items?: unknown }>(`/api/quotes/repair-suggestions/together?name=${encodeURIComponent(name ?? '')}&exclude=${encodeURIComponent(exclude.join('|'))}`, { timeoutMs: 10_000 })).items)
      .filter(item => typeof item.percent === 'number'),
  });
  return name ? (result.data ?? []) : [];
}
