import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../lib';
import type { MachineListResponse } from './machine-list';

/**
 * A lista de máquinas da Husqvarna (Tabela de preços). É o ÚNICO dono da consulta `['machine-list']`: a aba e o
 * selo "na lista de preços" do painel da máquina usam este hook, então a lista é buscada uma vez por sessão
 * (10 min de cache) e nunca por duas funções diferentes sob a mesma chave.
 */
export function useMachineList(enabled = true) {
  return useQuery({
    queryKey: ['machine-list'],
    enabled,
    staleTime: 10 * 60 * 1000,
    queryFn: () => apiJson<MachineListResponse>('/api/machine-list', { timeoutMs: 25_000 }),
  });
}
