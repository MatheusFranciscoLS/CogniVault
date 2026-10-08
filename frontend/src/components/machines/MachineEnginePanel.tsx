import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../../lib';
import { engineInputHelp, parseEngineInput } from '../../lib/engine-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import KohlerEnginePanel from './KohlerEnginePanel';
import KawasakiEnginePanel from './KawasakiEnginePanel';
import BriggsEnginePanel from './BriggsEnginePanel';

type EngineHint = {
  brand: 'Kohler' | 'Kawasaki' | 'Briggs & Stratton' | 'Husqvarna' | null;
  /** Vazio quando o Portal só diz a marca e manda ler o modelo na plaqueta. */
  model: string;
  searchTerm: string;
  machinePnc: string | null;
  source: 'PORTAL' | 'LISTA' | 'IPL' | 'DONO' | 'PLACA';
  precision: 'MODELO' | 'SERIE' | 'SO_MARCA';
};

/** De onde vem cada vínculo: é o que diz ao balcão quanto confiar. */
const SOURCE_LABEL: Record<EngineHint['source'], string> = {
  PORTAL: 'Citado pelo Portal Husqvarna para este PNC',
  LISTA: 'Ficha da lista de preços atual',
  IPL: 'IPL do catálogo (pode ser de outro ano da máquina)',
  DONO: 'Base informada pela loja',
  PLACA: 'Digitado por você, da plaqueta',
};

const PRECISION_LABEL: Record<EngineHint['precision'], string | null> = {
  MODELO: null,
  SERIE: 'Só a série: peça o spec na plaqueta',
  SO_MARCA: 'A Husqvarna só diz a marca: leia o modelo na plaqueta',
};

/** Máquinas que levam motor de terceiro (ou motor próprio fora do IPL): o campo da plaqueta aparece mesmo sem vínculo conhecido. */
const ENGINE_MACHINE_CATEGORY = /trator|giro zero|cortador|rider|motocultiv|motocultor|gerador|motobomba|estacion|lavadora|triturador/i;

/** PNC com 11 dígitos e o de 9 são a mesma máquina: o Portal só conhece os 9 primeiros. */
const samePnc = (a: string | null, b: string | null) => Boolean(a && b) && String(a).replace(/\D/g, '').slice(0, 9) === String(b).replace(/\D/g, '').slice(0, 9);

/**
 * O motor da máquina aberta, com a vista explodida dele.
 *
 * Pedido do dono (2026-10-08): ligar o motor ao trator, ao giro zero ou à máquina, e mostrar a vista explodida do motor ali mesmo.
 * O vínculo é uma BASE: o motor muda com o ano da máquina, então o cartão sempre manda conferir a plaqueta ou o número de série
 * do motor, e cada linha diz de onde vem (Portal por PNC, ficha da lista, IPL antigo ou a loja).
 *
 * **O campo da plaqueta** (dono, 2026-10-08: "e se não for nenhum desses? aí ele teria que fechar e voltar tudo para pesquisar"): o
 * atendente digita o modelo que está na plaqueta e o catálogo daquele motor abre ali mesmo, sem sair da máquina. A marca sai do
 * formato (`parseEngineInput`), e o que não for reconhecido recebe uma mensagem com exemplo, nunca um palpite.
 *
 * Em silêncio quando não há o que mostrar: motosserra e roçadeira têm o motor dentro do próprio IPL.
 */
