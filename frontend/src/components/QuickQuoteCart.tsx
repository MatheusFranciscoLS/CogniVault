import { useState } from 'react';
import type { FormEvent } from 'react';
import { useCounterSession } from '../context/CounterSessionContext';
import { useQuoteCart } from '../context/QuoteCartContext';
import type { QuoteCartItem, QuoteSyncState, QuoteTextOptions } from '../context/QuoteCartContext';
import { formatHusqvarnaPartNumber, cleanErpCode } from '../lib';
import { playCopySound } from '../lib/sound';
import { toast } from 'sonner';
import { Icon, type IconName } from './icons/Icon';

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
 * Onde a cesta está guardada. O atendente precisa dessa informação na tela:
 * "offline" significa que trocar de aparelho agora perderia o orçamento.
 */
function SyncBadge({ state }: { state: QuoteSyncState }) {
  const config: Record<QuoteSyncState, { icon: IconName; label: string; className: string; title: string }> = {
    loading: {
      icon: 'refresh',
      label: 'Carregando',
      className: 'border-white/20 bg-white/10 text-brand-100',
      title: 'Buscando a cesta salva no servidor.',
    },
    saving: {
      icon: 'refresh',
      label: 'Salvando',
      className: 'border-white/20 bg-white/10 text-brand-100',
      title: 'Gravando a cesta no servidor.',
    },
    synced: {
      icon: 'cloud',
      label: 'No servidor',
      className: 'border-emerald-300/40 bg-emerald-400/15 text-emerald-100',
      title: 'Esta cesta está salva no servidor e abre em qualquer aparelho.',
    },
    offline: {
      icon: 'cloudOff',
      label: 'Só neste aparelho',
      className: 'border-gold-300/50 bg-gold-500/20 text-gold-100',
      title: 'Sem conexão com o servidor. A cesta está apenas neste navegador — não troque de aparelho até voltar.',
    },
  };
  const { icon, label, className, title } = config[state];

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.08em] ${className}`}
    >
      <Icon name={icon} className={`h-3 w-3 ${state === 'saving' || state === 'loading' ? 'animate-spin' : ''}`} />
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
    <form onSubmit={handleSubmit} className="space-y-2 rounded-card border border-accent-200 bg-accent-50 p-3 dark:border-accent-500/40 dark:bg-accent-500/10">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-bold text-accent-700 dark:text-accent-300">
          <Icon name="wrench" className="h-3.5 w-3.5" />
          <span>Serviço / item avulso de balcão</span>
        </span>
        <button type="button" onClick={onClose} aria-label="Fechar" className="cv-touch-target grid place-items-center rounded-card text-ink-500 hover:text-ink-700">
          <Icon name="close" className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CUSTOM_ITEM_PRESETS.map(preset => (
          <button
            key={preset}
            type="button"
            onClick={() => setName(preset)}
            className="rounded-full border border-ink-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-ink-700 transition hover:border-accent-300 hover:text-accent-700 dark:border-ink-800 dark:bg-ink-850 dark:text-ink-300"
          >
            {preset}
          </button>
        ))}
      </div>

      <input
        type="text"
        required
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Descrição do serviço ou item…"
        className="cv-field h-11 py-0 text-sm"
      />

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="custom-item-price" className="block text-[10px] font-bold uppercase tracking-[.08em] text-ink-500">Preço (R$)</label>
          <input
            id="custom-item-price"
            type="number"
            step="0.5"
            min="0"
            value={price}
            onChange={e => setPrice(e.target.value)}
            placeholder="0,00"
            className="cv-field mt-1 h-11 py-0 text-sm font-bold"
          />
        </div>
        <div>
          <label htmlFor="custom-item-qty" className="block text-[10px] font-bold uppercase tracking-[.08em] text-ink-500">Quantidade</label>
          <input
            id="custom-item-qty"
            type="number"
            min="1"
            value={qty}
            onChange={e => setQty(parseInt(e.target.value, 10) || 1)}
            className="cv-field mt-1 h-11 py-0 text-sm font-bold"
          />
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button type="submit" className="cv-primary cv-touch-target flex-1 text-sm">Confirmar item</button>
        <button type="button" onClick={onClose} className="cv-secondary cv-touch-target px-4 text-sm">Cancelar</button>
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
  const isServiceItem = item.partNumber.startsWith('SRV-');
  const formattedCode = isServiceItem ? 'SERVIÇO / AVULSO' : formatHusqvarnaPartNumber(item.effectiveCode || item.partNumber);
  const subtotal = item.unitPrice ? item.quantity * item.unitPrice : 0;

  return (
    <div className="rounded-card border-2 border-ink-200 bg-white p-3.5 shadow-card transition hover:border-brand-300 dark:border-ink-800 dark:bg-ink-850 dark:hover:border-brand-400/50">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {/* Código primeiro: é o que o balcão procura na peça física
              — a peça mais importante da linha não pode ser a menos visível. */}
          <div className="flex flex-wrap items-center gap-1.5">
            {isServiceItem ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-accent-500 px-2.5 py-1.5 text-xs font-black uppercase tracking-[.04em] text-white">
                <Icon name="wrench" className="h-3.5 w-3.5" /> Serviço / balcão
              </span>
            ) : (
              <>
                <span className="inline-flex items-center rounded-lg bg-brand-50 px-2.5 py-1.5 font-mono text-base font-black tracking-[-.01em] text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
                  {formattedCode}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const clean = cleanErpCode(item.effectiveCode || item.partNumber);
                    void navigator.clipboard.writeText(clean);
                    playCopySound();
                    toast.success(`Código ${clean} copiado.`);
                  }}
                  title="Copiar o código sem espaços nem hífen"
                  aria-label={`Copiar o código ${formattedCode}`}
                  className="cv-touch-target grid place-items-center rounded-lg bg-ink-100 text-ink-600 transition hover:bg-brand-50 hover:text-brand-600 dark:bg-ink-900 dark:text-ink-300"
                >
                  <Icon name="clipboard" className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            {item.isSuperseded && (
              <span className="inline-flex items-center gap-1 rounded-full bg-gold-100 px-2 py-1 text-[10px] font-bold text-gold-800 dark:bg-gold-500/15 dark:text-gold-300">
                <Icon name="warning" className="h-3 w-3" /> Substituição
              </span>
            )}
          </div>
          <h3 className="mt-1.5 truncate text-sm font-bold text-ink-900 dark:text-white" title={item.name}>
            {item.name}
          </h3>
          <div className="mt-0.5 truncate text-[11px] text-ink-500">
            {isServiceItem ? (item.model || 'Balcão') : `${item.model}${item.pnc ? ` · PNC ${item.pnc}` : ''}${item.position ? ` · Pos. ${item.position}` : ''}`}
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remover ${item.name}`}
          className="cv-touch-target grid shrink-0 place-items-center rounded-card text-ink-500 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
        >
          <Icon name="trash" className="h-4 w-4" />
        </button>
      </div>

      {/* Controles em UMA linha, sem rótulos de texto (ficam em aria-label).
          Medido: com "Qtd." e "Unit. R$" empilhados, o cartão ia a 244px e não
          cabia inteiro na área visível do drawer em tela curta — o atendente
          tinha de rolar dentro de cada peça. Os alvos de toque continuam em
          44px (.cv-touch-target). */}
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-ink-200 pt-2.5 dark:border-ink-800">
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onUpdateQuantity(-1)}
            aria-label={`Diminuir quantidade de ${item.name}`}
            className="cv-touch-target grid place-items-center rounded-card border border-ink-200 bg-ink-100 text-ink-700 transition hover:bg-ink-200 active:scale-95 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-300"
          >
            <Icon name="minus" className="h-4 w-4" />
          </button>
          <span className="min-w-9 text-center text-base font-bold text-ink-900 tabular-nums dark:text-white">{item.quantity}</span>
          <button
            type="button"
            onClick={() => onUpdateQuantity(1)}
            aria-label={`Aumentar quantidade de ${item.name}`}
            className="cv-touch-target grid place-items-center rounded-card border border-ink-200 bg-ink-100 text-ink-700 transition hover:bg-ink-200 active:scale-95 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-300"
          >
            <Icon name="plus" className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-w-0 items-center justify-end gap-2">
          <input
            id={`price-${item.id}`}
            type="number"
            inputMode="decimal"
            min={0}
            step={0.5}
            placeholder="R$ un."
            aria-label={`Preço unitário de ${item.name}`}
            value={item.unitPrice ?? ''}
            onChange={e => onUpdateUnitPrice(e.target.value === '' ? undefined : Number(e.target.value))}
            className="cv-field h-11 w-[5.5rem] py-0 text-right text-sm font-bold tabular-nums"
          />
          {/* Subtotal da linha em cinza e rotulado. Antes era verde e negrito,
              igual ao total do orçamento na barra fixa — e com um item só na
              cesta os dois mostram o MESMO número (2 × 378,26 = 756,52 = total),
              o que fazia a tela parecer ter valor repetido. Verde grande fica
              reservado para o total do pedido. */}
          {subtotal > 0 && (
            <span className="shrink-0 text-right">
              <span className="block text-[9px] font-bold uppercase tracking-[.08em] text-ink-500 dark:text-ink-400">Subtotal</span>
              <span className="block text-sm font-bold text-ink-800 tabular-nums dark:text-ink-100">{money(subtotal)}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  tone = 'neutral',
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  tone?: 'neutral' | 'danger';
}) {
  const toneClass = tone === 'danger'
    ? 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30'
    : 'text-ink-700 hover:bg-brand-50 hover:text-brand-600 dark:text-ink-300 dark:hover:bg-ink-900';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`cv-touch-target flex flex-1 flex-col items-center justify-center gap-1 rounded-card border border-ink-200 bg-white py-2 text-[11px] font-bold transition active:scale-[.97] dark:border-ink-800 dark:bg-ink-850 ${toneClass}`}
    >
      <Icon name={icon} className="h-4 w-4" />
      <span>{label}</span>
    </button>
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
    generatePdfQuote,
    addItem,
    syncState,
    draftOptions,
    setDraftOptions,
  } = useQuoteCart();

  const { session } = useCounterSession();

  const [showCustomItemForm, setShowCustomItemForm] = useState(false);

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
  const discountAmount = totalPrice > 0 && discountPercentage > 0 ? (totalPrice * discountPercentage) / 100 : 0;
  const netTotalPrice = totalPrice - discountAmount;

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

  return (
    <>
      {/* Não existe mais botão flutuante de orçamento. O cabeçalho do app já
          tem o botão "Orçamento" com o contador, sempre visível, e o balcão
          via a mesma informação em dois lugares na mesma tela. */}
      {isOpen && (
        <div className="fixed inset-0 z-[80] flex justify-end bg-brand-900/45">
          <div className="fixed inset-0" onClick={() => setIsOpen(false)} aria-hidden="true" />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Cesta de orçamento de balcão"
            /* Larguras por aparelho de balcão: celular usa a tela inteira;
               tablet 10" em retrato (~800px) ganha 480px, o suficiente para o
               item caber sem quebrar; paisagem e desktop vão a 600/680px, onde
               quantidade e preço entram na mesma linha. */
            className="relative flex h-full w-full max-w-none flex-col border-l border-ink-200 bg-white shadow-raised dark:border-ink-800 dark:bg-ink-950 sm:max-w-[440px] tablet:max-w-[520px] lg:max-w-[600px] xl:max-w-[680px]"
          >
            {/* Cabeçalho enxuto: medido em 170px de 436px (39% da tela) no
                laptop do balcão, e repetia o total que a barra fixa já mostra.
                O selo de sincronização subiu para a mesma linha do título e a
                linha do total saiu — o espaço devolvido vai para a lista de
                peças. */}
            <div className="border-b border-brand-800 bg-brand-600 px-4 pb-2.5 pt-3 text-white tablet:px-6 tablet:pt-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-card bg-white/12">
                    <Icon name="quote" className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base font-bold tracking-tight text-white">Orçamento de balcão</h2>
                    <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate text-xs text-brand-200">Vardão Máquinas · Peças originais Husqvarna</span>
                      <SyncBadge state={syncState} />
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="cv-touch-target grid shrink-0 place-items-center rounded-card border border-white/15 bg-white/10 text-white transition hover:bg-white/20"
                  aria-label="Fechar cesta"
                >
                  <Icon name="close" className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
                {/* Uma única região rolável para tudo, e a barra fixa reduzida
                    ao essencial (total + WhatsApp).

                    O bug que isso corrige, medido no navegador: o rodapé antigo
                    tinha ~220px fixos (desconto + total + WhatsApp + 6 ações +
                    créditos). Numa tela curta ou com zoom alto — laptop do
                    balcão — sobravam ~44px para a lista de peças, que era o
                    único bloco elástico da coluna. Resultado: o código e o nome
                    da peça, a informação mais importante da tela, eram os
                    primeiros a desaparecer, e o atendente via só os totais.

                    Peças vêm primeiro no fluxo: é o que se confere com o
                    cliente na frente. Cliente/pagamento, desconto e ações
                    secundárias continuam acessíveis rolando. */}
                <div className="cv-scrollbar min-h-0 flex-1 overflow-y-auto">
                  <div className="space-y-3 p-4 tablet:px-6">
                    {items.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center text-ink-500">
                        <Icon name="cart" className="h-9 w-9" />
                        <div className="mt-3 text-sm font-bold text-ink-700 dark:text-ink-300">Sua cesta está vazia</div>
                        <p className="mt-1 max-w-[260px] text-xs">
                          Clique em &quot;+ Orçamento&quot; em qualquer peça na busca para montar a lista.
                        </p>
                        {/* A gaveta não tem mais aba de histórico: a lista de
                            arquivados vive na seção "Orçamentos", que filtra por
                            cliente, telefone, código e período. Sem esta linha, o
                            atendente não tem como saber para onde ela foi. */}
                        <p className="mt-3 max-w-[260px] text-[11px] text-ink-500 dark:text-ink-400">
                          Orçamentos já enviados ficam na seção <strong className="font-bold text-ink-600 dark:text-ink-300">Orçamentos</strong>, no menu lateral.
                        </p>
                      </div>
                    ) : (
                      items.map(item => (
                        <CartItemRow
                          key={item.id}
                          item={item}
                          onUpdateQuantity={delta => updateQuantity(item.id, delta)}
                          onUpdateUnitPrice={value => updateUnitPrice(item.id, value)}
                          onRemove={() => removeItem(item.id)}
                        />
                      ))
                    )}
                  </div>

                  <div className="border-y border-ink-200 bg-white px-3.5 py-2.5 dark:border-ink-800 dark:bg-ink-850 tablet:px-6">
                    {!showCustomItemForm ? (
                      <button
                        type="button"
                        onClick={() => setShowCustomItemForm(true)}
                        className="cv-touch-target flex w-full items-center justify-center gap-1.5 rounded-card border border-dashed border-accent-300 bg-accent-50 text-sm font-bold text-accent-700 transition hover:bg-accent-100 active:scale-[.99] dark:border-accent-500/40 dark:bg-accent-500/10 dark:text-accent-300"
                      >
                        <Icon name="wrench" className="h-4 w-4" />
                        <span>Adicionar serviço ou item avulso</span>
                      </button>
                    ) : (
                      <CustomItemForm onAdd={handleAddCustomItem} onClose={() => setShowCustomItemForm(false)} />
                    )}
                  </div>

                  <div className="space-y-2.5 border-b border-ink-200 bg-ink-100 p-3.5 dark:border-ink-800 dark:bg-ink-900 tablet:px-6">
                    <div className="grid gap-2.5 tablet:grid-cols-3">
                      <div className="tablet:col-span-1">
                        <label htmlFor="quote-customer-name" className="block text-[10px] font-bold uppercase tracking-[.08em] text-ink-500">
                          Cliente / máquina
                        </label>
                        <input
                          id="quote-customer-name"
                          type="text"
                          value={customerName}
                          onChange={e => patchOptions({ customerName: e.target.value })}
                          placeholder="Ex.: Sr. Carlos (143RII)"
                          className="cv-field mt-1 h-11 py-0 text-sm"
                        />
                      </div>
                      <div className="tablet:col-span-1">
                        <label htmlFor="quote-customer-phone" className="block text-[10px] font-bold uppercase tracking-[.08em] text-ink-500">
                          WhatsApp (opcional)
                        </label>
                        <input
                          id="quote-customer-phone"
                          type="tel"
                          inputMode="tel"
                          value={customerPhone}
                          onChange={e => patchOptions({ customerPhone: e.target.value })}
                          placeholder="(19) 99999-9999"
                          className="cv-field mt-1 h-11 py-0 text-sm tabular-nums"
                        />
                      </div>
                      <div className="tablet:col-span-1">
                        <label htmlFor="quote-payment-method" className="block text-[10px] font-bold uppercase tracking-[.08em] text-ink-500">
                          Condição de pagamento
                        </label>
                        <select
                          id="quote-payment-method"
                          value={paymentMethod}
                          onChange={e => patchOptions({ paymentMethod: e.target.value })}
                          className="cv-field mt-1 h-11 py-0 text-sm font-semibold"
                        >
                          {PAYMENT_METHODS.map(method => (
                            <option key={method} value={method}>{method}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {items.length > 0 && (
                    <div className="space-y-2.5 p-4 dark:bg-ink-900 tablet:px-6">
                      {totalPrice > 0 && (
                        <div className="rounded-card border border-ink-200 bg-white p-2.5 shadow-card dark:border-ink-800 dark:bg-ink-850">
                          <div className="mb-2 flex items-center justify-between text-xs">
                            <span className="font-bold text-ink-700 dark:text-ink-300">Desconto comercial</span>
                            <span className="text-[11px] font-semibold text-accent-700 dark:text-accent-300">
                              {discountPercentage > 0 ? `-${discountPercentage}% aplicado` : 'Sem desconto'}
                            </span>
                          </div>
                          <div className="grid grid-cols-4 gap-1.5">
                            {DISCOUNT_PRESETS.map(disc => (
                              <button
                                key={disc.value}
                                type="button"
                                onClick={() => patchOptions({ discountPercentage: disc.value })}
                                className={`cv-touch-target rounded-card px-1.5 text-center text-xs font-bold transition active:scale-95 ${
                                  discountPercentage === disc.value
                                    ? 'bg-brand-600 text-white'
                                    : 'bg-ink-100 text-ink-700 hover:bg-ink-200 dark:bg-ink-900 dark:text-ink-300'
                                }`}
                              >
                                {disc.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {totalPrice > 0 && discountPercentage > 0 && (
                        <div className="space-y-1 rounded-card border border-ink-200 bg-white px-3.5 py-2.5 dark:border-ink-800 dark:bg-ink-850">
                          <div className="flex items-center justify-between text-xs text-ink-500">
                            <span>Subtotal bruto</span>
                            <span className="font-mono">{money(totalPrice)}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs font-semibold text-accent-700 dark:text-accent-300">
                            <span>Desconto ({discountPercentage}%)</span>
                            <span className="font-mono">-{money(discountAmount)}</span>
                          </div>
                        </div>
                      )}

                      {syncState === 'offline' && (
                        <div className="flex items-start gap-2 rounded-card border border-gold-500/40 bg-gold-100 px-3 py-2 text-[11px] font-semibold leading-relaxed text-gold-800 dark:bg-gold-500/10 dark:text-gold-300">
                          <Icon name="cloudOff" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>Sem conexão com o servidor. Esta cesta está só neste aparelho — o envio no WhatsApp e o PDF funcionam, mas o arquivamento vai falhar até a conexão voltar.</span>
                        </div>
                      )}

                      {/* Sem menu "Mais": esconder duas ações atrás de um toque,
                          ao lado de um único botão visível, custa mais do que
                          mostrar as duas. Ficaram as que geram um documento, em
                          par e com o nome por extenso.

                          O que saiu e por quê:
                          - "Salvar": openWhatsApp e generatePdfQuote já chamam
                            saveCurrentQuote, então o orçamento é arquivado
                            sozinho em todo caminho que importa. O botão dava a
                            impressão contrária.
                          - "ERP": o dono confirmou que não usa.
                          - "Copiar texto": o botão do WhatsApp leva o mesmo
                            texto pronto, e sem telefone ele abre em
                            wa.me/?text=, deixando o atendente escolher o
                            contato. Copiar não cobria caso nenhum a mais, e a
                            função ficou sem uso — saiu do contexto também. */}
                      <div className="grid grid-cols-2 gap-2">
                        <ActionButton icon="pdf" label="PDF do orçamento" onClick={() => generatePdfQuote(quoteOptions)} />
                        <ActionButton icon="printer" label="Imprimir" onClick={() => window.print()} />
                      </div>

                      {/* Ação destrutiva nunca como par das de envio: fica
                          discreta, no fim. O "Encerrar" da barra de atendimento
                          já limpa a cesta junto com o contexto; este serve para
                          limpar só as peças e seguir com o mesmo cliente. */}
                      <button
                        type="button"
                        onClick={clearCart}
                        className="cv-touch-target mx-auto flex items-center justify-center gap-1.5 rounded-card px-3 text-[11px] font-bold text-ink-500 transition hover:bg-rose-50 hover:text-rose-700 dark:text-ink-400 dark:hover:bg-rose-950/30 dark:hover:text-rose-300"
                      >
                        <Icon name="trash" className="h-3.5 w-3.5" />
                        Esvaziar cesta
                      </button>
                    </div>
                  )}
                </div>

                {/* Barra fixa enxuta: o total e a ação que fecha o atendimento.
                    Tudo o que não é decisão final saiu daqui para a área
                    rolável — era esse bloco que engolia a lista de peças. */}
                {items.length > 0 && (
                  <div className="shrink-0 space-y-2 border-t border-ink-200 bg-white p-3 shadow-[0_-4px_12px_-8px_rgba(15,23,42,.35)] dark:border-ink-800 dark:bg-ink-850 tablet:px-6">
                    {totalPrice > 0 && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[11px] font-bold uppercase tracking-[.08em] text-ink-500">
                          {discountPercentage > 0 ? `Total líquido (-${discountPercentage}%)` : 'Valor total estimado'}
                        </span>
                        <span className="font-mono text-xl font-bold text-emerald-700 tabular-nums dark:text-emerald-400">
                          {money(netTotalPrice)}
                        </span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => openWhatsApp(quoteOptions)}
                      className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-card bg-[#25D366] px-4 text-sm font-bold text-[#0b2e17] transition hover:bg-[#20bd5a] active:scale-[.99]"
                    >
                      <Icon name="whatsapp" className="h-5 w-5" />
                      <span>{customerPhone ? `Enviar no WhatsApp (${customerPhone})` : 'Enviar no WhatsApp'}</span>
                    </button>
                  </div>
                )}
              </div>
          </aside>
        </div>
      )}

      <div id="printable-quote" className="fixed inset-0 z-[9999] hidden bg-white p-8 text-ink-900 print:block">
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
                  {formatHusqvarnaPartNumber(item.effectiveCode || item.partNumber)}
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
