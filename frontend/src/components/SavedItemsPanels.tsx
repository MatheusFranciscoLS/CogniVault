import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { toast } from 'sonner';
import { api, apiJson, fmtDate, json } from '../lib';
import { pdfPageUrl } from '../pdf';
import type { FavoriteItem, SearchHistoryItem, SearchStatus } from '../types';

const statusLabels: Record<SearchStatus, string> = {
  FOUND: 'Peça encontrada',
  PNC_REQUIRED: 'PNC solicitado',
  MODEL_REQUIRED: 'Modelo solicitado',
  PART_REQUIRED: 'Peça solicitada',
  AMBIGUOUS: 'Mais de uma opção',
  NOT_FOUND: 'Não encontrada',
};

const statusFilters: Array<['ALL' | SearchStatus, string]> = [
  ['ALL', 'Todos'],
  ['FOUND', 'Encontradas'],
  ['PNC_REQUIRED', 'Faltou PNC'],
  ['MODEL_REQUIRED', 'Faltou modelo'],
  ['AMBIGUOUS', 'Ambíguas'],
  ['NOT_FOUND', 'Sem resultado'],
];

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="cv-empty">
      <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-400" aria-hidden="true">⌕</div>
      <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</div>
      <div className="mt-1 text-xs leading-5 text-slate-400">{description}</div>
    </div>
  );
}

async function copyCode(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`Código ${value} copiado.`);
  } catch {
    toast.info(`Código: ${value}`);
  }
}

function LoadingCards() {
  return (
    <div className="grid gap-3 p-4" aria-hidden="true">
      {[0, 1, 2].map(item => (
        <div key={item} className="animate-pulse rounded-2xl border border-slate-100 dark:border-slate-800 p-4">
          <div className="h-3 w-1/3 rounded-full bg-slate-200 dark:bg-slate-600" />
          <div className="mt-3 h-3 w-2/3 rounded-full bg-slate-100 dark:bg-slate-700" />
        </div>
      ))}
    </div>
  );
}

function historyIdentity(item: SearchHistoryItem) {
  return `${item.query.trim().toLocaleLowerCase('pt-BR')}|${item.pnc || ''}`;
}

function replayQuery(item: SearchHistoryItem) {
  if (!item.pnc) return item.query;
  const queryDigits = item.query.replace(/\D/g, '');
  const pncDigits = item.pnc.replace(/\D/g, '');
  return pncDigits && queryDigits.includes(pncDigits) ? item.query : `${item.query} · PNC ${item.pnc}`;
}

