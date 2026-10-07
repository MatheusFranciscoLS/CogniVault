import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, Layers, MessageCircle, FileText, ReceiptText, Send, X } from 'lucide-react';
import { useQuoteCart } from '../context/QuoteCartContext';
import { useMachineList } from '../lib/use-machine-list';
import { useMachinePortal, type MachinePortalData } from '../lib/use-machine-portal';
import { buildMachineSheetMessage, machineFacts, machineSheetFileName } from '../lib/machine-sheet';
import { portalPnc, type ListedMachine } from '../lib/machine-list';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { normalizeCode, useMasterPrices } from './machines/master-part-prices';
import PartPriceTag from './machines/PartPriceTag';
import { MachineBadges, MachinePrice } from './MachineListPanel';
import MachineQuoteDialog from './MachineQuoteDialog';

/**
 * "Acompanha / não acompanha" vem do Portal, por PNC, ao abrir (a lista de preços só traz a descrição curta).
 * Se o Portal não responde ou não conhece o PNC, a seção não aparece.
 */
function EquipmentSection({ portal, loading }: { portal: MachinePortalData | undefined; loading: boolean }) {
  if (loading) return <p aria-busy="true" className="text-base text-muted-foreground">Consultando o que acompanha…</p>;
  const equipment = portal?.equipment;
  if (!equipment || (equipment.included.length === 0 && equipment.notIncluded.length === 0)) return null;

  const render = (items: typeof equipment.included) => (
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

/**
 * Acessórios que o Portal indica para ESTA máquina e que a loja tem no cadastro, com preço e prateleira. O que a
 * loja não tem não aparece (mesma regra do catálogo de motor: silêncio no que não é item daqui).
 */
function TakeAlongSection({ machine, portal }: { machine: ListedMachine; portal: MachinePortalData | undefined }) {
  const quoteCart = useQuoteCart();
  const accessories = useMemo(() => (portal?.accessories ?? []).filter(item => !item.discontinued), [portal]);
  const prices = useMasterPrices(accessories.map(item => item.id));
  const sold = accessories.filter(item => (prices.data?.prices[normalizeCode(item.id)]?.price ?? null) !== null);
  if (sold.length === 0) return null;

  return (
    <section>
      <h3 className="mb-1.5 text-lg font-semibold">Leve junto</h3>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {sold.map(item => {
          const hit = prices.data?.prices[normalizeCode(item.id)];
          const inCart = quoteCart.items.some(line => line.partNumber === item.id);
          return (
            <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-base">{item.name}</p>
                <p translate="no" className="font-code text-sm tabular-nums text-muted-foreground">{item.id}</p>
              </div>
              <PartPriceTag code={item.id} prices={prices.data?.prices} />
              <Button
                size="sm"
                variant={inCart ? 'added' : 'add'}
                onClick={() => {
                  quoteCart.addItem({
                    partNumber: item.id,
                    effectiveCode: item.id,
                    manufacturer: 'Husqvarna',
                    name: hit?.name || item.name,
                    model: machine.model,
                    unitPrice: hit?.price ?? undefined,
                  });
                  toast.success(`${item.name} no orçamento.`);
                }}
              >
                {inCart ? 'No orçamento' : '+ Orçamento'}
              </Button>
            </li>
          );
        })}
      </ul>
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
  const [quoting, setQuoting] = useState(false);
  const portalQuery = useMachinePortal(portalPnc(machine.pnc));
  const list = useMachineList();
  const listDate = list.data?.listDate ? new Date(list.data.listDate) : null;

  const copyPnc = async () => {
    try {
      await navigator.clipboard.writeText(machine.pnc);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* sem permissão de área de transferência: o PNC continua visível na tela */
    }
  };

  // O texto e o PDF levam o que o Portal já respondeu; se ele ainda não respondeu (ou não conhece o PNC), vão sem.
  const message = () => buildMachineSheetMessage({ machine, equipment: portalQuery.data?.equipment ?? null, listDate });

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message());
      toast.success('Mensagem copiada.');
    } catch {
      toast.error('Não foi possível copiar. Use o WhatsApp ou o PDF.');
    }
  };

  const openWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(message())}`, '_blank', 'noopener,noreferrer');
  };

  const downloadPdf = async () => {
    try {
      const [{ jsPDF }, autoTable, { buildMachineSheetPdf }, { loadStoreLogo }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable').then(module => module.default),
        import('../lib/machine-sheet'),
        import('../lib/pdf-assets'),
      ]);
      buildMachineSheetPdf({ doc: new jsPDF('p', 'pt', 'a4'), autoTable, machine, equipment: portalQuery.data?.equipment ?? null, listDate, logo: await loadStoreLogo() }).save(machineSheetFileName(machine));
    } catch (error) {
      console.error('Falha ao gerar a ficha em PDF:', error);
      toast.error('Não foi possível gerar o PDF. Tente novamente.');
    }
  };

  const facts = machineFacts(machine);

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
              {facts && <p className="text-base text-muted-foreground">{facts}</p>}
            </div>
            <div>
              <p className="text-right text-sm text-muted-foreground">Preço da lista</p>
              <MachinePrice machine={machine} />
            </div>
          </div>

          <div className="flex gap-2">
            <Button size="lg" className="flex-1" onClick={() => onOpenMachine(portalPnc(machine.pnc))}>
              <Layers className="size-5" aria-hidden="true" /> Abrir vista explodida
            </Button>
            <Button size="lg" variant="outline" onClick={() => setQuoting(true)}>
              <ReceiptText className="size-5" aria-hidden="true" /> Orçamento
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="lg" variant="outline"><Send className="size-5" aria-hidden="true" /> Enviar ao cliente</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                <DropdownMenuItem className="h-10 text-base" onSelect={openWhatsApp}><MessageCircle className="size-4" aria-hidden="true" /> Abrir no WhatsApp</DropdownMenuItem>
                <DropdownMenuItem className="h-10 text-base" onSelect={() => void copyMessage()}><Copy className="size-4" aria-hidden="true" /> Copiar mensagem</DropdownMenuItem>
                <DropdownMenuItem className="h-10 text-base" onSelect={() => void downloadPdf()}><FileText className="size-4" aria-hidden="true" /> Baixar ficha em PDF</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <EquipmentSection portal={portalQuery.data} loading={portalQuery.isLoading} />
          <TakeAlongSection machine={machine} portal={portalQuery.data} />

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
      {quoting && <MachineQuoteDialog machine={machine} equipment={portalQuery.data?.equipment ?? null} onClose={() => setQuoting(false)} />}
    </Sheet>
  );
}
