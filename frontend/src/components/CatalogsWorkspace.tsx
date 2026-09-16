import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiJson, formatEngineOrCatalogModel } from '../lib';
import type { DocumentItem, FavoriteItem } from '../types';
import CatalogsPanel from './CatalogsPanel';

type CatalogData = { documents: DocumentItem[]; favorites: FavoriteItem[]; categories: string[] };

type Props = {
  admin: boolean;
  onQuality?: () => void;
  initialSearch?: string;
  onSearch?: (query: string) => void;
};

function clean(value: string | null | undefined) {
  const normalized = (value ?? '').trim();
  return normalized === 'null' || normalized === 'undefined' ? '' : normalized;
}

async function loadCatalogs(): Promise<CatalogData> {
  const [documentsData, favoritesData] = await Promise.all([
    apiJson<{ documents: DocumentItem[]; categories: string[] }>('/api/documents'),
    apiJson<{ favorites: FavoriteItem[] }>('/api/favorites'),
  ]);
  return {
    documents: documentsData.documents,
    favorites: favoritesData.favorites,
    categories: documentsData.categories || [],
  };
}

function statusLabel(document: DocumentItem) {
  if (document.processingActive || document.status === 'PROCESSING' || document.status === 'PENDING') return 'Processando';
  if (document.status === 'FAILED') return 'Falhou';
  return 'Pronto';
}

function statusTone(document: DocumentItem) {
  if (document.processingActive || document.status === 'PROCESSING' || document.status === 'PENDING') return 'text-amber-700 dark:text-amber-300';
  if (document.status === 'FAILED') return 'text-rose-700 dark:text-rose-300';
  return 'text-emerald-700 dark:text-emerald-300';
}

function catalogPncs(document: DocumentItem) {
  return [...new Set([...(document.pncs || []), document.pnc || ''].map(value => value.trim()).filter(Boolean))];
}

