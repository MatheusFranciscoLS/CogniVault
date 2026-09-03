import type { ChatResponse } from '../../types';
import ReliabilityDetails from './ReliabilityDetails';

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
  if (!response.part) return null;
  const part = response.part;
  const confidence = confidencePresentation(response);

  return (
    <div className="mt-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 text-slate-800 dark:text-slate-200 shadow-sm transition hover:shadow-md">
      <div className="flex flex-wrap justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[.15em] text-[#1d4f91] dark:text-blue-300">Resultado técnico</div>
          <div className="mt-1 font-semibold">{part.name}</div>
          <div className="mt-2 break-all text-2xl font-bold text-[#1d4f91] dark:text-blue-300">{part.partNumber}</div>
        </div>
        {confidence ? <span className={`h-fit rounded-full px-3 py-1 text-xs font-semibold ring-1 ${confidence.style}`}>{confidence.label}</span> : null}
      </div>

      {response.match ? <div className="mt-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 text-xs leading-5 text-slate-500 dark:text-slate-400">{response.match.explanation}</div> : null}
      <ReliabilityDetails response={response}/>

      <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">Modelo<b className="mt-1 block">{part.model}</b></div>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">PNC<b className="mt-1 block">{part.pnc || 'Não informado'}</b></div>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">Seção<b className="mt-1 block">{part.section || '—'}</b></div>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">Posição / página<b className="mt-1 block">{part.position || '—'} · pág. {part.page ?? '—'}</b></div>
      </div>
      <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-xs">Catálogo<b className="mt-1 block break-words">{part.filename}</b></div>
      {part.notes ? <div className="mt-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 p-3 text-xs text-amber-900 dark:text-amber-300"><b className="block">Observação do catálogo</b><span className="mt-1 block">{part.notes}</span></div> : null}

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

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={favoritePending} onClick={onToggleFavorite} className={`rounded-xl border px-3 py-2 text-xs font-semibold transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50 ${favorite?'border-amber-300 bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300':'border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300'}`}>{favorite?'★ Favoritada':'☆ Favoritar peça'}</button>
        <button type="button" onClick={onCopyCode} className="rounded-xl bg-[#1d4f91] dark:bg-[#1d4f91]/80 px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90">Copiar código</button>
        <button type="button" onClick={onCopySummary} className="rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-xs font-semibold transition hover:bg-slate-50 dark:bg-slate-800/50">Copiar ficha</button>
        <button type="button" onClick={() => onAccess('view')} className="rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-xs font-semibold transition hover:bg-slate-50 dark:bg-slate-800/50">Abrir na página</button>
        <button type="button" onClick={() => onAccess('download')} className="rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-xs font-semibold transition hover:bg-slate-50 dark:bg-slate-800/50">Baixar PDF</button>
      </div>
    </div>
  );
}
