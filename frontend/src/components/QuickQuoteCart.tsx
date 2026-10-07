import { useState } from 'react';
import type { FormEvent } from 'react';
import { Check, Copy, Minus, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { useCounterSession } from '../context/CounterSessionContext';
import { useQuoteCart } from '../context/QuoteCartContext';
import type { QuoteCartItem, QuoteSyncState, QuoteTextOptions } from '../context/QuoteCartContext';
import { formatHusqvarnaPartNumber, cleanErpCode } from '../lib';
import { playCopySound } from '../lib/sound';
import { quoteTotals } from '../lib/quote-message';
import { Icon } from './icons/Icon';
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

const DISCOUNT_PRESETS = [
  { label: '0%', value: 0 },
  { label: '5% PIX', value: 5 },
  { label: '10% Balcão', value: 10 },
  { label: '15% Especial', value: 15 },
];

// Um atalho só, por decisão do dono. Os outros três saíram pelo que eles são,
// não por espaço na tela:
//   - "Limpeza e regulagem" e "Graxa de transmissão" já estão dentro da mão de
//     obra; cobrar à parte seria cobrar duas vezes pelo mesmo serviço.
//   - "Óleo 2T Pro 1L" é PEÇA, não serviço, e lubrificante é acessório — este
//     produto é focado em peça. Entra pelo cadastro ou como item avulso digitado.
const CUSTOM_ITEM_PRESETS = [
  'Mão de obra / Revisão Geral',
];

function money(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

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

function CustomItemForm({ onAdd, onClose }: { onAdd: (name: string, price: number | undefined, qty: number) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState(1);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;
    const priceNum = price ? parseFloat(price.replace(',', '.')) : undefined;
    onAdd(cleanName, priceNum !== undefined && !isNaN(priceNum) && priceNum >= 0 ? priceNum : undefined, Math.max(1, qty || 1));
    setName('');
    setPrice('');
    setQty(1);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Serviço ou item avulso</h3>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fechar"><X className="size-5" /></Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {CUSTOM_ITEM_PRESETS.map(preset => (
          <Button key={preset} type="button" variant="outline" size="sm" onClick={() => setName(preset)}>{preset}</Button>
        ))}
      </div>

      <Input type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="Descrição do serviço ou item…" aria-label="Descrição do serviço ou item" className="text-base" />

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="custom-item-price" className="block text-sm font-medium text-muted-foreground">Preço (R$)</label>
          <Input id="custom-item-price" type="number" inputMode="decimal" step="0.5" min="0" value={price} onChange={e => setPrice(e.target.value)} placeholder="0,00" className="font-code text-base font-semibold" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="custom-item-qty" className="block text-sm font-medium text-muted-foreground">Quantidade</label>
          <Input id="custom-item-qty" type="number" min="1" value={qty} onChange={e => setQty(parseInt(e.target.value, 10) || 1)} className="font-code text-base font-semibold" />
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" className="flex-1">Adicionar</Button>
        <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
      </div>
    </form>
  );
}

