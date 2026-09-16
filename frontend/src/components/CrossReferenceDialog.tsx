import { useQuery } from '@tanstack/react-query';
import type { CrossReferenceResult } from '../types';
import { apiJson, cleanErpCode, formatHusqvarnaPartNumber } from '../lib';
import { playCopySound, playCartSound } from '../lib/sound';
import { useOverlayLifecycle } from '../lib/useOverlayLifecycle';
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
  useOverlayLifecycle({ open: isOpen, onClose });

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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-0 backdrop-blur-xs sm:items-center sm:p-4"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="relative flex max-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:max-h-[85dvh] sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cross-reference-title"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/60">
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 text-base" aria-hidden="true">🔁</span>
              <h2 id="cross-reference-title" className="text-xs font-black uppercase tracking-[.08em] text-[#1d4f91] dark:text-blue-300 sm:text-sm">
                Referência cruzada · onde mais essa peça é usada?
              </h2>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="font-mono text-base font-black text-slate-900 dark:text-slate-100 sm:text-lg">
                {formatted}
              </span>
              <button
                type="button"
                onClick={handleCopyErp}
                className="flex items-center gap-1 rounded-lg bg-blue-100 px-2 py-1 text-[10px] font-bold text-[#1d4f91] transition hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-800/60 sm:text-[11px]"
                title="Copiar código puro para ERP"
              >
                📋 Copiar ERP ({rawClean})
              </button>
            </div>
            {partName && (
              <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                {partName}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-500 transition hover:text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-white"
            aria-label="Fechar referência cruzada"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {loading && (
            <div className="py-12 text-center text-sm text-slate-500" role="status">
              <div className="mb-2 inline-block animate-spin text-2xl" aria-hidden="true">⚙️</div>
              <p>Varrendo catálogos e modelos compatíveis...</p>
            </div>
          )}

          {error && (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
              {error}
            </div>
          )}

          {!loading && !error && data && (
            <>
              <div className="flex flex-col gap-1 rounded-xl border border-blue-100 bg-blue-50/80 p-3 text-xs dark:border-blue-900 dark:bg-blue-950/40 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <span className="font-bold text-[#1d4f91] dark:text-blue-300">
                    {data.totalModels} modelo(s) encontrado(s)
                  </span>
                  <span className="ml-1 text-slate-500 dark:text-slate-400">
                    em {data.totalUsages} ponto(s) de catálogo
                  </span>
                </div>
                <span className="text-[11px] font-medium text-slate-400">
                  Use como evidência de aplicação cadastrada
                </span>
              </div>

              {data.models.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500 dark:border-slate-700">
                  Nenhum outro equipamento cadastrado utiliza este mesmo código.
                </div>
              ) : (
                <div className="grid gap-2.5">
                  {data.models.map(m => (
                    <div
                      key={m.model}
                      className="rounded-xl border border-slate-200 bg-white p-3 transition hover:border-blue-300 dark:border-slate-800 dark:bg-slate-800/70 dark:hover:border-blue-700"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                              {m.model}
                            </span>
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                              {m.category}
                            </span>
                          </div>
                          <div className="mt-1 break-words text-xs text-slate-500 dark:text-slate-400">
                            📄 {m.filename}
                          </div>
                          {m.sections.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-slate-600 dark:text-slate-300">
                              <span className="text-slate-400">Vistas:</span>
                              {m.sections.map(s => (
                                <span key={s} className="rounded border border-slate-200/70 bg-slate-50 px-1.5 py-0.5 text-[10px] dark:border-slate-700 dark:bg-slate-900/60">
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
                          className="w-full shrink-0 rounded-lg bg-amber-400 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-300 sm:w-auto"
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

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] dark:border-slate-800 dark:bg-slate-800/60">
          <span className="hidden text-[11px] text-slate-500 dark:text-slate-400 sm:block">
            Aplicações exibidas vêm dos catálogos cadastrados no CogniVault.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
