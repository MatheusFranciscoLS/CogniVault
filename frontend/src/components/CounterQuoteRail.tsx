import { formatHusqvarnaPartNumber } from '../lib';
import { useCounterSession } from '../context/CounterSessionContext';
import { useQuoteCart } from '../context/QuoteCartContext';

function formatMoney(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export default function CounterQuoteRail() {
  const quoteCart = useQuoteCart();
  const { session } = useCounterSession();
  if (!quoteCart.items.length) return null;

  return (
    <aside className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm dark:border-ink-800 dark:bg-ink-900">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[.13em] text-ink-400">Orçamento</div>
          <div className="mt-0.5 text-base font-black text-ink-950 dark:text-white">{quoteCart.totalItems} {quoteCart.totalItems === 1 ? 'item' : 'itens'}</div>
        </div>
        <div className="text-right">
          <div className="text-[9px] font-bold uppercase tracking-wide text-ink-400">Total informado</div>
          <div className="mt-0.5 text-sm font-black text-ink-900 dark:text-white">{quoteCart.totalPrice > 0 ? formatMoney(quoteCart.totalPrice) : '—'}</div>
        </div>
      </div>

      {(session.customerName || session.machineModel || session.pnc) && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-y border-ink-100 bg-ink-50/70 px-4 py-2 text-[10px] text-ink-400 dark:border-ink-800 dark:bg-ink-950/30">
          {session.customerName && <span className="truncate">{session.customerName}</span>}
          {session.machineModel && <span className="font-bold text-ink-600 dark:text-ink-300">{session.machineModel}</span>}
          {session.pnc && <span>PNC {session.pnc}</span>}
        </div>
      )}

      <div className="max-h-[330px] overflow-y-auto px-3 py-1">
        {quoteCart.items.map(item => (
          <div key={item.id} className="border-b border-ink-100 px-1 py-2.5 last:border-0 dark:border-ink-800">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                {/* Código antes do nome e em corpo legível: é o que o balcão
                    confere na peça física. Estava em 10px, menor que a
                    descrição. */}
                <div className="flex items-center gap-2">
                  <span className="rounded bg-brand-50 px-1.5 py-0.5 font-mono text-xs font-black text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">{formatHusqvarnaPartNumber(item.effectiveCode || item.partNumber)}</span>
                  {item.unitPrice != null && <span className="text-[10px] text-ink-400">{formatMoney(item.unitPrice * item.quantity)}</span>}
                </div>
                <div className="mt-1 truncate text-[11px] font-bold text-ink-800 dark:text-ink-100" title={item.name}>{item.name}</div>
              </div>
              <button type="button" onClick={() => quoteCart.removeItem(item.id)} className="shrink-0 text-xs font-bold text-ink-300 transition hover:text-rose-500" aria-label={`Remover ${item.name}`}>×</button>
            </div>
            <div className="mt-1.5 inline-flex items-center overflow-hidden rounded-md border border-ink-200 dark:border-ink-700">
              <button type="button" onClick={() => quoteCart.updateQuantity(item.id, -1)} className="grid h-6 w-6 place-items-center text-xs text-ink-500 hover:bg-ink-50 dark:hover:bg-ink-800">−</button>
              <span className="min-w-7 text-center text-[10px] font-black">{item.quantity}</span>
              <button type="button" onClick={() => quoteCart.updateQuantity(item.id, 1)} className="grid h-6 w-6 place-items-center text-xs text-ink-500 hover:bg-ink-50 dark:hover:bg-ink-800">+</button>
            </div>
          </div>
        ))}
      </div>

      {/* Só a ação que leva adiante. O "Copiar para ERP" saiu: o dono confirmou
          que exportar a cesta para o ERP não serve para nada no fluxo dele. */}
      <div className="border-t border-ink-100 p-3 dark:border-ink-800">
        <button
          type="button"
          onClick={() => quoteCart.setIsOpen(true)}
          className="cv-touch-target w-full rounded-lg bg-ink-900 px-3 text-[11px] font-black text-white transition hover:bg-ink-950"
        >
          Revisar orçamento
        </button>
      </div>
    </aside>
  );
}
