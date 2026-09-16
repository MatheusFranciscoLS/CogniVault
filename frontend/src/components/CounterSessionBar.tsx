import { useCounterSession } from '../context/CounterSessionContext';
import { useQuoteCart } from '../context/QuoteCartContext';

function Field({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <label className="min-w-0 flex-1">
      <span className="sr-only">{label}</span>
      <input
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        title={label}
        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-[#1d4f91] focus:ring-3 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
      />
    </label>
  );
}

export default function CounterSessionBar() {
  const { session, hasContext, updateSession, clearSession } = useCounterSession();
  const quoteCart = useQuoteCart();
  const hasAnything = Boolean(session.customerName.trim() || session.machineModel.trim() || session.pnc.trim() || quoteCart.totalItems);

  const endSession = () => {
    if (!hasAnything) return;
    if (quoteCart.totalItems > 0) {
      const confirmed = window.confirm('Encerrar o atendimento e limpar o orçamento atual?');
      if (!confirmed) return;
      quoteCart.clearCart();
    }
    clearSession();
  };

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-center">
      <div className="flex shrink-0 items-center gap-2 lg:w-[150px]">
        <span className={`h-2 w-2 rounded-full ${hasAnything ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
        <div className="min-w-0">
          <div className="text-[9px] font-black uppercase tracking-[.13em] text-slate-400">Atendimento</div>
          <div className="truncate text-xs font-black text-slate-800 dark:text-white">{hasAnything ? 'Em andamento' : 'Novo atendimento'}</div>
        </div>
      </div>

      <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-3">
        <Field label="Cliente" value={session.customerName} placeholder="Cliente · opcional" onChange={value => updateSession({ customerName: value })} />
        <Field label="Máquina / modelo" value={session.machineModel} placeholder="Máquina / modelo · ex. 143RII" onChange={value => updateSession({ machineModel: value })} />
        <Field label="PNC" value={session.pnc} placeholder="PNC · ex. 967 17 65-01" onChange={value => updateSession({ pnc: value })} />
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2">
        {hasContext && <span className="hidden text-[10px] font-bold text-emerald-600 xl:inline dark:text-emerald-400">Contexto ativo</span>}
        {hasAnything && <button type="button" onClick={endSession} className="h-9 rounded-lg px-3 text-[11px] font-bold text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30">Encerrar</button>}
      </div>
    </section>
  );
}
