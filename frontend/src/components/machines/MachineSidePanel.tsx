import { useCallback, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import ListingBadge from './ListingBadge';
import MachineDetail from './MachineDetail';
import type { MachineDetailLoaded } from './MachineDetail';

/**
 * A máquina abre AO LADO do atendimento, não em outra aba.
 *
 * É a opção que o dono escolheu quando perguntei como juntar as duas telas
 * ("eu gostei do painel lateral"), e o motivo é o fluxo do balcão: ele digita a
 * peça, olha a vista explodida para confirmar a posição e volta para a lista —
 * trocar de aba perdia a lista e o contexto no meio do atendimento.
 *
 * Largo de propósito (até 1040px). A vista explodida do carburador tem mais de
 * 20 posições numeradas; num painel estreito o zoom não salva, porque não há
 * para onde arrastar. O zoom continua lá dentro, vindo do `ExplodedView`.
 */
export default function MachineSidePanel({
  pnc,
  contextModel,
  onClose,
  onOpenPnc,
  onOpenPart,
  onLoaded,
}: {
  pnc: string;
  contextModel?: string;
  onClose: () => void;
  onOpenPnc: (pnc: string) => void;
  onOpenPart: (code: string) => void;
  onLoaded?: (machine: MachineDetailLoaded) => void;
}) {
  const [loaded, setLoaded] = useState<MachineDetailLoaded | null>(null);
  const [copied, setCopied] = useState(false);

  const handleLoaded = useCallback((machine: MachineDetailLoaded) => {
    setLoaded(machine);
    onLoaded?.(machine);
  }, [onLoaded]);

  const copyPnc = async () => {
    try {
      await navigator.clipboard.writeText(pnc);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* sem permissão de área de transferência: o PNC continua visível na tela */
    }
  };

  // O nome só vale para a máquina atual: ao trocar de variante o painel remonta (key do pai),
  // mas o cabeçalho nunca mostra o nome de OUTRA máquina enquanto a nova carrega.
  const name = loaded && loaded.pnc === pnc ? loaded.name : contextModel || `PNC ${pnc}`;
  const meta = loaded && loaded.pnc === pnc ? loaded.meta : null;

  return (
    <Sheet open onOpenChange={open => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        showCloseButton={false}
        onOpenAutoFocus={event => { event.preventDefault(); (event.currentTarget as HTMLElement).focus(); }}
        className="w-full gap-0 border-border bg-background p-0 data-[side=right]:sm:max-w-[1040px]"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border bg-card px-6 py-4">
          <div className="min-w-0">
            <SheetTitle className="sr-only">Máquina aberta</SheetTitle>
            <SheetDescription className="sr-only">Vistas explodidas e peças da máquina</SheetDescription>
            <h2 className="truncate text-2xl font-semibold leading-8 text-foreground">{name}</h2>
            <p className="flex flex-wrap items-center gap-x-2 text-base text-muted-foreground">
              <span>PNC <span translate="no" className="font-code tabular-nums">{pnc}</span></span>
              {meta && <span>· {meta}</span>}
              <button
                type="button"
                onClick={() => void copyPnc()}
                aria-label={`Copiar PNC ${pnc}`}
                title="Copiar PNC"
                className="rounded-md p-1 text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/60"
              >
                {copied ? <Check className="size-4 text-ok" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
              </button>
            </p>
            <div className="mt-1.5"><ListingBadge pnc={pnc} /></div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar"><X className="size-5" /></Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6">
          <MachineDetail
            pnc={pnc}
            contextModel={contextModel}
            onOpenPnc={onOpenPnc}
            onOpenPart={onOpenPart}
            onLoaded={handleLoaded}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
