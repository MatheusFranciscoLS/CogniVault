import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../lib';

export type PortalEquipmentItem = { id: string; name: string; value: string | null };
export type PortalEquipment = { included: PortalEquipmentItem[]; notIncluded: PortalEquipmentItem[] } | null;
export type PortalAccessory = { id: string; name: string; discontinued: boolean };
export type MachinePortalData = { equipment: PortalEquipment; accessories: PortalAccessory[]; imageUrl: string | null };

/**
 * O que o Portal Husqvarna sabe de uma máquina que a lista de preços não traz: o que acompanha e os acessórios
 * dela. Lê o detalhe oficial por PNC (o mesmo da vista explodida, que o servidor guarda em cache).
 *
 * Sem retentativa e sem erro na tela: se o Portal não responde ou não conhece o PNC, quem usa recebe dados vazios
 * e a seção simplesmente não aparece. O balcão não precisa de aviso sobre integração.
 */
export function useMachinePortal(pnc: string) {
  return useQuery({
    queryKey: ['machine-portal', pnc],
    staleTime: 10 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<MachinePortalData> => {
      const data = await apiJson<{ product?: { equipment?: PortalEquipment; accessories?: PortalAccessory[]; imageUrl?: string | null } }>(
        `/api/husqvarna/products/${encodeURIComponent(pnc)}/details`,
        { timeoutMs: 20_000 },
      );
      return { equipment: data.product?.equipment ?? null, accessories: data.product?.accessories ?? [], imageUrl: data.product?.imageUrl ?? null };
    },
  });
}
