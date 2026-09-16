import { useState } from 'react';
import { useCounterSession } from '../context/CounterSessionContext';
import { useQuoteCart } from '../context/QuoteCartContext';

function Field({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <label className="min-w-0 flex-1">
      <span className="mb-1.5 block text-[9px] font-black uppercase tracking-[.13em] text-slate-400">{label}</span>
      <input
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-[#1d4f91] focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
      />
    </label>
  );
}

export default function CounterSessionBar() {
  const { session, hasContext, updateSession, clearSession } = useCounterSession();
  const quoteCart = useQuoteCart();
  const [expanded, setExpanded] = useState(false);
  const hasAnything = Boolean(session.customerName.trim() || session.machineModel.trim() || session.pnc.trim() || session.serial.trim() || quoteCart.totalItems);

  const endSession = () => {
    if (!hasAnything) return;
    if (quoteCart.totalItems > 0) {
      const confirmed = window.confirm('Encerrar o atendimento e limpar o orçamento atual?');
      if (!confirmed) return;
      quoteCart.clearCart();
    }
    clearSession();
    setExpanded(false);
  };

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex min-h-12 flex-wrap items-center gap-3 px-4 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className={`h-2 w-2 shrink-0 rounded-full ${hasAnything ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
          <div className="min-w-0">
            <div className="text-[9px] font-black uppercase tracking-[.13em] text-slate-400">Atendimento</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              {session.customerName && <span className="font-semibold text-slate-700 dark:text-slate-200">{session.customerName}</span>}
              {session.machineModel && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-black text-slate-700 dark:bg-slate-800 dark:text-slate-200">{session.machineModel}</span>}
              {session.pnc && <span className="font-medium text-slate-500 dark:text-slate-400">PNC {session.pnc}</span>}
              {session.serial && <span className="font-medium text-slate-500 dark:text-slate-400">S/N {session.serial}</span>}
              {!session.customerName && !session.machineModel && !session.pnc && !session.serial && <span className="font-semibold text-slate-500 dark:text-slate-400">Sem contexto técnico</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasContext && <span className="hidden text-[10px] font-bold text-emerald-600 xl:inline dark:text-emerald-400">Contexto aplicado à busca</span>}
          <button type="button" onClick={() => setExpanded(value => !value)} className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-black text-slate-600 transition hover:border-blue-200 hover:text-[#1d4f91] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            {expanded ? 'Ocultar dados' : hasAnything ? 'Editar contexto' : 'Adicionar contexto'}
          </button>
          {hasAnything && <button type="button" onClick={endSession} className="h-8 rounded-lg px-2 text-[10px] font-bold text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30">Encerrar</button>}
        </div>
      </div>

      {expanded && (
        <div className="grid gap-3 border-t border-slate-100 bg-slate-50/70 px-4 py-4 sm:grid-cols-2 xl:grid-cols-4 dark:border-slate-800 dark:bg-slate-950/40">
          <Field label="Cliente · opcional" value={session.customerName} placeholder="Nome do cliente" onChange={value => updateSession({ customerName: value })} />
          <Field label="Máquina / modelo" value={session.machineModel} placeholder="Ex.: 143RII" onChange={value => updateSession({ machineModel: value })} />
          <Field label="PNC" value={session.pnc} placeholder="Ex.: 967 17 65-01" onChange={value => updateSession({ pnc: value })} />
          <Field label="S/N · quando necessário" value={session.serial} placeholder="Número de série" onChange={value => updateSession({ serial: value })} />
        </div>
      )}
    </section>
  );
}
