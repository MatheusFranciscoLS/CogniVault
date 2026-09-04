import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQuoteCart } from '../context/QuoteCartContext';
import { formatHusqvarnaPartNumber } from '../lib';
import { toast } from 'sonner';

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
    copyQuoteToClipboard,
    openWhatsApp,
    savedQuotes,
    saveCurrentQuote,
    restoreQuote,
    deleteSavedQuote,
    clearSavedQuotes,
    addItem,
  } = useQuoteCart();

  const [activeTab, setActiveTab] = useState<'cart' | 'history'>('cart');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('A Combinar no Balcão');
  const [discountPercentage, setDiscountPercentage] = useState<number>(0);

  const [showCustomItemForm, setShowCustomItemForm] = useState(false);
  const [customItemName, setCustomItemName] = useState('');
  const [customItemPrice, setCustomItemPrice] = useState('');
  const [customItemQty, setCustomItemQty] = useState(1);

  const handleAddCustomItem = (e: FormEvent) => {
    e.preventDefault();
    const cleanName = customItemName.trim();
    if (!cleanName) return;
    const priceNum = customItemPrice ? parseFloat(customItemPrice.replace(',', '.')) : undefined;
    const qty = Math.max(1, customItemQty || 1);

    addItem({
      partNumber: `SRV-${Date.now().toString().slice(-4)}`,
      name: cleanName,
      model: customerName.trim() || 'Serviço / Balcão',
      unitPrice: priceNum !== undefined && !isNaN(priceNum) && priceNum >= 0 ? priceNum : undefined,
      quantity: qty,
    });

    setCustomItemName('');
    setCustomItemPrice('');
    setCustomItemQty(1);
    setShowCustomItemForm(false);
    toast.success(`"${cleanName}" adicionado ao orçamento.`);
  };

  const discountAmount = totalPrice > 0 && discountPercentage > 0 ? (totalPrice * discountPercentage) / 100 : 0;
  const netTotalPrice = totalPrice - discountAmount;

  if (totalItems === 0 && savedQuotes.length === 0 && !isOpen) {
    return null;
  }

  return (
    <>
      {/* Botão Flutuante de Orçamento */}
      {!isOpen && (totalItems > 0 || savedQuotes.length > 0) && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label={`Ver orçamento com ${totalItems} itens`}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#1d4f91] to-[#123867] px-4 py-3.5 text-white shadow-[0_12px_32px_rgba(29,79,145,0.4)] transition-all duration-300 hover:scale-105 hover:shadow-[0_16px_40px_rgba(29,79,145,0.5)] active:scale-95"
        >
          <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 text-lg">
            🛒
            {totalItems > 0 && (
              <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[11px] font-extrabold text-slate-900 shadow-md">
                {totalItems}
              </span>
            )}
          </div>
          <div className="text-left">
            <div className="text-xs font-extrabold uppercase tracking-wider text-amber-200">Orçamento de Balcão</div>
            <div className="text-sm font-semibold">
              {totalItems > 0
                ? `${totalItems} ${totalItems === 1 ? 'peça' : 'peças'} ${totalPrice > 0 ? `· R$ ${totalPrice.toFixed(2).replace('.', ',')}` : ''}`
                : `${savedQuotes.length} no histórico`}
            </div>
          </div>
        </button>
      )}

      {/* Gaveta Lateral Modal de Orçamento */}
      {isOpen && (
        <div className="fixed inset-0 z-[80] flex justify-end bg-slate-950/45 backdrop-blur-sm transition-opacity">
          <div
            className="fixed inset-0"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Cesta de Orçamento de Balcão"
            className="relative flex h-full w-full max-w-md flex-col border-l border-white/20 bg-white dark:bg-slate-900 shadow-2xl transition-all duration-300"
          >
            {/* Cabeçalho */}
            <div className="border-b border-slate-200 dark:border-slate-800 bg-[#0b1d3a] px-6 pt-5 pb-4 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-xl">
                    📋
                  </div>
                  <div>
                    <h2 className="text-base font-bold tracking-tight text-white">Cesta & Balcão</h2>
                    <p className="text-xs text-blue-200/70">
                      Vardão Máquinas · Gestão de Orçamentos
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-xl border border-white/15 bg-white/10 p-2 text-slate-300 transition hover:bg-white/20 hover:text-white"
                  aria-label="Fechar cesta"
                >
                  ✕
                </button>
              </div>

              {/* Seletor de Abas (Cesta Atual vs Histórico) */}
              <div className="mt-4 flex rounded-xl bg-white/10 p-1 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setActiveTab('cart')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg transition ${
                    activeTab === 'cart'
                      ? 'bg-amber-400 text-slate-950 shadow-xs'
                      : 'text-blue-200 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span>🛒 Cesta Atual</span>
                  {totalItems > 0 && (
                    <span className="rounded-full bg-slate-900/20 px-1.5 py-0.2 text-[10px] font-black">
                      {totalItems}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('history')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg transition ${
                    activeTab === 'history'
                      ? 'bg-amber-400 text-slate-950 shadow-xs'
                      : 'text-blue-200 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span>🕒 Histórico</span>
                  {savedQuotes.length > 0 && (
                    <span className="rounded-full bg-slate-900/20 px-1.5 py-0.2 text-[10px] font-black">
                      {savedQuotes.length}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {activeTab === 'history' ? (
              /* Aba de Histórico de Orçamentos */
              <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-900">
                <div className="cv-scrollbar flex-1 overflow-y-auto p-4 space-y-3">
                  {savedQuotes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
                      <span className="text-4xl">🕒</span>
                      <div className="mt-3 text-sm font-semibold text-slate-600 dark:text-slate-300">Nenhum orçamento salvo</div>
                      <p className="mt-1 max-w-[240px] text-xs">
                        Ao copiar para WhatsApp ou imprimir uma ficha de balcão, o orçamento é arquivado aqui para consulta rápida.
                      </p>
                    </div>
                  ) : (
                    savedQuotes.map(q => {
                      const dateFormatted = new Intl.DateTimeFormat('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      }).format(new Date(q.createdAt));

                      return (
                        <div
                          key={q.id}
                          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 p-3.5 shadow-sm transition hover:border-blue-300 dark:hover:border-blue-700"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                                  {q.customerName || 'Cliente Balcão'}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {dateFormatted}
                                </span>
                              </div>
                              {q.customerPhone && (
                                <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                                  📱 {q.customerPhone}
                                </div>
                              )}
                              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {q.totalItems} {q.totalItems === 1 ? 'peça' : 'peças'}
                                {q.totalPrice > 0 ? ` · R$ ${q.totalPrice.toFixed(2).replace('.', ',')}` : ''}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => deleteSavedQuote(q.id)}
                              aria-label="Excluir este orçamento do histórico"
                              className="text-slate-400 hover:text-rose-500 p-1 transition"
                            >
                              🗑️
                            </button>
                          </div>

                          {/* Mini lista de peças */}
                          <div className="mt-2.5 space-y-1 rounded-xl bg-slate-50 dark:bg-slate-900/60 p-2 text-[11px]">
                            {q.items.slice(0, 3).map((item, idx) => (
                              <div key={idx} className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                                <span className="truncate max-w-[200px]">{item.quantity}x {item.name}</span>
                                <span className="font-mono font-bold text-[#1d4f91] dark:text-blue-300">
                                  {formatHusqvarnaPartNumber(item.effectiveCode || item.partNumber)}
                                </span>
                              </div>
                            ))}
                            {q.items.length > 3 && (
                              <div className="text-[10px] text-slate-400 italic pt-0.5">
                                + {q.items.length - 3} outra(s) peça(s)...
                              </div>
                            )}
                          </div>

                          {/* Botões de Ação Rápida */}
                          <div className="mt-3 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                restoreQuote(q);
                                if (q.customerName) setCustomerName(q.customerName);
                                if (q.customerPhone) setCustomerPhone(q.customerPhone);
                                if (q.paymentMethod) setPaymentMethod(q.paymentMethod);
                                setDiscountPercentage(q.discountPercentage || 0);
                                setActiveTab('cart');
                              }}
                              className="flex-1 rounded-xl bg-[#1d4f91] hover:bg-[#153e75] text-white py-1.5 px-2.5 text-xs font-bold transition shadow-2xs"
                            >
                              Restaurar na Cesta
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                restoreQuote(q);
                                setActiveTab('cart');
                                void copyQuoteToClipboard({
                                  customerName: q.customerName,
                                  customerPhone: q.customerPhone,
                                  paymentMethod: q.paymentMethod,
                                  discountPercentage: q.discountPercentage,
                                });
                              }}
                              className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 py-1.5 px-2.5 text-xs font-semibold transition"
                              title="Copiar WhatsApp"
                            >
                              📋
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {savedQuotes.length > 0 && (
                  <div className="border-t border-slate-200 dark:border-slate-800 p-3 bg-white dark:bg-slate-900 flex justify-between items-center">
                    <button
                      type="button"
                      onClick={clearSavedQuotes}
                      className="text-xs text-rose-600 dark:text-rose-400 hover:underline font-semibold"
                    >
                      Limpar todo o histórico
                    </button>
                    <span className="text-[11px] text-slate-400">
                      {savedQuotes.length} orçamentos arquivados
                    </span>
                  </div>
                )}
              </div>
            ) : (
              /* Aba da Cesta Atual */
              <>
                {/* Campo de Identificação do Cliente, Telefone e Pagamento */}
                <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-3.5 space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor="quote-customer-name" className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Cliente / Máquina:
                      </label>
                      <input
                        id="quote-customer-name"
                        type="text"
                        value={customerName}
                        onChange={e => setCustomerName(e.target.value)}
                        placeholder="Ex.: Sr. Carlos (143RII)"
                        className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-[#1d4f91] focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                    <div>
                      <label htmlFor="quote-customer-phone" className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        WhatsApp (Opcional):
                      </label>
                      <input
                        id="quote-customer-phone"
                        type="text"
                        value={customerPhone}
                        onChange={e => setCustomerPhone(e.target.value)}
                        placeholder="(44) 99999-9999"
                        className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-[#1d4f91] focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="quote-payment-method" className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Condição de Pagamento:
                    </label>
                    <select
                      id="quote-payment-method"
                      value={paymentMethod}
                      onChange={e => setPaymentMethod(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none focus:border-[#1d4f91]"
                    >
                      <option value="A Combinar no Balcão">A Combinar no Balcão</option>
                      <option value="À Vista / PIX (5% desc.)">À Vista / PIX (5% desc.)</option>
                      <option value="Cartão de Débito">Cartão de Débito</option>
                      <option value="Cartão de Crédito (até 3x)">Cartão de Crédito (até 3x)</option>
                      <option value="Boleto Faturado (14/28 dias)">Boleto Faturado (14/28 dias)</option>
                    </select>
                  </div>
                </div>

                {/* Ação Rápida: Adicionar Serviço / Item Avulso de Oficina */}
                <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 px-3.5 py-2.5">
                  {!showCustomItemForm ? (
                    <button
                      type="button"
                      onClick={() => setShowCustomItemForm(true)}
                      className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-blue-300 dark:border-blue-700/80 bg-blue-50/50 dark:bg-blue-950/30 py-2 text-xs font-bold text-[#1d4f91] dark:text-blue-300 transition hover:bg-blue-50 dark:hover:bg-blue-900/40 active:scale-98"
                    >
                      <span>🛠️</span>
                      <span>+ Adicionar Serviço ou Item Avulso</span>
                    </button>
                  ) : (
                    <form onSubmit={handleAddCustomItem} className="space-y-2 rounded-xl border border-blue-200 dark:border-blue-800/80 bg-blue-50/40 dark:bg-slate-800 p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1">
                          <span>🛠️</span>
                          <span>Serviço / Item Avulso de Balcão</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowCustomItemForm(false)}
                          className="text-xs text-slate-400 hover:text-slate-600 p-0.5"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Presets Rápidos */}
                      <div className="flex flex-wrap gap-1">
                        {[
                          'Mão de obra / Revisão',
                          'Limpeza e regulagem',
                          'Óleo 2T Pro 1L',
                          'Graxa de transmissão',
                        ].map(preset => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setCustomItemName(preset)}
                            className="rounded-md bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-blue-900/50"
                          >
                            {preset}
                          </button>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 gap-2">
                        <input
                          type="text"
                          required
                          value={customItemName}
                          onChange={e => setCustomItemName(e.target.value)}
                          placeholder="Descrição do serviço ou item..."
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-750 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-[#1d4f91]"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-400">Preço (R$):</label>
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            value={customItemPrice}
                            onChange={e => setCustomItemPrice(e.target.value)}
                            placeholder="0,00"
                            className="mt-0.5 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-750 px-2 py-1 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-[#1d4f91]"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-400">Quantidade:</label>
                          <input
                            type="number"
                            min="1"
                            value={customItemQty}
                            onChange={e => setCustomItemQty(parseInt(e.target.value, 10) || 1)}
                            className="mt-0.5 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-750 px-2 py-1 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-[#1d4f91]"
                          />
                        </div>
                      </div>

                      <div className="flex gap-2 pt-1">
                        <button
                          type="submit"
                          className="flex-1 rounded-lg bg-[#1d4f91] hover:bg-[#153e75] py-1.5 text-xs font-bold text-white transition shadow-2xs"
                        >
                          Confirmar Item
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowCustomItemForm(false)}
                          className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                {/* Lista de Peças */}
                <div className="cv-scrollbar flex-1 overflow-y-auto p-4 space-y-3">
                  {items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
                      <span className="text-4xl">🛒</span>
                      <div className="mt-3 text-sm font-semibold text-slate-600 dark:text-slate-300">Sua cesta está vazia</div>
                      <p className="mt-1 max-w-[220px] text-xs">
                        Clique em &quot;+ Orçamento&quot; em qualquer peça na busca para montar uma lista rápida.
                      </p>
                    </div>
                  ) : (
                    items.map(item => {
                      const isServiceItem = item.partNumber.startsWith('SRV-');
                      const formattedCode = isServiceItem ? 'SERVIÇO / AVULSO' : formatHusqvarnaPartNumber(item.effectiveCode || item.partNumber);
                      return (
                        <div
                          key={item.id}
                          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 p-3.5 shadow-sm transition hover:border-blue-300 dark:hover:border-blue-700"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate" title={item.name}>
                                {item.name}
                              </h3>
                              <div className="mt-1 flex items-baseline gap-2">
                                {isServiceItem ? (
                                  <span className="rounded-md bg-blue-50 dark:bg-blue-900/40 px-1.5 py-0.5 text-[10px] font-bold text-[#1d4f91] dark:text-blue-300">
                                    🛠️ SERVIÇO / BALCÃO
                                  </span>
                                ) : (
                                  <span className="font-mono text-xs font-bold text-[#1d4f91] dark:text-blue-300">
                                    {formattedCode}
                                  </span>
                                )}
                                {item.isSuperseded && (
                                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                                    (Substituição)
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                                {isServiceItem
                                  ? (item.model || 'Oficina / Balcão')
                                  : `${item.model} ${item.pnc ? `· PNC ${item.pnc}` : ''} ${item.position ? `· Pos. ${item.position}` : ''}`}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeItem(item.id)}
                              aria-label={`Remover ${item.name}`}
                              className="text-slate-400 transition hover:text-rose-500 p-1"
                            >
                              🗑️
                            </button>
                          </div>

                          {/* Controle de Quantidade */}
                          <div className="mt-3 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2.5">
                            <span className="text-[11px] font-medium text-slate-400">Quantidade:</span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => updateQuantity(item.id, -1)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 text-xs font-bold text-slate-600 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 active:scale-95"
                              >
                                -
                              </button>
                              <span className="min-w-6 text-center text-xs font-bold text-slate-800 dark:text-slate-200">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateQuantity(item.id, 1)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700 text-xs font-bold text-slate-600 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 active:scale-95"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          {/* Preço Unitário Opcional */}
                          <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800 pt-2 text-xs">
                            <label htmlFor={`price-${item.id}`} className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                              Preço Unit. (R$):
                            </label>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-slate-400 font-semibold">R$</span>
                              <input
                                id={`price-${item.id}`}
                                type="number"
                                min={0}
                                step={0.5}
                                placeholder="0,00"
                                value={item.unitPrice ?? ''}
                                onChange={e => {
                                  const val = e.target.value === '' ? undefined : Number(e.target.value);
                                  updateUnitPrice(item.id, val);
                                }}
                                className="w-20 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-750 px-2 py-1 text-right text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-amber-400 focus:bg-white dark:focus:bg-slate-800"
                              />
                              {item.unitPrice && item.unitPrice > 0 ? (
                                <span className="min-w-16 text-right text-xs font-black text-emerald-600 dark:text-emerald-400">
                                  = R$ {(item.quantity * item.unitPrice).toFixed(2).replace('.', ',')}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Rodapé com Ações de Exportação */}
                {items.length > 0 && (
                  <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/90 p-4 space-y-2.5">
                    {/* Seletor de Desconto Comercial */}
                    {totalPrice > 0 && (
                      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 p-2.5 shadow-2xs">
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="font-bold text-slate-700 dark:text-slate-300">Desconto Comercial:</span>
                          <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                            {discountPercentage > 0 ? `-${discountPercentage}% aplicado` : 'Sem desconto'}
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                          {[
                            { label: '0%', value: 0 },
                            { label: '5% PIX', value: 5 },
                            { label: '10% Balcão', value: 10 },
                            { label: '15% Especial', value: 15 },
                          ].map(disc => (
                            <button
                              key={disc.value}
                              type="button"
                              onClick={() => setDiscountPercentage(disc.value)}
                              className={`rounded-lg py-1 px-1.5 text-[11px] font-bold transition text-center active:scale-95 ${
                                discountPercentage === disc.value
                                  ? 'bg-amber-400 text-slate-950 shadow-2xs font-extrabold'
                                  : 'bg-slate-100 dark:bg-slate-750 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                              }`}
                            >
                              {disc.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {totalPrice > 0 && (
                      <div className="rounded-xl bg-emerald-500/10 dark:bg-emerald-950/40 border border-emerald-500/20 px-3.5 py-2.5 space-y-1">
                        {discountPercentage > 0 ? (
                          <>
                            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                              <span>Subtotal bruto:</span>
                              <span className="font-mono">R$ {totalPrice.toFixed(2).replace('.', ',')}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs text-amber-700 dark:text-amber-300 font-semibold">
                              <span>Desconto ({discountPercentage}%):</span>
                              <span className="font-mono">-R$ {discountAmount.toFixed(2).replace('.', ',')}</span>
                            </div>
                            <div className="flex items-center justify-between pt-1 border-t border-emerald-500/20">
                              <span className="text-xs font-black text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">
                                Total Líquido Estimado:
                              </span>
                              <span className="text-base font-black text-emerald-700 dark:text-emerald-400 font-mono">
                                R$ {netTotalPrice.toFixed(2).replace('.', ',')}
                              </span>
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">
                              Valor Total Estimado:
                            </span>
                            <span className="text-base font-black text-emerald-700 dark:text-emerald-400 font-mono">
                              R$ {totalPrice.toFixed(2).replace('.', ',')}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => void copyQuoteToClipboard({ customerName, customerPhone, paymentMethod, discountPercentage })}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white py-3 px-4 text-xs font-bold shadow-md transition hover:shadow-lg active:scale-98"
                    >
                      <span>📋</span>
                      <span>Copiar para WhatsApp (Texto Formatado)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openWhatsApp({ customerName, customerPhone, paymentMethod, discountPercentage })}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-slate-950 font-extrabold py-2.5 px-4 text-xs shadow-sm transition active:scale-98"
                    >
                      <span>💬</span>
                      <span>{customerPhone ? `Abrir WhatsApp do Cliente (${customerPhone})` : 'Abrir no WhatsApp Web'}</span>
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 text-slate-800 dark:text-slate-200 font-semibold py-2 px-3 text-xs shadow-2xs transition active:scale-98"
                      >
                        <span>🖨️</span>
                        <span>Imprimir Ficha</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          saveCurrentQuote({ customerName, customerPhone, paymentMethod, discountPercentage });
                        }}
                        className="flex items-center justify-center gap-1.5 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 text-[#1d4f91] dark:text-blue-300 font-semibold py-2 px-3 text-xs transition active:scale-98"
                      >
                        <span>💾</span>
                        <span>Salvar Cotação</span>
                      </button>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <button
                        type="button"
                        onClick={clearCart}
                        className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline"
                      >
                        Esvaziar cesta
                      </button>
                      <span className="text-[10px] text-slate-400">
                        Vardão Máquinas · CogniVault
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </aside>
        </div>
      )}

      {/* Ficha de Separação de Balcão - Exclusiva para Impressão */}
      <div className="hidden print:block fixed inset-0 bg-white p-8 text-slate-900 z-[9999]">
        <div className="border-b-2 border-slate-900 pb-4 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-xl font-black uppercase tracking-wider text-slate-950">VARDÃO MÁQUINAS</h1>
              <p className="text-xs font-bold text-slate-800">Concessionária & Peças Originais Husqvarna</p>
              <p className="text-[11px] text-slate-600">CogniVault · Ficha de Separação / Orçamento de Balcão</p>
            </div>
            <div className="text-right text-xs">
              <p><strong>Data:</strong> {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
              {customerName && <p className="mt-1 font-semibold text-slate-800"><strong>Cliente:</strong> {customerName}</p>}
              {customerPhone && <p className="text-slate-600"><strong>WhatsApp:</strong> {customerPhone}</p>}
              {paymentMethod && <p className="text-slate-600"><strong>Condição:</strong> {paymentMethod}</p>}
              <p className="mt-0.5 text-slate-500">Total de itens: {totalItems}</p>
              {totalPrice > 0 && (
                <p className="mt-1 font-bold text-sm text-slate-950">
                  Total Geral: R$ {totalPrice.toFixed(2).replace('.', ',')}
                </p>
              )}
            </div>
          </div>
        </div>

        <table className="w-full text-left border-collapse mb-8 text-xs">
          <thead>
            <tr className="border-b-2 border-slate-800 text-slate-900">
              <th className="py-2.5 w-12 font-extrabold text-center">Conf.</th>
              <th className="py-2.5 w-16 font-extrabold text-center">Qtd.</th>
              <th className="py-2.5 w-36 font-extrabold">Código Oficial</th>
              <th className="py-2.5 font-extrabold">Descrição da Peça</th>
              <th className="py-2.5 w-44 font-extrabold">Modelo / Aplicação</th>
              {totalPrice > 0 && <th className="py-2.5 w-24 font-extrabold text-right">Preço Un.</th>}
              {totalPrice > 0 && <th className="py-2.5 w-24 font-extrabold text-right">Subtotal</th>}
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id} className="border-b border-slate-300">
                <td className="py-2.5 text-center">
                  <span className="inline-block w-4 h-4 border border-slate-900 rounded-xs"></span>
                </td>
                <td className="py-2.5 text-center font-bold text-slate-950">{item.quantity}x</td>
                <td className="py-2.5 font-mono font-bold text-slate-900">
                  {formatHusqvarnaPartNumber(item.effectiveCode || item.partNumber)}
                </td>
                <td className="py-2.5 font-medium text-slate-900">
                  {item.name} {item.isSuperseded ? '★ (Substituição Oficial)' : ''}
                </td>
                <td className="py-2.5 text-slate-700">
                  {item.model} {item.pnc ? `· PNC ${item.pnc}` : ''} {item.position ? `· Pos. ${item.position}` : ''}
                </td>
                {totalPrice > 0 && (
                  <td className="py-2.5 text-right font-mono text-slate-700">
                    {item.unitPrice ? `R$ ${item.unitPrice.toFixed(2).replace('.', ',')}` : '—'}
                  </td>
                )}
                {totalPrice > 0 && (
                  <td className="py-2.5 text-right font-mono font-bold text-slate-950">
                    {item.unitPrice ? `R$ ${(item.quantity * item.unitPrice).toFixed(2).replace('.', ',')}` : '—'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {totalPrice > 0 && (
            <tfoot>
              {discountPercentage > 0 && (
                <>
                  <tr className="border-t-2 border-slate-700 text-slate-700">
                    <td colSpan={5} className="py-1.5 text-right uppercase tracking-wider text-xs">
                      Subtotal Bruto:
                    </td>
                    <td colSpan={2} className="py-1.5 text-right font-semibold text-xs font-mono">
                      R$ {totalPrice.toFixed(2).replace('.', ',')}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-700 text-slate-700">
                    <td colSpan={5} className="py-1.5 text-right uppercase tracking-wider text-xs">
                      Desconto Comercial ({discountPercentage}%):
                    </td>
                    <td colSpan={2} className="py-1.5 text-right font-semibold text-xs font-mono">
                      -R$ {discountAmount.toFixed(2).replace('.', ',')}
                    </td>
                  </tr>
                </>
              )}
              <tr className="border-t-2 border-slate-900 font-bold">
                <td colSpan={5} className="py-3 text-right uppercase tracking-wider text-xs">
                  {discountPercentage > 0 ? 'Total Líquido do Orçamento:' : 'Total Geral do Orçamento:'}
                </td>
                <td colSpan={2} className="py-3 text-right font-black text-sm text-slate-950 font-mono">
                  R$ {netTotalPrice.toFixed(2).replace('.', ',')}
                </td>
              </tr>
            </tfoot>
          )}
        </table>

        <div className="grid grid-cols-2 gap-8 pt-6 border-t border-slate-400 text-xs">
          <div>
            <p className="font-bold text-slate-800">Observações da Oficina / Balcão:</p>
            <div className="mt-2 h-20 border border-dashed border-slate-400 rounded-lg"></div>
          </div>
          <div className="flex flex-col justify-end text-center">
            <div className="border-t border-slate-800 pt-1 font-semibold text-slate-800">Assinatura do Atendente / Mecânico</div>
            <div className="text-[10px] text-slate-500 mt-1">Conferência de retirada de peças no estoque</div>
          </div>
        </div>
      </div>
    </>
  );
}