function CartItemRow({
  item,
  onUpdateQuantity,
  onUpdateUnitPrice,
  onRemove,
}: {
  item: QuoteCartItem;
  onUpdateQuantity: (delta: number) => void;
  onUpdateUnitPrice: (value: number | undefined) => void;
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
    : [item.model, item.pnc ? `PNC ${item.pnc}` : '', item.position ? `Pos. ${item.position}` : ''].filter(Boolean).join(' · ');

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
            step={0.5}
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

export default function QuickQuoteCart() {
  const {
    items,
    totalItems,
    totalPrice,
    isOpen,
    setIsOpen,
    updateQuantity,
    updateUnitPrice,
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

  const [showCustomItemForm, setShowCustomItemForm] = useState(false);
  const [showMessage, setShowMessage] = useState(false);

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

  const patchOptions = (patch: Partial<QuoteTextOptions>) => setDraftOptions({ ...draftOptions, ...patch });

  const quoteOptions: QuoteTextOptions = { customerName, customerPhone, paymentMethod, discountPercentage };
  // Mesma conta do texto do WhatsApp, do PDF e do servidor (desconto arredondado antes de subtrair). Calcular
  // aqui por conta própria dava R$ 435,92 na tela e R$ 435,91 no que o cliente recebia e no orçamento arquivado.
  const { discount: discountAmount, net: netTotalPrice } = quoteTotals(items, discountPercentage);

  if (totalItems === 0 && !isOpen) {
    return null;
  }

  const handleAddCustomItem = (name: string, price: number | undefined, qty: number) => {
    addItem({
      partNumber: `SRV-${Date.now().toString().slice(-4)}`,
      name,
      model: customerName.trim() || 'Serviço / Balcão',
      unitPrice: price,
      quantity: qty,
    });
    setShowCustomItemForm(false);
    toast.success(`"${name}" adicionado ao orçamento.`);
  };

  // Esvaziar apaga o trabalho do atendimento: pede confirmação, como o "Encerrar".
  const handleClear = () => {
    if (window.confirm('Esvaziar o orçamento?')) clearCart();
  };

  return (
    <>
      {/* Não existe botão flutuante de orçamento: o cabeçalho do app já tem o botão
          "Orçamento" com o contador, sempre visível. */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent side="right" showCloseButton={false} className="w-full gap-0 border-border bg-background p-0 sm:max-w-[560px]">
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border bg-card px-6 py-4">
            <div className="min-w-0">
              <SheetTitle className="text-2xl font-semibold leading-8 text-foreground">Orçamento</SheetTitle>
              <SheetDescription className="sr-only">Peças, cliente e envio do orçamento de balcão</SheetDescription>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <span className="text-base text-muted-foreground">{totalItems} {totalItems === 1 ? 'item' : 'itens'}</span>
                <SyncStatus state={syncState} />
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} aria-label="Fechar orçamento"><X className="size-5" /></Button>
          </header>

          {/* Uma única região rolável: peças primeiro (é o que se confere com o cliente
              na frente), depois cliente e pagamento. O rodapé fica fixo e curto: total e
              envio. Antes, um rodapé de ~220 px engolia a lista em tela curta. */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {items.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <p className="text-xl font-semibold">Orçamento vazio</p>
                <p className="mt-1 text-base text-muted-foreground">Adicione peças pela busca.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border bg-card">
                {items.map(item => (
                  <CartItemRow
                    key={item.id}
                    item={item}
                    onUpdateQuantity={delta => updateQuantity(item.id, delta)}
                    onUpdateUnitPrice={value => updateUnitPrice(item.id, value)}
                    onRemove={() => removeItem(item.id)}
                  />
                ))}
              </ul>
            )}

            <div className="border-t border-border px-6 py-4">
              {!showCustomItemForm ? (
                <Button variant="outline" onClick={() => setShowCustomItemForm(true)} className="w-full border-dashed">
                  <Plus className="size-4" />
                  Serviço ou item avulso
                </Button>
              ) : (
                <CustomItemForm onAdd={handleAddCustomItem} onClose={() => setShowCustomItemForm(false)} />
              )}
            </div>

            <section className="space-y-4 border-t border-border bg-card px-6 py-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="quote-customer-name" className="block text-sm font-medium text-muted-foreground">Cliente e máquina</label>
                  <Input id="quote-customer-name" type="text" autoComplete="off" value={customerName} onChange={e => patchOptions({ customerName: e.target.value })} placeholder="Nome do cliente" className="text-base" />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="quote-customer-phone" className="block text-sm font-medium text-muted-foreground">WhatsApp do cliente</label>
                  <Input id="quote-customer-phone" type="tel" inputMode="tel" autoComplete="off" value={customerPhone} onChange={e => patchOptions({ customerPhone: e.target.value })} placeholder="(19) 99999-9999" className="font-code text-base tabular-nums" />
                </div>
              </div>

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

              {totalPrice > 0 && (
                <div className="space-y-1.5">
                  <span className="block text-sm font-medium text-muted-foreground">Desconto</span>
                  <div className="grid grid-cols-4 gap-2" role="group" aria-label="Desconto">
                    {DISCOUNT_PRESETS.map(disc => (
                      <Button
                        key={disc.value}
                        type="button"
                        variant={discountPercentage === disc.value ? 'default' : 'outline'}
                        size="sm"
                        aria-pressed={discountPercentage === disc.value}
                        onClick={() => patchOptions({ discountPercentage: disc.value })}
                        className="px-1"
                      >
                        {disc.label}
                      </Button>
                    ))}
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
            <footer className="shrink-0 space-y-3 border-t border-border bg-card px-6 py-4">
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

              <Button size="lg" className="w-full" onClick={() => openWhatsApp(quoteOptions)}>
                <Icon name="whatsapp" className="size-5" />
                {customerPhone ? `Enviar no WhatsApp (${customerPhone})` : 'Enviar no WhatsApp'}
              </Button>

              {/* Prévia do que o cliente vai ler, igual ao que sai no link do WhatsApp. Fechada por padrão: o
                  atendimento normal é um clique só, e quem quer conferir abre. */}
              <div>
                <Button variant="ghost" size="sm" onClick={() => setShowMessage(value => !value)} aria-expanded={showMessage} className="w-full text-muted-foreground">
                  {showMessage ? 'Esconder a mensagem' : 'Ver a mensagem antes de enviar'}
                </Button>
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

              {/* O PDF e o WhatsApp já arquivam o orçamento sozinhos: não há botão "Salvar",
                  que dava a impressão contrária. */}
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" onClick={() => generatePdfQuote(quoteOptions)}><Icon name="pdf" className="size-4" />PDF</Button>
                <Button variant="outline" onClick={() => window.print()}><Icon name="printer" className="size-4" />Imprimir</Button>
                <Button variant="ghost" onClick={handleClear} className="text-muted-foreground hover:text-destructive">Esvaziar</Button>
              </div>
            </footer>
          )}
        </SheetContent>
      </Sheet>

      <div id="printable-quote" className="fixed inset-0 z-9999 hidden bg-white p-8 text-ink-900 print:block">
        <div className="mb-6 border-b-2 border-brand-600 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold uppercase tracking-wide text-brand-600">VARDÃO MÁQUINAS</h1>
              <p className="text-xs font-bold text-ink-900">Revenda Autorizada Ouro &amp; Peças Originais Husqvarna</p>
              <p className="text-[11px] text-ink-500">CogniVault · Orçamento de balcão</p>
            </div>
            <div className="text-right text-xs">
              <p><strong>Data:</strong> {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
              {customerName && <p className="mt-1 font-semibold text-ink-900"><strong>Cliente:</strong> {customerName}</p>}
              {customerPhone && <p className="text-ink-700"><strong>WhatsApp:</strong> {customerPhone}</p>}
              {paymentMethod && <p className="text-ink-700"><strong>Condição:</strong> {paymentMethod}</p>}
              <p className="mt-0.5 text-ink-500">Total de itens: {totalItems}</p>
            </div>
          </div>
        </div>

        <table className="mb-8 w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b-2 border-brand-600 text-ink-900">
              <th className="w-16 py-2.5 text-center font-bold">Qtd.</th>
              <th className="w-36 py-2.5 font-bold">Código oficial</th>
              <th className="py-2.5 font-bold">Descrição da peça</th>
              <th className="w-44 py-2.5 font-bold">Modelo / aplicação</th>
              {totalPrice > 0 && <th className="w-24 py-2.5 text-right font-bold">Preço un.</th>}
              {totalPrice > 0 && <th className="w-24 py-2.5 text-right font-bold">Subtotal</th>}
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id} className="border-b border-ink-200">
                <td className="py-2.5 text-center font-bold text-ink-900 tabular-nums">{item.quantity}x</td>
                <td className="py-2.5 font-mono font-bold text-ink-900">
                  {item.manufacturer?.toLowerCase().includes('husqvarna')
                    ? formatHusqvarnaPartNumber(item.effectiveCode || item.partNumber)
                    : (item.effectiveCode || item.partNumber)}
                </td>
                <td className="py-2.5 font-medium text-ink-900">
                  {item.name} {item.isSuperseded ? '★ (Substituição oficial)' : ''}
                </td>
                <td className="py-2.5 text-ink-700">
                  {item.model} {item.pnc ? `· PNC ${item.pnc}` : ''} {item.position ? `· Pos. ${item.position}` : ''}
                </td>
                {totalPrice > 0 && (
                  <td className="py-2.5 text-right font-mono text-ink-700">
                    {item.unitPrice ? money(item.unitPrice) : '—'}
                  </td>
                )}
                {totalPrice > 0 && (
                  <td className="py-2.5 text-right font-mono font-bold text-ink-900">
                    {item.unitPrice ? money(item.quantity * item.unitPrice) : '—'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {totalPrice > 0 && (
            <tfoot>
              {discountPercentage > 0 && (
                <>
                  <tr className="border-t-2 border-ink-700 text-ink-700">
                    <td colSpan={4} className="py-1.5 text-right text-xs uppercase tracking-wide">Subtotal bruto:</td>
                    <td colSpan={2} className="py-1.5 text-right font-mono text-xs font-semibold">{money(totalPrice)}</td>
                  </tr>
                  <tr className="border-b border-ink-700 text-ink-700">
                    <td colSpan={4} className="py-1.5 text-right text-xs uppercase tracking-wide">Desconto comercial ({discountPercentage}%):</td>
                    <td colSpan={2} className="py-1.5 text-right font-mono text-xs font-semibold">-{money(discountAmount)}</td>
                  </tr>
                </>
              )}
              <tr className="border-t-2 border-brand-600 font-bold">
                <td colSpan={4} className="py-3 text-right text-xs uppercase tracking-wide">
                  {discountPercentage > 0 ? 'Total líquido do orçamento:' : 'Total geral do orçamento:'}
                </td>
                <td colSpan={2} className="py-3 text-right font-mono text-sm font-bold text-ink-900">{money(netTotalPrice)}</td>
              </tr>
            </tfoot>
          )}
        </table>

        <div className="grid grid-cols-2 gap-8 border-t border-ink-300 pt-6 text-xs">
          <div>
            <p className="font-bold text-ink-900">Observações do balcão:</p>
            <div className="mt-2 h-20 rounded-card border border-dashed border-ink-300"></div>
          </div>
          <div className="flex flex-col justify-end text-center">
            <div className="border-t border-ink-900 pt-1 font-semibold text-ink-900">Assinatura do atendente</div>
          </div>
        </div>
      </div>
    </>
  );
}
