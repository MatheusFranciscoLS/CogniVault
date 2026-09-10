import { useMemo } from 'react';
import type { OfficialVerification } from '../../types';
import { cleanErpCode, classifyPartKind } from '../../lib';
import { useQuoteCart } from '../../context/QuoteCartContext';
import { effectivePartNumber, isSupersededForCode, normalizePartCode, VerificationBadge } from '../PartVerificationDialog';
import { recordQuoteUsage } from './quoteUsage';
import type { SearchResultPart } from './types';

type Props = { part: SearchResultPart; verification?: OfficialVerification; verificationLoading?: boolean; selected?: boolean; opening?: boolean; onSelect: () => void; onOpen: () => void; onCopy: (code: string) => void; onCrossReference: (code: string, name: string) => void };

function classificationClasses(kind: string) {
  if (kind === 'ASSEMBLY') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300';
  if (kind === 'REPAIR_KIT') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300';
  return 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400';
}

export default function PartResultRow({ part, verification, verificationLoading = false, selected = false, opening = false, onSelect, onOpen, onCopy, onCrossReference }: Props) {
  const quoteCart = useQuoteCart();
  const superseded = isSupersededForCode(part.partNumber, verification);
  const rawCode = cleanErpCode(effectivePartNumber(part.partNumber, verification));
  const originalRawCode = cleanErpCode(part.partNumber);
  const classification = part.classification ?? classifyPartKind(part.name, part.section, part.notes);
  const inCart = useMemo(() => quoteCart.items.find(item => normalizePartCode(item.partNumber) === normalizePartCode(rawCode) && item.model === part.model), [part.model, quoteCart.items, rawCode]);

  const addToQuote = () => {
    recordQuoteUsage([...quoteCart.items, { partNumber: rawCode, model: part.model }], quoteCart.items.length === 0);
    quoteCart.addItem({ partNumber: rawCode, effectiveCode: rawCode, name: part.name, model: part.model, pnc: part.pnc, section: part.section, position: part.position, filename: part.filename, page: part.page, isSuperseded: superseded, originalCode: superseded ? originalRawCode : undefined, notes: part.notes, unitPrice: part.price ?? undefined });
  };

  return <article className={`group rounded-2xl border bg-white transition dark:bg-slate-900 ${selected ? 'border-blue-300 shadow-[0_10px_30px_rgba(29,79,145,.10)] ring-2 ring-blue-100 dark:border-blue-700 dark:ring-blue-950' : 'border-slate-200 hover:border-slate-300 hover:shadow-sm dark:border-slate-800 dark:hover:border-slate-700'}`} onMouseEnter={onSelect}>
    <div className="grid gap-3 p-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
      <button type="button" onClick={onOpen} onFocus={onSelect} data-part-result="true" className="min-w-0 text-left" aria-label={`Abrir detalhes de ${part.name}`}>
        <div className="flex flex-wrap items-center gap-2"><h3 className="min-w-0 truncate text-sm font-black text-slate-900 dark:text-white">{part.name}</h3><span className={`rounded-full border px-2 py-0.5 text-[9px] font-extrabold tracking-wide ${classificationClasses(classification.kind)}`}>{classification.label.replace(/^\[|\]$/g, '')}</span><VerificationBadge verification={verification} loading={verificationLoading} /></div>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1"><span className="font-mono text-xl font-black tracking-[-.03em] text-[#123867] dark:text-blue-300">{rawCode}</span>{superseded && <span className="text-[11px] font-semibold text-slate-400">substitui {originalRawCode}</span>}</div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400"><span><strong className="font-semibold text-slate-700 dark:text-slate-200">{part.model}</strong></span><span>PNC {part.pnc || '—'}</span>{part.position && <span>Pos. {part.position}</span>}{part.page && <span>Pág. {part.page}</span>}<span className="max-w-[320px] truncate" title={part.filename}>{part.filename}</span></div>
        {part.price != null && <div className="mt-3 inline-flex rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(part.price)}</div>}
      </button>
      <div className="flex flex-wrap items-center gap-2 xl:justify-end"><button type="button" onClick={() => onCopy(rawCode)} className="rounded-xl bg-[#123867] px-3.5 py-2 text-xs font-bold text-white transition hover:bg-[#0d2d57]">Copiar código</button><button type="button" onClick={addToQuote} className={`rounded-xl border px-3.5 py-2 text-xs font-bold ${inCart ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-300 bg-amber-400 text-slate-950 hover:bg-amber-300'}`}>{inCart ? `No orçamento (${inCart.quantity})` : '+ Orçamento'}</button><button type="button" onClick={() => onCrossReference(rawCode, part.name)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">Onde usa?</button><button type="button" onClick={onOpen} disabled={opening} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{opening ? 'Abrindo…' : 'Detalhes'}</button></div>
    </div>
  </article>;
}
