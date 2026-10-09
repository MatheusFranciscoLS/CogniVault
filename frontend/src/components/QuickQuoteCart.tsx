import { useState } from 'react';
import { useConfirm } from '../context/confirm';
import { Check, Copy, Eye, Minus, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { useCounterSession } from '../context/CounterSessionContext';
import { useQuoteCart } from '../context/QuoteCartContext';
import type { QuoteCartItem, QuoteSyncState, QuoteTextOptions } from '../context/QuoteCartContext';
import { formatHusqvarnaPartNumber, cleanErpCode } from '../lib';
import { playCopySound } from '../lib/sound';
import { formatBRL, quoteTotals } from '../lib/quote-message';
import { PIX_DISCOUNT, formatDiscountInput, parseDiscountInput } from '../lib/discount';
import { LEAD_TIME_NOW, LEAD_TIME_ORDER, leadMode, leadTimeConflict, leadTimeFor } from '../lib/lead-time';
import { QUOTE_DEFAULTS } from '../lib/store-profile';
import { maskPhoneInput } from '../lib/phone';
import { Icon } from './icons/Icon';
import QuotePdfDialog from './QuotePdfDialog';
import CustomItemForm, { type CustomItemInput } from './CustomItemForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const PAYMENT_METHODS = [
  'A Combinar no Balcão',
  'À Vista / PIX (5% desc.)',
  'Cartão de Débito',
  'Cartão de Crédito (até 3x)',
  'Boleto Faturado (14/28 dias)',
];

// Um atalho só (dono, 2026-10-09: a loja não chega a 10 nem a 15%); qualquer outro desconto é digitado no campo ao lado.
const DISCOUNT_PRESETS = [
  { label: '0%', value: 0 },
  { label: '5% PIX', value: PIX_DISCOUNT },
];

// Mesma formatação do texto e do PDF que o cliente recebe, com ponto de milhar ("R$ 1.202,87"): a tela do
// balcão mostrava "R$ 1202,87", e o atendente lia o total de um jeito e o cliente recebia de outro.
const money = formatBRL;

/**
 * Onde o orçamento está guardado. O atendente precisa dessa informação na tela:
 * "Só neste aparelho" significa que trocar de aparelho agora perderia o orçamento.
 * Discreto quando está tudo certo, em destaque quando não está.
 */
function SyncStatus({ state }: { state: QuoteSyncState }) {
  const config: Record<QuoteSyncState, { label: string; dot: string; title: string }> = {
    loading: { label: 'Carregando…', dot: 'bg-muted-foreground', title: 'Buscando o orçamento salvo no servidor.' },
    saving: { label: 'Salvando…', dot: 'bg-muted-foreground', title: 'Gravando o orçamento no servidor.' },
    synced: { label: 'No servidor', dot: 'bg-ok', title: 'Este orçamento está salvo no servidor e abre em qualquer aparelho.' },
    offline: { label: 'Só neste aparelho', dot: 'bg-warn', title: 'Sem conexão com o servidor. O orçamento está apenas neste navegador: não troque de aparelho até voltar.' },
  };
  const { label, dot, title } = config[state];
  return (
    <span title={title} className={cn('inline-flex items-center gap-1.5 text-sm', state === 'offline' ? 'font-semibold text-warn' : 'text-muted-foreground')}>
      <span className={cn('size-2 rounded-full', dot)} aria-hidden="true" />
      {label}
    </span>
  );
}

