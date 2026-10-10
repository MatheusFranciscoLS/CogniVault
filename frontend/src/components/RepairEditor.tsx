import { useId, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent, ReactNode } from 'react';
import { Eye, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '../context/confirm';
import { useQuoteCart } from '../context/QuoteCartContext';
import type { QuoteTextOptions } from '../context/QuoteCartContext';
import { LINE_COLUMNS, leadChoiceOf, leadTextFor, type LeadChoice } from '../lib/quote-line';
import { maskPhoneInput } from '../lib/phone';
import { formatBRL, quoteTotals } from '../lib/quote-message';
import { useItemLookup } from '../lib/use-item-lookup';
import { priceLooksOff, sameHistoryLine, useRepairHistoryWarmup, useRepairSuggestions, useRepairTogether, type HistorySuggestion } from '../lib/use-repair-history';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { BAND_FIELD } from '../lib/band-field';
import { Icon } from './icons/Icon';
import DiscountField from './DiscountField';
import PaymentTerms from './PaymentTerms';
import QuoteLine, { LeadSelect } from './QuoteLine';
import QuotePdfDialog from './QuotePdfDialog';
import { SuggestionList, TogetherChips } from './RepairSuggestions';
import SyncStatus from './SyncStatus';

/** A linha de entrada, embaixo da tabela: código (opcional), descrição, quantidade, valor, prazo. Enter adiciona e volta para o código. */
function EntryRow({ onAdd, extra }: { onAdd: (input: { code: string; name: string; quantity: number; price: number | undefined; leadTime: string | undefined; manufacturer?: string; location?: string }) => void; extra?: ReactNode }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [price, setPrice] = useState('');
  const [lead, setLead] = useState<string>('NOW');
  // O que o balcão escreveu nunca é apagado pelo que o sistema acha.
  const [nameTouched, setNameTouched] = useState(false);
  const [priceTouched, setPriceTouched] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);

  const { enabled, searching, found, typed } = useItemLookup(code);
  const shownName = nameTouched ? name : (found?.name ?? name);
  const shownPrice = priceTouched ? price : (found?.price !== undefined ? String(found.price) : price);

  // Já orçado antes: pela descrição que o balcão digita; sem descrição, pelo código que o cadastro e os catálogos não conhecem (outro fornecedor).
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const [dismissed, setDismissed] = useState('');
  const typedName = nameTouched ? name.trim() : '';
  const askText = typedName || (!shownName.trim() && enabled && !searching && !found ? code.trim() : '');
  const { items: suggestions, asked } = useRepairSuggestions(askText);
  const listOpen = focused && suggestions.length > 0 && asked === askText && dismissed !== askText;

  const pick = (item: HistorySuggestion) => {
    setName(item.name); setNameTouched(true);
    if (item.price !== null) { setPrice(String(item.price)); setPriceTouched(true); }
    if (item.isService) setLead('');
    else { const choice = leadChoiceOf(item.leadTime); if (choice) setLead(choice); }
    if (!code.trim() && item.partNumber) setCode(item.partNumber);
    setActive(-1);
    setDismissed(item.name.trim());
    priceRef.current?.focus();
    priceRef.current?.select();
  };

  // Setas escolhem, Enter só escolhe se uma opção está marcada (senão lança o que foi digitado, como sempre), Esc fecha.
  const suggestKeys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!listOpen) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive(current => (current + step + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      pick(suggestions[active]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setDismissed(askText);
    }
  };
  const typing = () => { setActive(-1); setDismissed(''); };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const cleanName = shownName.trim();
    if (!cleanName) { nameRef.current?.focus(); return; }
    const parsedPrice = shownPrice ? parseFloat(shownPrice.replace(',', '.')) : undefined;
    const parsedQty = Math.max(1, Math.floor(Number(quantity)) || 1);
    // Mão de obra não tem prazo de peça (como nas planilhas da loja).
    const isLabor = /m[aã]o.?de.?obra/i.test(cleanName);
    onAdd({
      code: typed,
      name: cleanName,
      quantity: parsedQty,
      price: parsedPrice !== undefined && !Number.isNaN(parsedPrice) && parsedPrice >= 0 ? parsedPrice : undefined,
      leadTime: isLabor || !lead ? undefined : leadTextFor(lead as LeadChoice),
      manufacturer: found?.manufacturer,
      location: found?.location,
    });
    setCode(''); setName(''); setQuantity('1'); setPrice(''); setNameTouched(false); setPriceTouched(false); setActive(-1); setDismissed('');
    codeRef.current?.focus();
  };

  // Valor fora do que a loja costuma cobrar nesta linha (o zero a mais ou a menos): só um aviso, o valor digitado vale.
  const typedPrice = shownPrice ? parseFloat(shownPrice.replace(',', '.')) : undefined;
  const reference = typedName && asked === typedName ? suggestions.find(item => sameHistoryLine(item.name, typedName)) : undefined;
  const priceHint = reference && priceLooksOff(typedPrice, reference) ? `Costuma ser ${formatBRL(reference.price as number)} (${reference.count} vezes): confira o valor.` : null;

  const status = !enabled ? null
    : searching ? 'Procurando…'
      : found ? (found.origin === 'LOJA'
        ? `Achei no cadastro da loja${found.manufacturer ? ` (${found.manufacturer})` : ''}${found.price === undefined ? '. Escreva o valor.' : '.'}${found.confirmPrice ? ' Confira o valor.' : ''}`
        : `Achei no catálogo ${found.manufacturer}. Escreva o valor.`)
        : 'Não achei este código: escreva a descrição e o valor.';

  return (
    <form onSubmit={submit} noValidate className="relative shrink-0 space-y-2 border-t border-border bg-secondary/40 px-5 py-3">
      <div className="flex min-h-5 items-center justify-between gap-3">
        <div className="min-w-0">
          <p role="status" className="text-sm text-muted-foreground">{status}</p>
          {priceHint && <p role="status" className="text-sm font-semibold text-warn">{priceHint}</p>}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => { setName('Mão de obra'); setNameTouched(true); priceRef.current?.focus(); }}
          className="text-muted-foreground"
        >
          <Plus className="size-4" aria-hidden="true" />Mão de obra
        </Button>
      </div>
      {extra}
      <div className={LINE_COLUMNS}>
        <div className="flex min-w-0 gap-2">
          <Input
            ref={codeRef}
            id="repair-entry-code"
            aria-label="Código da peça (opcional)"
            placeholder="Código"
            autoComplete="off"
            spellCheck={false}
            translate="no"
            value={code}
            onChange={event => { setCode(event.target.value); typing(); }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={suggestKeys}
            className="h-9 w-36 shrink-0 font-code text-base font-semibold"
          />
          <Input
            ref={nameRef}
            aria-label="Descrição do serviço ou item"
            placeholder="Descrição"
            autoComplete="off"
            role="combobox"
            aria-expanded={listOpen}
            aria-controls={listOpen ? listId : undefined}
            aria-activedescendant={listOpen && active >= 0 ? `${listId}-${active}` : undefined}
            aria-autocomplete="list"
            value={shownName}
            onChange={event => { setName(event.target.value); setNameTouched(true); typing(); }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={suggestKeys}
            className="h-9 min-w-0 flex-1 text-base"
          />
        </div>
        <Input aria-label="Quantidade" type="number" min={1} value={quantity} onChange={event => setQuantity(event.target.value)} className="h-9 w-full text-center font-code text-base font-semibold" />
        <Input
          ref={priceRef}
          aria-label="Valor unitário (R$)"
          type="number"
          inputMode="decimal"
          min={0}
          step={0.01}
          placeholder="R$ un."
          value={shownPrice}
          onChange={event => { setPrice(event.target.value); setPriceTouched(true); }}
          className="h-9 w-full text-right font-code text-base font-semibold"
        />
        <LeadSelect label="Prazo da nova linha" blankLabel="Sem prazo" value={lead} onChange={setLead} />
        <Button type="submit" size="sm" className="col-span-2 h-9">Adicionar</Button>
      </div>
      {listOpen && <SuggestionList id={listId} items={suggestions} active={active} onPick={pick} />}
    </form>
  );
}

