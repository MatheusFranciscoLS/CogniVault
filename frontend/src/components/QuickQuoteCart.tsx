import { useState } from 'react';
import { useQuoteCart } from '../context/QuoteCartContext';
import { formatHusqvarnaPartNumber } from '../lib';

export default function QuickQuoteCart() {
  const {
    items,
    totalItems,
    isOpen,
    setIsOpen,
    updateQuantity,
    removeItem,
    clearCart,
    copyQuoteToClipboard,
    openWhatsApp,
  } = useQuoteCart();

  const [customerInfo, setCustomerInfo] = useState('');

  if (totalItems === 0 && !isOpen) {
    return null;
  }

  return (
    <>
      {/* Botão Flutuante de Orçamento */}
      {!isOpen && totalItems > 0 && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label={`Ver orçamento com ${totalItems} itens`}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#1d4f91] to-[#123867] px-4 py-3.5 text-white shadow-[0_12px_32px_rgba(29,79,145,0.4)] transition-all duration-300 hover:scale-105 hover:shadow-[0_16px_40px_rgba(29,79,145,0.5)] active:scale-95"
        >
          <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 text-lg">
            🛒
            <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[11px] font-extrabold text-slate-900 shadow-md">
              {totalItems}
            </span>
          </div>
          <div className="text-left">
            <div className="text-xs font-extrabold uppercase tracking-wider text-amber-200">Orçamento de Balcão</div>
            <div className="text-sm font-semibold">{totalItems} {totalItems === 1 ? 'peça selecionada' : 'peças selecionadas'}</div>
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
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-[#0b1d3a] px-6 py-5 text-white">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-xl">
                  📋
                </div>
                <div>
                  <h2 className="text-base font-bold tracking-tight text-white">Cesta de Orçamento</h2>
                  <p className="text-xs text-blue-200/70">
                    {totalItems} {totalItems === 1 ? 'item pronto' : 'itens prontos'} para envio rápido
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

            {/* Campo Opcional de Identificação do Cliente / Máquina */}
            <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-4">
              <label htmlFor="quote-customer-info" className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Máquina ou Cliente (Opcional):
              </label>
              <input
                id="quote-customer-info"
                type="text"
                value={customerInfo}
                onChange={e => setCustomerInfo(e.target.value)}
                placeholder="Ex.: 143RII - Sr. Carlos"
                className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-800 dark:text-slate-100 outline-none transition focus:border-[#1d4f91] focus:ring-2 focus:ring-blue-500/20"
              />
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
                  const formattedCode = formatHusqvarnaPartNumber(item.effectiveCode || item.partNumber);
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
                            <span className="font-mono text-xs font-bold text-[#1d4f91] dark:text-blue-300">
                              {formattedCode}
                            </span>
                            {item.isSuperseded && (
                              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                                (Substituição)
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                            {item.model} {item.pnc ? `· PNC ${item.pnc}` : ''} {item.position ? `· Pos. ${item.position}` : ''}
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
                    </div>
                  );
                })
              )}
            </div>

            {/* Rodapé com Ações de Exportação */}
            {items.length > 0 && (
              <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/90 p-4 space-y-2.5">
                <button
                  type="button"
                  onClick={() => void copyQuoteToClipboard(customerInfo)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white py-3 px-4 text-xs font-bold shadow-md transition hover:shadow-lg active:scale-98"
                >
                  <span>📋</span>
                  <span>Copiar para WhatsApp (Texto Formatado)</span>
                </button>

                <button
                  type="button"
                  onClick={() => openWhatsApp(customerInfo)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-slate-950 font-extrabold py-2.5 px-4 text-xs shadow-sm transition active:scale-98"
                >
                  <span>💬</span>
                  <span>Abrir no WhatsApp Web</span>
                </button>

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
          </aside>
        </div>
      )}
    </>
  );
}
