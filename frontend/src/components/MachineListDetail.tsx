import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Copy, Layers, X } from 'lucide-react';
import { apiJson } from '../lib';
import { applicationLabel, categoryLabel, technologyLabel, type ListedMachine } from '../lib/machine-list';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { MachineBadges, MachinePrice } from './MachineListPanel';

type EquipmentItem = { id: string; name: string; value: string | null };
type ProductEquipment = { included: EquipmentItem[]; notIncluded: EquipmentItem[] } | null;

/**
 * O que acompanha a máquina vem do Portal Husqvarna, por PNC, ao abrir (a lista de preços só traz a
 * descrição curta). Se o Portal não responder ou não conhecer o PNC, a seção simplesmente não aparece:
 * o atendente não precisa de aviso de erro de integração.
 */
function EquipmentSection({ pnc }: { pnc: string }) {
  const query = useQuery({
    queryKey: ['machine-equipment', pnc],
    staleTime: 10 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const data = await apiJson<{ product?: { equipment?: ProductEquipment } }>(
        `/api/husqvarna/products/${encodeURIComponent(pnc)}/details`,
        { timeoutMs: 20_000 },
      );
      return data.product?.equipment ?? null;
    },
  });

  if (query.isLoading) return <p aria-busy="true" className="text-base text-muted-foreground">Consultando o que acompanha…</p>;
  const equipment = query.data;
  if (!equipment || (equipment.included.length === 0 && equipment.notIncluded.length === 0)) return null;

  const render = (items: EquipmentItem[]) => (
    <ul className="space-y-1 text-base">
      {items.map(item => (
        <li key={item.id}>
          {item.name}{item.value && <span className="text-muted-foreground"> · {item.value}</span>}
        </li>
      ))}
    </ul>
  );

  return (
    <section className="space-y-3">
      {equipment.included.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-lg font-semibold">Acompanha</h3>
          {render(equipment.included)}
        </div>
      )}
      {equipment.notIncluded.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-lg font-semibold">Não acompanha</h3>
          {render(equipment.notIncluded)}
        </div>
      )}
    </section>
  );
}

export default function MachineListDetail({
  machine,
  onClose,
  onOpenMachine,
}: {
  machine: ListedMachine;
  onClose: () => void;
  onOpenMachine: (pnc: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyPnc = async () => {
    try {
      await navigator.clipboard.writeText(machine.pnc);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* sem permissão de área de transferência: o PNC continua visível na tela */
    }
  };

  const facts = [categoryLabel(machine.category), technologyLabel(machine.technology), applicationLabel(machine.application)].filter(Boolean);

  return (
    <Sheet open onOpenChange={open => { if (!open) onClose(); }}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 border-border bg-background p-0 data-[side=right]:sm:max-w-[560px]">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border bg-card px-6 py-4">
          <div className="min-w-0 space-y-1">
            <SheetTitle className="text-2xl font-semibold leading-8">{machine.model}</SheetTitle>
            <SheetDescription className="text-base text-muted-foreground">{machine.description}</SheetDescription>
            <p className="flex flex-wrap items-center gap-x-2 text-base text-muted-foreground">
              <span>PNC <span translate="no" className="font-code tabular-nums text-foreground">{machine.pnc}</span></span>
              <button
                type="button"
                onClick={() => void copyPnc()}
                aria-label={`Copiar PNC ${machine.pnc}`}
                title="Copiar PNC"
                className="rounded-md p-1 outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/60"
              >
                {copied ? <Check className="size-4 text-ok" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
              </button>
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar"><X className="size-5" /></Button>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2"><MachineBadges machine={machine} /></div>
              {facts.length > 0 && <p className="text-base text-muted-foreground">{facts.join(' · ')}</p>}
            </div>
            <div>
              <p className="text-right text-sm text-muted-foreground">Preço da lista</p>
              <MachinePrice machine={machine} />
            </div>
          </div>

          <Button size="lg" className="w-full" onClick={() => onOpenMachine(machine.pnc)}>
            <Layers className="size-5" aria-hidden="true" /> Abrir vista explodida
          </Button>

          <EquipmentSection pnc={machine.pnc} />

          {machine.specs.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-lg font-semibold">Ficha técnica</h3>
              <dl className="divide-y divide-border rounded-lg border border-border bg-card text-base">
                {machine.specs.map(spec => (
                  <div key={spec.label} className="flex items-baseline justify-between gap-4 px-4 py-2">
                    <dt className="text-muted-foreground">{spec.label}</dt>
                    <dd className="text-right font-medium text-foreground">{spec.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {machine.details && (
            <section>
              <h3 className="mb-1.5 text-lg font-semibold">Descrição</h3>
              <p className="whitespace-pre-line text-base leading-7 text-foreground">{machine.details}</p>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
