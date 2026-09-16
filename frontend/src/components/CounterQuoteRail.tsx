import { formatHusqvarnaPartNumber } from '../lib';
import { useCounterSession } from '../context/CounterSessionContext';
import { useQuoteCart } from '../context/QuoteCartContext';

function formatMoney(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export default function CounterQuoteRail() {
  const quoteCart = useQuoteCart();
  const { session } = useCounterSession();

  return (
    <aside className="sticky top-[84px] rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-100 px-4 py-4 dark:border-slate-800">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">Orçamento atual</div>
            <div className="mt-1 text-lg font-black text-slate-950 dark:text-white">{quoteCart.totalItems} {quoteCart.totalItems === 1 ? 'item' : 'itens'}</div>
          </div>
          {quoteCart.totalItems > 0 && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">Em andamento</span>}
        </div>
        {(session.customerName || session.machineModel || session.pnc) && (
          <div className="mt-3 space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
            {session.customerName && <div className="truncate"><strong className="font-semibold text-slate-700 dark:text-slate-200">Cliente:</strong> {session.customerName}</div>}
            {session.machineModel && <div className="truncate"><strong className="font-semibold text-slate-700 dark:text-slate-200">Máquina:</strong> {session.machineModel}</div>}
            {session.pnc && <div className="truncate"><strong className="font-semibold text-slate-700 dark:text-slate-200">PNC:</strong> {session.pnc}</div>}
          </div>
        )}
      </div>

      {quoteCart.items.length ? (
        <div className="max-h-[460px] overflow-y-auto px-3 py-2">
          {quoteCart.items.map(item => (
            <div key={item.id} className="border-b border-slate-100 px-1 py-3 last:border-0 dark:border-slate-800">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-xs font-bold text-slate-800 dark:text-slate-100" title={item.name}>{item.name}</div>
                  <div className="mt-1 font-mono text-[11px] font-black text-[#123867] dark:text-blue-300">{formatHusqvarnaPartNumber(item.effectiveCode || item.partNumber)}</div>
                  <div className="mt-1 truncate text-[10px] text-slate-400">{item.model || 'Aplicação não informada'}{item.pnc ? ` · ${item.pnc}` : ''}</div>
                </div>
                <button type="button" onClick={() => quoteCart.removeItem(item.id)} className="shrink-0 text-xs font-bold text-slate-300 transition hover:text-rose-500" aria-label={`Remover ${item.name}`}>×</button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="inline-flex items-center overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                  <button type="button" onClick={() => quoteCart.updateQuantity(item.id, -1)} className="grid h-7 w-7 place-items-center text-sm font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800" aria-label="Diminuir quantidade">−</button>
                  <span className="min-w-8 text-center text-[11px] font-black text-slate-700 dark:text-slate-200">{item.quantity}</span>
                  <button type="button" onClick={() => quoteCart.updateQuantity(item.id, 1)} className="grid h-7 w-7 place-items-center text-sm font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800" aria-label="Aumentar quantidade">+</button>
                </div>
                {item.unitPrice != null && <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">{formatMoney(item.unitPrice * item.quantity)}</span>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-5 py-8 text-center">
          <div className="mx-auto grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-sm font-black text-slate-400 dark:bg-slate-800">0</div>
          <div className="mt-3 text-xs font-bold text-slate-600 dark:text-slate-300">Nenhuma peça adicionada</div>
          <p className="mt-1 text-[11px] leading-5 text-slate-400">Adicione as peças encontradas sem sair da pesquisa.</p>
        </div>
      )}

      <div className="border-t border-slate-100 p-4 dark:border-slate-800">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">Total informado</span>
          <span className="text-sm font-black text-slate-900 dark:text-white">{quoteCart.totalPrice > 0 ? formatMoney(quoteCart.totalPrice) : '—'}</span>
        </div>
        <button type="button" onClick={() => quoteCart.setIsOpen(true)} className="mt-3 h-10 w-full rounded-lg bg-[#123867] text-xs font-black text-white transition hover:bg-[#0d2c52] disabled:cursor-not-allowed disabled:opacity-50" disabled={!quoteCart.items.length}>Abrir orçamento completo</button>
      </div>
    </aside>
  );
}
