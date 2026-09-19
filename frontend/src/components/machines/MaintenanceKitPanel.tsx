import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiJson, cleanErpCode } from '../../lib';
import { useQuoteCart } from '../../context/QuoteCartContext';
import type { MaintenanceKitItem } from '../../types';

type Props = { model: string; pnc?: string | null };
type KitItem = MaintenanceKitItem & { part: NonNullable<MaintenanceKitItem['part']> };

export default function MaintenanceKitPanel({ model, pnc }: Props) {
  const quoteCart = useQuoteCart();
  const cleanModel = model.trim();

  const kitQuery = useQuery({
    queryKey: ['maintenance-kit', cleanModel],
    enabled: cleanModel.length > 0,
    queryFn: async () => {
      const data = await apiJson<{ items: MaintenanceKitItem[] }>(`/api/models/${encodeURIComponent(cleanModel)}/maintenance-kit`);
      return (data.items ?? []).filter((item): item is KitItem => Boolean(item.part));
    },
  });

  const items = useMemo(() => kitQuery.data ?? [], [kitQuery.data]);
  const loading = kitQuery.isLoading;

  const cartItems = useMemo(() => items.map(item => ({
    partNumber: item.part.partNumber,
    effectiveCode: item.part.partNumber,
    name: item.part.name,
    model: item.part.model,
    pnc: item.part.pnc ?? pnc ?? null,
    section: item.part.section,
    position: item.part.position,
    filename: item.part.filename ?? null,
    page: item.part.page,
    quantity: 1,
  })), [items, pnc]);

  // O kit só aparece quando o catálogo interno cobre o modelo. Sem cobertura,
  // um bloco vazio só ocuparia espaço no balcão.
  if (!loading && !items.length) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-4 py-3 dark:border-ink-800">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[.13em] text-brand-600 dark:text-brand-300">Revisão rápida</div>
          <div className="mt-0.5 text-sm font-black text-ink-900 dark:text-white">Kit de manutenção · {cleanModel}</div>
        </div>
        {items.length > 0 && (
          <button type="button" onClick={() => quoteCart.addItems(cartItems)} className="h-9 rounded-lg bg-ink-900 px-3 text-[11px] font-black text-white transition hover:bg-ink-950">
            Adicionar kit ao orçamento
          </button>
        )}
      </div>

      {loading ? (
        <div className="px-4 py-6 text-xs font-semibold text-ink-500 dark:text-ink-400">Montando o kit de manutenção deste modelo…</div>
      ) : (
        <div className="grid gap-px bg-ink-100 sm:grid-cols-2 dark:bg-ink-800">
          {items.map((item, index) => (
            <div key={`${item.category}-${item.part.id}`} className="bg-white px-4 py-3 dark:bg-ink-900">
              <div className="text-[9px] font-black uppercase tracking-[.12em] text-ink-500 dark:text-ink-400">{item.label}</div>
              <div className="mt-1 truncate text-xs font-bold text-ink-800 dark:text-ink-100" title={item.part.name}>{item.part.name}</div>
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <span className="font-mono text-xs font-black text-ink-900 dark:text-brand-300">{cleanErpCode(item.part.partNumber)}</span>
                <button
                  type="button"
                  onClick={() => quoteCart.addItem(cartItems[index])}
                  className="rounded-lg border border-ink-200 px-2.5 py-1.5 text-[10px] font-black text-ink-600 transition hover:border-brand-300 hover:text-brand-600 dark:border-ink-700 dark:text-ink-300"
                >
                  + Orçamento
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