/**
 * Nº da OS, cliente e WhatsApp do orçamento de conserto. Moram na FAIXA da tela (direção B: os campos de trabalho ficam em cima, ao lado do título) e
 * escrevem na mesma cesta do editor. Vêm antes das linhas no HTML, então a ordem do Tab continua: OS, cliente, WhatsApp, linhas.
 */
export function RepairCustomerFields() {
  const { draftOptions, setDraftOptions } = useQuoteCart();
  const patch = (changes: Partial<QuoteTextOptions>) => setDraftOptions({ ...draftOptions, ...changes });
  return (
    <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)_200px]">
      <div className="space-y-1.5">
        <label htmlFor="repair-os" className="block text-sm font-semibold text-band-muted">Nº da OS</label>
        <Input id="repair-os" type="text" autoComplete="off" maxLength={40} value={draftOptions.docNumber ?? ''} onChange={event => patch({ docNumber: event.target.value })} className={cn('h-11 font-code text-base font-semibold', BAND_FIELD)} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="repair-customer" className="block text-sm font-semibold text-band-muted">Cliente</label>
        <Input id="repair-customer" type="text" autoComplete="off" value={draftOptions.customerName ?? ''} onChange={event => patch({ customerName: event.target.value })} className={cn('h-11 text-base', BAND_FIELD)} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="repair-phone" className="block text-sm font-semibold text-band-muted">WhatsApp</label>
        <Input id="repair-phone" type="tel" inputMode="tel" autoComplete="off" value={draftOptions.customerPhone ?? ''} onChange={event => patch({ customerPhone: maskPhoneInput(event.target.value) })} placeholder="(19) 99999-9999" className={cn('h-11 font-code text-base tabular-nums', BAND_FIELD)} />
      </div>
    </div>
  );
}

