import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api, apiJson, formatHusqvarnaPartNumber, json } from '../lib';
import type { FavoriteItem } from '../types';
import { useQuoteCart } from '../context/QuoteCartContext';

type KindFilter = 'ALL' | FavoriteItem['kind'];

function exportFavoritesCsv(items: FavoriteItem[]) {
  const header = ['Tipo', 'Nome', 'Código', 'Modelo', 'PNC', 'Catálogo', 'Seção', 'Posição'];
  const rows = items.map(item => [
    item.kind === 'PART' ? 'Peça' : 'Catálogo',
    `"${(item.label || '').replace(/"/g, '""')}"`,
    item.reference || '',
    `"${(item.model || '').replace(/"/g, '""')}"`,
    `"${(item.pnc || '').replace(/"/g, '""')}"`,
    `"${(item.sourceFilename || '').replace(/"/g, '""')}"`,
    `"${(item.section || '').replace(/"/g, '""')}"`,
    `"${(item.position || '').replace(/"/g, '""')}"`,
  ]);
  const blob = new Blob(['\uFEFF' + [header.join(';'), ...rows.map(row => row.join(';'))].join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `cognivault_favoritos_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function FavoritesWorkspace({ onSearch }: { onSearch: (query: string) => void }) {
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [filter, setFilter] = useState('');
  const [kind, setKind] = useState<KindFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pdf, setPdf] = useState<{ url: string; title: string; page: number | null } | null>(null);
  const quoteCart = useQuoteCart();

  const load = async () => {
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
  };

  useEffect(() => { void load(); }, []);

  const normalized = filter.trim().toLocaleLowerCase('pt-BR');
  const filtered = useMemo(() => items.filter(item => {
    if (kind !== 'ALL' && item.kind !== kind) return false;
    if (!normalized) return true;
    return [item.label, item.reference, item.model, item.pnc, item.sourceFilename, item.section, item.position]
      .some(value => value?.toLocaleLowerCase('pt-BR').includes(normalized));
  }), [items, kind, normalized]);

  const remove = async (id: string) => {
    try {
      await json(await api(`/api/favorites/${id}`, { method: 'DELETE' }));
      setItems(current => current.filter(item => item.id !== id));
      toast.success('Favorito removido.');
    } catch (removeError) {
      toast.error(removeError instanceof Error ? removeError.message : 'Não foi possível remover o favorito.');
    }
  };

  const openCatalog = async (item: FavoriteItem) => {
    if (!item.documentId) return;
    try {
      const data = await apiJson<{ url: string }>(`/api/documents/${item.documentId}/access?mode=view`);
      setPdf({ url: data.url, title: item.sourceFilename || item.label, page: item.page ?? null });
    } catch (openError) {
      toast.error(openError instanceof Error ? openError.message : 'Não foi possível abrir o catálogo.');
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`Código ${value} copiado.`);
    } catch {
      toast.info(`Código: ${value}`);
    }
  };

  return (
    <section className="mx-auto max-w-[1400px] space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[.15em] text-[#1d4f91] dark:text-blue-300">Acesso rápido</div>
          <h1 className="mt-1 text-2xl font-black tracking-[-.03em] text-slate-950 dark:text-white">Favoritos</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Peças e catálogos que você decidiu manter à mão.</p>
        </div>
        {filtered.length > 0 && <button type="button" onClick={() => exportFavoritesCsv(filtered)} className="self-start rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-500 transition hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-300">Exportar CSV</button>}
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
          <input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Peça, código, modelo, PNC ou catálogo…" className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-semibold outline-none transition focus:border-[#1d4f91] focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
        </div>
        <select value={kind} onChange={event => setKind(event.target.value as KindFilter)} className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          <option value="ALL">Todos</option>
          <option value="PART">Peças</option>
          <option value="DOCUMENT">Catálogos</option>
        </select>
        <div className="px-1 text-xs font-semibold text-slate-400">{filtered.length} itens</div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="hidden grid-cols-[90px_minmax(220px,1.25fr)_150px_minmax(170px,.8fr)_170px] gap-4 border-b border-slate-100 px-4 py-2.5 text-[10px] font-black uppercase tracking-[.1em] text-slate-400 lg:grid dark:border-slate-800">
          <span>Tipo</span><span>Item</span><span>Modelo / PNC</span><span>Origem</span><span className="text-right">Ações</span>
        </div>

        {loading ? <div className="space-y-1 p-3">{[0,1,2,3].map(item => <div key={item} className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />)}</div> : filtered.length ? filtered.map(item => {
          const code = item.reference ? formatHusqvarnaPartNumber(item.reference) : '';
          const inCart = item.reference ? quoteCart.items.find(cartItem => cartItem.partNumber === item.reference) : undefined;
          return (
            <article key={item.id} className="grid gap-3 border-b border-slate-100 px-4 py-3.5 last:border-0 transition hover:bg-slate-50/80 lg:grid-cols-[90px_minmax(220px,1.25fr)_150px_minmax(170px,.8fr)_170px] lg:items-center dark:border-slate-800 dark:hover:bg-slate-800/45">
              <div className="text-[10px] font-black uppercase tracking-[.1em] text-slate-400">{item.kind === 'PART' ? 'Peça' : 'Catálogo'}</div>
              <div className="min-w-0">
                <div className="truncate text-sm font-black text-slate-900 dark:text-white">{item.label}</div>
                <div className="mt-1 truncate font-mono text-[11px] font-bold text-[#123867] dark:text-blue-300">{code || item.sourceFilename || '—'}</div>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{item.model || '—'}{item.pnc ? <><br /><span className="text-[11px] text-slate-400">PNC {item.pnc}</span></> : null}</div>
              <div className="min-w-0 truncate text-xs text-slate-400">{item.sourceFilename || item.section || '—'}</div>
              <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
                {item.reference && <button type="button" onClick={() => { quoteCart.addItem({ partNumber: item.reference!, name: item.label, model: item.model || 'Husqvarna', pnc: item.pnc || undefined, section: item.section || undefined, position: item.position || undefined }); toast.success(inCart ? 'Quantidade atualizada no orçamento.' : 'Peça adicionada ao orçamento.'); }} className="grid h-8 w-8 place-items-center rounded-lg text-sm font-black text-amber-600 transition hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/30" title="Adicionar ao orçamento">{inCart ? '✓' : '+'}</button>}
                {item.reference && <button type="button" onClick={() => void copy(code)} className="rounded-lg px-2.5 py-2 text-xs font-bold text-slate-400 transition hover:bg-slate-100 hover:text-[#1d4f91] dark:hover:bg-slate-800">Copiar</button>}
                {item.reference && <button type="button" onClick={() => onSearch(item.reference!)} className="rounded-lg bg-[#123867] px-3 py-2 text-xs font-black text-white transition hover:bg-[#0d2c52]">Consultar</button>}
                {item.documentId && <button type="button" onClick={() => void openCatalog(item)} className="rounded-lg bg-[#123867] px-3 py-2 text-xs font-black text-white transition hover:bg-[#0d2c52]">Abrir</button>}
                <button type="button" onClick={() => void remove(item.id)} className="rounded-lg px-2.5 py-2 text-xs font-bold text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30">Remover</button>
              </div>
            </article>
          );
        }) : <div className="px-5 py-12 text-center"><div className="text-sm font-bold text-slate-700 dark:text-slate-200">Nenhum favorito encontrado</div><p className="mt-1 text-xs text-slate-400">Favorite uma peça ou catálogo para acessá-lo rapidamente aqui.</p></div>}
      </div>

      {pdf && <div className="fixed inset-0 z-[90] bg-slate-950/90 p-3 md:p-5"><div className="mx-auto flex h-full max-w-[1500px] flex-col overflow-hidden rounded-2xl bg-white dark:bg-slate-900"><div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800"><div className="truncate text-sm font-black">{pdf.title}</div><button type="button" onClick={() => setPdf(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold dark:border-slate-700">Fechar</button></div><iframe title={pdf.title} src={`${pdf.url}${pdf.page ? `#page=${pdf.page}` : ''}`} className="h-full w-full border-0" /></div></div>}
    </section>
  );
}
