import { formatHusqvarnaPartNumber } from '../lib';
import { useQuoteCart } from '../context/QuoteCartContext';
import { Button } from '@/components/ui/button';

function formatMoney(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

/**
 * Orçamento ao lado da busca, sempre à vista. Antes ele só aparecia depois do primeiro
 * item, e a tela inteira pulava de lugar nessa hora, com o cliente olhando.
 */
export default function CounterQuoteRail() {
  const quoteCart = useQuoteCart();
  const empty = quoteCart.items.length === 0;

  return (
    <aside aria-label="Orçamento" className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-baseline justify-between gap-3 px-4 pb-3 pt-4">
        <h2 className="text-xl font-semibold">Orçamento</h2>
        <span className="text-base text-muted-foreground">{quoteCart.totalItems} {quoteCart.totalItems === 1 ? 'item' : 'itens'}</span>
      </div>

      {empty ? (
        <p className="border-t border-border px-4 py-8 text-center text-base text-muted-foreground">Adicione peças para montar o orçamento.</p>
      ) : (
        <ul className="max-h-[46vh] divide-y divide-border overflow-y-auto border-t border-border">
          {quoteCart.items.map(item => (
            <li key={item.id} className="space-y-2 px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div translate="no" className="break-all font-code text-lg font-semibold tabular-nums">
                    {item.manufacturer?.toLowerCase().includes('husqvarna') ? formatHusqvarnaPartNumber(item.effectiveCode || item.partNumber) : (item.effectiveCode || item.partNumber)}
                  </div>
                  <div className="truncate text-base" title={item.name}>{item.name}</div>
                </div>
                {/* Ação destrutiva: menor que o resto e longe do "−", mas com alvo de clique de 40 px. */}
                <Button variant="ghost" size="icon-sm" onClick={() => quoteCart.removeItem(item.id)} aria-label={`Remover ${item.name}`} className="-mr-2 -mt-1 shrink-0 hover:text-destructive">
                  <span aria-hidden="true" className="text-xl leading-none">×</span>
                </Button>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex items-center overflow-hidden rounded-md border border-input">
                  <button type="button" onClick={() => quoteCart.updateQuantity(item.id, -1)} className="grid size-9 place-items-center text-lg hover:bg-accent focus-visible:bg-accent focus-visible:outline-none" aria-label={`Diminuir quantidade de ${item.name}`}>−</button>
                  <span className="min-w-9 text-center text-base font-semibold tabular-nums">{item.quantity}</span>
                  <button type="button" onClick={() => quoteCart.updateQuantity(item.id, 1)} className="grid size-9 place-items-center text-lg hover:bg-accent focus-visible:bg-accent focus-visible:outline-none" aria-label={`Aumentar quantidade de ${item.name}`}>+</button>
                </div>
                {item.unitPrice != null && <span className="font-code text-lg font-semibold tabular-nums">{formatMoney(item.unitPrice * item.quantity)}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto space-y-3 border-t border-border bg-muted px-4 py-4">
        <div className="flex items-baseline justify-between">
          <span className="text-base text-muted-foreground">Total</span>
          {quoteCart.totalPrice > 0
            ? <span className="font-code text-3xl font-bold tabular-nums">{formatMoney(quoteCart.totalPrice)}</span>
            : <span className="text-lg text-muted-foreground">{empty ? 'R$ 0,00' : 'Sem preço'}</span>}
        </div>
        <Button size="lg" className="w-full" disabled={empty} onClick={() => quoteCart.setIsOpen(true)}>Revisar orçamento</Button>
      </div>
    </aside>
  );
}