export function HistoryPanel({ onSearch }: { onSearch: (query: string) => void }) {
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | SearchStatus>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    void apiJson<{ history: SearchHistoryItem[] }>('/api/history')
      .then(data => setHistory(data.history))
      .catch(loadError => setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar o histórico.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let active = true;
    void apiJson<{ history: SearchHistoryItem[] }>('/api/history')
      .then(data => { if (active) setHistory(data.history); })
      .catch(loadError => { if (active) setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar o histórico.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const repeatCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of history) counts.set(historyIdentity(item), (counts.get(historyIdentity(item)) || 0) + 1);
    return counts;
  }, [history]);
  const foundCount = useMemo(() => history.filter(item => item.status === 'FOUND').length, [history]);
  const uniqueCount = useMemo(() => new Set(history.map(historyIdentity)).size, [history]);
  const pendingCount = history.length - foundCount;

  const normalizedFilter = filter.trim().toLowerCase();
  const filtered = useMemo(() => history.filter(item => (
    (statusFilter === 'ALL' || item.status === statusFilter)
    && [item.query, item.resultCode, item.resultLabel, item.resultModel, item.resultPnc]
      .some(value => value?.toLowerCase().includes(normalizedFilter))
  )), [history, normalizedFilter, statusFilter]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 140,
    overscan: 5,
  });

  return (
    <section>
      <p className="cv-kicker">Continuidade do atendimento</p>
      <h1 className="cv-page-title">Histórico inteligente</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Retome o contexto original da consulta, identifique pesquisas recorrentes e filtre atendimentos que ainda precisam de confirmação.</p>

      {error && (
        <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/30 p-3 text-sm text-rose-700 dark:text-rose-300">
          <span>{error}</span>
          <button type="button" onClick={load} className="rounded-lg border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold">Tentar novamente</button>
        </div>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="cv-surface rounded-[18px] p-4"><div className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">Encontradas</div><div className="mt-2 text-2xl font-semibold text-emerald-700 dark:text-emerald-300">{foundCount}</div><div className="mt-1 text-xs text-slate-400">consultas com código liberado</div></div>
        <div className="cv-surface rounded-[18px] p-4"><div className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">Precisaram confirmação</div><div className="mt-2 text-2xl font-semibold text-amber-700 dark:text-amber-300">{pendingCount}</div><div className="mt-1 text-xs text-slate-400">PNC, modelo, ambiguidade ou ausência</div></div>
        <div className="cv-surface rounded-[18px] p-4"><div className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">Consultas diferentes</div><div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{uniqueCount}</div><div className="mt-1 text-xs text-slate-400">repetições são marcadas abaixo</div></div>
      </div>

      <div className="cv-surface mt-4 rounded-[22px] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="history-filter" className="sr-only">Filtrar histórico</label>
          <input id="history-filter" value={filter} onChange={event => setFilter(event.target.value)} placeholder="Filtrar por consulta, código, modelo ou PNC" className="cv-field min-w-[220px] flex-1 text-sm" />
          {filter && <button type="button" onClick={() => setFilter('')} className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 transition hover:bg-slate-100 dark:bg-slate-700">Limpar filtro</button>}
          <span className="cv-soft-badge">{filtered.length} {filtered.length === 1 ? 'registro' : 'registros'}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {statusFilters.map(([value, label]) => <button key={value} type="button" onClick={() => setStatusFilter(value)} className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${statusFilter === value ? 'border-slate-800 bg-slate-900 text-white' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:border-slate-600'}`}>{label}</button>)}
        </div>
      </div>

      <div className="cv-surface mt-4 overflow-hidden rounded-[22px]" aria-busy={loading}>
        {loading ? <LoadingCards /> : (
          <div ref={parentRef} className="h-[600px] overflow-auto divide-y divide-slate-100 dark:divide-slate-800/60">
            <div style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
              {virtualizer.getVirtualItems().map(virtualItem => {
                const item = filtered[virtualItem.index];
                const repeats = repeatCounts.get(historyIdentity(item)) || 1;
                return <div key={virtualItem.key} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${virtualItem.size}px`, transform: `translateY(${virtualItem.start}px)` }}>
                  <article className="flex h-full flex-wrap items-center justify-between gap-4 p-4 transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{item.query}</div>
                        <span className="rounded-full bg-slate-100 dark:bg-slate-700/60 px-2 py-1 text-[9px] font-bold uppercase tracking-[.08em] text-slate-500 dark:text-slate-400">{statusLabels[item.status]}</span>
                        {repeats > 1 && <span className="rounded-full bg-blue-50 dark:bg-blue-900/30 px-2 py-1 text-[9px] font-bold text-blue-700 dark:text-blue-300">consultada {repeats}x</span>}
                      </div>
                      {item.resultCode ? (
                        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <strong className="text-lg text-[#1d4f91] dark:text-blue-400">{item.resultCode}</strong>
                          <span className="text-xs text-slate-500 dark:text-slate-400">{item.resultLabel || 'Peça'} · {item.resultModel || 'modelo não informado'}{item.resultPnc ? ` · PNC ${item.resultPnc}` : ''}</span>
                        </div>
                      ) : <div className="mt-2 text-xs text-slate-400">A consulta não gerou um código de peça.</div>}
                      <div className="mt-1 text-[10px] text-slate-400">{fmtDate(item.createdAt)}{item.pnc ? ` · PNC usado ${item.pnc}` : ''}{item.sourceFilename ? ` · ${item.sourceFilename}` : ''}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {item.resultCode && <button type="button" onClick={() => void copyCode(item.resultCode!)} className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/60 px-3 py-2 text-xs font-semibold text-[#1d4f91] dark:text-blue-300 transition hover:border-blue-200 dark:hover:border-blue-500/50 hover:bg-blue-50 dark:hover:bg-blue-500/10">Copiar código</button>}
                      {item.resultCode && <button type="button" onClick={() => onSearch(item.resultCode!)} className="rounded-xl border border-blue-200 dark:border-blue-600 bg-white dark:bg-slate-800/60 px-3 py-2 text-xs font-semibold text-[#1d4f91] dark:text-blue-300 transition hover:bg-blue-50 dark:hover:bg-blue-500/10">Consultar código</button>}
                      <button type="button" onClick={() => onSearch(replayQuery(item))} className="cv-primary px-3 py-2 text-xs font-semibold">Retomar contexto</button>
                    </div>
                  </article>
                </div>;
              })}
            </div>
            {!filtered.length && (
              <div className="p-5">
                <EmptyState title={filter || statusFilter !== 'ALL' ? 'Nenhum registro encontrado' : 'Histórico vazio'} description={filter || statusFilter !== 'ALL' ? 'Ajuste o texto ou o filtro de situação.' : 'As pesquisas feitas pelo Assistente IA aparecerão aqui.'} />
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

type FavoriteKindFilter = 'ALL' | FavoriteItem['kind'];

export function FavoritesPanel({ onSearch }: { onSearch: (query: string) => void }) {
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [filter, setFilter] = useState('');
  const [kindFilter, setKindFilter] = useState<FavoriteKindFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [pdf, setPdf] = useState<{ url: string; title: string; page: number | null } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiJson<{ favorites: FavoriteItem[] }>('/api/favorites');
      setItems(data.favorites);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar favoritos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void apiJson<{ favorites: FavoriteItem[] }>('/api/favorites')
      .then(data => { if (active) setItems(data.favorites); })
      .catch(loadError => { if (active) setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar favoritos.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!pdf) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPdf(null);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [pdf]);

  const remove = async (id: string) => {
    setRemovingId(id);
    setError('');
    try {
      await json(await api(`/api/favorites/${id}`, { method: 'DELETE' }));
      setItems(current => current.filter(item => item.id !== id));
      toast.success('Item removido dos favoritos.');
    } catch (removeError) {
      const msg = removeError instanceof Error ? removeError.message : 'Não foi possível remover o favorito.';
      setError(msg);
      toast.error(msg);
    } finally {
      setRemovingId(null);
    }
  };

  const openCatalog = async (item: FavoriteItem) => {
    if (!item.documentId) return;
    setError('');
    try {
      const data = await apiJson<{ url: string }>(`/api/documents/${item.documentId}/access?mode=view`);
      setPdf({ url: data.url, title: item.sourceFilename || item.label, page: item.page ?? null });
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'Não foi possível abrir o catálogo.');
    }
  };

  const normalizedFilter = filter.trim().toLowerCase();
  const filteredItems = useMemo(() => items.filter(item => (
    (kindFilter === 'ALL' || item.kind === kindFilter)
    && [item.label, item.reference, item.model, item.pnc, item.sourceFilename, item.section, item.position]
      .some(value => value?.toLowerCase().includes(normalizedFilter))
  )), [items, kindFilter, normalizedFilter]);
  const partCount = items.filter(item => item.kind === 'PART').length;
  const documentCount = items.length - partCount;

  return (
    <section>
      <p className="cv-kicker">Atalhos pessoais</p>
      <h1 className="cv-page-title">Favoritos operacionais</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Mantenha peças e catálogos recorrentes prontos para copiar, consultar ou abrir diretamente na fonte técnica.</p>

      {error && (
        <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/30 p-3 text-sm text-rose-700 dark:text-rose-300">
          <span>{error}</span>
          <button type="button" onClick={() => void load()} className="rounded-lg border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold">Recarregar</button>
        </div>
      )}

      <div className="cv-surface mt-6 rounded-[22px] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="favorite-filter" className="sr-only">Filtrar favoritos</label>
          <input id="favorite-filter" value={filter} onChange={event => setFilter(event.target.value)} placeholder="Filtrar por peça, código, modelo, PNC, seção ou catálogo" className="cv-field min-w-[220px] flex-1 text-sm" />
          {filter && <button type="button" onClick={() => setFilter('')} className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 transition hover:bg-slate-100 dark:bg-slate-700">Limpar</button>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {([['ALL', `Todos · ${items.length}`], ['PART', `Peças · ${partCount}`], ['DOCUMENT', `Catálogos · ${documentCount}`]] as Array<[FavoriteKindFilter,string]>).map(([value,label]) => <button key={value} type="button" onClick={() => setKindFilter(value)} className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${kindFilter === value ? 'border-slate-800 bg-slate-900 text-white' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:border-slate-600'}`}>{label}</button>)}
        </div>
      </div>

      {loading ? <div className="cv-surface mt-4 rounded-[22px]"><LoadingCards /></div> : (
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredItems.map(item => (
            <article key={item.id} className="cv-surface flex min-h-[240px] flex-col rounded-[22px] p-5 transition hover:-translate-y-0.5 hover:border-blue-200 dark:border-blue-600 hover:shadow-lg">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] font-bold uppercase tracking-[.12em] text-[#1d4f91] dark:text-blue-300">{item.kind === 'PART' ? 'Peça' : 'Catálogo'}</div>
                <span className="text-amber-400" aria-hidden="true">★</span>
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">{item.label}</div>
              <div className="mt-2 break-all text-xl font-semibold text-[#1d4f91] dark:text-blue-300">{item.reference || item.model || 'Catálogo'}</div>
              <div className="mt-1 text-xs text-slate-400">{item.model || '—'} · PNC {item.pnc || '—'}</div>
              {item.kind === 'PART' && (item.section || item.position || item.page) && <div className="mt-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 text-[11px] leading-5 text-slate-500 dark:text-slate-400">{item.section ? `Vista: ${item.section}` : 'Vista não informada'}{item.position ? ` · posição ${item.position}` : ''}{item.page ? ` · pág. ${item.page}` : ''}</div>}
              {item.sourceFilename && <div className="mt-2 truncate text-[10px] text-slate-400" title={item.sourceFilename}>{item.sourceFilename}</div>}
              <div className="mt-auto flex flex-wrap gap-2 pt-5">
                {item.reference && <button type="button" onClick={() => void copyCode(item.reference!)} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-[#1d4f91] dark:text-blue-300 transition hover:border-blue-200 dark:border-blue-600 hover:bg-blue-50 dark:bg-[#123867]">Copiar código</button>}
                {item.reference && <button type="button" onClick={() => onSearch(item.reference!)} className="cv-primary px-3 py-2 text-xs font-semibold">Consultar</button>}
                {item.documentId && <button type="button" onClick={() => void openCatalog(item)} className="rounded-xl border border-blue-200 dark:border-blue-600 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-[#1d4f91] dark:text-blue-300 transition hover:bg-blue-50 dark:bg-[#123867]">{item.page ? 'Abrir na página' : 'Abrir catálogo'}</button>}
                <button type="button" onClick={() => void remove(item.id)} disabled={removingId === item.id} className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-400 transition hover:bg-rose-50 dark:bg-rose-900/30 hover:text-rose-600 disabled:opacity-50">{removingId === item.id ? 'Removendo…' : 'Remover'}</button>
              </div>
            </article>
          ))}
          {!filteredItems.length && <EmptyState title={items.length ? 'Nenhum favorito neste filtro' : 'Nenhum favorito'} description={items.length ? 'Tente outro texto ou selecione Todos.' : 'Favorite uma peça na tela de detalhes ou um catálogo na biblioteca.'} />}
        </div>
      )}

      {pdf && (
        <div className="fixed inset-0 z-[90] bg-slate-950/90 p-3 md:p-6">
          <div role="dialog" aria-modal="true" aria-labelledby="favorite-pdf-title" className="mx-auto flex h-full max-w-[1500px] flex-col overflow-hidden rounded-[22px] bg-white dark:bg-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-4 py-3">
              <div><div id="favorite-pdf-title" className="text-sm font-semibold">{pdf.title}</div><div className="text-xs text-slate-400">Visualizador técnico{pdf.page ? ` · página ${pdf.page}` : ''}</div></div>
              <div className="flex gap-2">
                <a href={pdfPageUrl(pdf.url, pdf.page)} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-[#1d4f91] dark:text-blue-300">Nova aba</a>
                <button type="button" autoFocus onClick={() => setPdf(null)} className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm">Fechar <span className="ml-1 text-[10px] text-slate-400">Esc</span></button>
              </div>
            </div>
            <iframe title={pdf.title} src={pdfPageUrl(pdf.url, pdf.page)} className="h-full w-full border-0" />
          </div>
        </div>
      )}
    </section>
  );
}