function CartItemRow({
  item,
  onUpdateQuantity,
  onUpdateUnitPrice,
  onUpdateLeadTime,
  quoteLeadTime,
  onRemove,
}: {
  item: QuoteCartItem;
  onUpdateQuantity: (delta: number) => void;
  onUpdateUnitPrice: (value: number | undefined) => void;
  /** Prazo só desta linha (vazio = o do orçamento). */
  onUpdateLeadTime: (value: string | undefined) => void;
  /** Prazo do orçamento: a "Encomenda" da linha usa o mesmo texto quando ele já é de encomenda. */
  quoteLeadTime: string;
  onRemove: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const isServiceItem = item.partNumber.startsWith('SRV-');
  const formattedCode = item.manufacturer?.toLowerCase().includes('husqvarna')
    ? formatHusqvarnaPartNumber(item.effectiveCode || item.partNumber)
    : (item.effectiveCode || item.partNumber);
  const subtotal = item.unitPrice ? item.quantity * item.unitPrice : 0;
  const details = isServiceItem
    ? (item.model || 'Balcão')
    : [item.model, item.pnc ? `PNC ${item.pnc}` : '', item.position ? `Pos. ${item.position}` : '', item.location ? `Local ${item.location}` : ''].filter(Boolean).join(' · ');

  const copyCode = () => {
    const clean = cleanErpCode(item.effectiveCode || item.partNumber);
    void navigator.clipboard.writeText(clean);
    playCopySound();
    toast.success(`Código ${clean} copiado.`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <li className="space-y-2.5 px-6 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Código primeiro: é o que o balcão copia e procura na peça física. */}
          <div className="flex flex-wrap items-center gap-2">
            {isServiceItem ? (
              <span className="rounded bg-secondary px-2 py-0.5 text-sm font-semibold">Serviço avulso</span>
            ) : (
              <>
                <span translate="no" className="font-code text-xl font-semibold tabular-nums">{formattedCode}</span>
                <Button type="button" variant="ghost" size="icon-sm" onClick={copyCode} aria-label={`Copiar o código ${formattedCode}`} title="Copiar o código sem espaços nem hífen">
                  {copied ? <Check className="size-4 text-ok" /> : <Copy className="size-4" />}
                </Button>
              </>
            )}
            {item.isSuperseded && <span className="rounded bg-warn-soft px-1.5 text-sm font-semibold text-warn">Código atualizado</span>}
          </div>
          <h3 className="truncate text-base font-semibold" title={item.name}>{item.name}</h3>
          {details && <p className="truncate text-sm text-muted-foreground">{details}</p>}
          <select
            aria-label={`Prazo de ${item.name}`}
            value={item.leadTime ? leadMode(item.leadTime) : ''}
            onChange={event => {
              const value = event.target.value;
              onUpdateLeadTime(value === 'NOW' ? LEAD_TIME_NOW : value === 'ORDER' ? (leadMode(quoteLeadTime) === 'ORDER' ? quoteLeadTime.trim() : LEAD_TIME_ORDER) : undefined);
            }}
            className="mt-1 h-8 rounded-md border border-input bg-card px-2 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
          >
            <option value="">Prazo do orçamento</option>
            <option value="NOW">Pronta entrega</option>
            <option value="ORDER">Encomenda</option>
          </select>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Remover ${item.name}`} className="-mr-2 shrink-0 hover:text-destructive">
          <X className="size-5" />
        </Button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex items-center overflow-hidden rounded-md border border-input">
          <button type="button" onClick={() => onUpdateQuantity(-1)} disabled={item.quantity <= 1} title={item.quantity <= 1 ? 'Para tirar o item, use o ×' : undefined} aria-label={`Diminuir quantidade de ${item.name}`} className="grid size-10 place-items-center hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:opacity-40"><Minus className="size-4" /></button>
          <span className="min-w-10 text-center text-base font-semibold tabular-nums">{item.quantity}</span>
          <button type="button" onClick={() => onUpdateQuantity(1)} aria-label={`Aumentar quantidade de ${item.name}`} className="grid size-10 place-items-center hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"><Plus className="size-4" /></button>
        </div>

        <div className="flex min-w-0 items-center justify-end gap-3">
          <Input
            id={`price-${item.id}`}
            type="number"
            inputMode="decimal"
            min={0}
            step={0.01}
            placeholder="R$ un."
            aria-label={`Preço unitário de ${item.name}`}
            value={item.unitPrice ?? ''}
            onChange={e => onUpdateUnitPrice(e.target.value === '' ? undefined : Number(e.target.value))}
            className="h-10 w-28 text-right font-code text-base font-semibold tabular-nums"
          />
          {subtotal > 0 && <span className="min-w-24 text-right font-code text-lg font-bold tabular-nums">{money(subtotal)}</span>}
        </div>
      </div>
    </li>
  );
}

/**
 * A linha do orçamento na aba Conserto: UMA linha por item, como a planilha da loja (descrição, prazo, quantidade, valor, total).
 * A gaveta usa o cartão alto (`CartItemRow`), que tem espaço para código copiável e detalhes da peça.
 */
function CartItemRowCompact({
  item,
  onUpdateQuantity,
  onUpdateUnitPrice,
  onUpdateLeadTime,
  quoteLeadTime,
  onRemove,
}: {
  item: QuoteCartItem;
  onUpdateQuantity: (delta: number) => void;
  onUpdateUnitPrice: (value: number | undefined) => void;
  onUpdateLeadTime: (value: string | undefined) => void;
  quoteLeadTime: string;
  onRemove: () => void;
}) {
  const isServiceItem = item.partNumber.startsWith('SRV-');
  const code = item.manufacturer?.toLowerCase().includes('husqvarna') ? formatHusqvarnaPartNumber(item.effectiveCode || item.partNumber) : (item.effectiveCode || item.partNumber);
  const subtotal = item.unitPrice ? item.quantity * item.unitPrice : 0;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_150px_104px_96px_96px_32px] items-center gap-x-3 px-6 py-2.5">
      <div className="min-w-0">
        <h3 className="truncate text-base font-semibold" title={item.name}>{item.name}</h3>
        {!isServiceItem && (
          <span translate="no" className="block truncate font-code text-sm tabular-nums text-muted-foreground">
            {code}{item.location && <span title="Prateleira" className="ml-2 font-semibold text-foreground">Local {item.location}</span>}
          </span>
        )}
      </div>
      <select
        aria-label={`Prazo de ${item.name}`}
        value={item.leadTime ? leadMode(item.leadTime) : ''}
        onChange={event => {
          const value = event.target.value;
          onUpdateLeadTime(value === 'NOW' ? LEAD_TIME_NOW : value === 'ORDER' ? (leadMode(quoteLeadTime) === 'ORDER' ? quoteLeadTime.trim() : LEAD_TIME_ORDER) : undefined);
        }}
        className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
      >
        <option value="">Do orçamento</option>
        <option value="NOW">Pronta entrega</option>
        <option value="ORDER">Encomenda</option>
      </select>
      <div className="inline-flex h-9 items-center overflow-hidden rounded-md border border-input">
        <button type="button" onClick={() => onUpdateQuantity(-1)} disabled={item.quantity <= 1} title={item.quantity <= 1 ? 'Para tirar o item, use o ×' : undefined} aria-label={`Diminuir quantidade de ${item.name}`} className="grid size-9 place-items-center hover:bg-accent focus-visible:bg-accent disabled:opacity-40"><Minus className="size-4" /></button>
        <span className="min-w-8 text-center text-base font-semibold tabular-nums">{item.quantity}</span>
        <button type="button" onClick={() => onUpdateQuantity(1)} aria-label={`Aumentar quantidade de ${item.name}`} className="grid size-9 place-items-center hover:bg-accent focus-visible:bg-accent"><Plus className="size-4" /></button>
      </div>
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        step={0.01}
        placeholder="R$ un."
        aria-label={`Preço unitário de ${item.name}`}
        value={item.unitPrice ?? ''}
        onChange={e => onUpdateUnitPrice(e.target.value === '' ? undefined : Number(e.target.value))}
        className="h-9 w-full text-right font-code text-base font-semibold tabular-nums"
      />
      <span className="text-right font-code text-base font-bold tabular-nums">{subtotal > 0 ? money(subtotal) : ''}</span>
      <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Remover ${item.name}`} className="hover:text-destructive"><X className="size-5" /></Button>
    </li>
  );
}

/**
 * A gaveta do orçamento (layout "drawer", em qualquer tela) e a aba Conserto (layout "page", a MESMA cesta em página inteira).
 * Orçamento de conserto = peças de qualquer fornecedor + mão de obra, com o "Nº da OS" digitado (o sistema não numera).
 */
export default function QuickQuoteCart({ layout = 'drawer' }: { layout?: 'drawer' | 'page' }) {
  const page = layout === 'page';
  const {
    items,
    totalItems,
    totalPrice,
    isOpen,
    setIsOpen,
    updateQuantity,
    updateUnitPrice,
    updateLeadTime,
    removeItem,
    clearCart,
    openWhatsApp,
    generateWhatsAppText,
    generatePdfQuote,
    addItem,
    syncState,
    draftOptions,
    setDraftOptions,
  } = useQuoteCart();

  const { session } = useCounterSession();
  const confirm = useConfirm();

  const [showCustomItemForm, setShowCustomItemForm] = useState(false);
  const [showMessage, setShowMessage] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showPdf, setShowPdf] = useState(false);
  // O que o atendente digitou no campo "Outro desconto" (null = não digitou). Só vale enquanto bate com o desconto da cesta (esvaziar ou restaurar zera).
  const [discountDraft, setDiscountDraft] = useState<string | null>(null);

  // Cliente, telefone, pagamento e desconto moram no rascunho persistido, não
  // em estado local: antes, recarregar a página perdia o nome do cliente mesmo
  // com os itens intactos.
  //
  // O nome do cliente era pedido em DOIS lugares que não se falavam: a barra de
  // atendimento (session.customerName, no localStorage) e este campo
  // (draftOptions.customerName, no rascunho do servidor). Nada ligava os dois,
  // então quem preenchia só na barra mandava o orçamento SEM nome do cliente —
  // o PDF e o texto do WhatsApp leem daqui. Agora a barra é a origem quando
  // este campo está vazio, e digitar aqui continua valendo por cima.
  const customerName = draftOptions.customerName || session.customerName || '';
  const customerPhone = draftOptions.customerPhone || '';
  const paymentMethod = draftOptions.paymentMethod || 'A Combinar no Balcão';
  const discountPercentage = draftOptions.discountPercentage || 0;

  const draftParsed = discountDraft === null ? null : parseDiscountInput(discountDraft);
  const discountText = discountDraft !== null && (draftParsed === null || draftParsed === (draftOptions.discountPercentage || 0)) ? discountDraft : null;
  const discountInvalid = discountText !== null && parseDiscountInput(discountText) === null;
  const shownDiscount = discountText ?? (discountPercentage !== 0 && discountPercentage !== PIX_DISCOUNT ? formatDiscountInput(discountPercentage) : '');
  const patchOptions = (patch: Partial<QuoteTextOptions>) => setDraftOptions({ ...draftOptions, ...patch });

  // Prazo das peças: escolhido (Pronta entrega, Encomenda ou nenhum). Observações: vazias, valem as padrão da loja.
  const leadTime = draftOptions.leadTime ?? '';
  const mode = leadMode(leadTime);
  const defaultNotes = QUOTE_DEFAULTS.observations.join('\n');
  const notesText = draftOptions.notes ?? defaultNotes;
  const leadConflict = leadTimeConflict(leadTime, notesText);
  const notesCustomized = draftOptions.notes !== undefined && draftOptions.notes !== defaultNotes;
  // Na aba Conserto, a cesta vazia JÁ é um orçamento de conserto (o tipo só é gravado quando o primeiro item entra por ela); assim o tipo nunca
  // vaza para o Atendimento: peça adicionada pela busca continua sendo orçamento de peças.
  const repair = page && items.length === 0 ? true : draftOptions.kind === 'REPAIR';
  const quoteOptions: QuoteTextOptions = { kind: draftOptions.kind, docNumber: draftOptions.docNumber, customerName, customerPhone, paymentMethod, discountPercentage, leadTime: draftOptions.leadTime, notes: notesCustomized ? draftOptions.notes : undefined };
  // Mesma conta do texto do WhatsApp, do PDF e do servidor (desconto arredondado antes de subtrair). Calcular
  // aqui por conta própria dava R$ 435,92 na tela e R$ 435,91 no que o cliente recebia e no orçamento arquivado.
  const { discount: discountAmount, net: netTotalPrice } = quoteTotals(items, discountPercentage);

  if (!page && totalItems === 0 && !isOpen) {
    return null;
  }

  const handleAddCustomItem = ({ name, price, quantity, code, manufacturer, location }: CustomItemInput) => {
    if (page && items.length === 0 && draftOptions.kind !== 'REPAIR') patchOptions({ kind: 'REPAIR' });
    if (code) {
      // Peça com código (de qualquer marca): entra com o código, SEM o "modelo" de serviço, para não aparecer como máquina no orçamento do cliente.
      addItem({ partNumber: code, effectiveCode: code, manufacturer, name, model: '', unitPrice: price, quantity, location });
    } else {
      addItem({
        partNumber: `SRV-${Date.now().toString().slice(-4)}`,
        name,
        model: customerName.trim() || 'Serviço / Balcão',
        unitPrice: price,
        quantity,
      });
    }
    // O formulário continua aberto: manutenção leva vários itens em sequência.
    toast.success(`"${name}" adicionado ao orçamento.`);
  };

  // Esvaziar apaga o trabalho do atendimento: pede confirmação, como o "Encerrar".
  const handleClear = async () => {
    const confirmed = await confirm({ title: 'Esvaziar o orçamento?', description: totalItems === 1 ? 'O item será removido.' : `Os ${totalItems} itens serão removidos.`, confirmLabel: 'Esvaziar', destructive: true });
    if (confirmed) clearCart();
  };

  // Cliente e OS: na aba Conserto vêm ANTES das linhas (como na planilha); na gaveta, depois do formulário. Muda de lugar no próprio HTML
  // (e não por CSS), porque a ordem do Tab precisa ser a da tela.
  const customerSection = (
            <section className={cn('space-y-4 border-t border-border bg-card px-6 py-5', page && 'border-t-0')}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="quote-customer-name" className="block text-sm font-medium text-muted-foreground">Cliente e máquina</label>
                  <Input id="quote-customer-name" type="text" autoComplete="off" value={customerName} onChange={e => patchOptions({ customerName: e.target.value })} placeholder="Nome do cliente" className="text-base" />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="quote-customer-phone" className="block text-sm font-medium text-muted-foreground">WhatsApp do cliente</label>
                  <Input id="quote-customer-phone" type="tel" inputMode="tel" autoComplete="off" value={customerPhone} onChange={e => patchOptions({ customerPhone: maskPhoneInput(e.target.value) })} placeholder="(19) 99999-9999" className="font-code text-base tabular-nums" />
                </div>
              </div>

              {repair && (
                <div className="space-y-1.5">
                  <label htmlFor="quote-doc-number" className="block text-sm font-medium text-muted-foreground">Nº da OS</label>
                  <Input id="quote-doc-number" type="text" autoComplete="off" maxLength={40} value={draftOptions.docNumber ?? ''} onChange={e => patchOptions({ docNumber: e.target.value })} className="font-code text-base font-semibold" />
                </div>
              )}

              {draftOptions.engine && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted px-3 py-2">
                  <span className="text-base"><span className="text-muted-foreground">Motor </span><span translate="no" className="font-code font-semibold">{draftOptions.engine}</span></span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => patchOptions({ engine: undefined })} aria-label={`Tirar o motor ${draftOptions.engine} do orçamento`}>Tirar</Button>
                </div>
              )}

            </section>
  );

  const content = (
    <>
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border bg-card px-6 py-4">
            <div className="min-w-0">
              {!page && <SheetTitle className="text-2xl font-semibold leading-8 text-foreground">{repair ? 'Orçamento de conserto' : 'Orçamento'}</SheetTitle>}
              {!page && <SheetDescription className="sr-only">Peças, cliente e envio do orçamento de balcão</SheetDescription>}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <span className="text-base text-muted-foreground">{totalItems} {totalItems === 1 ? 'item' : 'itens'}</span>
                <SyncStatus state={syncState} />
              </div>
              {!(page && items.length === 0) && <div role="group" aria-label="Tipo do orçamento" className="mt-2 inline-flex overflow-hidden rounded-md border border-input">
                {([['PARTS', 'Peças'], ['REPAIR', 'Conserto']] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={(repair ? 'REPAIR' : 'PARTS') === value}
                    onClick={() => patchOptions({ kind: value })}
                    className={cn('h-8 px-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/60', (repair ? 'REPAIR' : 'PARTS') === value ? 'bg-selected font-semibold text-foreground' : 'bg-card text-muted-foreground hover:bg-muted')}
                  >
                    {label}
                  </button>
                ))}
              </div>}
            </div>
            {!page && <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} aria-label="Fechar orçamento"><X className="size-5" /></Button>}
          </header>

          {/* Uma única região rolável: peças primeiro (é o que se confere com o cliente
              na frente), depois cliente e pagamento. O rodapé fica fixo e curto: total e
              envio. Antes, um rodapé de ~220 px engolia a lista em tela curta. */}
          <div className={page ? '' : 'min-h-0 flex-1 overflow-y-auto overscroll-contain'}>
            {page && customerSection}
            {items.length === 0 ? (page ? null : (
              <div className="px-6 py-16 text-center">
                <p className="text-xl font-semibold">Orçamento vazio</p>
                <p className="mt-1 text-base text-muted-foreground">Adicione peças pela busca.</p>
              </div>
            )) : (
              <ul className="divide-y divide-border bg-card">
                {page && (
                  <li aria-hidden="true" className="grid grid-cols-[minmax(0,1fr)_150px_104px_96px_96px_32px] gap-x-3 bg-muted px-6 py-1.5 text-sm font-medium text-muted-foreground">
                    <span>Descrição</span><span>Prazo</span><span className="text-center">Qtde</span><span className="text-right">Valor un.</span><span className="text-right">Total</span><span />
                  </li>
                )}
                {items.map(item => {
                  const Row = page ? CartItemRowCompact : CartItemRow;
                  return (
                  <Row
                    key={item.id}
                    item={item}
                    onUpdateQuantity={delta => updateQuantity(item.id, delta)}
                    onUpdateUnitPrice={value => updateUnitPrice(item.id, value)}
                    onUpdateLeadTime={value => updateLeadTime(item.id, value)}
                    quoteLeadTime={leadTime}
                    onRemove={() => removeItem(item.id)}
                  />
                  );
                })}
              </ul>
            )}

            <div className="border-t border-border px-6 py-4">
              {!showCustomItemForm && !page ? (
                <Button variant="outline" onClick={() => setShowCustomItemForm(true)} className="w-full border-dashed">
                  <Plus className="size-4" />
                  Serviço ou item avulso
                </Button>
              ) : (
                <CustomItemForm onAdd={handleAddCustomItem} onClose={() => setShowCustomItemForm(false)} embedded={page} />
              )}
            </div>


            {!page && customerSection}

            <section className="space-y-4 border-t border-border bg-card px-6 py-5">
              <div className="space-y-1.5">
                <label htmlFor="quote-payment-method" className="block text-sm font-medium text-muted-foreground">Condição de pagamento</label>
                <select
                  id="quote-payment-method"
                  value={paymentMethod}
                  onChange={e => patchOptions({ paymentMethod: e.target.value })}
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-base text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
                >
                  {PAYMENT_METHODS.map(method => (
                    <option key={method} value={method}>{method}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <span id="quote-lead-time-label" className="block text-sm font-medium text-muted-foreground">Prazo das peças</span>
                <div role="group" aria-labelledby="quote-lead-time-label" className="flex flex-wrap gap-2">
                  {([['NOW', 'Pronta entrega'], ['ORDER', 'Encomenda'], ['NONE', 'Sem prazo']] as const).map(([value, label]) => (
                    <Button key={value} type="button" size="sm" variant="outline" className={mode === value ? 'border-ring bg-selected' : undefined} aria-pressed={mode === value} onClick={() => patchOptions({ leadTime: leadTimeFor(value, leadTime) })}>{label}</Button>
                  ))}
                </div>
                {mode === 'ORDER' && (
                  <Input id="quote-lead-time" aria-label="Prazo da encomenda" type="text" autoComplete="off" value={leadTime} onChange={e => patchOptions({ leadTime: e.target.value })} placeholder="7 a 10 dias" className="text-base" />
                )}
                {leadConflict && <p role="alert" className="text-sm font-medium text-warn">{leadConflict}</p>}
              </div>

              <div>
                <Button variant="ghost" size="sm" onClick={() => setShowNotes(value => !value)} aria-expanded={showNotes} className="-ml-2 text-muted-foreground">
                  {showNotes ? 'Esconder as observações' : 'Observações do orçamento'}
                  {notesCustomized && !showNotes && <span className="ml-1 font-semibold text-foreground">(editadas)</span>}
                </Button>
                {showNotes && (
                  <div className="mt-1 space-y-2">
                    <textarea
                      aria-label="Observações do orçamento"
                      value={notesText}
                      rows={4}
                      onChange={e => patchOptions({ notes: e.target.value === defaultNotes ? undefined : e.target.value })}
                      className="w-full rounded-md border border-input bg-card px-3 py-2 text-base text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/60"
                    />
                    {notesCustomized && (
                      <Button variant="ghost" size="sm" onClick={() => patchOptions({ notes: undefined })} className="-ml-2 text-muted-foreground">Voltar ao texto padrão</Button>
                    )}
                  </div>
                )}
              </div>

              {totalPrice > 0 && (
                <div className="space-y-1.5">
                  <span className="block text-sm font-medium text-muted-foreground">Desconto</span>
                  <div className="grid grid-cols-[1fr_1fr_1.4fr] gap-2" role="group" aria-label="Desconto">
                    {DISCOUNT_PRESETS.map(disc => (
                      <Button
                        key={disc.value}
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-pressed={discountPercentage === disc.value && discountText === null}
                        onClick={() => { setDiscountDraft(null); patchOptions({ discountPercentage: disc.value }); }}
                        className={`px-1 ${discountPercentage === disc.value && discountText === null ? 'border-ring bg-selected' : ''}`}
                      >
                        {disc.label}
                      </Button>
                    ))}
                    <div className="relative">
                      <Input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        aria-label="Outro desconto (%)"
                        placeholder="Outro"
                        value={shownDiscount}
                        aria-invalid={discountInvalid}
                        onChange={event => {
                          const text = event.target.value;
                          setDiscountDraft(text);
                          const parsed = parseDiscountInput(text);
                          if (parsed !== null) patchOptions({ discountPercentage: parsed });
                        }}
                        className={`h-8 pr-7 text-right font-code text-base font-semibold ${discountText !== null && !discountInvalid && discountText.trim() !== '' ? 'border-ring bg-selected' : ''}`}
                      />
                      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                </div>
              )}

              {syncState === 'offline' && (
                <p role="status" className="rounded-lg border border-warn bg-warn-soft px-3 py-2 text-sm font-medium text-warn">
                  Sem conexão com o servidor. O envio no WhatsApp e o PDF funcionam, mas o orçamento só será arquivado quando a conexão voltar.
                </p>
              )}
            </section>
          </div>

          {items.length > 0 && (
            <footer className={cn('shrink-0 space-y-2 border-t border-border bg-card px-6 py-3', page && 'sticky bottom-0 z-10')}>
              {totalPrice > 0 && (
                <div>
                  {discountPercentage > 0 && (
                    <div className="mb-1 space-y-0.5 text-base text-muted-foreground">
                      <div className="flex justify-between"><span>Subtotal</span><span className="font-code tabular-nums">{money(totalPrice)}</span></div>
                      <div className="flex justify-between"><span>Desconto ({discountPercentage}%)</span><span className="font-code tabular-nums">-{money(discountAmount)}</span></div>
                    </div>
                  )}
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-base text-muted-foreground">Total</span>
                    <span className="font-code text-3xl font-bold tabular-nums">{money(netTotalPrice)}</span>
                  </div>
                </div>
              )}

              {/* O PDF e o WhatsApp já arquivam o orçamento sozinhos: não há botão "Salvar",
                  que dava a impressão contrária. Tudo numa linha: o rodapé alto deixava só uma faixa
                  de rolagem para o formulário em tela de 768 px. */}
              <div className="flex gap-2">
                <Button size="lg" className="min-w-0 flex-1" onClick={() => openWhatsApp(quoteOptions)}>
                  <Icon name="whatsapp" className="size-5 shrink-0" />
                  <span className="truncate">{customerPhone ? `Enviar no WhatsApp (${customerPhone})` : 'Enviar no WhatsApp'}</span>
                </Button>
                <Button size="lg" variant="outline" onClick={() => generatePdfQuote(quoteOptions)}><Icon name="pdf" className="size-4" />PDF</Button>
                <Button size="lg" variant="outline" onClick={() => setShowPdf(true)}><Eye className="size-4" aria-hidden="true" />Prévia</Button>
              </div>

              {/* Prévia do que o cliente vai ler, igual ao que sai no link do WhatsApp. Fechada por padrão: o
                  atendimento normal é um clique só, e quem quer conferir abre. */}
              <div>
                <div className="flex items-center justify-between">
                  <Button variant="ghost" size="sm" onClick={() => setShowMessage(value => !value)} aria-expanded={showMessage} className="text-muted-foreground">
                    {showMessage ? 'Esconder a mensagem' : 'Ver a mensagem antes de enviar'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleClear} className="text-muted-foreground hover:text-destructive">Esvaziar</Button>
                </div>
                {showMessage && (
                  <div className="mt-2 rounded-lg border border-border bg-background p-3">
                    <pre aria-label="Mensagem do WhatsApp" className="max-h-36 overflow-y-auto whitespace-pre-wrap font-sans text-sm leading-6">{generateWhatsAppText(quoteOptions)}</pre>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => {
                        void navigator.clipboard.writeText(generateWhatsAppText(quoteOptions)).then(
                          () => toast.success('Mensagem copiada.'),
                          () => toast.error('Não foi possível copiar a mensagem.'),
                        );
                      }}
                    >
                      Copiar mensagem
                    </Button>
                  </div>
                )}
              </div>
            </footer>
          )}
    </>
  );

  return (
    <>
      {/* Não existe botão flutuante de orçamento: o cabeçalho do app já tem o botão
          "Orçamento" com o contador, sempre visível. */}
      {page ? (
        <div className="flex w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-background">{content}</div>
      ) : (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetContent side="right" showCloseButton={false} className="w-full gap-0 border-border bg-background p-0 sm:max-w-[560px]">{content}</SheetContent>
        </Sheet>
      )}

      {showPdf && <QuotePdfDialog options={quoteOptions} onClose={() => setShowPdf(false)} />}
    </>
  );
}
