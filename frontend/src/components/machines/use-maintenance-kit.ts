import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../../lib';
import type { MaintenanceKitItem } from '../../types';

export type KitItem = MaintenanceKitItem & { part: NonNullable<MaintenanceKitItem['part']> };

/** O kit do catálogo interno do modelo. Mesma chave no painel do kit e em quem decide se mostra a revisão da lista: o servidor responde uma vez só. */
export function useMaintenanceKit(model: string) {
  const cleanModel = model.trim();
  return useQuery({
    queryKey: ['maintenance-kit', cleanModel],
    enabled: cleanModel.length > 0,
    queryFn: async () => {
      const data = await apiJson<{ items: MaintenanceKitItem[] }>(`/api/models/${encodeURIComponent(cleanModel)}/maintenance-kit`);
      return (data.items ?? []).filter((item): item is KitItem => Boolean(item.part));
    },
  });
}
