import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, apiJson, fmtDate, json } from '../lib';
import type { FavoriteItem, SearchHistoryItem, SearchStatus } from '../types';

const statusLabels: Record<SearchStatus, string> = {
  FOUND: 'Peça encontrada',
  PNC_REQUIRED: 'PNC solicitado',
  MODEL_REQUIRED: 'Modelo solicitado',
  PART_REQUIRED: 'Peça solicitada',
  AMBIGUOUS: 'Mais de uma opção',
  NOT_FOUND: 'Não encontrada',
};

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="cv-empty">
      <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-400" aria-hidden="true">⌕</div>
      <div className="text-sm font-semibold text-slate-700">{title}</div>
      <div className="mt-1 text-xs leading-5 text-slate-400">{description}</div>
    </div>
  );
}

function useCopyNotice() {
  const [notice, setNotice] = useState('');
  const timer = useRef<number | null>(null);

  const copy = useCallback(async (value: string) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`Código ${value} copiado.`);
    } catch {
      setNotice(`Código: ${value}`);
    }
    timer.current = window.setTimeout(() => setNotice(''), 1800);
  }, []);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  return { notice, copy };
}

function Toast({ message }: { message: string }) {
  if (!message) return null;
  return <div role="status" aria-live="polite" className="fixed right-5 top-20 z-[100] rounded-xl bg-slate-950 px-4 py-2.5 text-sm text-white shadow-xl">{message}</div>;
}

