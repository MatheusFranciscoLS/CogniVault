import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../lib';
import { normalizeCode, useMasterPrices } from '../components/machines/master-part-prices';
import { resolveItemLookup, type ItemLookup, type OfficialHit } from './item-lookup';

/** Espera o balcão parar de digitar antes de consultar: um código de 9 dígitos faria 9 consultas. */
export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/**
 * O que o sistema sabe sobre o código digitado (cadastro de preços da loja e catálogos oficiais de motor), nunca bloqueando a digitação.
 * Regra do dono (2026-10-09): Husqvarna, Briggs, Kawasaki e Kohler preenchem; qualquer outro fornecedor não puxa nada. Ver `resolveItemLookup`.
 */
export function useItemLookup(code: string) {
  const debouncedCode = useDebounced(code, 350);
  const typed = normalizeCode(code);
  const asked = normalizeCode(debouncedCode);
  const enabled = asked.length >= 4;
  const settled = typed === asked;

  const prices = useMasterPrices(enabled ? [debouncedCode] : []);
  const official = useQuery({
    queryKey: ['item-official-hits', asked],
    // Só código com cara de código (3 dígitos ou mais), como o resto do produto: "TRAMONTINA" nunca existe no índice dos motores.
    enabled: enabled && (asked.match(/\d/g) || []).length >= 3,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => (await apiJson<{ officialParts: OfficialHit[] }>(`/api/official-parts/by-code?code=${encodeURIComponent(asked)}`, { timeoutMs: 10_000 })).officialParts ?? [],
  });

  const lookup: ItemLookup = enabled && settled
    ? resolveItemLookup({ code: debouncedCode, store: prices.data?.prices[asked] ?? null, official: official.data ?? [] })
    : { kind: 'NONE' };
  const searching = enabled && (!settled || prices.isFetching || official.isFetching);
  return { enabled, searching, found: lookup.kind === 'FOUND' ? lookup : null, typed };
}
