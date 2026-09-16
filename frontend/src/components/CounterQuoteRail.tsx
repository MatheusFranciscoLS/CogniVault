import { formatHusqvarnaPartNumber } from '../lib';
import { useCounterSession } from '../context/CounterSessionContext';
import { useQuoteCart } from '../context/QuoteCartContext';

function formatMoney(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export default function CounterQuoteRail() {
  const quoteCart = useQuoteCart();
  const { session } = useCounterSession();
  const hasItems = quoteCart.items.length > 0;

  return (
    <aside className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[.13em] text-slate-400">Orçamento atual</div>
          <div className="mt-0.5 text-base font-black text-slate-950 dark:text-white">{quoteCart.totalItems} {quoteCart.totalItems === 1 ? 'item' : 'itens'}</div>
        </div>
        {quoteCart.totalPrice > 0 && <div className="text-right"><div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Total</div><div className="text-sm font-black text-slate-900 dark:text-white">{formatMoney(quoteCart.totalPrice)}</div></div>}
      </div>

      {(session.customerName || session.machineModel || session.pnc) && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-b border-slate-100 px-4 py-2 text-[10px] text-slate-400 dark:border-slate-800">
          {session.customerName && <span className="truncate">{session.customerName}</span>}
          {session.machineModel && <span className="font-bold text-slate-600 dark:text-slate-300">{session.machineModel}</span>}
          {session.pnc && <span>PNC {session.pnc}</span>}
        </div>
      )}

      {hasItems ? (
        <div className="max-h-[360px] overflow-y-auto px-3 py-1">
          {quoteCart.items.map(item => (
            <div key={item.id} className="border-b border-slate-100 px-1 py-2.5 last:border-0 dark:border-slate-800">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1"><div className="truncate text-[11px] font-bold text-slate-800 dark:text-slate-100" title={item.name}>{item.name}</div><div className="mt-0.5 flex items-center gap-2"><span className="font-mono text-[10px] font-black text-[#123867] dark:text-blue-300">{formatHusqvarnaPartNumber(item.effectiveCode || item.partNumber)}</span>{item.unitPrice != null && <span className="text-[10px] text-slate-400">{formatMoney(item.unitPrice * item.quantity)}</span>}</div></div>
                <button type="button" onClick={() => quoteCart.removeItem(item.id)} className="shrink-0 text-xs font-bold text-slate-300 hover:text-rose-500" aria-label={`Remover ${item.name}`}>×</button>
              </div>
              <div className="mt-1.5 inline-flex items-center overflow-hidden rounded-md border border-slate-200 dark:border-slate-700"><button type="button" onClick={() => quoteCart.updateQuantity(item.id, -1)} className="grid h-6 w-6 place-items-center text-xs text-slate-500">−</button><span className="min-w-7 text-center text-[10px] font-black">{item.quantity}</span><button type="button" onClick={() => quoteCart.updateQuantity(item.id, 1)} className="grid h-6 w-6 place-items-center text-xs text-slate-500">+</button></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-4 py-5 text-center"><div className="text-[11px] font-bold text-slate-500 dark:text-slate-300">Orçamento vazio</div><p className="mt-1 text-[10px] leading-4 text-slate-400">Adicione uma peça encontrada para começar.</p></div>
      )}

      {hasItems && <div className="border-t border-slate-100 p-3 dark:border-slate-800"><button type="button" onClick={() => quoteCart.setIsOpen(true)} className="h-9 w-full rounded-lg bg-[#123867] text-[11px] font-black text-white transition hover:bg-[#0d2c52]">Revisar orçamento</button></div>}
    </aside>
  );
}
