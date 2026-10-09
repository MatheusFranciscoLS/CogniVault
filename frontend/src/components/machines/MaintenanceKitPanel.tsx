import { useMemo } from 'react';
import { cleanErpCode, formatHusqvarnaPartNumber } from '../../lib';
import { useMaintenanceKit } from './use-maintenance-kit';
import { Button } from '@/components/ui/button';
import { useQuoteCart } from '../../context/QuoteCartContext';

type Props = { model: string; pnc?: string | null };

export default function MaintenanceKitPanel({ model, pnc }: Props) {
  const quoteCart = useQuoteCart();
  const cleanModel = model.trim();
  const kitQuery = useMaintenanceKit(model);

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
    <section aria-label="Kit de manutenção" className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h3 className="text-lg font-semibold">Kit de manutenção · {cleanModel}</h3>
        {items.length > 0 && (
          <Button variant="add" onClick={() => quoteCart.addItems(cartItems)}>Adicionar kit ao orçamento</Button>
        )}
      </div>

      {loading ? (
        <p aria-busy="true" className="px-4 py-6 text-base text-muted-foreground">Montando o kit deste modelo…</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item, index) => (
            <li key={`${item.category}-${item.part.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm text-muted-foreground">{item.label}</div>
                <div className="truncate text-base font-semibold" title={item.part.name}>{item.part.name}</div>
              </div>
              <span translate="no" className="font-code text-xl font-semibold tabular-nums">{formatHusqvarnaPartNumber(cleanErpCode(item.part.partNumber)) || cleanErpCode(item.part.partNumber)}</span>
              <Button variant="add" onClick={() => quoteCart.addItem(cartItems[index])}>+ Orçamento<span className="sr-only">, {item.part.name}</span></Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
