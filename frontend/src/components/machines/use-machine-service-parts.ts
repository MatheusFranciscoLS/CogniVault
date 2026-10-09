import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../../lib';

export type ServicePart = { partNumber: string; name: string; kind: 'PREVENTIVO' | 'CONSUMIVEL' | 'PREDITIVO' };

/** As peças de revisão do PNC (campo "reparo" da lista de preços). Vazio quando a lista ainda não foi carregada com o campo. */
export function useMachineServiceParts(pnc: string | null | undefined) {
  const digits = (pnc ?? '').replace(/\D/g, '');
  return useQuery({
    queryKey: ['machine-service-parts', digits.slice(0, 9)],
    enabled: digits.length >= 9,
    staleTime: 10 * 60 * 1000,
    retry: false,
    queryFn: async () => (await apiJson<{ parts: ServicePart[] }>(`/api/machines/${encodeURIComponent(digits)}/service-parts`, { timeoutMs: 15_000 })).parts ?? [],
  });
}
