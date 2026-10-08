import { useState } from 'react';
import { useCounterSession } from '../context/CounterSessionContext';
import { useConfirm } from '../context/confirm';
import type { CounterSession } from '../context/CounterSessionContext';
import { useQuoteCart } from '../context/QuoteCartContext';
import { machineChipLabel } from '../lib/model-search-rank';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function Field({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <label className="min-w-0 flex-1 space-y-1.5">
      <span className="block text-sm font-medium text-muted-foreground">{label}</span>
      <Input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} autoComplete="off" spellCheck={false} className="h-10 bg-card text-base" />
    </label>
  );
}

function ContextFields({ session, updateSession }: { session: CounterSession; updateSession: (patch: Partial<CounterSession>) => void }) {
  return (
    <div className="grid gap-3 border-t border-border px-4 pb-4 pt-3 sm:grid-cols-2 xl:grid-cols-4">
      <Field label="Cliente (opcional)" value={session.customerName} placeholder="Nome do cliente" onChange={value => updateSession({ customerName: value })} />
      <Field label="Máquina ou modelo" value={session.machineModel} placeholder="Ex.: 143RII" onChange={value => updateSession({ machineModel: value })} />
      <Field label="PNC" value={session.pnc} placeholder="Ex.: 967 17 65-01" onChange={value => updateSession({ pnc: value })} />
      <Field label="Número de série" value={session.serial} placeholder="Quando necessário" onChange={value => updateSession({ serial: value })} />
    </div>
  );
}

type Props = { onOpenMachine?: (pnc: string) => void };

export default function CounterSessionBar({ onOpenMachine }: Props) {
  const { session, updateSession, clearSession } = useCounterSession();
  const quoteCart = useQuoteCart();
  const confirm = useConfirm();
  const [expanded, setExpanded] = useState(false);
  const temContexto = Boolean(session.customerName.trim() || session.machineModel.trim() || session.pnc.trim() || session.serial.trim());
  const hasAnything = temContexto || quoteCart.totalItems > 0;
  // A vista explodida vive na Husqvarna e é endereçada pelo PNC; sem um PNC
  // plausível o atalho só levaria o balcão a um erro.
  const machinePnc = /^\d{8,14}$/.test(session.pnc.replace(/\D/g, '')) ? session.pnc.replace(/\D/g, '') : '';

  const endSession = async () => {
    if (!hasAnything) return;
    if (quoteCart.totalItems > 0) {
      const confirmed = await confirm({ title: 'Encerrar o atendimento?', description: 'O orçamento atual será esvaziado.', confirmLabel: 'Encerrar', destructive: true });
      if (!confirmed) return;
      quoteCart.clearCart();
    }
    clearSession();
    setExpanded(false);
  };

  // Sem nada preenchido é uma linha só: o convite para informar a máquina. Os quatro
  // campos (modelo, PNC e S/N entram na busca; o cliente vai para o orçamento) só
  // aparecem quando o atendente pede.
  if (!temContexto) {
    return (
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-1">
          <Button variant="ghost" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} className="text-primary hover:text-primary dark:text-add">
            <span aria-hidden="true" className="text-xl leading-none">{expanded ? '−' : '+'}</span>
            Máquina, PNC ou cliente
          </Button>
          {quoteCart.totalItems > 0 && <Button variant="ghost" onClick={endSession} className="hover:text-destructive">Limpar orçamento</Button>}
        </div>
        {expanded && <ContextFields session={session} updateSession={updateSession} />}
      </div>
    );
  }

  return (
    <div>
      <div className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-1.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-base">
          {session.customerName && <span className="font-semibold">{session.customerName}</span>}
          {session.machineModel && (() => {
            // "HUSQVARNA Roçadeira Husqvarna 143R II" → "143R II" em destaque e "Roçadeira" ao lado.
            const label = machineChipLabel(session.machineModel);
            return <>
              <span className="rounded-md bg-secondary px-2 py-0.5 font-bold">{label.model}</span>
              {label.kind && <span className="text-muted-foreground">{label.kind}</span>}
            </>;
          })()}
          {session.pnc && <span className="font-code text-muted-foreground tabular-nums">PNC {session.pnc}</span>}
          {session.serial && <span className="font-code text-muted-foreground tabular-nums">S/N {session.serial}</span>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {onOpenMachine && machinePnc && <Button variant="outline" size="sm" onClick={() => onOpenMachine(machinePnc)}>Ver vista explodida</Button>}
          <Button variant="outline" size="sm" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>{expanded ? 'Ocultar dados' : 'Editar'}</Button>
          <Button variant="ghost" size="sm" onClick={endSession} className="hover:text-destructive">Encerrar atendimento</Button>
        </div>
      </div>
      {expanded && <ContextFields session={session} updateSession={updateSession} />}
    </div>
  );
}