export default function MachineEnginePanel({
  model,
  pnc,
  category,
  onSearchPart,
}: {
  model: string;
  pnc: string | null;
  /** Categoria que o Portal dá à máquina: decide se o campo da plaqueta aparece quando não há vínculo conhecido. */
  category?: string | null;
  onSearchPart: (code: string) => void;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  // `maintenance` abre o motor já no grupo de peças de manutenção (filtros, velas): é o que o balcão mais vende na revisão.
  const [mode, setMode] = useState<'maintenance' | undefined>(undefined);
  const [typed, setTyped] = useState('');
  const [typedError, setTypedError] = useState<string | null>(null);
  const [custom, setCustom] = useState<EngineHint | null>(null);

  const query = useQuery({
    queryKey: ['machine-engines', model, pnc ?? ''],
    enabled: Boolean(model),
    staleTime: 30 * 60 * 1000,
    queryFn: async () => (await apiJson<{ engines: EngineHint[] }>(
      `/api/machines/engines?model=${encodeURIComponent(model)}${pnc ? `&pnc=${encodeURIComponent(pnc)}` : ''}`,
      { timeoutMs: 25_000 },
    )).engines ?? [],
  });

  const known = [...(query.data ?? [])].sort((a, b) => Number(samePnc(b.machinePnc, pnc)) - Number(samePnc(a.machinePnc, pnc)));
  // O que o atendente digitou vai na frente: é a plaqueta, a evidência mais forte que existe.
  const engines = custom ? [custom, ...known.filter(item => item.searchTerm.toUpperCase() !== custom.searchTerm.toUpperCase())] : known;
  const wantsField = engines.length > 0 || ENGINE_MACHINE_CATEGORY.test(category ?? '');
  // Espera a resposta antes de mostrar o cartão: aparecer só com o campo e os motores "pularem" para dentro depois faria a tela piscar.
  if (query.isLoading || !wantsField) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseEngineInput(typed);
    if (parsed.kind !== 'ok') {
      setTypedError(engineInputHelp(parsed));
      return;
    }
    setTypedError(null);
    const hint: EngineHint = { brand: parsed.brand, model: parsed.model, searchTerm: parsed.model, machinePnc: null, source: 'PLACA', precision: parsed.precision };
    setCustom(hint);
    setMode(undefined);
    // Abre o catálogo na hora: o atendente já está com o cliente esperando.
    setOpenKey(`${hint.brand}|${hint.searchTerm}||PLACA`);
    setTyped('');
  };

  return (
    <section aria-label="Motor desta máquina" className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-3">
        <h3 className="text-lg font-semibold">Motor desta máquina</h3>
        <p className="mt-0.5 text-base text-muted-foreground">Pode mudar com o ano. Confira o modelo na plaqueta ou pelo número de série do motor.</p>
      </div>
      {engines.length > 0 && (
        <ul className="divide-y divide-border">
          {engines.map(engine => {
            const key = `${engine.brand ?? ''}|${engine.searchTerm}|${engine.machinePnc ?? ''}|${engine.source}`;
            const open = openKey === key;
            const forThisPnc = samePnc(engine.machinePnc, pnc);
            // Kohler só abre com o spec completo da plaqueta (SV540-3212): só a série (KT740) não tem catálogo para abrir.
            const openable = Boolean(engine.searchTerm) && !(engine.brand === 'Kohler' && engine.precision !== 'MODELO');
            const precision = PRECISION_LABEL[engine.precision];
            return (
              <li key={key} className="px-5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {engine.brand && <span className="rounded-sm bg-muted px-1.5 py-0.5 text-sm font-semibold text-muted-foreground">{engine.brand}</span>}
                      {engine.model
                        ? <span translate="no" className="font-code text-lg font-semibold tabular-nums">{engine.model}</span>
                        : <span className="text-lg font-semibold">Modelo na plaqueta</span>}
                      {forThisPnc && <span className="rounded-sm bg-ok-soft px-1.5 py-0.5 text-sm font-semibold text-ok">Este PNC</span>}
                    </div>
                    <div className="text-base text-muted-foreground">
                      {SOURCE_LABEL[engine.source]}
                      {engine.machinePnc && !forThisPnc ? ` · vale para o PNC ${engine.machinePnc}` : ''}
                      {precision ? ` · ${precision}` : ''}
                    </div>
                  </div>
                  {openable && (
                    <div className="flex flex-wrap gap-2">
                      {(engine.brand === 'Kohler' || engine.brand === 'Kawasaki') && engine.precision === 'MODELO' && !open && (
                        <Button type="button" variant="outline" onClick={() => { setMode('maintenance'); setOpenKey(key); }}>Peças de manutenção</Button>
                      )}
                      <Button type="button" variant="outline" aria-expanded={open} onClick={() => { setMode(undefined); setOpenKey(open ? null : key); }}>
                        {open ? 'Esconder o motor' : 'Ver peças e vista explodida'}
                      </Button>
                    </div>
                  )}
                </div>
                {open && openable && (
                  <div className="mt-3">
                    {engine.brand === 'Kohler' && <KohlerEnginePanel model={engine.searchTerm} autoOpen={mode} onSearchPart={onSearchPart} />}
                    {engine.brand === 'Kawasaki' && <KawasakiEnginePanel model={engine.searchTerm} autoOpen={mode} onSearchPart={onSearchPart} />}
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
      )}

      <form onSubmit={submit} className="border-t border-border px-5 py-3" aria-label="Modelo do motor da plaqueta">
        <label htmlFor="engine-from-plate" className="text-base font-semibold">
          {engines.length ? 'Nenhum destes? Digite o modelo da plaqueta' : 'Digite o modelo do motor da plaqueta'}
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input
            id="engine-from-plate"
            value={typed}
            onChange={event => { setTyped(event.target.value); if (typedError) setTypedError(null); }}
            placeholder="ex.: FX921V-ES06, SV540-3212, 104M02-0002-F1"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={typedError ? true : undefined}
            aria-describedby={typedError ? 'engine-from-plate-error' : undefined}
            className="h-10 w-full max-w-sm font-code"
          />
          <Button type="submit" disabled={!typed.trim()}>Abrir motor</Button>
          {custom && <Button type="button" variant="ghost" onClick={() => { setCustom(null); setOpenKey(null); }}>Limpar</Button>}
        </div>
        {typedError && <p id="engine-from-plate-error" role="alert" className="mt-2 text-base text-warn">{typedError}</p>}
      </form>
    </section>
  );
}
