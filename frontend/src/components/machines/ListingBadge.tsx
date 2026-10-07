import { AlertTriangle, Check } from 'lucide-react';
import { findListedMachine } from '../../lib/machine-list';
import { formatBRL } from '../../lib/quote-message';
import { useMachineList } from '../../lib/use-machine-list';

/**
 * "Posso vender esta máquina hoje?" no painel da máquina: "Em linha" (está na lista de preços vigente da
 * Husqvarna, com o valor), "Descontinuada" (a lista a marca assim) ou "Fora de linha" (não está na lista).
 * Fica em silêncio enquanto a lista não carregou ou quando a loja ainda não a importou: sem lista não há
 * resposta, e "fora de linha" sem lista seria afirmar o que não se sabe.
 */
export default function ListingBadge({ pnc }: { pnc: string }) {
  const list = useMachineList();
  const machines = list.data?.machines;
  if (!machines?.length) return null;

  const found = findListedMachine(machines, pnc);
  if (found && !found.discontinued) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-ok-soft px-2 py-0.5 text-sm font-medium text-ok">
        <Check className="size-4" aria-hidden="true" />
        Em linha · <span className="font-code tabular-nums">{formatBRL(found.listPrice)}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-warn-soft px-2 py-0.5 text-sm font-medium text-warn">
      <AlertTriangle className="size-4" aria-hidden="true" />
      {found ? 'Descontinuada' : 'Fora de linha'}
    </span>
  );
}
