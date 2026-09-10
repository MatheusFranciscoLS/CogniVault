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

  return <article onMouseEnter={onSelect} className={`rounded-2xl border bg-white transition dark:bg-slate-900 ${selected ? 'border-blue-300 shadow-[0_10px_30px_rgba(29,79,145,.10)] ring-2 ring-blue-100 dark:border-blue-700 dark:ring-blue-950' : 'border-slate-200 hover:border-slate-300 hover:shadow-sm dark:border-slate-800 dark:hover:border-slate-700'}`}>
    <div className="grid gap-3 p-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
      <button type="button" onFocus={onSelect} onClick={onSelect} className="min-w-0 text-left">
        <div className="flex flex-wrap items-center gap-2"><h3 className="min-w-0 truncate text-sm font-black text-slate-900 dark:text-white">{part.name}</h3><SourceBadge source="PRICE_LIST" compact /></div>
        <div className="mt-2 font-mono text-xl font-black tracking-[-.03em] text-[#123867] dark:text-blue-300">{code}</div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400"><span><strong className="font-semibold text-slate-700 dark:text-slate-200">{application}</strong></span>{applications.length > 1 && <span>+{applications.length - 1} aplicações</span>}{part.references[0] && <span>Ref. {part.references[0]}</span>}</div>
        <div className="mt-2 flex flex-wrap gap-1.5">{part.priceSections.slice(0, 2).map(section => <span key={section} className="rounded-md bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">{section}</span>)}</div>
        {part.price != null && <div className="mt-3 inline-flex rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(part.price)}</div>}
      </button>
      <div className="flex flex-wrap items-center gap-2 xl:justify-end"><button type="button" onClick={() => onCopy(code)} className="rounded-xl bg-[#123867] px-3.5 py-2 text-xs font-bold text-white">Copiar código</button><button type="button" onClick={addToQuote} className={`rounded-xl border px-3.5 py-2 text-xs font-bold ${inCart ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-300 bg-amber-400 text-slate-950 hover:bg-amber-300'}`}>{inCart ? `No orçamento (${inCart.quantity})` : '+ Orçamento'}</button><button type="button" onClick={() => onOfficial(part)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">Conferir oficial</button></div>
    </div>
  </article>;
}
