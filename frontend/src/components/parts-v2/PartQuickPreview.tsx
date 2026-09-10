import { cleanErpCode } from '../../lib';
import { useQuoteCart } from '../../context/QuoteCartContext';
import type { OfficialVerification } from '../../types';
import { effectivePartNumber, isSupersededForCode } from '../PartVerificationDialog';
import { recordQuoteUsage } from './quoteUsage';
import SourceBadge from './SourceBadge';
import type { CommercialPart, SearchResultPart } from './types';

type Props = { technical?: SearchResultPart; commercial?: CommercialPart; verification?: OfficialVerification; onCopy: (code: string) => void; onOpenTechnical: (id: string) => void; onCrossReference: (code: string, name: string) => void; onOfficial: (query: string) => void };

export default function PartQuickPreview({ technical, commercial, verification, onCopy, onOpenTechnical, onCrossReference, onOfficial }: Props) {
  const quoteCart = useQuoteCart();
  if (!technical && !commercial) return <aside className="sticky top-24 hidden h-fit rounded-2xl border border-slate-200 bg-white p-5 xl:block dark:border-slate-800 dark:bg-slate-900"><div className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">Preview rápido</div><div className="mt-5 rounded-xl bg-slate-50 px-4 py-8 text-center text-xs leading-5 text-slate-400 dark:bg-slate-800/60">Selecione uma peça ou use ↑ ↓ para visualizar sem abrir o detalhe.</div></aside>;

  const isTechnical = Boolean(technical);
  const name = technical?.name || commercial?.name || '';
  const code = technical ? cleanErpCode(effectivePartNumber(technical.partNumber, verification)) : cleanErpCode(commercial?.partNumber);
  const originalCode = technical ? cleanErpCode(technical.partNumber) : code;
  const commercialApplications = commercial?.applications?.length ? commercial.applications : commercial?.application ? [commercial.application] : [];
  const model = technical?.model || commercialApplications[0] || 'Aplicação não informada';
  const price = technical?.price ?? commercial?.price ?? null;

  const addToQuote = () => {
    recordQuoteUsage([...quoteCart.items, { partNumber: code, model }], quoteCart.items.length === 0);
    if (technical) {
      const superseded = isSupersededForCode(technical.partNumber, verification);
      quoteCart.addItem({ partNumber: code, effectiveCode: code, name: technical.name, model: technical.model, pnc: technical.pnc, section: technical.section, position: technical.position, filename: technical.filename, page: technical.page, isSuperseded: superseded, originalCode: superseded ? originalCode : undefined, notes: technical.notes, unitPrice: technical.price ?? undefined });
      return;
    }
    if (commercial) quoteCart.addItem({ partNumber: code, effectiveCode: code, name: commercial.name, model, pnc: null, section: commercial.priceSections[0] || 'Cadastro comercial', filename: 'Cadastro comercial', unitPrice: commercial.price ?? undefined });
  };

  return <aside className="sticky top-24 hidden h-fit overflow-hidden rounded-2xl border border-slate-200 bg-white xl:block dark:border-slate-800 dark:bg-slate-900">
    <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800"><div className="flex items-center justify-between gap-3"><div className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">Preview rápido</div><SourceBadge source={isTechnical ? 'CATALOG' : 'PRICE_LIST'} compact /></div><h3 className="mt-3 text-base font-black leading-5 text-slate-950 dark:text-white">{name}</h3><div className="mt-2 break-all font-mono text-2xl font-black tracking-[-.04em] text-[#123867] dark:text-blue-300">{code}</div></div>
    <div className="space-y-4 p-5"><div className="grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60"><div className="text-[9px] font-black uppercase tracking-[.1em] text-slate-400">Aplicação</div><div className="mt-1 font-bold text-slate-800 dark:text-slate-100">{model}</div>{commercialApplications.length > 1 && <div className="mt-1 text-[9px] text-slate-400">+{commercialApplications.length - 1} aplicações no cadastro</div>}</div><div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60"><div className="text-[9px] font-black uppercase tracking-[.1em] text-slate-400">Preço</div><div className="mt-1 font-bold text-slate-800 dark:text-slate-100">{price != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price) : 'Não informado'}</div></div></div>
    {technical ? <div className="rounded-xl border border-slate-200 p-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400"><div className="grid grid-cols-2 gap-x-3 gap-y-2"><span>PNC <strong className="text-slate-700 dark:text-slate-200">{technical.pnc || '—'}</strong></span><span>Pos. <strong className="text-slate-700 dark:text-slate-200">{technical.position || '—'}</strong></span><span>Pág. <strong className="text-slate-700 dark:text-slate-200">{technical.page || '—'}</strong></span><span className="truncate" title={technical.filename}>Catálogo <strong className="text-slate-700 dark:text-slate-200">{technical.filename}</strong></span></div></div> : commercial ? <div className="space-y-2"><div className="text-[9px] font-black uppercase tracking-[.1em] text-slate-400">Áreas do cadastro</div><div className="flex flex-wrap gap-1.5">{commercial.priceSections.slice(0, 3).map(section => <span key={section} className="rounded-lg bg-blue-50 px-2 py-1 text-[9px] font-bold text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">{section}</span>)}</div><p className="text-[11px] leading-5 text-slate-400">Resultado salvo no banco. Use catálogo técnico ou fonte oficial para confirmar posição e montagem.</p></div> : null}
    <div className="grid gap-2"><button type="button" onClick={() => onCopy(code)} className="rounded-xl bg-[#123867] px-4 py-2.5 text-xs font-black text-white">Copiar código</button><button type="button" onClick={addToQuote} className="rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-black text-slate-950">+ Adicionar ao orçamento</button></div><div className="grid grid-cols-2 gap-2">{technical && <><button type="button" onClick={() => onOpenTechnical(technical.id)} className="rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300">Detalhes</button><button type="button" onClick={() => onCrossReference(code, name)} className="rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300">Onde usa?</button></>}{!technical && <button type="button" onClick={() => onOfficial(code)} className="col-span-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] font-bold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-300">Conferir no oficial</button>}</div></div>
  </aside>;
}
