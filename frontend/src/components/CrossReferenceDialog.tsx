import { useQuery } from '@tanstack/react-query';
import type { CrossReferenceResult } from '../types';
import { apiJson, cleanErpCode, formatHusqvarnaPartNumber } from '../lib';
import { playCopySound, playCartSound } from '../lib/sound';
import { useQuoteCart } from '../context/QuoteCartContext';
import { toast } from 'sonner';

interface CrossReferenceDialogProps {
  partCode: string;
  partName?: string;
  isOpen?: boolean;
  onClose: () => void;
}

export default function CrossReferenceDialog({
  partCode,
  partName,
  isOpen = true,
  onClose,
}: CrossReferenceDialogProps) {
  const quoteCart = useQuoteCart();
  const clean = isOpen && partCode ? cleanErpCode(partCode) : '';

  const { data = null, isLoading: loading, error: queryError } = useQuery<CrossReferenceResult>({
    queryKey: ['cross-reference', clean],
    queryFn: () => apiJson<CrossReferenceResult>(`/api/parts/${encodeURIComponent(clean)}/cross-reference`),
    enabled: Boolean(isOpen && clean),
  });

  const error = queryError instanceof Error ? queryError.message : queryError ? 'Erro ao buscar referências cruzadas.' : null;

  if (!isOpen) return null;

  const formatted = formatHusqvarnaPartNumber(partCode);
  const rawClean = cleanErpCode(partCode);

  const handleCopyErp = () => {
    navigator.clipboard.writeText(rawClean);
    playCopySound();
    toast.success(`Código ERP copiado: ${rawClean}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-base">🔁</span>
              <h2 className="text-sm font-bold uppercase tracking-wider text-[#1d4f91] dark:text-blue-300">
                Referência Cruzada · Onde mais essa peça é usada?
              </h2>
            </div>
            <div className="mt-1 flex items-center gap-3">
              <span className="font-mono text-lg font-black text-slate-900 dark:text-slate-100">
                {formatted}
              </span>
              <button
                type="button"
                onClick={handleCopyErp}
                className="rounded-lg bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/40 dark:hover:bg-blue-800/60 text-[#1d4f91] dark:text-blue-300 px-2 py-0.5 text-[11px] font-bold transition flex items-center gap-1"
                title="Copiar código puro para ERP"
              >
                📋 Copiar ERP ({rawClean})
              </button>
            </div>
            {partName && (
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                {partName}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {loading && (
            <div className="py-12 text-center text-sm text-slate-500">
              <div className="inline-block animate-spin text-2xl mb-2">⚙️</div>
              <p>Varrendo catálogos e modelos compatíveis...</p>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 p-4 text-xs text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
              {error}
            </div>
          )}

          {!loading && !error && data && (
            <>
              <div className="flex items-center justify-between rounded-xl bg-blue-50/80 dark:bg-blue-950/40 p-3 border border-blue-100 dark:border-blue-900 text-xs">
                <div>
                  <span className="font-bold text-[#1d4f91] dark:text-blue-300">
                    {data.totalModels} modelo(s) encontrado(s)
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 ml-1">
                    em {data.totalUsages} ponto(s) de catálogo
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">
                  Ideal para substituição entre máquinas
                </span>
              </div>

              {data.models.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  Nenhum outro equipamento cadastrado utiliza este mesmo código.
                </div>
              ) : (
                <div className="grid gap-2.5">
                  {data.models.map(m => (
                    <div
                      key={m.model}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/70 p-3 shadow-2xs hover:border-blue-300 dark:hover:border-blue-700 transition"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                              {m.model}
                            </span>
                            <span className="rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 text-[10px] font-semibold">
                              {m.category}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            📄 {m.filename}
                          </div>
                          {m.sections.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-slate-600 dark:text-slate-300">
                              <span className="text-slate-400">Vistas:</span>
                              {m.sections.map(s => (
                                <span key={s} className="rounded bg-slate-50 dark:bg-slate-900/60 px-1.5 py-0.5 border border-slate-200/70 dark:border-slate-700 text-[10px]">
                                  {s}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                            <span className="text-slate-400">PNCs:</span>
                            {m.pncs.map(p => (
                              <span key={p} className="font-mono text-[10px] text-blue-600 dark:text-blue-400">
                                {p}
                              </span>
                            ))}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            quoteCart.addItem({
                              partNumber: partCode,
                              name: partName || m.usages[0]?.name || 'Peça Compatível',
                              model: m.model,
                              pnc: m.pncs[0] !== 'Todos PNCs' ? m.pncs[0] : null,
                              section: m.sections[0] || null,
                              position: m.usages[0]?.position || null,
                              filename: m.filename,
                            });
                            playCartSound();
                          }}
                          className="shrink-0 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 px-2.5 py-1 text-xs font-bold transition shadow-xs active:scale-95"
                          title={`Adicionar ao orçamento sob o modelo ${m.model}`}
                        >
                          + Orçar ({m.model})
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Dica de balcão: use peças equivalentes para atender clientes sem estoque específico.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
