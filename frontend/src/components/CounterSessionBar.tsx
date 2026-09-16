import { useCounterSession } from '../context/CounterSessionContext';
import { useQuoteCart } from '../context/QuoteCartContext';

function Field({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <label className="min-w-0">
      <span className="mb-1.5 block text-[9px] font-black uppercase tracking-[.13em] text-slate-400">{label}</span>
      <input
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-800 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-[#1d4f91] focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:bg-slate-950"
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
    <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:px-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
        <div className="min-w-[180px] xl:w-[220px]">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${hasAnything ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
            <span className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">Atendimento atual</span>
          </div>
          <div className="mt-1 text-sm font-black text-slate-900 dark:text-white">{hasAnything ? 'Em andamento' : 'Pronto para iniciar'}</div>
          <p className="mt-1 text-[11px] leading-4 text-slate-400">Modelo e PNC refinam automaticamente a busca técnica.</p>
        </div>

        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-3">
          <Field label="Cliente · opcional" value={session.customerName} placeholder="Nome do cliente" onChange={value => updateSession({ customerName: value })} />
          <Field label="Máquina / modelo" value={session.machineModel} placeholder="Ex.: 143RII" onChange={value => updateSession({ machineModel: value })} />
          <Field label="PNC" value={session.pnc} placeholder="Ex.: 967 17 65-01" onChange={value => updateSession({ pnc: value })} />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {hasContext && <span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700 lg:inline-flex dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">Contexto aplicado</span>}
          {hasAnything && <button type="button" onClick={endSession} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-500 transition hover:border-rose-200 hover:text-rose-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">Encerrar</button>}
        </div>
      </div>
    </section>
  );
}
