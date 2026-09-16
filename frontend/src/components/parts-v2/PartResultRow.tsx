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

  return (
    <article
      onMouseEnter={onSelect}
      className={`group border-b border-slate-100 bg-white transition last:border-b-0 dark:border-slate-800 dark:bg-slate-900 ${selected ? 'relative z-[1] bg-blue-50/60 shadow-[inset_3px_0_0_#1d4f91] dark:bg-blue-950/15' : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/35'}`}
    >
      <div className="grid gap-3 px-3 py-3 lg:grid-cols-[145px_minmax(0,1fr)_170px_auto] lg:items-center lg:px-4">
        <button type="button" onClick={onOpen} onFocus={onSelect} data-part-result="true" className="min-w-0 text-left" aria-label={`Abrir detalhes de ${part.name}`}>
          <div className="font-mono text-[15px] font-black tracking-[-.02em] text-[#123867] dark:text-blue-300">{rawCode}</div>
          {superseded && <div className="mt-1 truncate text-[9px] font-semibold text-slate-400" title={`Substitui ${originalRawCode}`}>substitui {originalRawCode}</div>}
        </button>

        <button type="button" onClick={onOpen} onFocus={onSelect} className="min-w-0 text-left">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="min-w-0 truncate text-[13px] font-black text-slate-900 dark:text-white">{part.name}</h3>
            <span className={`rounded-md border px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wide ${classificationClasses(classification.kind)}`}>{classification.label.replace(/^\[|\]$/g, '')}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400">
            <span className="font-semibold text-slate-600 dark:text-slate-300">{part.model}</span>
            <span>PNC {part.pnc || '—'}</span>
            {part.position && <span>Pos. {part.position}</span>}
            {part.page && <span>Pág. {part.page}</span>}
          </div>
        </button>

        <div className="flex min-w-0 flex-wrap items-center gap-2 lg:block">
          <VerificationBadge verification={verification} loading={verificationLoading} />
          {part.price != null && <div className="mt-1 text-[11px] font-black text-slate-700 dark:text-slate-200">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(part.price)}</div>}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
          <button type="button" onClick={addToQuote} className={`h-8 rounded-lg border px-2.5 text-[10px] font-black transition ${inCart ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-amber-300 bg-amber-300 text-slate-950 hover:bg-amber-200'}`}>{inCart ? `No orçamento · ${inCart.quantity}` : '+ Orçamento'}</button>
          <button type="button" onClick={() => onCopy(rawCode)} className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-bold text-slate-600 transition hover:border-blue-200 hover:text-[#1d4f91] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">Copiar</button>
          <button type="button" onClick={() => onCrossReference(rawCode, part.name)} className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">Onde usa?</button>
          <button type="button" onClick={onOpen} disabled={opening} className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-bold text-slate-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{opening ? 'Abrindo…' : 'Detalhes'}</button>
        </div>
      </div>
    </article>
  );
}
