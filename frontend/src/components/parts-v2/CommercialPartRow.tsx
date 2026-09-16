import { useMemo } from 'react';
import { cleanErpCode } from '../../lib';
import { useQuoteCart } from '../../context/QuoteCartContext';
import { recordQuoteUsage } from './quoteUsage';
import SourceBadge from './SourceBadge';
import type { CommercialPart } from './types';

type Props = { part: CommercialPart; selected?: boolean; onSelect: () => void; onCopy: (code: string) => void; onOfficial: (part: CommercialPart) => void };

export default function CommercialPartRow({ part, selected = false, onSelect, onCopy, onOfficial }: Props) {
  const quoteCart = useQuoteCart();
  const code = cleanErpCode(part.partNumber);
  const applications = part.applications?.length ? part.applications : part.application ? [part.application] : [];
  const application = applications[0] || part.productCategories[0] || 'Aplicação não informada';
  const inCart = useMemo(() => quoteCart.items.find(item => cleanErpCode(item.partNumber) === code), [code, quoteCart.items]);

  const addToQuote = () => {
    recordQuoteUsage([...quoteCart.items, { partNumber: code, model: application }], quoteCart.items.length === 0);
    quoteCart.addItem({ partNumber: code, effectiveCode: code, name: part.name, model: application, pnc: null, section: part.priceSections[0] || 'Cadastro comercial', position: null, filename: 'Cadastro comercial', page: null, unitPrice: part.price ?? undefined });
  };

  return (
    <article onMouseEnter={onSelect} className={`border-b border-slate-100 bg-white transition last:border-b-0 dark:border-slate-800 dark:bg-slate-900 ${selected ? 'relative z-[1] bg-blue-50/60 shadow-[inset_3px_0_0_#1d4f91] dark:bg-blue-950/15' : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/35'}`}>
      <div className="grid gap-3 px-3 py-3 lg:grid-cols-[145px_minmax(0,1fr)_150px_auto] lg:items-center lg:px-4">
        <button type="button" onFocus={onSelect} onClick={onSelect} className="min-w-0 text-left">
          <div className="font-mono text-[15px] font-black tracking-[-.02em] text-[#123867] dark:text-blue-300">{code}</div>
          <div className="mt-1"><SourceBadge source="PRICE_LIST" compact /></div>
        </button>

        <button type="button" onFocus={onSelect} onClick={onSelect} className="min-w-0 text-left">
          <h3 className="truncate text-[13px] font-black text-slate-900 dark:text-white">{part.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400">
            <span className="font-semibold text-slate-600 dark:text-slate-300">{application}</span>
            {applications.length > 1 && <span>+{applications.length - 1} aplicações</span>}
            {part.references[0] && <span>Ref. {part.references[0]}</span>}
          </div>
        </button>

        <div className="min-w-0">
          {part.price != null ? <div className="text-[11px] font-black text-slate-700 dark:text-slate-200">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(part.price)}</div> : <div className="text-[10px] text-slate-400">Preço não informado</div>}
          {part.priceSections[0] && <div className="mt-1 truncate text-[9px] font-bold text-slate-400">{part.priceSections[0]}</div>}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
          <button type="button" onClick={addToQuote} className={`h-8 rounded-lg border px-2.5 text-[10px] font-black transition ${inCart ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-amber-300 bg-amber-300 text-slate-950 hover:bg-amber-200'}`}>{inCart ? `No orçamento · ${inCart.quantity}` : '+ Orçamento'}</button>
          <button type="button" onClick={() => onCopy(code)} className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-bold text-slate-600 transition hover:border-blue-200 hover:text-[#1d4f91] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">Copiar</button>
          <button type="button" onClick={() => onOfficial(part)} className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">Conferir oficial</button>
        </div>
      </div>
    </article>
  );
}