/**
 * O orçamento de conserto (aba Conserto): o mesmo que a loja faz hoje na planilha "ORÇAMENTO DAV ####", com a cesta PRÓPRIA (nunca mistura com o
 * orçamento de peças do Atendimento). Nº da OS digitado, cliente, linhas (peças de qualquer fornecedor e mão de obra, cada uma com o seu prazo), pagamento
 * e desconto só se negociado. Sem defeito, previsão, garantia nem separação de peças (isso é a OS do Clipp).
 */
export default function RepairEditor() {
  const {
    items, totalItems, totalPrice, syncState, draftOptions, setDraftOptions,
    addItem, updateQuantity, updateUnitPrice, updateLeadTime, removeItem, clearCart, openWhatsApp, generatePdfQuote,
  } = useQuoteCart();
  const confirm = useConfirm();
  const [showPdf, setShowPdf] = useState(false);
  useRepairHistoryWarmup();
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const together = useRepairTogether(lastAdded, items.map(item => item.name));

  const patch = (changes: Partial<QuoteTextOptions>) => setDraftOptions({ ...draftOptions, ...changes });
  const discountPercentage = draftOptions.discountPercentage || 0;
  const customerPhone = draftOptions.customerPhone || '';
  const quoteOptions: QuoteTextOptions = {
    kind: 'REPAIR',
    docNumber: draftOptions.docNumber,
    customerName: draftOptions.customerName,
    customerPhone,
    paymentMethod: draftOptions.paymentMethod,
    discountPercentage,
  };
  const { discount, net } = quoteTotals(items, discountPercentage);

  const add: Parameters<typeof EntryRow>[0]['onAdd'] = ({ code, name, quantity, price, leadTime, manufacturer, location }) => {
    if (code) {
      addItem({ partNumber: code, effectiveCode: code, manufacturer, name, model: '', unitPrice: price, quantity, leadTime, location });
    } else {
      addItem({ partNumber: `SRV-${Date.now().toString().slice(-6)}`, name, model: '', unitPrice: price, quantity, leadTime });
    }
  };

  const reset = async () => {
    if (items.length === 0 && !draftOptions.docNumber && !draftOptions.customerName) return;
    const ok = await confirm({ title: 'Começar um orçamento novo?', description: items.length ? `Os ${items.length} ${items.length === 1 ? 'item' : 'itens'} deste orçamento saem da tela. Se já enviou, ele continua na pasta.` : 'Os dados deste orçamento saem da tela.', confirmLabel: 'Começar novo', destructive: true });
    if (ok) clearCart();
  };

  return (
    <section aria-label="Orçamento de conserto" className="flex min-h-[480px] flex-col overflow-clip rounded-card border border-border bg-card lg:h-[calc(100dvh-15rem)]">
      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <li aria-hidden="true" className={`${LINE_COLUMNS} sticky top-0 z-10 bg-muted px-5 py-1.5 text-sm font-medium text-muted-foreground`}>
          <span>Descrição</span><span className="text-center">Qtde</span><span className="text-right">Valor un.</span><span>Prazo</span><span className="text-right">Total</span><span />
        </li>
        {items.map(item => (
          <QuoteLine
            key={item.id}
            item={item}
            variant="repair"
            onQuantity={delta => updateQuantity(item.id, delta)}
            onPrice={value => updateUnitPrice(item.id, value)}
            onLead={value => updateLeadTime(item.id, value)}
            onRemove={() => removeItem(item.id)}
          />
        ))}
      </ul>

      <EntryRow
        onAdd={entry => { add(entry); setLastAdded(entry.name); toast.success(`"${entry.name}" adicionado.`); }}
        extra={<TogetherChips
          items={together}
          onAdd={item => {
            add({ code: item.partNumber ?? '', name: item.name, quantity: 1, price: item.price ?? undefined, leadTime: item.isService ? undefined : (item.leadTime ?? undefined) });
            setLastAdded(item.name);
            toast.success(`"${item.name}" adicionado.`);
          }}
        />}
      />

      {/* A barra de baixo nunca sai da tela: o editor tem a altura da janela e só a lista de linhas rola (em 768 px o total e o envio não podem ficar abaixo da dobra). */}
      <div className="shrink-0 border-t border-border bg-card">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-5 pt-3">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <PaymentTerms idPrefix="repair" value={draftOptions.paymentMethod} onChange={text => patch({ paymentMethod: text || undefined })} />
            {totalPrice > 0 && <DiscountField percentage={discountPercentage} onChange={value => patch({ discountPercentage: value })} />}
          </div>
          <div className="space-y-0.5 text-right">
            {discountPercentage > 0 && totalPrice > 0 && (
              <>
                <div className="flex justify-between gap-6 text-sm text-muted-foreground"><span>Subtotal</span><span className="font-code tabular-nums">{formatBRL(totalPrice)}</span></div>
                <div className="flex justify-between gap-6 text-sm text-muted-foreground"><span>Desconto ({discountPercentage}%)</span><span className="font-code tabular-nums">-{formatBRL(discount)}</span></div>
              </>
            )}
            <div className="flex items-baseline justify-between gap-6">
              <span className="text-base text-muted-foreground">Total</span>
              <span className="font-code text-3xl font-bold tabular-nums">{formatBRL(net)}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-5 py-3">
          <Button size="lg" disabled={totalItems === 0} onClick={() => openWhatsApp(quoteOptions)}>
            <Icon name="whatsapp" className="size-5 shrink-0" />Enviar no WhatsApp
          </Button>
          <Button size="lg" variant="outline" disabled={totalItems === 0} onClick={() => generatePdfQuote(quoteOptions)}><Icon name="pdf" className="size-4" />PDF</Button>
          <Button size="lg" variant="outline" disabled={totalItems === 0} onClick={() => setShowPdf(true)}><Eye className="size-4" aria-hidden="true" />Prévia</Button>
          <div className="ml-auto flex items-center gap-3">
            <SyncStatus state={syncState} />
            <Button variant="ghost" size="sm" onClick={() => void reset()} className="text-muted-foreground hover:text-destructive">Novo orçamento</Button>
          </div>
        </div>
      </div>

      {showPdf && <QuotePdfDialog options={quoteOptions} onClose={() => setShowPdf(false)} />}
    </section>
  );
}
