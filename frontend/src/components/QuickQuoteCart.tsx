import { useEffect, useRef, useState } from 'react';
import { useRestoreFocus } from '../lib/use-restore-focus';
import { useConfirm } from '../context/confirm';
import { Eye, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { useCounterSession } from '../context/CounterSessionContext';
import { useQuoteCart } from '../context/QuoteCartContext';
import type { QuoteTextOptions } from '../context/QuoteCartContext';
import { leadMode, leadTimeConflict, leadTimeFor } from '../lib/lead-time';
import { LINE_COLUMNS } from '../lib/quote-line';
import { formatBRL, quoteTotals } from '../lib/quote-message';
import { QUOTE_DEFAULTS } from '../lib/store-profile';
import { maskPhoneInput } from '../lib/phone';
import { Icon } from './icons/Icon';
import CustomItemForm, { type CustomItemInput } from './CustomItemForm';
import DiscountField from './DiscountField';
import PaymentTerms from './PaymentTerms';
import QuoteLine from './QuoteLine';
import QuotePdfDialog from './QuotePdfDialog';
import SyncStatus from './SyncStatus';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

// Mesma formatação do texto e do PDF que o cliente recebe, com ponto de milhar ("R$ 1.202,87"): a tela do
// balcão mostrava "R$ 1202,87", e o atendente lia o total de um jeito e o cliente recebia de outro.
const money = formatBRL;

/**
 * O orçamento de PEÇAS do Atendimento, num card grande no centro (não numa gaveta estreita): as linhas à esquerda, uma por linha como a planilha da loja,
 * e cliente, pagamento, prazo e desconto à direita; total e envio fixos embaixo. Adicionar peças continua pela busca, sem abrir nada: o card abre em
 * "Revisar orçamento", quando o atendente vai conferir com o cliente e mandar. O orçamento de conserto é outro: tem a sua cesta e a sua aba (`RepairQuotePage`).
 */
export default function QuickQuoteCart() {
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
  const discountPercentage = draftOptions.discountPercentage || 0;

  const patchOptions = (patch: Partial<QuoteTextOptions>) => setDraftOptions({ ...draftOptions, ...patch });

  // Prazo das peças: escolhido (Pronta entrega, Encomenda ou nenhum). Observações: vazias, valem as padrão da loja.
  const leadTime = draftOptions.leadTime ?? '';
  const mode = leadMode(leadTime);
  const defaultNotes = QUOTE_DEFAULTS.observations.join('\n');
  const notesText = draftOptions.notes ?? defaultNotes;
  const leadConflict = leadTimeConflict(leadTime, notesText);
  const notesCustomized = draftOptions.notes !== undefined && draftOptions.notes !== defaultNotes;
  const quoteOptions: QuoteTextOptions = { kind: draftOptions.kind, customerName, customerPhone, paymentMethod: draftOptions.paymentMethod, discountPercentage, leadTime: draftOptions.leadTime, notes: notesCustomized ? draftOptions.notes : undefined };
  // Mesma conta do texto do WhatsApp, do PDF e do servidor (desconto arredondado antes de subtrair). Calcular
  // aqui por conta própria dava R$ 435,92 na tela e R$ 435,91 no que o cliente recebia e no orçamento arquivado.
  const { discount: discountAmount, net: netTotalPrice } = quoteTotals(items, discountPercentage);

  // Fechar o orçamento (Esc, X ou fora) devolve o foco a quem o abriu, em vez de pular para o começo da página; sem esse ponto, vai para a busca.
  const restoreFocus = useRestoreFocus(() => document.getElementById('cv-workspace-search') ?? document.querySelector<HTMLElement>('input[name="busca"]'));
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !isOpen) restoreFocus();
    wasOpen.current = isOpen;
  }, [isOpen, restoreFocus]);

  if (totalItems === 0 && !isOpen) {
    return null;
  }

  const handleAddCustomItem = ({ name, price, quantity, code, manufacturer, location }: CustomItemInput) => {
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

  return (
    <>
      {/* Não existe botão flutuante de orçamento: o cabeçalho do app já tem o botão
          "Orçamento" com o contador, sempre visível. */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent showCloseButton={false} className="flex h-[90dvh] max-h-[880px] w-[96vw] max-w-[1120px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1120px]">
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border bg-card px-6 py-4">
            <div className="min-w-0">
              <DialogTitle className="text-2xl font-semibold leading-8 text-foreground">Orçamento</DialogTitle>
              <DialogDescription className="sr-only">Peças, cliente e envio do orçamento de balcão</DialogDescription>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <span className="text-base text-muted-foreground">{totalItems} {totalItems === 1 ? 'item' : 'itens'}</span>
                <SyncStatus state={syncState} />
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} aria-label="Fechar orçamento"><X className="size-5" /></Button>
          </header>

          <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_320px]">
            {/* Esquerda: o que o cliente vai levar, uma peça por linha. */}
            <div className="min-h-0 overflow-y-auto overscroll-contain">
              {items.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <p className="text-xl font-semibold">Orçamento vazio</p>
                  <p className="mt-1 text-base text-muted-foreground">Adicione peças pela busca.</p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  <li aria-hidden="true" className={`${LINE_COLUMNS} sticky top-0 z-10 bg-muted px-5 py-1.5 text-sm font-medium text-muted-foreground`}>
                    <span>Descrição</span><span className="text-center">Qtde</span><span className="text-right">Valor un.</span><span>Prazo</span><span className="text-right">Total</span><span />
                  </li>
                  {items.map(item => (
                    <QuoteLine
                      key={item.id}
                      item={item}
                      variant="parts"
                      quoteLeadTime={leadTime}
                      onQuantity={delta => updateQuantity(item.id, delta)}
                      onPrice={value => updateUnitPrice(item.id, value)}
                      onLead={value => updateLeadTime(item.id, value)}
                      onRemove={() => removeItem(item.id)}
                    />
                  ))}
                </ul>
              )}

              <div className="border-t border-border px-5 py-4">
                {!showCustomItemForm ? (
                  <Button variant="outline" onClick={() => setShowCustomItemForm(true)} className="w-full border-dashed">
                    <Plus className="size-4" />
                    Peça avulsa
                  </Button>
                ) : (
                  <CustomItemForm onAdd={handleAddCustomItem} onClose={() => setShowCustomItemForm(false)} />
                )}
              </div>
            </div>

            {/* Direita: cliente, pagamento, prazo, observações e desconto. */}
            <div className="min-h-0 space-y-5 overflow-y-auto overscroll-contain border-t border-border bg-card px-5 py-5 lg:border-l lg:border-t-0">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label htmlFor="quote-customer-name" className="block text-sm font-medium text-muted-foreground">Cliente e máquina</label>
                  <Input id="quote-customer-name" type="text" autoComplete="off" value={customerName} onChange={e => patchOptions({ customerName: e.target.value })} placeholder="Nome do cliente" className="text-base" />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="quote-customer-phone" className="block text-sm font-medium text-muted-foreground">WhatsApp do cliente</label>
                  <Input id="quote-customer-phone" type="tel" inputMode="tel" autoComplete="off" value={customerPhone} onChange={e => patchOptions({ customerPhone: maskPhoneInput(e.target.value) })} placeholder="(19) 99999-9999" className="font-code text-base tabular-nums" />
                </div>
                {draftOptions.engine && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted px-3 py-2">
                    <span className="text-base"><span className="text-muted-foreground">Motor </span><span translate="no" className="font-code font-semibold">{draftOptions.engine}</span></span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => patchOptions({ engine: undefined })} aria-label={`Tirar o motor ${draftOptions.engine} do orçamento`}>Tirar</Button>
                  </div>
                )}
              </div>

              <PaymentTerms value={draftOptions.paymentMethod} onChange={text => patchOptions({ paymentMethod: text || undefined })} />

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

              {totalPrice > 0 && <DiscountField percentage={discountPercentage} onChange={value => patchOptions({ discountPercentage: value })} />}

              {showMessage && items.length > 0 && (
                <div className="rounded-lg border border-border bg-background p-3">
                  <pre aria-label="Mensagem do WhatsApp" className="max-h-48 overflow-y-auto whitespace-pre-wrap font-sans text-sm leading-6">{generateWhatsAppText(quoteOptions)}</pre>
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

              {syncState === 'offline' && (
                <p role="status" className="rounded-lg border border-warn bg-warn-soft px-3 py-2 text-sm font-medium text-warn">
                  Sem conexão com o servidor. O envio no WhatsApp e o PDF funcionam, mas o orçamento só será arquivado quando a conexão voltar.
                </p>
              )}
            </div>
          </div>

          {items.length > 0 && (
            <footer className="shrink-0 border-t border-border bg-card px-6 py-3">
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
                <div className="min-w-0">
                  {totalPrice > 0 && (
                    <>
                      {discountPercentage > 0 && (
                        <div className="space-y-0.5 text-base text-muted-foreground">
                          <div className="flex justify-between gap-6"><span>Subtotal</span><span className="font-code tabular-nums">{money(totalPrice)}</span></div>
                          <div className="flex justify-between gap-6"><span>Desconto ({discountPercentage}%)</span><span className="font-code tabular-nums">-{money(discountAmount)}</span></div>
                        </div>
                      )}
                      <div className="flex items-baseline gap-4">
                        <span className="text-base text-muted-foreground">Total</span>
                        <span className="font-code text-3xl font-bold tabular-nums">{money(netTotalPrice)}</span>
                      </div>
                    </>
                  )}
                </div>

                {/* O PDF e o WhatsApp já arquivam o orçamento sozinhos: não há botão "Salvar", que dava a impressão contrária. */}
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setShowMessage(value => !value)} aria-expanded={showMessage} className="text-muted-foreground">
                    {showMessage ? 'Esconder a mensagem' : 'Ver a mensagem antes de enviar'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleClear} className="text-muted-foreground hover:text-destructive">Esvaziar</Button>
                  <Button size="lg" variant="outline" onClick={() => setShowPdf(true)}><Eye className="size-4" aria-hidden="true" />Prévia</Button>
                  <Button size="lg" variant="outline" onClick={() => generatePdfQuote(quoteOptions)}><Icon name="pdf" className="size-4" />PDF</Button>
                  <Button size="lg" onClick={() => openWhatsApp(quoteOptions)}>
                    <Icon name="whatsapp" className="size-5 shrink-0" />
                    <span className="truncate">{customerPhone ? `Enviar no WhatsApp · ${customerPhone}` : 'Enviar no WhatsApp'}</span>
                  </Button>
                </div>
              </div>
            </footer>
          )}
        </DialogContent>
      </Dialog>

      {showPdf && <QuotePdfDialog options={quoteOptions} onClose={() => setShowPdf(false)} />}
    </>
  );
}
