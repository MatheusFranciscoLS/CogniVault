import { useState } from 'react';
import type { ChatResponse, SuggestedAddon } from '../../types';
import ReliabilityDetails from './ReliabilityDetails';
import { officialPortalUrl, officialPortalLabel } from '../PartVerificationDialog';
import { formatHusqvarnaPartNumber, cleanErpCode, classifyPartKind } from '../../lib';
import { useQuoteCart } from '../../context/QuoteCartContext';
import CrossReferenceDialog from '../CrossReferenceDialog';
import { playCopySound } from '../../lib/sound';
import { toast } from 'sonner';

function confidencePresentation(response: ChatResponse) {
  if (!response.match) return null;
  const presentations = {
    EXACT: { label: 'Correspondência exata', style: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 ring-emerald-200' },
    HIGH: { label: 'Confiança alta', style: 'bg-blue-50 dark:bg-[#123867] text-blue-700 dark:text-blue-300 ring-blue-200' },
    REVIEW: { label: 'Requer conferência', style: 'bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 ring-amber-200' },
  } as const;
  return presentations[response.match.level];
}

export default function ResultCard({
  response,
  favorite,
  favoritePending,
  onToggleFavorite,
  onCopyCode,
  onCopySummary,
  onAccess,
}: {
  response: ChatResponse;
  favorite: boolean;
  favoritePending: boolean;
  onToggleFavorite: () => void;
  onCopyCode: () => void;
  onCopySummary: () => void;
  onAccess: (mode: 'view' | 'download') => void;
}) {
  const quoteCart = useQuoteCart();
  const [crossRefOpen, setCrossRefOpen] = useState(false);
  if (!response.part) return null;
  const part = response.part;
  const confidence = confidencePresentation(response);
  const formattedCode = formatHusqvarnaPartNumber(part.partNumber);
  const inCart = quoteCart.items.find(i => i.partNumber === part.partNumber);

  const classification = part.classification || classifyPartKind(part.name, part.section, part.notes);

  return (
    <div className="mt-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 text-slate-800 dark:text-slate-200 shadow-sm transition hover:shadow-md">
      <div className="flex flex-wrap justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[.15em] text-[#1d4f91] dark:text-blue-300">Resultado técnico</div>
          <div className="mt-1 font-semibold">{part.name}</div>
          <div className="mt-2 flex flex-wrap items-baseline gap-2">
            <span className="break-all font-mono text-2xl font-bold text-[#1d4f91] dark:text-blue-300">{formattedCode}</span>
            {formattedCode !== part.partNumber && (
              <span className="text-xs font-mono text-slate-400">({part.partNumber})</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            title={classification.description}
            className={`rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold tracking-wider ${classification.badgeColor}`}
          >
            {classification.label}
          </span>
          {confidence ? <span className={`h-fit rounded-full px-3 py-1 text-xs font-semibold ring-1 ${confidence.style}`}>{confidence.label}</span> : null}
        </div>
      </div>

      {response.match ? <div className="mt-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 text-xs leading-5 text-slate-500 dark:text-slate-400">{response.match.explanation}</div> : null}
      <ReliabilityDetails response={response}/>

      {/* Destaque Visual da Vista Explodida do Catálogo */}
      {(part.page || part.position || response.diagramHighlight) && (
        <div className="mt-3 rounded-2xl border-2 border-blue-200 dark:border-blue-800/80 bg-gradient-to-br from-blue-50/90 via-indigo-50/40 to-slate-50 dark:from-[#0b1d3a]/80 dark:via-slate-800/80 dark:to-slate-900/90 p-3.5 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-blue-600 text-white text-sm font-black shadow-2xs">
                📐
              </span>
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#1d4f91] dark:text-blue-300">
                  Vista Explodida do Catálogo
                </span>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                  {part.section || 'Diagrama Técnico Oficial'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {part.position && (
                <span className="rounded-lg bg-white dark:bg-slate-800 px-2.5 py-1 text-xs font-black text-[#1d4f91] dark:text-blue-300 shadow-2xs border border-blue-200 dark:border-blue-700">
                  Pos. Nº {part.position}
                </span>
              )}
              {part.page && (
                <span className="rounded-lg bg-blue-600 text-white px-2.5 py-1 text-xs font-black shadow-2xs">
                  Pág. {part.page}
                </span>
              )}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-blue-100 dark:border-blue-900/50 pt-2.5">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate max-w-[240px]">
              📄 {part.filename}
            </span>
            <button
              type="button"
              onClick={() => onAccess('view')}
              className="rounded-xl bg-[#1d4f91] hover:bg-[#153e75] text-white px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5 shadow-2xs active:scale-95 shrink-0"
            >
              <span>👁️</span>
              <span>Ver Vista Explodida (Pág. {part.page ?? '1'})</span>
            </button>
          </div>
        </div>
      )}

      {/* Raciocínio Técnico Passo a Passo da IA */}
      {response.technicalReasoningSteps && response.technicalReasoningSteps.length > 0 && (
        <details className="group mt-3 rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/60 dark:bg-slate-800/60 transition overflow-hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between p-3 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-[#1d4f91] dark:hover:text-blue-300 transition">
            <div className="flex items-center gap-2">
              <span className="text-sm">🧠</span>
              <span>Raciocínio Técnico Passo a Passo da IA</span>
              <span className="rounded-full bg-blue-100 dark:bg-blue-900/40 text-[#1d4f91] dark:text-blue-300 px-2 py-0.2 text-[10px] font-black">
                {response.technicalReasoningSteps.length} etapas
              </span>
            </div>
            <span className="text-slate-400 transition-transform group-open:rotate-180 text-xs">▼</span>
          </summary>
          <div className="border-t border-slate-200/80 dark:border-slate-700/60 p-3.5 space-y-2.5 bg-white/70 dark:bg-slate-800/60">
            {response.technicalReasoningSteps.map(step => (
              <div key={step.step} className="flex items-start gap-2.5 text-xs">
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-black ${
                  step.status === 'NOTICE'
                    ? 'bg-amber-400 text-slate-950 shadow-2xs'
                    : 'bg-emerald-500 text-white shadow-2xs'
                }`}>
                  {step.status === 'NOTICE' ? '★' : '✓'}
                </span>
                <div className="min-w-0">
                  <div className="font-bold text-slate-800 dark:text-slate-200">{step.title}</div>
                  <div className="mt-0.5 text-slate-600 dark:text-slate-400 leading-relaxed font-medium">{step.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">Modelo<b className="mt-1 block">{part.model}</b></div>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">PNC<b className="mt-1 block">{part.pnc || 'Não informado'}</b></div>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">Seção<b className="mt-1 block">{part.section || '—'}</b></div>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">Posição / página<b className="mt-1 block">{part.position || '—'} · pág. {part.page ?? '—'}</b></div>
      </div>
      <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-xs">Catálogo<b className="mt-1 block break-words">{part.filename}</b></div>
      {part.notes ? (
        part.notes.includes('Substituição oficial') ? (
          <div className="mt-3 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50/90 dark:bg-amber-950/40 p-3.5 text-xs text-amber-900 dark:text-amber-200 shadow-sm">
            <div className="flex items-center gap-2 font-bold text-amber-800 dark:text-amber-300">
              <span className="text-base leading-none">★</span>
              <span>Substituição Oficial</span>
            </div>
            <p className="mt-1.5 leading-relaxed font-medium">{part.notes}</p>
            <a
              href={officialPortalUrl(part.partNumber, part.manufacturer)}
              target="_blank"
              rel="noreferrer"
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 dark:bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-700 dark:hover:bg-amber-600"
            >
              {officialPortalLabel(part.partNumber, part.manufacturer)} ↗
            </a>
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 p-3 text-xs text-amber-900 dark:text-amber-300">
            <b className="block">Observação do catálogo</b>
            <span className="mt-1 block">{part.notes}</span>
          </div>
        )
      ) : null}

      {(part.applications?.length || 0) > 1 ? (
        <div className="mt-3 rounded-xl border border-blue-100 dark:border-blue-700 bg-blue-50 dark:bg-[#123867]/60 p-3">
          <div className="text-[10px] font-bold uppercase tracking-[.1em] text-blue-700 dark:text-blue-300">Aplicações confirmadas deste código</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {part.applications?.map(application => <span key={`${application.model}-${application.pnc}`} className="rounded-full bg-white dark:bg-slate-800 px-2.5 py-1 text-[10px] font-medium text-blue-800 dark:text-blue-300 ring-1 ring-blue-100">{application.model} · PNC {application.pnc}</span>)}
          </div>
        </div>
      ) : null}

      {/* Exibição da disponibilidade em B2B caso a API tenha retornado */}
      {response.b2bPortal && (
        <div className={`mt-3 rounded-xl border p-3 text-xs ${response.b2bPortal.success ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-900 dark:text-emerald-300' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400'}`}>
          <b className="block">Status no B2B</b>
          <span className="mt-1 block">{response.b2bPortal.stockStatus}</span>
          {response.b2bPortal.supersededBy && <span className="mt-1 block text-rose-700 dark:text-rose-300 font-semibold">Substituído por: {response.b2bPortal.supersededBy}</span>}
        </div>
      )}

      {/* Venda Sugerida / Peças Recomendadas */}
      {part.suggestedAddons && part.suggestedAddons.items.length > 0 && (
        <div className="mt-3 rounded-2xl border-2 border-amber-300 dark:border-amber-700 bg-gradient-to-br from-amber-50/90 via-orange-50/40 to-yellow-50/30 dark:from-amber-950/40 dark:via-slate-800 dark:to-slate-900 p-3.5 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-amber-500 text-slate-950 text-sm font-black shadow-2xs">
                💡
              </span>
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-900 dark:text-amber-300">
                  Venda Sugerida / Peças Correlatas de Manutenção
                </span>
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {part.suggestedAddons.reason}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                quoteCart.addItems(
                  part.suggestedAddons!.items.map((item: SuggestedAddon) => ({
                    partNumber: item.partNumber,
                    name: item.name,
                    model: item.model || part.model,
                    section: item.section || part.section,
                    position: item.position,
                    filename: part.filename,
                  }))
                );
                toast.success(`${part.suggestedAddons!.items.length} peças sugeridas adicionadas ao orçamento!`);
              }}
              className="rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 py-1.5 text-xs font-bold transition shadow-2xs active:scale-95 shrink-0"
            >
              + Orçar Todas ({part.suggestedAddons.items.length})
            </button>
          </div>
          <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
            {part.suggestedAddons.items.map((addon: SuggestedAddon) => {
              const addonInCart = quoteCart.items.find(i => i.partNumber === addon.partNumber);
              return (
                <div key={addon.id} className="flex items-center justify-between gap-2 rounded-xl bg-white/90 dark:bg-slate-800/90 border border-amber-200/80 dark:border-amber-800/80 p-2">
                  <div className="min-w-0">
                    <div className="text-xs font-bold truncate text-slate-800 dark:text-slate-100">{addon.name}</div>
                    <div className="text-[11px] font-mono font-semibold text-[#1d4f91] dark:text-blue-300">
                      {formatHusqvarnaPartNumber(addon.partNumber)}
                      {addon.position && <span className="text-slate-400 font-sans font-normal ml-1">· Pos. {addon.position}</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      quoteCart.addItem({
                        partNumber: addon.partNumber,
                        name: addon.name,
                        model: addon.model || part.model,
                        section: addon.section || part.section,
                        position: addon.position,
                        filename: part.filename,
                      });
                      toast.success(`${addon.name} adicionada ao orçamento!`);
                    }}
                    className={`rounded-lg px-2 py-1 text-[10px] font-bold transition shrink-0 ${
                      addonInCart
                        ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                        : 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                    }`}
                  >
                    {addonInCart ? '✓ No Orçamento' : '+ Orçar'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            quoteCart.addItem({
              partNumber: part.partNumber,
              name: part.name,
              model: part.model,
              pnc: part.pnc,
              section: part.section,
              position: part.position,
              notes: part.notes,
            });
            toast.success(`Peça adicionada ao orçamento de balcão!`);
          }}
          className={`rounded-xl px-3.5 py-2 text-xs font-bold transition flex items-center gap-1.5 shadow-xs active:scale-95 ${
            inCart
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
              : 'bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 shadow-amber-500/20'
          }`}
        >
          <span>{inCart ? '✓' : '+'}</span>
          <span>{inCart ? `No Orçamento (${inCart.quantity}x)` : 'Adicionar ao Orçamento'}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            const clean = cleanErpCode(part.partNumber);
            void navigator.clipboard.writeText(clean);
            playCopySound();
            toast.success(`Código ERP copiado: ${clean}`);
          }}
          title="Copiar código sem pontuação/espaço para colar no ERP"
          className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 transition flex items-center gap-1.5 active:scale-95"
        >
          <span>📋</span>
          <span>Copiar ERP (Puro)</span>
        </button>
        <button
          type="button"
          onClick={() => setCrossRefOpen(true)}
          title="Verificar todos os modelos e catálogos que usam esta mesma peça"
          className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 px-3 py-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300 transition flex items-center gap-1.5 active:scale-95"
        >
          <span>🔁</span>
          <span>Onde mais é usada?</span>
        </button>
        <button type="button" disabled={favoritePending} onClick={onToggleFavorite} className={`rounded-xl border px-3 py-2 text-xs font-semibold transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50 ${favorite?'border-amber-300 bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300':'border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300'}`}>{favorite?'★ Favoritada':'☆ Favoritar peça'}</button>
        <button type="button" onClick={onCopyCode} className="rounded-xl bg-[#1d4f91] dark:bg-[#1d4f91]/80 px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90">Copiar código</button>
        <button type="button" onClick={onCopySummary} className="rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-xs font-semibold transition hover:bg-slate-50 dark:bg-slate-800/50">Copiar ficha</button>
        <button type="button" onClick={() => onAccess('view')} className="rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-xs font-semibold transition hover:bg-slate-50 dark:bg-slate-800/50">Abrir na página</button>
        <button type="button" onClick={() => onAccess('download')} className="rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-xs font-semibold transition hover:bg-slate-50 dark:bg-slate-800/50">Baixar PDF</button>
      </div>

      {crossRefOpen && (
        <CrossReferenceDialog
          partCode={part.partNumber}
          partName={part.name}
          onClose={() => setCrossRefOpen(false)}
        />
      )}
    </div>
  );
}
