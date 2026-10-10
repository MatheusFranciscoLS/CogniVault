import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Eye, FileText, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import MachinePaymentTerms from './MachinePaymentTerms';
import { DEFAULT_MACHINE_PAYMENT, machinePaymentText, type MachinePaymentChoice } from '../lib/machine-payment';
import { machinePhotoUrl, type ListedMachine } from '../lib/machine-list';
import {
  MACHINE_QUOTE_DEFAULTS,
  defaultHighlight,
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
import { DEFAULT_BULLETS, listBullets } from '../lib/machine-highlights';
import { bulletsHeading } from '../lib/machine-highlights';
import { useMachinePhoto, usePublicMachineUse, type MachinePortalData } from '../lib/use-machine-portal';
import { mergeBulletLines, publicUseLines } from '../lib/machine-public-use';
import { formatBRL } from '../lib/quote-message';

const TEXTAREA_CLASS = 'w-full rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/60';

/**
 * Orçamento da máquina para o cliente, no modelo em Word da loja (A/C, Ref., "01-)", preço, condições, ATT.).
 * O preço vem da lista como sugestão e é do atendente: o valor negociado quase nunca é o da lista.
 */
export default function MachineQuoteDialog({
  machine,
  portal,
  portalSettled,
  allMachines,
  onClose,
}: {
  machine: ListedMachine;
  portal: MachinePortalData | undefined;
  /** O Portal já respondeu (ou falhou) para o PNC da lista; só então vale procurar a foto pelo nome do modelo. */
  portalSettled: boolean;
  /** A lista inteira, para saber se o modelo tem versões (sabre de 13 ou de 20 polegadas). */
  allMachines: ListedMachine[];
  onClose: () => void;
}) {
  // Foto da PRÓPRIA LISTA primeiro (dono, 2026-10-08: "a lista tem as fotos sem erro, não precisa pegar do Portal"); fica guardada
  // no banco, então não depende do Portal responder. O Portal (pelo PNC e depois pelo nome do modelo) só entra se a lista não tem.
  const listPhoto = machine.hasPhoto ? machinePhotoUrl(machine.pnc) : null;
  const byName = useMachinePhoto(machine.model, portalSettled && !listPhoto && !portal?.imageUrl);
  const photoUrl = listPhoto ?? portal?.imageUrl ?? byName.data ?? null;
  const ids = useId();
  const [customer, setCustomer] = useState('');
  const [priceText, setPriceText] = useState(() => String(machine.listPrice).replace('.', ','));
  const [paymentChoice, setPaymentChoice] = useState<MachinePaymentChoice>(DEFAULT_MACHINE_PAYMENT);
  const payment = machinePaymentText(paymentChoice);
  const [leadTime, setLeadTime] = useState<string>(MACHINE_QUOTE_DEFAULTS.leadTime);
  const [observation, setObservation] = useState<string>(MACHINE_QUOTE_DEFAULTS.observation);
  // null = o atendente ainda não mexeu: vale a sugestão do Portal (que pode chegar depois de o diálogo abrir).
  const [typedComplement, setTypedComplement] = useState<string | null>(null);
  const complement = typedComplement ?? suggestComplement(machine, portal);
  const [highlight, setHighlight] = useState(() => defaultHighlight(machine.application));
  // Linhas da descrição da lista: as primeiras vêm marcadas; o atendente liga ou desliga cada uma e VÊ o resultado na prévia.
  // O que o site público da Husqvarna escreve sobre o uso (classe de uso e sabre) vem primeiro e já marcado; sem dado, a lista segue como era.
  const publicUse = usePublicMachineUse(machine.pnc);
  const publicLines = useMemo(() => publicUseLines(publicUse.data), [publicUse.data]);
  const listLines = useMemo(() => listBullets(machine.details, machine.model, machine.category), [machine]);
  const bulletLines = useMemo(() => mergeBulletLines(publicLines, listLines), [publicLines, listLines]);
  const [typedBullets, setTypedBullets] = useState<Set<string> | null>(null);
  const chosenBullets = typedBullets ?? new Set([...publicLines, ...listLines.slice(0, DEFAULT_BULLETS)]);
  const bullets = bulletLines.filter(line => chosenBullets.has(line));
  const toggleBullet = (line: string) => {
    const next = new Set(chosenBullets);
    if (next.has(line)) next.delete(line); else next.add(line);
    setTypedBullets(next);
  };
  const [includePhoto, setIncludePhoto] = useState(true);
  // A data do orçamento é a da negociação (dono, 2026-10-07): começa em hoje e a validade de 20 dias conta dela.
  const [dateText, setDateText] = useState(() => todayInputValue());
  const quoteDate = parseInputDate(dateText);
  const [busy, setBusy] = useState(false);
  // Prévia: o PDF que o cliente recebe, montado de novo a cada ajuste (como na gaveta de peças); imprimir imprime ESTE documento.
  const [showPreview, setShowPreview] = useState(false);
  const [pdf, setPdf] = useState<{ url: string } | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  // Logo e foto são baixados uma vez só, não a cada letra digitada.
  const assets = useRef<{ logo?: Promise<unknown>; photo?: { url: string; image: Promise<unknown> } }>({});

  const variant = machineVariantNote(machine, allMachines);
  const price = parseMoneyInput(priceText);

  /** Monta o PDF com o que está na tela. A prévia e o botão de baixar usam ESTA função: o que se vê é o que sai. */
  const buildDoc = async () => {
    if (price === null || quoteDate === null) return null;
    const [{ jsPDF }, autoTable, { buildMachineQuotePdf }, { loadStoreLogo, loadProductImage }, { resolveAttendantName }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable').then(module => module.default),
      import('../lib/machine-quote'),
      import('../lib/pdf-assets'),
      import('../lib/store-profile'),
    ]);
    const fields: MachineQuoteFields = { customerName: customer, price, payment, leadTime, observation, complement, highlight, bullets };
    assets.current.logo ??= loadStoreLogo();
    let photo: Awaited<ReturnType<typeof loadProductImage>> | null = null;
    if (includePhoto && photoUrl) {
      if (assets.current.photo?.url !== photoUrl) assets.current.photo = { url: photoUrl, image: loadProductImage(photoUrl) };
      photo = (await assets.current.photo.image) as typeof photo;
    }
    return buildMachineQuotePdf({
      doc: new jsPDF('p', 'pt', 'a4'),
      autoTable,
      machine,
      fields,
      attendantName: (await resolveAttendantName()) || undefined,
      variant,
      now: quoteDate,
      logo: (await assets.current.logo) as Awaited<ReturnType<typeof loadStoreLogo>>,
      photo,
    });
  };

  // Chave primitiva de tudo que muda o PDF: a prévia só é refeita quando algo mudou de verdade.
  const previewKey = JSON.stringify([customer, price, payment, leadTime, observation, complement, highlight, bullets, includePhoto && photoUrl, dateText, variant]);
  useEffect(() => {
    if (!showPreview) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const doc = await buildDoc();
        if (cancelled) return;
        if (!doc) { setPreviewFailed(true); return; }
        const url = URL.createObjectURL(doc.output('blob'));
        setPdf(previous => { if (previous) URL.revokeObjectURL(previous.url); return { url }; });
        setPreviewFailed(false);
      } catch (error) {
        console.error('Falha ao montar a prévia do orçamento da máquina:', error);
        if (!cancelled) setPreviewFailed(true);
      }
    }, 400);
    return () => { cancelled = true; window.clearTimeout(timer); };
    // buildDoc lê os mesmos valores que entram em previewKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPreview, previewKey]);
  useEffect(() => () => { setPdf(previous => { if (previous) URL.revokeObjectURL(previous.url); return null; }); }, []);

  const print = () => {
    const frame = frameRef.current?.contentWindow;
    if (!pdf || !frame) return;
    frame.focus();
    frame.print();
  };

  const download = async () => {
    if (price === null || quoteDate === null) return;
    setBusy(true);
    try {
      const doc = await buildDoc();
      if (!doc) return;
      doc.save(machineQuoteFileName(machine));
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
      <DialogContent className={`max-h-[94dvh] gap-4 overflow-y-auto ${showPreview ? 'sm:max-w-6xl' : 'sm:max-w-2xl'}`}>
        <DialogHeader>
          <DialogTitle className="text-xl">Orçamento da {machine.model}</DialogTitle>
          <DialogDescription className="text-base">{machineQuoteReference(machine)}</DialogDescription>
        </DialogHeader>

        <div className={showPreview ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]' : undefined}>
        <div className="space-y-4">
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
          <label className="block space-y-1.5 text-base font-medium" htmlFor={`${ids}-prazo`}>
            Prazo de entrega
            <Input id={`${ids}-prazo`} value={leadTime} onChange={event => setLeadTime(event.target.value)} />
          </label>
          <MachinePaymentTerms idPrefix={ids} value={paymentChoice} onChange={setPaymentChoice} />
        </div>

        <label className="block space-y-1.5 text-base font-medium" htmlFor={`${ids}-complemento`}>
          Complemento da descrição
          <textarea
            id={`${ids}-complemento`}
            value={complement}
            onChange={event => setTypedComplement(event.target.value)}
            rows={2}
            maxLength={600}
            placeholder="Opcional: algo a mais que a lista não diz (área recomendada, por exemplo)"
            className={TEXTAREA_CLASS}
          />
        </label>

        {bulletLines.length > 0 && (
          <fieldset className="space-y-1.5">
            <legend className="text-base font-medium">{bulletsHeading(machine.category).replace(/:$/, '')} </legend>
            <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
              {bulletLines.map(line => (
                <label key={line} className="flex items-start gap-2 text-base">
                  <input type="checkbox" checked={chosenBullets.has(line)} onChange={() => toggleBullet(line)} className="mt-1 size-4 shrink-0" />
                  <span>{line}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="rounded-md bg-secondary px-3 py-2 text-base leading-7 text-secondary-foreground" aria-label="Prévia do texto do orçamento">
          <p><span className="font-medium">01-)</span> {machineQuoteDescription(machine, complement, variant)}</p>
          {bullets.length > 0 && (
            <>
              <p className="mt-2">{bulletsHeading(machine.category)}</p>
              <ul className="list-disc pl-6">{bullets.map(line => <li key={line}>{line}</li>)}</ul>
            </>
          )}
        </div>

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
        </div>

        {showPreview && (
          <div className="min-h-[60dvh] overflow-hidden rounded-lg border border-border bg-secondary lg:sticky lg:top-0 lg:self-start">
            {previewFailed ? (
              <p role="status" className="p-4 text-base text-warn">Não foi possível montar o PDF. Confira o preço e a data.</p>
            ) : pdf ? (
              <iframe ref={frameRef} title="Prévia do PDF do orçamento da máquina" src={`${pdf.url}#toolbar=0&navpanes=0`} className="h-[72dvh] w-full" />
            ) : (
              <p role="status" className="p-4 text-base text-muted-foreground">Montando o PDF…</p>
            )}
          </div>
        )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="outline" onClick={() => setShowPreview(open => !open)} aria-pressed={showPreview}>
            <Eye className="size-5" aria-hidden="true" /> {showPreview ? 'Fechar prévia' : 'Prévia'}
          </Button>
          {showPreview && (
            <Button variant="outline" onClick={print} disabled={!pdf}>
              <Printer className="size-5" aria-hidden="true" /> Imprimir
            </Button>
          )}
          <Button onClick={() => void download()} disabled={price === null || quoteDate === null || busy}>
            <FileText className="size-5" aria-hidden="true" /> {busy ? 'Gerando…' : 'Baixar orçamento em PDF'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