function LoadingCards() {
  return (
    <div className="grid gap-3 p-4" aria-hidden="true">
      {[0, 1, 2].map(item => (
        <div key={item} className="animate-pulse rounded-2xl border border-slate-100 p-4">
          <div className="h-3 w-1/3 rounded-full bg-slate-200" />
          <div className="mt-3 h-3 w-2/3 rounded-full bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

export function HistoryPanel({ onSearch }: { onSearch: (query: string) => void }) {
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { notice, copy } = useCopyNotice();

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

  const normalizedFilter = filter.trim().toLowerCase();
  const filtered = useMemo(() => history.filter(item => [
    item.query,
    item.resultCode,
    item.resultLabel,
    item.resultModel,
    item.resultPnc,
  ].some(value => value?.toLowerCase().includes(normalizedFilter))), [history, normalizedFilter]);

  return (
    <section>
      <Toast message={notice} />
      <p className="cv-kicker">Continuidade do atendimento</p>
      <h1 className="cv-page-title">Histórico de pesquisas</h1>
      <p className="mt-2 text-sm text-slate-500">Retome uma consulta, copie o código ou filtre os atendimentos anteriores.</p>

      {error && (
        <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <span>{error}</span>
          <button type="button" onClick={load} className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold">Tentar novamente</button>
        </div>
      )}

      <div className="cv-surface mt-6 rounded-[22px] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="history-filter" className="sr-only">Filtrar histórico</label>
          <input id="history-filter" value={filter} onChange={event => setFilter(event.target.value)} placeholder="Filtrar por consulta, código, modelo ou PNC" className="cv-field min-w-[220px] flex-1 text-sm" />
          {filter && <button type="button" onClick={() => setFilter('')} className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100">Limpar filtro</button>}
          <span className="cv-soft-badge">{filtered.length} {filtered.length === 1 ? 'registro' : 'registros'}</span>
        </div>
      </div>

      <div className="cv-surface mt-4 overflow-hidden rounded-[22px]" aria-busy={loading}>
        {loading ? <LoadingCards /> : (
          <div className="divide-y divide-slate-100">
            {filtered.map(item => (
              <article key={item.id} className="flex flex-wrap items-center justify-between gap-4 p-4 transition hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold text-slate-800">{item.query}</div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold uppercase tracking-[.08em] text-slate-500">{statusLabels[item.status]}</span>
                  </div>
                  {item.resultCode ? (
                    <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <strong className="text-lg text-[#1d4f91]">{item.resultCode}</strong>
                      <span className="text-xs text-slate-500">{item.resultLabel || 'Peça'} · {item.resultModel || 'modelo não informado'}{item.resultPnc ? ` · PNC ${item.resultPnc}` : ''}</span>
                    </div>
                  ) : <div className="mt-2 text-xs text-slate-400">A consulta não gerou um código de peça.</div>}
                  <div className="mt-1 text-[10px] text-slate-400">{fmtDate(item.createdAt)}{item.sourceFilename ? ` · ${item.sourceFilename}` : ''}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.resultCode && <button type="button" onClick={() => void copy(item.resultCode!)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#1d4f91] transition hover:border-blue-200 hover:bg-blue-50">Copiar código</button>}
                  <button type="button" onClick={() => onSearch(item.resultCode || item.query)} className="cv-primary px-3 py-2 text-xs font-semibold">Pesquisar novamente</button>
                </div>
              </article>
            ))}
            {!filtered.length && (
              <div className="p-5">
                <EmptyState title={filter ? 'Nenhum registro encontrado' : 'Histórico vazio'} description={filter ? 'Tente outro código, modelo ou PNC.' : 'As pesquisas feitas pelo Assistente IA aparecerão aqui.'} />
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export function FavoritesPanel({ onSearch }: { onSearch: (query: string) => void }) {
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [pdf, setPdf] = useState<{ url: string; title: string } | null>(null);
  const { notice, copy } = useCopyNotice();

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
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Não foi possível remover o favorito.');
    } finally {
      setRemovingId(null);
    }
  };

  const openCatalog = async (item: FavoriteItem) => {
    if (!item.documentId) return;
    setError('');
    try {
      const data = await apiJson<{ url: string }>(`/api/documents/${item.documentId}/access?mode=view`);
      setPdf({ url: data.url, title: item.label });
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'Não foi possível abrir o catálogo.');
    }
  };

  return (
    <section>
      <Toast message={notice} />
      <p className="cv-kicker">Atalhos pessoais</p>
      <h1 className="cv-page-title">Favoritos</h1>
      <p className="mt-2 text-sm text-slate-500">Consulte ou copie em um clique as peças usadas com frequência.</p>

      {error && (
        <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <span>{error}</span>
          <button type="button" onClick={() => void load()} className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold">Recarregar</button>
        </div>
      )}

      {loading ? <div className="cv-surface mt-6 rounded-[22px]"><LoadingCards /></div> : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map(item => (
            <article key={item.id} className="cv-surface flex min-h-[220px] flex-col rounded-[22px] p-5 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] font-bold uppercase tracking-[.12em] text-[#1d4f91]">{item.kind === 'PART' ? 'Peça' : 'Catálogo'}</div>
                <span className="text-amber-400" aria-hidden="true">★</span>
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-800">{item.label}</div>
              <div className="mt-2 break-all text-xl font-semibold text-[#1d4f91]">{item.reference || item.model || 'Catálogo'}</div>
              <div className="mt-1 text-xs text-slate-400">{item.model || '—'} · PNC {item.pnc || '—'}</div>
              <div className="mt-auto flex flex-wrap gap-2 pt-5">
                {item.reference && <button type="button" onClick={() => void copy(item.reference!)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#1d4f91] transition hover:border-blue-200 hover:bg-blue-50">Copiar código</button>}
                {item.reference && <button type="button" onClick={() => onSearch(item.reference!)} className="cv-primary px-3 py-2 text-xs font-semibold">Consultar</button>}
                {item.documentId && <button type="button" onClick={() => void openCatalog(item)} className="cv-primary px-3 py-2 text-xs font-semibold">Abrir catálogo</button>}
                <button type="button" onClick={() => void remove(item.id)} disabled={removingId === item.id} className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50">{removingId === item.id ? 'Removendo…' : 'Remover'}</button>
              </div>
            </article>
          ))}
          {!items.length && <EmptyState title="Nenhum favorito" description="Favorite uma peça na tela de detalhes para encontrá-la em um clique." />}
        </div>
      )}

      {pdf && (
        <div className="fixed inset-0 z-[90] bg-slate-950/90 p-3 md:p-6">
          <div role="dialog" aria-modal="true" aria-labelledby="favorite-pdf-title" className="mx-auto flex h-full max-w-[1500px] flex-col overflow-hidden rounded-[22px] bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div><div id="favorite-pdf-title" className="text-sm font-semibold">{pdf.title}</div><div className="text-xs text-slate-400">Visualizador técnico</div></div>
              <div className="flex gap-2">
                <a href={pdf.url} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-[#1d4f91]">Nova aba</a>
                <button type="button" autoFocus onClick={() => setPdf(null)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">Fechar <span className="ml-1 text-[10px] text-slate-400">Esc</span></button>
              </div>
            </div>
            <iframe title={pdf.title} src={pdf.url} className="h-full w-full border-0" />
          </div>
        </div>
      )}
    </section>
  );
}
