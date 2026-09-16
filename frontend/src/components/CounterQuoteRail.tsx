import { toast } from 'sonner';
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

  const copyErpItems = async () => {
    const lines = quoteCart.items.map(item => `${item.effectiveCode || item.partNumber}\t${item.quantity}`);
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      toast.success(`${quoteCart.items.length} ${quoteCart.items.length === 1 ? 'item copiado' : 'itens copiados'} para o ERP.`);
    } catch {
      toast.error('Não foi possível copiar os itens para o ERP.');
    }
  };

  return (
    <aside className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[.13em] text-slate-400">Orçamento</div>
          <div className="mt-0.5 text-base font-black text-slate-950 dark:text-white">{quoteCart.totalItems} {quoteCart.totalItems === 1 ? 'item' : 'itens'}</div>
        </div>
        <div className="text-right">
          <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Total informado</div>
          <div className="mt-0.5 text-sm font-black text-slate-900 dark:text-white">{quoteCart.totalPrice > 0 ? formatMoney(quoteCart.totalPrice) : '—'}</div>
        </div>
      </div>

      {(session.customerName || session.machineModel || session.pnc) && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-y border-slate-100 bg-slate-50/70 px-4 py-2 text-[10px] text-slate-400 dark:border-slate-800 dark:bg-slate-950/30">
          {session.customerName && <span className="truncate">{session.customerName}</span>}
          {session.machineModel && <span className="font-bold text-slate-600 dark:text-slate-300">{session.machineModel}</span>}
          {session.pnc && <span>PNC {session.pnc}</span>}
        </div>
      )}

      <div className="max-h-[330px] overflow-y-auto px-3 py-1">
        {quoteCart.items.map(item => (
          <div key={item.id} className="border-b border-slate-100 px-1 py-2.5 last:border-0 dark:border-slate-800">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-bold text-slate-800 dark:text-slate-100" title={item.name}>{item.name}</div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="font-mono text-[10px] font-black text-[#123867] dark:text-blue-300">{formatHusqvarnaPartNumber(item.effectiveCode || item.partNumber)}</span>
                  {item.unitPrice != null && <span className="text-[10px] text-slate-400">{formatMoney(item.unitPrice * item.quantity)}</span>}
                </div>
              </div>
              <button type="button" onClick={() => quoteCart.removeItem(item.id)} className="shrink-0 text-xs font-bold text-slate-300 transition hover:text-rose-500" aria-label={`Remover ${item.name}`}>×</button>
            </div>
            <div className="mt-1.5 inline-flex items-center overflow-hidden rounded-md border border-slate-200 dark:border-slate-700">
              <button type="button" onClick={() => quoteCart.updateQuantity(item.id, -1)} className="grid h-6 w-6 place-items-center text-xs text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800">−</button>
              <span className="min-w-7 text-center text-[10px] font-black">{item.quantity}</span>
              <button type="button" onClick={() => quoteCart.updateQuantity(item.id, 1)} className="grid h-6 w-6 place-items-center text-xs text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800">+</button>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-3 dark:border-slate-800">
        <button type="button" onClick={copyErpItems} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-black text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">Copiar para ERP</button>
        <button type="button" onClick={() => quoteCart.setIsOpen(true)} className="h-9 rounded-lg bg-[#123867] px-3 text-[11px] font-black text-white transition hover:bg-[#0d2c52]">Revisar orçamento</button>
      </div>
    </aside>
  );
}
