import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../../lib';
import type { HusqvarnaOfficialSearchResult } from '../parts-v2/types';

export function normalizeOfficialSearchResults(value: unknown): HusqvarnaOfficialSearchResult[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(raw => {
    const item = raw as Record<string, unknown>;
    if (typeof item.kind === 'string' && typeof item.title === 'string') return [item as unknown as HusqvarnaOfficialSearchResult];
    // O endpoint antigo devolvia apenas produtos; a leitura continua aqui para
    // o balcão não quebrar durante uma promoção parcial do backend.
    if (typeof item.productName === 'string' && typeof item.pnc === 'string') {
      return [{
        kind: 'PRODUCT' as const,
        id: String(item.pnc),
        title: String(item.productName),
        subtitle: null,
        pnc: String(item.pnc),
        partNumber: null,
        categoryName: typeof item.categoryName === 'string' ? item.categoryName : null,
        portalUrl: typeof item.portalUrl === 'string' ? item.portalUrl : null,
        imageUrl: typeof item.imageUrl === 'string' ? item.imageUrl : null,
        discontinued: Boolean(item.discontinued),
        numberOfVariants: typeof item.numberOfVariants === 'number' ? item.numberOfVariants : null,
        documentType: null,
        languages: [],
        lastUpdated: null,
        productCount: null,
      }];
    }
    return [];
  });
}

/**
 * Busca de máquina no catálogo oficial Husqvarna.
 *
 * Uma função só, usada pela tela de máquinas e pelo atendimento, com a MESMA
 * chave de cache (`official-machine-search`). É isso que faz o balcão pagar a
 * chamada externa **uma vez** por modelo: o atendente que busca "carburador
 * 143RII" e depois abre a tela de máquinas não consulta o Portal duas vezes.
 *
 * Fica no cliente de propósito. O stream de busca só ANUNCIA que o texto tem
 * cara de máquina — se ele também buscasse, o `done` do stream esperaria o
 * Portal (teto de 8s) com a peça já na tela.
 */
export function useOfficialMachineSearch(term: string) {
  const clean = term.trim();
  return useQuery({
    queryKey: ['official-machine-search', clean],
    enabled: clean.length >= 2,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const response = await apiJson<{ results: unknown }>(
        `/api/husqvarna/products/search?q=${encodeURIComponent(clean)}`,
        { timeoutMs: 15_000 },
      );
      return normalizeOfficialSearchResults(response.results);
    },
  });
}
