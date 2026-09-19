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
    <article onMouseEnter={onSelect} className={`border-b border-ink-100 bg-white transition last:border-b-0 dark:border-ink-800 dark:bg-ink-900 ${selected ? 'relative z-[1] bg-brand-50/60 shadow-[inset_3px_0_0_#273a60] dark:bg-brand-950/15' : 'hover:bg-ink-50/80 dark:hover:bg-ink-800/35'}`}>
      <div className="grid gap-3 px-3 py-3 lg:grid-cols-[145px_minmax(0,1fr)_150px_auto] lg:items-center lg:px-4">
        <button type="button" onFocus={onSelect} onClick={onSelect} className="min-w-0 text-left">
          <div className="font-mono text-[15px] font-black tracking-[-.02em] text-ink-900 dark:text-brand-300">{code}</div>
          <div className="mt-1"><SourceBadge source="PRICE_LIST" compact /></div>
        </button>

        <button type="button" onFocus={onSelect} onClick={onSelect} className="min-w-0 text-left">
          <h3 className="truncate text-[13px] font-black text-ink-900 dark:text-white">{part.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-ink-500 dark:text-ink-400">
            <span className="font-semibold text-ink-600 dark:text-ink-300">{application}</span>
            {applications.length > 1 && <span>+{applications.length - 1} aplicações</span>}
            {part.references[0] && <span>Ref. {part.references[0]}</span>}
          </div>
        </button>

        <div className="min-w-0">
          {part.price != null ? (
            <div className="text-[11px] font-black text-ink-700 dark:text-ink-200">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(part.price)}</div>
          ) : (
            <div>
              <div className="text-[10px] text-ink-500 dark:text-ink-400">Preço não informado</div>
              {/* Sem login automático: copia o código pro clipboard e abre o portal
                  numa aba nova, já logado do jeito do atendente — o preço aparece
                  na hora que ele clica na peça, sem nada guardado no servidor. */}
              <button
                type="button"
                onClick={() => { onCopy(code); window.open('https://parceirohusqvarna.com/Product/Index', '_blank', 'noopener,noreferrer'); }}
                className="mt-0.5 text-[9px] font-bold text-brand-600 underline decoration-dotted underline-offset-2 hover:text-ink-900 dark:text-brand-300 dark:hover:text-brand-200"
              >
                Consultar no Parceiro ↗
              </button>
            </div>
          )}
          {part.priceSections[0] && <div className="mt-1 truncate text-[9px] font-bold text-ink-500 dark:text-ink-400">{part.priceSections[0]}</div>}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
          <button type="button" onClick={addToQuote} className={`h-8 rounded-lg border px-2.5 text-[10px] font-black transition ${inCart ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-amber-300 bg-amber-300 text-ink-950 hover:bg-amber-200'}`}>{inCart ? `No orçamento · ${inCart.quantity}` : '+ Orçamento'}</button>
          <button type="button" onClick={() => onCopy(code)} className="h-8 rounded-lg border border-ink-200 bg-white px-2.5 text-[10px] font-bold text-ink-600 transition hover:border-brand-200 hover:text-brand-600 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300">Copiar</button>
          <button type="button" onClick={() => onOfficial(part)} className="h-8 rounded-lg border border-ink-200 bg-white px-2.5 text-[10px] font-bold text-ink-500 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300">Conferir oficial</button>
        </div>
      </div>
    </article>
  );
}
