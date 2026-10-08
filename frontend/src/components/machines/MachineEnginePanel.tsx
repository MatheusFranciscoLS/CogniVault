import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../../lib';
import { Button } from '@/components/ui/button';
import KohlerEnginePanel from './KohlerEnginePanel';
import KawasakiEnginePanel from './KawasakiEnginePanel';
import BriggsEnginePanel from './BriggsEnginePanel';

type EngineHint = {
  brand: 'Kohler' | 'Kawasaki' | 'Briggs & Stratton' | 'Husqvarna' | null;
  model: string;
  searchTerm: string;
  machinePnc: string | null;
  source: 'IPL' | 'DONO';
};

/** PNC com 11 dígitos e o de 9 são a mesma máquina: o Portal só conhece os 9 primeiros. */
const samePnc = (a: string | null, b: string | null) => Boolean(a && b) && String(a).replace(/\D/g, '').slice(0, 9) === String(b).replace(/\D/g, '').slice(0, 9);

/**
 * O motor da máquina aberta, com a vista explodida dele.
 *
 * Pedido do dono (2026-10-08): ligar o motor ao trator, ao giro zero ou à máquina, e mostrar a vista explodida do motor ali mesmo.
 * O vínculo é uma BASE: o motor muda com o ano da máquina, então o cartão sempre manda conferir a plaqueta ou o número de série
 * do motor. Quando o IPL da máquina cita mais de um motor, cada um aparece com o PNC a que vale, e o do PNC aberto vem primeiro.
 *
 * Em silêncio quando não há vínculo: a maioria das máquinas (motosserra, roçadeira) tem o motor dentro do próprio IPL.
 */
export default function MachineEnginePanel({
  model,
  pnc,
  onSearchPart,
}: {
  model: string;
  pnc: string | null;
  onSearchPart: (code: string) => void;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['machine-engines', model],
    enabled: Boolean(model),
    staleTime: 30 * 60 * 1000,
    queryFn: async () => (await apiJson<{ engines: EngineHint[] }>(`/api/machines/engines?model=${encodeURIComponent(model)}`)).engines ?? [],
  });

  const engines = [...(query.data ?? [])].sort((a, b) => Number(samePnc(b.machinePnc, pnc)) - Number(samePnc(a.machinePnc, pnc)));
  if (!engines.length) return null;

  return (
    <section aria-label="Motor desta máquina" className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-3">
        <h3 className="text-lg font-semibold">Motor desta máquina</h3>
        <p className="mt-0.5 text-base text-muted-foreground">Pode mudar com o ano. Confira o modelo na plaqueta ou pelo número de série do motor.</p>
      </div>
      <ul className="divide-y divide-border">
        {engines.map(engine => {
          const key = `${engine.searchTerm}|${engine.machinePnc ?? ''}`;
          const open = openKey === key;
          const forThisPnc = samePnc(engine.machinePnc, pnc);
          return (
            <li key={key} className="px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {engine.brand && <span className="rounded-sm bg-muted px-1.5 py-0.5 text-sm font-semibold text-muted-foreground">{engine.brand}</span>}
                    <span translate="no" className="font-code text-lg font-semibold tabular-nums">{engine.model}</span>
                    {forThisPnc && <span className="rounded-sm bg-ok-soft px-1.5 py-0.5 text-sm font-semibold text-ok">Este PNC</span>}
                  </div>
                  {engine.machinePnc && !forThisPnc && <div className="text-base text-muted-foreground">Vale para o PNC {engine.machinePnc}</div>}
                </div>
                <Button type="button" variant="outline" aria-expanded={open} onClick={() => setOpenKey(open ? null : key)}>
                  {open ? 'Esconder o motor' : 'Ver peças e vista explodida'}
                </Button>
              </div>
              {open && (
                <div className="mt-3">
                  {engine.brand === 'Kohler' && <KohlerEnginePanel model={engine.searchTerm} onSearchPart={onSearchPart} />}
                  {engine.brand === 'Kawasaki' && <KawasakiEnginePanel model={engine.searchTerm} onSearchPart={onSearchPart} />}
                  {engine.brand === 'Briggs & Stratton' && <BriggsEnginePanel model={engine.searchTerm} onSearchPart={onSearchPart} />}
                  {(engine.brand === 'Husqvarna' || engine.brand === null) && (
                    <Button type="button" onClick={() => onSearchPart(engine.searchTerm)}>Buscar peças do motor {engine.model}</Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
