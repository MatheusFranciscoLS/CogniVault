import { useId, useState } from 'react';
import { toast } from 'sonner';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { machinePhotoUrl, type ListedMachine } from '../lib/machine-list';
import {
  MACHINE_QUOTE_DEFAULTS,
  defaultHighlight,
  defaultIncludeEquipment,
  suggestComplement,
  machineQuoteDescription,
  machineVariantNote,
  machineQuoteFileName,
  machineQuoteReference,
  parseInputDate,
  parseMoneyInput,
  todayInputValue,
  type MachineQuoteFields,
} from '../lib/machine-quote';
import type { SheetEquipment } from '../lib/machine-sheet';
import { useMachinePhoto, type MachinePortalData } from '../lib/use-machine-portal';
import { formatBRL } from '../lib/quote-message';

const TEXTAREA_CLASS = 'w-full rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/60';

/**
 * Orçamento da máquina para o cliente, no modelo em Word da loja (A/C, Ref., "01-)", preço, condições, ATT.).
 * O preço vem da lista como sugestão e é do atendente: o valor negociado quase nunca é o da lista.
 */
export default function MachineQuoteDialog({
  machine,
  equipment,
  portal,
  portalSettled,
  allMachines,
  onClose,
}: {
  machine: ListedMachine;
  equipment: SheetEquipment;
  portal: MachinePortalData | undefined;
  /** O Portal já respondeu (ou falhou) para o PNC da lista; só então vale procurar a foto pelo nome do modelo. */
  portalSettled: boolean;
  /** A lista inteira, para saber se o modelo tem versões (sabre de 13 ou de 20 polegadas). */
  allMachines: ListedMachine[];
  onClose: () => void;
}) {
  // Foto do PORTAL primeiro (maior qualidade; dono, 2026-10-07), pelo PNC e, sem ela, pelo nome do modelo. A da própria
  // lista, que toda máquina vigente tem, fica de reserva.
  const listPhoto = machine.hasPhoto ? machinePhotoUrl(machine.pnc) : null;
  const byName = useMachinePhoto(machine.model, portalSettled && !portal?.imageUrl);
  const photoUrl = portal?.imageUrl ?? byName.data ?? listPhoto;
  const ids = useId();
  const [customer, setCustomer] = useState('');
  const [priceText, setPriceText] = useState(() => String(machine.listPrice).replace('.', ','));
  const [payment, setPayment] = useState<string>(MACHINE_QUOTE_DEFAULTS.payment);
  const [leadTime, setLeadTime] = useState<string>(MACHINE_QUOTE_DEFAULTS.leadTime);
  const [observation, setObservation] = useState<string>(MACHINE_QUOTE_DEFAULTS.observation);
  // null = o atendente ainda não mexeu: vale a sugestão do Portal (que pode chegar depois de o diálogo abrir).
  const [typedComplement, setTypedComplement] = useState<string | null>(null);
  const complement = typedComplement ?? suggestComplement(machine, portal);
  const [highlight, setHighlight] = useState(() => defaultHighlight(machine.application));
  const [typedEquipment, setTypedEquipment] = useState<boolean | null>(null);
  const [includePhoto, setIncludePhoto] = useState(true);
  // A data do orçamento é a da negociação (dono, 2026-10-07): começa em hoje e a validade de 20 dias conta dela.
  const [dateText, setDateText] = useState(() => todayInputValue());
  const quoteDate = parseInputDate(dateText);
  const [busy, setBusy] = useState(false);

  const variant = machineVariantNote(machine, allMachines);
  const price = parseMoneyInput(priceText);
  const hasEquipment = (equipment?.included.length ?? 0) > 0;
  // Roçadeira (cabeçote, cinto, lâmina) lista o que acompanha por padrão, como no modelo em Word; as outras só se marcar.
  const includeEquipment = typedEquipment ?? defaultIncludeEquipment(machine, equipment);

  const download = async () => {
    if (price === null || quoteDate === null) return;
    setBusy(true);
    try {
      const [{ jsPDF }, autoTable, { buildMachineQuotePdf }, { loadStoreLogo, loadProductImage }, { attendantNameFromEmail }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable').then(module => module.default),
        import('../lib/machine-quote'),
        import('../lib/pdf-assets'),
        import('../lib/store-profile'),
      ]);
      let email: string | null = null;
      try { email = localStorage.getItem('cognivault_email'); } catch { /* sem armazenamento: o PDF sai sem o ATT. */ }
      const fields: MachineQuoteFields = { customerName: customer, price, payment, leadTime, observation, complement, highlight, includeEquipment };
      buildMachineQuotePdf({
        doc: new jsPDF('p', 'pt', 'a4'),
        autoTable,
        machine,
        equipment,
        fields,
        attendantName: attendantNameFromEmail(email) || undefined,
        variant,
        now: quoteDate,
        logo: await loadStoreLogo(),
        photo: includePhoto && photoUrl ? await loadProductImage(photoUrl) : null,
      }).save(machineQuoteFileName(machine));
      toast.success('Orçamento em PDF gerado.');
      onClose();
    } catch (error) {
      console.error('Falha ao gerar o orçamento da máquina:', error);
      toast.error('Não foi possível gerar o PDF. Tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90dvh] gap-4 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Orçamento da {machine.model}</DialogTitle>
          <DialogDescription className="text-base">{machineQuoteReference(machine)}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5 text-base font-medium" htmlFor={`${ids}-cliente`}>
            Cliente (A/C)
            <Input id={`${ids}-cliente`} value={customer} onChange={event => setCustomer(event.target.value)} placeholder="Nome de quem pediu" autoFocus />
          </label>
          <label className="block space-y-1.5 text-base font-medium" htmlFor={`${ids}-preco`}>
            Preço do orçamento
            <Input id={`${ids}-preco`} value={priceText} onChange={event => setPriceText(event.target.value)} inputMode="decimal" aria-invalid={price === null} />
            <span className="block text-sm font-normal text-muted-foreground">
              {price === null ? 'Digite um valor maior que zero.' : `${formatBRL(price)} · preço da lista ${formatBRL(machine.listPrice)}`}
            </span>
          </label>
          <label className="block space-y-1.5 text-base font-medium" htmlFor={`${ids}-data`}>
            Data do orçamento
            <Input id={`${ids}-data`} type="date" value={dateText} onChange={event => setDateText(event.target.value)} aria-invalid={quoteDate === null} />
          </label>
          <label className="block space-y-1.5 text-base font-medium" htmlFor={`${ids}-pagamento`}>
            Condição de pagamento
            <Input id={`${ids}-pagamento`} value={payment} onChange={event => setPayment(event.target.value)} />
          </label>
          <label className="block space-y-1.5 text-base font-medium" htmlFor={`${ids}-prazo`}>
            Prazo de entrega
            <Input id={`${ids}-prazo`} value={leadTime} onChange={event => setLeadTime(event.target.value)} />
          </label>
        </div>

        <label className="block space-y-1.5 text-base font-medium" htmlFor={`${ids}-complemento`}>
          Complemento da descrição
          <textarea
            id={`${ids}-complemento`}
            value={complement}
            onChange={event => setTypedComplement(event.target.value)}
            rows={2}
            maxLength={600}
            placeholder="O que a lista não traz: transmissão, altura de corte, velocidade máxima, área recomendada"
            className={TEXTAREA_CLASS}
          />
        </label>

        <p className="rounded-md bg-secondary px-3 py-2 text-base leading-7 text-secondary-foreground">
          <span className="font-medium">01-)</span> {machineQuoteDescription(machine, complement, variant)}
        </p>

        <label className="block space-y-1.5 text-base font-medium" htmlFor={`${ids}-destaque`}>
          Destaque
          <Input id={`${ids}-destaque`} value={highlight} onChange={event => setHighlight(event.target.value)} placeholder="Deixe vazio para não mostrar" />
        </label>
        <label className="block space-y-1.5 text-base font-medium" htmlFor={`${ids}-obs`}>
          Observação
          <textarea id={`${ids}-obs`} value={observation} onChange={event => setObservation(event.target.value)} rows={2} maxLength={600} className={TEXTAREA_CLASS} />
        </label>

        {photoUrl && (
          <label className="flex items-center gap-2 text-base">
            <input type="checkbox" checked={includePhoto} onChange={event => setIncludePhoto(event.target.checked)} className="size-4" />
            Incluir a foto da máquina
          </label>
        )}

        {hasEquipment && (
          <label className="flex items-center gap-2 text-base">
            <input type="checkbox" checked={includeEquipment} onChange={event => setTypedEquipment(event.target.checked)} className="size-4" />
            Listar o que acompanha a máquina ({equipment?.included.length} itens do Portal)
          </label>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void download()} disabled={price === null || quoteDate === null || busy}>
            <FileText className="size-5" aria-hidden="true" /> {busy ? 'Gerando…' : 'Baixar orçamento em PDF'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