export default function CatalogsWorkspace({ admin, onQuality, initialSearch, onSearch }: Props) {
  const [search, setSearch] = useState(() => clean(initialSearch));
  const [category, setCategory] = useState('ALL');
  const [managementOpen, setManagementOpen] = useState(false);
  const [pdf, setPdf] = useState<{ url: string; title: string } | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['catalog-workspace'],
    queryFn: loadCatalogs,
    refetchInterval: query => (query.state.data?.documents || []).some(document => document.processingActive || ['PENDING', 'PROCESSING'].includes(document.status)) ? 8000 : false,
  });

  if (managementOpen) {
    return (
      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <button type="button" onClick={() => setManagementOpen(false)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">← Voltar para catálogos</button>
          <span className="text-xs text-slate-400">Modo administração da biblioteca</span>
        </div>
        <CatalogsPanel admin={admin} onQuality={onQuality} initialSearch={initialSearch} onSearch={onSearch} />
      </section>
    );
  }

  const documents = (data?.documents || []).filter(document => !document.archivedAt);
  const categories = data?.categories || [];
  const favoritesByDocument = new Map((data?.favorites || []).filter(item => item.documentId).map(item => [item.documentId!, item]));
  const normalized = search.trim().toLocaleLowerCase('pt-BR');

  const filtered = useMemo(() => documents
    .filter(document => {
      if (category !== 'ALL' && document.category !== category) return false;
      if (!normalized) return true;
      const model = formatEngineOrCatalogModel(document.model, document.manufacturer, document.filename);
      const values = [document.filename, document.model, document.manufacturer, document.category, document.pnc, model, ...catalogPncs(document)];
      const applicationMatch = (document.applications || []).some(item => `${item.machineModel} ${item.machinePnc || ''} ${item.label}`.toLocaleLowerCase('pt-BR').includes(normalized));
      return applicationMatch || values.some(value => value?.toLocaleLowerCase('pt-BR').includes(normalized));
    })
    .sort((a, b) => {
      const nameA = formatEngineOrCatalogModel(a.model, a.manufacturer, a.filename) || a.filename;
      const nameB = formatEngineOrCatalogModel(b.model, b.manufacturer, b.filename) || b.filename;
      return nameA.localeCompare(nameB, 'pt-BR', { numeric: true, sensitivity: 'base' });
    }), [category, documents, normalized]);

  const access = async (document: DocumentItem) => {
    try {
      const response = await apiJson<{ url: string }>(`/api/documents/${document.id}/access?mode=view`);
      setPdf({ url: response.url, title: formatEngineOrCatalogModel(document.model, document.manufacturer, document.filename) || document.filename });
    } catch (accessError) {
      toast.error(accessError instanceof Error ? accessError.message : 'Não foi possível abrir o catálogo.');
    }
  };

  const toggleFavorite = async (document: DocumentItem) => {
    try {
      const current = favoritesByDocument.get(document.id);
      if (current) await apiJson(`/api/favorites/${current.id}`, { method: 'DELETE' });
      else await apiJson('/api/favorites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentId: document.id }) });
      await refetch();
      toast.success(current ? 'Catálogo removido dos favoritos.' : 'Catálogo adicionado aos favoritos.');
    } catch (favoriteError) {
      toast.error(favoriteError instanceof Error ? favoriteError.message : 'Não foi possível atualizar o favorito.');
    }
  };

  return (
    <section className="mx-auto max-w-[1400px] space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[.15em] text-[#1d4f91] dark:text-blue-300">Documentação técnica</div>
          <h1 className="mt-1 text-2xl font-black tracking-[-.03em] text-slate-950 dark:text-white">Catálogos</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Localize o modelo e abra a vista técnica sem navegar por categorias desnecessárias.</p>
        </div>
        {admin && <button type="button" onClick={() => setManagementOpen(true)} className="self-start rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-blue-300 hover:text-[#1d4f91] dark:border-slate-700 dark:text-slate-300">Gerenciar biblioteca</button>}
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:flex-row md:items-center">
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Modelo, arquivo, PNC ou aplicação…" className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-semibold outline-none transition focus:border-[#1d4f91] focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
        </div>
        <select value={category} onChange={event => setCategory(event.target.value)} className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          <option value="ALL">Todas as categorias</option>
          {categories.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
        <div className="px-1 text-xs font-semibold text-slate-400">{filtered.length} {filtered.length === 1 ? 'catálogo' : 'catálogos'}</div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error instanceof Error ? error.message : 'Não foi possível carregar os catálogos.'}</div>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="hidden grid-cols-[minmax(220px,1.4fr)_minmax(170px,.8fr)_110px_100px_130px] gap-4 border-b border-slate-100 px-4 py-2.5 text-[10px] font-black uppercase tracking-[.1em] text-slate-400 lg:grid dark:border-slate-800">
          <span>Modelo / catálogo</span><span>Categoria</span><span>Peças</span><span>Status</span><span className="text-right">Ações</span>
        </div>

        {isLoading ? (
          <div className="space-y-1 p-3">{[0,1,2,3].map(item => <div key={item} className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />)}</div>
        ) : filtered.length ? filtered.map(document => {
          const title = formatEngineOrCatalogModel(document.model, document.manufacturer, document.filename) || document.model || document.filename;
          const pncs = catalogPncs(document);
          const favorite = favoritesByDocument.has(document.id);
          return (
            <article key={document.id} className="grid gap-3 border-b border-slate-100 px-4 py-3.5 last:border-0 transition hover:bg-slate-50/80 lg:grid-cols-[minmax(220px,1.4fr)_minmax(170px,.8fr)_110px_100px_130px] lg:items-center dark:border-slate-800 dark:hover:bg-slate-800/45">
              <div className="min-w-0">
                <div className="truncate text-sm font-black text-slate-900 dark:text-white">{title}</div>
                <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-slate-400">
                  <span className="truncate">{document.filename}</span>
                  {pncs.length > 0 && <span>PNC {pncs.slice(0, 2).join(' · ')}{pncs.length > 2 ? ` +${pncs.length - 2}` : ''}</span>}
                </div>
              </div>
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">{document.category || 'Sem categoria'}</div>
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">{document.partCount} peças</div>
              <div className={`text-xs font-bold ${statusTone(document)}`}>{statusLabel(document)}</div>
              <div className="flex items-center gap-2 lg:justify-end">
                {onSearch && document.status === 'COMPLETED' && <button type="button" onClick={() => onSearch(title)} className="rounded-lg px-2.5 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-[#1d4f91] dark:text-slate-300 dark:hover:bg-slate-800">Peças</button>}
                <button type="button" onClick={() => void toggleFavorite(document)} className="grid h-8 w-8 place-items-center rounded-lg text-base text-amber-400 transition hover:bg-amber-50 dark:hover:bg-amber-950/30" title={favorite ? 'Remover dos favoritos' : 'Favoritar'}>{favorite ? '★' : '☆'}</button>
                <button type="button" disabled={document.status !== 'COMPLETED'} onClick={() => void access(document)} className="rounded-lg bg-[#123867] px-3 py-2 text-xs font-black text-white transition hover:bg-[#0d2c52] disabled:cursor-not-allowed disabled:opacity-40">Abrir</button>
              </div>
            </article>
          );
        }) : (
          <div className="px-5 py-12 text-center"><div className="text-sm font-bold text-slate-700 dark:text-slate-200">Nenhum catálogo encontrado</div><p className="mt-1 text-xs text-slate-400">Ajuste o modelo, PNC ou categoria.</p></div>
        )}
      </div>

      {pdf && <div className="fixed inset-0 z-[90] bg-slate-950/90 p-3 md:p-5"><div className="mx-auto flex h-full max-w-[1500px] flex-col overflow-hidden rounded-2xl bg-white dark:bg-slate-900"><div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800"><div className="truncate text-sm font-black">{pdf.title}</div><button type="button" onClick={() => setPdf(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold dark:border-slate-700">Fechar</button></div><iframe title={pdf.title} src={pdf.url} className="h-full w-full border-0" /></div></div>}
    </section>
  );
}
