import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiJson, formatEngineOrCatalogModel } from '../lib';
import type { DocumentItem, FavoriteItem } from '../types';
import CatalogsPanel from './CatalogsPanel';

type CatalogData = { documents: DocumentItem[]; favorites: FavoriteItem[]; categories: string[] };

/**
 * Catálogo de peças Kawasaki: abrir + copiar o modelo.
 *
 * **Não é integração, e não pode ser.** Medido: a lista de peças da Kawasaki
 * vive no ARI PartStream com uma app key do site deles, e a página do
 * localizador roda reCAPTCHA. O `/manuals` público tem só manual do
 * proprietário, por série, e a própria página manda procurar o revendedor para
 * o manual de serviço. Link profundo também não existe: a URL de um conjunto
 * carrega dois GUIDs, e abrir só com o modelo cai na busca genérica.
 *
 * Então é o mesmo padrão já decidido para o Portal Parceiro: abre a busca
 * oficial e o atendente cola o modelo. O botão de copiar existe porque o
 * modelo é série+spec da plaqueta (`FX921V-ES06`) e o autocompletar da
 * Kawasaki só reconhece com os dois juntos — digitar errado ali devolve nada.
 */
function KawasakiPartsLink({ model, url }: { model: string; url: string }) {
  return (
    <span className="mt-1 inline-flex flex-wrap items-center gap-1">
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        title="Abrir o catálogo oficial de peças da Kawasaki. Cole o modelo no campo Model e CLIQUE na opção que aparecer."
        className="cv-touch-target inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2 text-[10px] font-bold text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
      >
        ⚙ Catálogo Kawasaki ↗
      </a>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(model).then(
            () => toast.success(`Modelo ${model} copiado. Cole no campo Model e clique na opção.`),
            () => toast.error('Não foi possível copiar. Anote o modelo: ' + model),
          );
        }}
        title="Copiar o modelo para colar na busca da Kawasaki"
        className="cv-touch-target inline-flex items-center gap-1 rounded border border-ink-200 bg-white px-2 font-mono text-[10px] font-bold text-ink-700 transition hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200"
      >
        {model} ⧉
      </button>
    </span>
  );
}

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

  const documents = (data?.documents || []).filter(document => !document.archivedAt);
  const categories = data?.categories || [];
  const favoritesByDocument = new Map((data?.favorites || []).filter(item => item.documentId).map(item => [item.documentId!, item]));
  const normalized = search.trim().toLocaleLowerCase('pt-BR');

  const filtered = documents
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
    });

  if (managementOpen) {
    return (
      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <button type="button" onClick={() => setManagementOpen(false)} className="rounded-lg border border-ink-200 px-3 py-2 text-xs font-bold text-ink-600 transition hover:bg-ink-50 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800">← Voltar para catálogos</button>
          <span className="text-xs text-ink-500 dark:text-ink-400">Modo administração da biblioteca</span>
        </div>
        <CatalogsPanel admin={admin} onQuality={onQuality} initialSearch={initialSearch} onSearch={onSearch} />
      </section>
    );
  }

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
          <div className="text-[10px] font-black uppercase tracking-[.15em] text-brand-600 dark:text-brand-300">Documentação técnica</div>
          <h1 className="mt-1 text-2xl font-black tracking-[-.03em] text-ink-950 dark:text-white">Catálogos</h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">Localize o modelo e abra a vista técnica sem navegar por categorias desnecessárias.</p>
        </div>
        {admin && <button type="button" onClick={() => setManagementOpen(true)} className="self-start rounded-lg border border-ink-200 px-3 py-2 text-xs font-bold text-ink-600 transition hover:border-brand-300 hover:text-brand-600 dark:border-ink-700 dark:text-ink-300">Gerenciar biblioteca</button>}
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-ink-200 bg-white p-3 shadow-sm dark:border-ink-800 dark:bg-ink-900 md:flex-row md:items-center">
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500 dark:text-ink-400">⌕</span>
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Modelo, arquivo, PNC ou aplicação…" className="h-11 w-full rounded-lg border border-ink-200 bg-ink-50 pl-10 pr-3 text-sm font-semibold outline-none transition focus:border-brand-600 focus:bg-white focus:ring-4 focus:ring-brand-500/10 dark:border-ink-700 dark:bg-ink-800 dark:text-white" />
        </div>
        <select value={category} onChange={event => setCategory(event.target.value)} className="h-11 rounded-lg border border-ink-200 bg-white px-3 text-xs font-bold text-ink-600 outline-none dark:border-ink-700 dark:bg-ink-800 dark:text-ink-300">
          <option value="ALL">Todas as categorias</option>
          {categories.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
        <div className="px-1 text-xs font-semibold text-ink-500 dark:text-ink-400">{filtered.length} {filtered.length === 1 ? 'catálogo' : 'catálogos'}</div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error instanceof Error ? error.message : 'Não foi possível carregar os catálogos.'}</div>}

      <div className="overflow-hidden rounded-xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
        <div className="hidden grid-cols-[minmax(220px,1.4fr)_minmax(170px,.8fr)_110px_100px_130px] gap-4 border-b border-ink-100 px-4 py-2.5 text-[10px] font-black uppercase tracking-[.1em] text-ink-500 dark:text-ink-400 lg:grid dark:border-ink-800">
          <span>Modelo / catálogo</span><span>Categoria</span><span>Peças</span><span>Status</span><span className="text-right">Ações</span>
        </div>

        {isLoading ? (
          <div className="space-y-1 p-3">{[0,1,2,3].map(item => <div key={item} className="h-16 animate-pulse rounded-lg bg-ink-100 dark:bg-ink-800" />)}</div>
        ) : filtered.length ? filtered.map(document => {
          const title = formatEngineOrCatalogModel(document.model, document.manufacturer, document.filename) || document.model || document.filename;
          const pncs = catalogPncs(document);
          const favorite = favoritesByDocument.has(document.id);
          return (
            <article key={document.id} className="grid gap-3 border-b border-ink-100 px-4 py-3.5 last:border-0 transition hover:bg-ink-50/80 lg:grid-cols-[minmax(220px,1.4fr)_minmax(170px,.8fr)_110px_100px_130px] lg:items-center dark:border-ink-800 dark:hover:bg-ink-800/45">
              <div className="min-w-0">
                <div className="truncate text-sm font-black text-ink-900 dark:text-white">{title}</div>
                <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-ink-500 dark:text-ink-400">
                  <span className="truncate">{document.filename}</span>
                  {pncs.length > 0 && <span>PNC {pncs.slice(0, 2).join(' · ')}{pncs.length > 2 ? ` +${pncs.length - 2}` : ''}</span>}
                </div>
                {/* Abre a LISTA DE PEÇAS do motor, não a busca de manuais.
                    O link antigo apontava para a página de resultados da Briggs,
                    onde os dois PARTS MANUAL ficam no fim de 16 itens quase
                    idênticos — o atendente abria PDF errado até achar. A rota do
                    servidor resolve pela API da Briggs e manda o inglês quando
                    existe. */}
                {document.briggsEngineModel ? (
                  <span className="mt-1 inline-flex flex-wrap items-center gap-1">
                    <a
                      href={`/api/briggs/parts-manuals/open?model=${encodeURIComponent(document.briggsEngineModel)}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      title={`Abrir a lista de peças oficial do motor ${document.briggsEngineModel} — inglês quando a Briggs publica; senão, o idioma disponível`}
                      className="cv-touch-target inline-flex items-center gap-1 rounded border border-red-300 bg-red-100 px-2 text-[10px] font-bold text-red-800 transition hover:bg-red-200 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-900/50"
                    >
                      📕 Lista de peças Briggs ↗
                    </a>
                    {document.briggsManualsUrl && (
                      <a
                        href={document.briggsManualsUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        title="Todos os manuais deste motor no site da Briggs (inclui manual do operador)"
                        className="cv-touch-target inline-flex items-center rounded border border-ink-200 bg-white px-2 text-[10px] font-semibold text-ink-600 transition hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300"
                      >
                        todos ↗
                      </a>
                    )}
                  </span>
                ) : document.briggsManualsUrl ? (
                  <a
                    href={document.briggsManualsUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    title="Abrir manuais oficiais no site da Briggs & Stratton"
                    className="mt-1 inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700 transition hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                  >
                    📕 Manuais Briggs ↗
                  </a>
                ) : document.kawasakiEngineModel && document.kawasakiPartsUrl ? (
                  <KawasakiPartsLink model={document.kawasakiEngineModel} url={document.kawasakiPartsUrl} />
                ) : null}
              </div>
              <div className="text-xs font-semibold text-ink-600 dark:text-ink-300">{document.category || 'Sem categoria'}</div>
              <div className="text-xs font-semibold text-ink-500 dark:text-ink-400">{document.partCount} peças</div>
              <div className={`text-xs font-bold ${statusTone(document)}`}>{statusLabel(document)}</div>
              <div className="flex items-center gap-2 lg:justify-end">
                {onSearch && document.status === 'COMPLETED' && <button type="button" onClick={() => onSearch(title)} className="rounded-lg px-2.5 py-2 text-xs font-bold text-ink-500 transition hover:bg-ink-100 hover:text-brand-600 dark:text-ink-300 dark:hover:bg-ink-800">Peças</button>}
                <button type="button" onClick={() => void toggleFavorite(document)} className="grid h-8 w-8 place-items-center rounded-lg text-base text-amber-400 transition hover:bg-amber-50 dark:hover:bg-amber-950/30" title={favorite ? 'Remover dos favoritos' : 'Favoritar'}>{favorite ? '★' : '☆'}</button>
                <button type="button" disabled={document.status !== 'COMPLETED'} onClick={() => void access(document)} className="rounded-lg bg-ink-900 px-3 py-2 text-xs font-black text-white transition hover:bg-ink-950 disabled:cursor-not-allowed disabled:opacity-40">Abrir</button>
              </div>
            </article>
          );
        }) : (
          <div className="px-5 py-12 text-center"><div className="text-sm font-bold text-ink-700 dark:text-ink-200">Nenhum catálogo encontrado</div><p className="mt-1 text-xs text-ink-500 dark:text-ink-400">Ajuste o modelo, PNC ou categoria.</p></div>
        )}
      </div>

      {pdf && <div className="fixed inset-0 z-[90] bg-ink-950/90 p-3 md:p-5"><div className="mx-auto flex h-full max-w-[1500px] flex-col overflow-hidden rounded-2xl bg-white dark:bg-ink-900"><div className="flex items-center justify-between border-b border-ink-200 px-4 py-3 dark:border-ink-800"><div className="truncate text-sm font-black">{pdf.title}</div><button type="button" onClick={() => setPdf(null)} className="rounded-lg border border-ink-200 px-3 py-2 text-xs font-bold dark:border-ink-700">Fechar</button></div><iframe title={pdf.title} src={pdf.url} className="h-full w-full border-0" /></div></div>}
    </section>
  );
}
