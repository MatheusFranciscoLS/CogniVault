import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { toast } from 'sonner';
import { apiJson, fmtDate, formatHusqvarnaPartNumber } from '../lib';
import type { SearchHistoryItem, SearchStatus } from '../types';
import { useQuoteCart } from '../context/QuoteCartContext';

const statusLabels: Record<SearchStatus, string> = {
  FOUND: 'Encontrada',
  PNC_REQUIRED: 'Faltou PNC',
  MODEL_REQUIRED: 'Faltou modelo',
  PART_REQUIRED: 'Faltou peça',
  AMBIGUOUS: 'Ambígua',
  NOT_FOUND: 'Sem resultado',
};

function replayQuery(item: SearchHistoryItem) {
  if (!item.pnc) return item.query;
  const queryDigits = item.query.replace(/\D/g, '');
  const pncDigits = item.pnc.replace(/\D/g, '');
  return pncDigits && queryDigits.includes(pncDigits) ? item.query : `${item.query} · PNC ${item.pnc}`;
}

function tone(status: SearchStatus) {
  if (status === 'FOUND') return 'text-emerald-700 dark:text-emerald-300';
  if (status === 'NOT_FOUND') return 'text-rose-700 dark:text-rose-300';
  return 'text-amber-700 dark:text-amber-300';
}

export default function HistoryWorkspace({ onSearch }: { onSearch: (query: string) => void }) {
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState<'ALL' | SearchStatus>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const quoteCart = useQuoteCart();

  useEffect(() => {
    let active = true;
    void apiJson<{ history: SearchHistoryItem[] }>('/api/history')
      .then(data => { if (active) setHistory(data.history); })
      .catch(loadError => { if (active) setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar o histórico.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const normalized = filter.trim().toLocaleLowerCase('pt-BR');
  const filtered = useMemo(() => history.filter(item => {
    if (status !== 'ALL' && item.status !== status) return false;
    if (!normalized) return true;
    return [item.query, item.resultCode, item.resultLabel, item.resultModel, item.pnc, item.resultPnc]
      .some(value => value?.toLocaleLowerCase('pt-BR').includes(normalized));
  }), [history, normalized, status]);

  const parentRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 78,
    overscan: 8,
  });

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(`Código ${code} copiado.`);
    } catch {
      toast.info(`Código: ${code}`);
    }
  };

  return (
    <section className="mx-auto max-w-[1400px] space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[.15em] text-[#1d4f91] dark:text-blue-300">Continuidade do atendimento</div>
          <h1 className="mt-1 text-2xl font-black tracking-[-.03em] text-slate-950 dark:text-white">Histórico</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Retome uma consulta anterior sem reconstruir o contexto.</p>
        </div>
        <div className="text-xs font-semibold text-slate-400">{history.length} {history.length === 1 ? 'consulta' : 'consultas'}</div>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
          <input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Consulta, código, modelo ou PNC…" className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-semibold outline-none transition focus:border-[#1d4f91] focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
        </div>
        <select value={status} onChange={event => setStatus(event.target.value as 'ALL' | SearchStatus)} className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          <option value="ALL">Todas as situações</option>
          <option value="FOUND">Encontradas</option>
          <option value="PNC_REQUIRED">Faltou PNC</option>
          <option value="MODEL_REQUIRED">Faltou modelo</option>
          <option value="AMBIGUOUS">Ambíguas</option>
          <option value="NOT_FOUND">Sem resultado</option>
        </select>
        <div className="px-1 text-xs font-semibold text-slate-400">{filtered.length} registros</div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="hidden grid-cols-[minmax(250px,1.35fr)_minmax(230px,1fr)_120px_130px] gap-4 border-b border-slate-100 px-4 py-2.5 text-[10px] font-black uppercase tracking-[.1em] text-slate-400 lg:grid dark:border-slate-800">
          <span>Consulta</span><span>Resultado</span><span>Situação</span><span className="text-right">Ações</span>
        </div>

        {loading ? <div className="space-y-1 p-3">{[0,1,2,3].map(item => <div key={item} className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />)}</div> : filtered.length ? (
          <div ref={parentRef} className="h-[620px] overflow-auto">
            <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
              {virtualizer.getVirtualItems().map(virtualItem => {
                const item = filtered[virtualItem.index];
                const code = item.resultCode ? formatHusqvarnaPartNumber(item.resultCode) : '';
                const inCart = item.resultCode ? quoteCart.items.find(cartItem => cartItem.partNumber === item.resultCode) : undefined;
                return (
                  <article key={virtualItem.key} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${virtualItem.size}px`, transform: `translateY(${virtualItem.start}px)` }} className="grid gap-3 border-b border-slate-100 px-4 py-3 transition hover:bg-slate-50/80 lg:grid-cols-[minmax(250px,1.35fr)_minmax(230px,1fr)_120px_130px] lg:items-center dark:border-slate-800 dark:hover:bg-slate-800/45">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-slate-900 dark:text-white">{item.query}</div>
                      <div className="mt-1 truncate text-[11px] text-slate-400">{fmtDate(item.createdAt)}{item.pnc ? ` · PNC ${item.pnc}` : ''}</div>
                    </div>
                    <div className="min-w-0">
                      {item.resultCode ? <><div className="truncate font-mono text-sm font-black text-[#123867] dark:text-blue-300">{code}</div><div className="mt-1 truncate text-[11px] text-slate-400">{item.resultLabel || 'Peça'}{item.resultModel ? ` · ${item.resultModel}` : ''}</div></> : <span className="text-xs text-slate-400">Sem código confirmado</span>}
                    </div>
                    <div className={`text-xs font-bold ${tone(item.status)}`}>{statusLabels[item.status]}</div>
                    <div className="flex items-center gap-1.5 lg:justify-end">
                      {item.resultCode && <button type="button" onClick={() => { quoteCart.addItem({ partNumber: item.resultCode!, name: item.resultLabel || item.query, model: item.resultModel || 'Husqvarna', pnc: item.resultPnc || undefined }); toast.success(inCart ? 'Quantidade atualizada no orçamento.' : 'Peça adicionada ao orçamento.'); }} className="grid h-8 w-8 place-items-center rounded-lg text-sm font-black text-amber-600 transition hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/30" title="Adicionar ao orçamento">{inCart ? '✓' : '+'}</button>}
                      {item.resultCode && <button type="button" onClick={() => void copy(code)} className="rounded-lg px-2.5 py-2 text-xs font-bold text-slate-400 transition hover:bg-slate-100 hover:text-[#1d4f91] dark:hover:bg-slate-800" title="Copiar código">Copiar</button>}
                      <button type="button" onClick={() => onSearch(replayQuery(item))} className="rounded-lg bg-[#123867] px-3 py-2 text-xs font-black text-white transition hover:bg-[#0d2c52]">Retomar</button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : <div className="px-5 py-12 text-center"><div className="text-sm font-bold text-slate-700 dark:text-slate-200">Nenhuma consulta encontrada</div><p className="mt-1 text-xs text-slate-400">Ajuste o texto ou a situação.</p></div>}
      </div>
    </section>
  );
}
