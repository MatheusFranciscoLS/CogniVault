import { cleanErpCode } from '../../lib';
import { useQuoteCart } from '../../context/QuoteCartContext';
import type { OfficialVerification } from '../../types';
import { effectivePartNumber, isSupersededForCode } from '../PartVerificationDialog';
import { recordQuoteUsage } from './quoteUsage';
import SourceBadge from './SourceBadge';
import type { CommercialPart, SearchResultPart } from './types';

type Props = { technical?: SearchResultPart; commercial?: CommercialPart; verification?: OfficialVerification; onCopy: (code: string) => void; onOpenTechnical: (id: string) => void; onCrossReference: (code: string, name: string) => void; onOfficial: (query: string) => void };

function officialEvidence(verification?: OfficialVerification) {
  if (!verification || verification.state === 'UNVERIFIED') return 'Fonte oficial ainda não confirmada';
  if (verification.state === 'VERIFIED') return 'Código com confirmação oficial salva';
  if (verification.state === 'SUPERSEDED') return `Código atual oficial: ${cleanErpCode(verification.currentPartNumber)}`;
  return 'Conferência oficial requer revisão';
}

export default function PartQuickPreview({ technical, commercial, verification, onCopy, onOpenTechnical, onCrossReference, onOfficial }: Props) {
  const quoteCart = useQuoteCart();
  if (!technical && !commercial) return null;

  const isTechnical = Boolean(technical);
  const name = technical?.name || commercial?.name || '';
  const code = technical ? cleanErpCode(effectivePartNumber(technical.partNumber, verification)) : cleanErpCode(commercial?.partNumber);
  const originalCode = technical ? cleanErpCode(technical.partNumber) : code;
  const commercialApplications = commercial?.applications?.length ? commercial.applications : commercial?.application ? [commercial.application] : [];
  const model = technical?.model || commercialApplications[0] || 'Aplicação não informada';
  const price = technical?.price ?? commercial?.price ?? null;

  const evidenceSteps = technical ? [
    technical.model ? `Modelo ${technical.model}` : '',
    technical.pnc && !/qualquer/i.test(technical.pnc) ? `PNC ${technical.pnc}` : '',
    technical.section ? `Vista ${technical.section}` : '',
    technical.position ? `Pos. ${technical.position}` : '',
    `Código ${code}`,
  ].filter(Boolean) : [];

  const addToQuote = () => {
    recordQuoteUsage([...quoteCart.items, { partNumber: code, model }], quoteCart.items.length === 0);
    if (technical) {
      const superseded = isSupersededForCode(technical.partNumber, verification);
      quoteCart.addItem({ partNumber: code, effectiveCode: code, name: technical.name, model: technical.model, pnc: technical.pnc, section: technical.section, position: technical.position, filename: technical.filename, page: technical.page, isSuperseded: superseded, originalCode: superseded ? originalCode : undefined, notes: technical.notes, unitPrice: technical.price ?? undefined });
      return;
    }
    if (commercial) quoteCart.addItem({ partNumber: code, effectiveCode: code, name: commercial.name, model, pnc: null, section: commercial.priceSections[0] || 'Cadastro comercial', filename: 'Cadastro comercial', unitPrice: commercial.price ?? undefined });
  };

  return <aside className="overflow-hidden rounded-xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
    <div className="border-b border-ink-100 px-4 py-3 dark:border-ink-800"><div className="flex items-center justify-between gap-3"><div className="text-[9px] font-black uppercase tracking-[.13em] text-ink-500 dark:text-ink-400">Peça selecionada</div><SourceBadge source={isTechnical ? 'CATALOG' : 'PRICE_LIST'} compact /></div><h3 className="mt-2 text-sm font-black leading-5 text-ink-950 dark:text-white">{name}</h3><div className="mt-1.5 break-all font-mono text-xl font-black tracking-[-.03em] text-ink-900 dark:text-brand-300">{code}</div></div>
    <div className="space-y-3 p-4"><div className="grid grid-cols-2 gap-2 text-[11px]"><div className="rounded-lg bg-ink-50 p-2.5 dark:bg-ink-800/60"><div className="text-[8px] font-black uppercase tracking-[.1em] text-ink-500 dark:text-ink-400">Aplicação</div><div className="mt-1 truncate font-bold text-ink-800 dark:text-ink-100" title={model}>{model}</div></div><div className="rounded-lg bg-ink-50 p-2.5 dark:bg-ink-800/60"><div className="text-[8px] font-black uppercase tracking-[.1em] text-ink-500 dark:text-ink-400">Preço</div><div className="mt-1 font-bold text-ink-800 dark:text-ink-100">{price != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price) : 'Não informado'}</div></div></div>
    {technical ? <><div className="grid grid-cols-3 gap-2 text-[10px] text-ink-500 dark:text-ink-400"><span>PNC <strong className="block truncate text-ink-700 dark:text-ink-200">{technical.pnc || '—'}</strong></span><span>Pos. <strong className="block text-ink-700 dark:text-ink-200">{technical.position || '—'}</strong></span><span>Pág. <strong className="block text-ink-700 dark:text-ink-200">{technical.page || '—'}</strong></span></div><div className="rounded-lg border border-ink-100 bg-ink-50/70 p-3 dark:border-ink-800 dark:bg-ink-950/40"><div className="text-[8px] font-black uppercase tracking-[.12em] text-ink-500 dark:text-ink-400">Cadeia de evidência</div><div className="mt-2 flex flex-wrap items-center gap-1 text-[9px] font-bold text-ink-600 dark:text-ink-300">{evidenceSteps.map((step, index) => <span key={`${step}-${index}`} className="flex items-center gap-1"><span className="rounded bg-white px-1.5 py-1 shadow-sm dark:bg-ink-800">{step}</span>{index < evidenceSteps.length - 1 && <span className="text-ink-300">›</span>}</span>)}</div><div className={`mt-2 text-[9px] font-bold ${verification?.state === 'VERIFIED' || verification?.state === 'SUPERSEDED' ? 'text-emerald-600 dark:text-emerald-400' : verification?.state === 'REVIEW' ? 'text-amber-600 dark:text-amber-400' : 'text-ink-500 dark:text-ink-400'}`}>{officialEvidence(verification)}</div></div></> : null}
    <div className="grid grid-cols-2 gap-2"><button type="button" onClick={addToQuote} className="col-span-2 rounded-lg bg-ink-900 px-3 py-2.5 text-[11px] font-black text-white">+ Adicionar ao orçamento</button><button type="button" onClick={() => onCopy(code)} className="rounded-lg border border-ink-200 px-3 py-2 text-[10px] font-bold text-ink-600 dark:border-ink-700 dark:text-ink-300">Copiar</button>{technical ? <button type="button" onClick={() => onOpenTechnical(technical.id)} className="rounded-lg border border-ink-200 px-3 py-2 text-[10px] font-bold text-ink-600 dark:border-ink-700 dark:text-ink-300">Detalhes</button> : <button type="button" onClick={() => onOfficial(code)} className="rounded-lg border border-indigo-200 px-3 py-2 text-[10px] font-bold text-indigo-700 dark:border-indigo-800 dark:text-indigo-300">Oficial</button>}{technical && <button type="button" onClick={() => onCrossReference(code, name)} className="col-span-2 rounded-lg px-3 py-1.5 text-[10px] font-bold text-ink-500 dark:text-ink-400 hover:text-brand-600">Onde usa esta peça?</button>}</div></div>
  </aside>;
}
