import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, apiJson, fmtDate, formatEngineOrCatalogModel, json } from '../lib';
import { toast } from 'sonner';
import type { DocumentItem, FavoriteItem } from '../types';
import BatchCatalogUploader from './BatchCatalogUploader';

type CatalogData = { documents: DocumentItem[]; favorites: FavoriteItem[]; categories: string[] };
type StatusFilter = 'ALL' | 'FAILED' | 'REVIEW' | 'READY';
export type CatalogSortMode = 'NAME_ASC' | 'NAME_DESC' | 'NEWEST' | 'PARTS_DESC';

const SORT_OPTIONS: Array<{
  value: CatalogSortMode;
  label: string;
  shortLabel: string;
  description: string;
  icon: string;
}> = [
  {
    value: 'NAME_ASC',
    label: 'Nome / Modelo (A-Z)',
    shortLabel: 'A-Z',
    description: 'Ordem alfabética padrão de balcão e oficina',
    icon: '🔤',
  },
  {
    value: 'NAME_DESC',
    label: 'Nome / Modelo (Z-A)',
    shortLabel: 'Z-A',
    description: 'Ordem alfabética decrescente (Z até A)',
    icon: '🔡',
  },
  {
    value: 'NEWEST',
    label: 'Mais recentes',
    shortLabel: 'Recentes',
    description: 'Últimos catálogos adicionados no topo',
    icon: '🕒',
  },
  {
    value: 'PARTS_DESC',
    label: 'Mais peças',
    shortLabel: 'Qtd Peças',
    description: 'Catálogos com maior volume de peças',
    icon: '📦',
  },
];

function getCatalogSortKey(document: DocumentItem): string {
  const model = formatEngineOrCatalogModel(document.model, document.manufacturer, document.filename) || document.model?.trim();
  if (model) return model;
  return document.filename.replace(/\.pdf$/i, '').trim();
}

function compareCatalogs(a: DocumentItem, b: DocumentItem, sortMode: CatalogSortMode): number {
  if (sortMode === 'PARTS_DESC') {
    const diff = (b.partCount || 0) - (a.partCount || 0);
    if (diff !== 0) return diff;
  }
  if (sortMode === 'NEWEST') {
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    const diff = dateB - dateA;
    if (diff !== 0) return diff;
  }
  const nameA = getCatalogSortKey(a);
  const nameB = getCatalogSortKey(b);
  const cmp = nameA.localeCompare(nameB, 'pt-BR', { numeric: true, sensitivity: 'base' });
  return sortMode === 'NAME_DESC' ? -cmp : cmp;
}

type FailureGuidance = {
  title: string;
  description: string;
  tone: string;
  retryLabel: string;
};

async function fetchCatalogData(admin: boolean, archived: boolean): Promise<CatalogData> {
  const [documentsData, favoritesData] = await Promise.all([
    apiJson<{ documents: DocumentItem[]; categories: string[] }>(`/api/documents${admin && archived ? '?includeArchived=true' : ''}`),
    apiJson<{ favorites: FavoriteItem[] }>('/api/favorites'),
  ]);
  return {
    documents: documentsData.documents,
    favorites: favoritesData.favorites,
    categories: documentsData.categories || [],
  };
}

function qualityLabel(document: DocumentItem): string {
  if (document.modelNeedsReview) return 'Modelo precisa de conferência';
  if (document.reviewStatus === 'REVIEWED') return `Revisado · ${document.healthScore || 0}/100`;
  if (document.reviewStatus === 'READY') return `Qualidade OK · ${document.healthScore || 0}/100`;
  if (document.reviewStatus === 'NEEDS_REVIEW') return `Revisar · ${document.healthScore || 0}/100`;
  return 'Qualidade pendente';
}

function qualityTone(document: DocumentItem): string {
  if (document.modelNeedsReview) return 'text-rose-700 dark:text-rose-300';
  if (document.reviewStatus === 'REVIEWED' || document.reviewStatus === 'READY') return 'text-emerald-700 dark:text-emerald-300';
  if (document.reviewStatus === 'NEEDS_REVIEW') return 'text-rose-700 dark:text-rose-300';
  return 'text-amber-700 dark:text-amber-300';
}

function extractionLabel(method?: string | null): string {
  if (!method) return '';
  if (method === 'HUSQVARNA_IPL_TEXT') return 'Parser local · sem IA';
  if (method.startsWith('GEMINI:')) return `IA · ${method.replace('GEMINI:', '')}`;
  return method;
}

function catalogPncs(document: DocumentItem): string[] {
  return [...new Set([...(document.pncs || []), document.pnc || ''].map(value => value.trim()).filter(Boolean))];
}

function categoryIcon(category: string): string {
  const lower = category.toLowerCase();
  if (lower.includes('roçadeira') || lower.includes('rocadeira')) return '🌿';
  if (lower.includes('motosserra')) return '🌲';
  if (lower.includes('soprador')) return '💨';
  if (lower.includes('cortador') || lower.includes('rider') || lower.includes('trator')) return '🚜';
  if (lower.includes('pulverizador') || lower.includes('atomizador')) return '🌾';
  if (lower.includes('podador')) return '✂️';
  return '⚙️';
}

function failureGuidance(document: DocumentItem): FailureGuidance | null {
  if (document.status !== 'FAILED') return null;
  const error = (document.processingError || '').toLowerCase();

  if (/cota|quota/.test(error) && /(ia|gemini)/.test(error)) {
    return {
      title: 'Cota da IA atingida',
      description: 'Este PDF precisa de leitura visual. Aguarde a renovação da cota antes de tentar novamente; se existir um IPL oficial com texto pesquisável, prefira esse arquivo.',
      tone: 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-300',
      retryLabel: 'Tentar após renovar cota',
    };
  }
  if (/leitura visual|tabela textual|texto pesquisável|texto pesquisavel/.test(error)) {
    return {
      title: 'PDF exige leitura visual',
      description: 'O parser local não encontrou uma tabela confiável. Tente novamente com IA disponível ou substitua por um IPL oficial com texto pesquisável.',
      tone: 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-300',
      retryLabel: 'Tentar leitura novamente',
    };
  }
  if (/fila|rabbit/.test(error)) {
    return {
      title: 'Fila temporariamente indisponível',
      description: 'O arquivo foi preservado. Tente novamente quando o processamento assíncrono estiver disponível.',
      tone: 'border-blue-200 dark:border-blue-600 bg-blue-50 dark:bg-[#123867] text-blue-900 dark:text-blue-300',
      retryLabel: 'Tentar novamente',
    };
  }
  if (/storage|armazen|supabase/.test(error)) {
    return {
      title: 'Falha de armazenamento',
      description: 'Confira o acesso ao storage antes de reprocessar. O sistema não deve substituir nem inventar conteúdo quando o PDF original não está acessível.',
      tone: 'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/30 text-rose-900 dark:text-rose-300',
      retryLabel: 'Tentar novamente',
    };
  }
  return {
    title: 'Falha de processamento',
    description: 'O PDF continua preservado. Consulte o detalhe abaixo e tente novamente somente depois de corrigir a causa indicada.',
    tone: 'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/30 text-rose-900 dark:text-rose-300',
    retryLabel: 'Tentar novamente',
  };
}

function matchesStatusFilter(document: DocumentItem, filter: StatusFilter): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'FAILED') return document.status === 'FAILED';
  if (filter === 'REVIEW') return document.status === 'COMPLETED' && (Boolean(document.modelNeedsReview) || document.reviewStatus === 'NEEDS_REVIEW' || document.reviewStatus === 'PENDING');
  return document.status === 'COMPLETED' && !document.modelNeedsReview && (document.reviewStatus === 'READY' || document.reviewStatus === 'REVIEWED');
}

export default function CatalogsPanel({
  admin,
  onQuality,
  initialSearch,
  onSearch,
}: {
  admin: boolean;
  onQuality?: () => void;
  initialSearch?: string;
  onSearch?: (query: string) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const cleanInitialSearch = (initialSearch && initialSearch.trim() !== 'null' && initialSearch.trim() !== 'undefined') ? initialSearch.trim() : '';
  const [search, setSearch] = useState(cleanInitialSearch);
  const [prevInitialSearch, setPrevInitialSearch] = useState(initialSearch);

  if (initialSearch !== prevInitialSearch) {
    setPrevInitialSearch(initialSearch);
    const clean = (initialSearch && initialSearch.trim() !== 'null' && initialSearch.trim() !== 'undefined') ? initialSearch.trim() : '';
    setSearch(clean);
  }

  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sortOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(event.target as Node)) {
        setSortOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSortOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [sortOpen]);

  const [archived, setArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [analyzingQuality, setAnalyzingQuality] = useState(false);
  const [actionError, setActionError] = useState('');
  const [pdf, setPdf] = useState<{ url: string; title: string } | null>(null);

  const [viewMode, setViewMode] = useState<'grid' | 'table'>(() => {
    try {
      return (localStorage.getItem('cognivault_catalog_view_mode') as 'grid' | 'table') || 'grid';
    } catch {
      return 'grid';
    }
  });

  const changeViewMode = (mode: 'grid' | 'table') => {
    setViewMode(mode);
    try {
      localStorage.setItem('cognivault_catalog_view_mode', mode);
    } catch {
      // Ignora erro local
    }
  };

  const [sortMode, setSortMode] = useState<CatalogSortMode>(() => {
    try {
      return (localStorage.getItem('cognivault_catalog_sort_mode') as CatalogSortMode) || 'NAME_ASC';
    } catch {
      return 'NAME_ASC';
    }
  });

  const changeSortMode = (mode: CatalogSortMode) => {
    setSortMode(mode);
    try {
      localStorage.setItem('cognivault_catalog_sort_mode', mode);
    } catch {
      // Ignora erro local
    }
  };

  const { data, refetch, error: loadError } = useQuery({
    queryKey: ['catalogs', admin, archived],
    queryFn: () => fetchCatalogData(admin, archived),
    refetchInterval: (query) => {
      const currentDocs = query.state.data?.documents || [];
      const processing = currentDocs.some(document => document.processingActive || ['PENDING', 'PROCESSING'].includes(document.status));
      return processing ? 8000 : false;
    },
  });

  const docs = useMemo(() => data?.documents || [], [data?.documents]);
  const favorites = useMemo(() => data?.favorites || [], [data?.favorites]);
  const categories = useMemo(() => data?.categories || [], [data?.categories]);

  const error = actionError || (loadError instanceof Error ? loadError.message : loadError ? 'Erro ao carregar catálogos.' : '');
  const setError = setActionError;

  const load = async () => { await refetch(); };

  const activeDocs = useMemo(() => docs.filter(document => archived || !document.archivedAt), [docs, archived]);
  const processing = activeDocs.some(document => document.processingActive || ['PENDING', 'PROCESSING'].includes(document.status));
  const qualityPending = useMemo(() => activeDocs.filter(document => document.status === 'COMPLETED' && (!document.qualityCheckedAt || document.reviewStatus === 'PENDING' || !document.healthScore)).length, [activeDocs]);
  const failedCount = useMemo(() => activeDocs.filter(document => document.status === 'FAILED').length, [activeDocs]);
  const reviewCount = useMemo(() => activeDocs.filter(document => document.status === 'COMPLETED' && (document.modelNeedsReview || document.reviewStatus === 'NEEDS_REVIEW' || document.reviewStatus === 'PENDING')).length, [activeDocs]);
  const readyCount = useMemo(() => activeDocs.filter(document => document.status === 'COMPLETED' && !document.modelNeedsReview && (document.reviewStatus === 'READY' || document.reviewStatus === 'REVIEWED')).length, [activeDocs]);
  
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const document of activeDocs) counts.set(document.category, (counts.get(document.category) || 0) + 1);
    return counts;
  }, [activeDocs]);

  const visibleCategories = useMemo(() => categories.filter(category => (categoryCounts.get(category) || 0) > 0), [categories, categoryCounts]);
  const effectiveCategoryFilter = categoryFilter === 'ALL' || categories.includes(categoryFilter) ? categoryFilter : 'ALL';
  const normalizedSearch = search.trim().toLowerCase();

  const filtered = useMemo(() => {
    const list = activeDocs.filter(document => {
      const matchesCategory = effectiveCategoryFilter === 'ALL'
        || document.category === effectiveCategoryFilter
        || (effectiveCategoryFilter === 'Giro zero' && document.applications?.some(a => /giro\s*zero/i.test(a.label || '')));
      if (!matchesStatusFilter(document, statusFilter) || !matchesCategory) return false;
      if (!normalizedSearch) return true;
      const formatted = formatEngineOrCatalogModel(document.model, document.manufacturer, document.filename);
      const baseMatch = [document.filename, document.manufacturer, document.model, formatted, document.pnc, document.category]
        .some(value => value?.toLowerCase().includes(normalizedSearch));
      const appMatch = (document.applications || []).some(a => a.machineModel.toLowerCase().includes(normalizedSearch) || a.label.toLowerCase().includes(normalizedSearch));
      const engineMatch = (document.engineApplications || []).some(e => e.engineModel.toLowerCase().includes(normalizedSearch) || e.label.toLowerCase().includes(normalizedSearch));
      return baseMatch || appMatch || engineMatch || catalogPncs(document).some(value => value.toLowerCase().includes(normalizedSearch));
    });
    return list.sort((a, b) => compareCatalogs(a, b, sortMode));
  }, [activeDocs, effectiveCategoryFilter, normalizedSearch, statusFilter, sortMode]);

  const favoritesByDocument = useMemo(() => new Map(favorites.filter(item => item.documentId).map(item => [item.documentId!, item])), [favorites]);

  const flash = (text: string) => { toast.success(text); };

  useEffect(() => {
    if (!pdf) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPdf(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pdf]);

  const access = async (id: string, mode: 'view' | 'download', title = 'Catálogo') => {
    try {
      const respData = await apiJson<{ url: string }>(`/api/documents/${id}/access?mode=${mode}`);
      if (mode === 'view') setPdf({ url: respData.url, title });
      else {
        const link = document.createElement('a');
        link.href = respData.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.click();
      }
    } catch (accessError) {
      const msg = accessError instanceof Error ? accessError.message : 'Não foi possível abrir o catálogo.';
      setError(msg);
      toast.error(msg);
    }
  };

  const analyzeQuality = async () => {
    setAnalyzingQuality(true);
    setError('');
    try {
      const response = await apiJson<{ message: string }>('/api/admin/quality/rebuild-knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 500 }),
      });
      await load();
      flash(response.message || 'Qualidade dos catálogos atualizada.');
    } catch (analyzeError) {
      setError(analyzeError instanceof Error ? analyzeError.message : 'Não foi possível analisar os catálogos.');
    } finally {
      setAnalyzingQuality(false);
    }
  };

  const toggleFavorite = async (document: DocumentItem) => {
    try {
      const current = favoritesByDocument.get(document.id);
      if (current) {
        await json(await api(`/api/favorites/${current.id}`, { method: 'DELETE' }));
        flash('Catálogo removido dos favoritos.');
      } else {
        await apiJson('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentId: document.id }),
        });
        flash('Catálogo adicionado aos favoritos.');
      }
      await load();
    } catch (favoriteError) {
      setError(favoriteError instanceof Error ? favoriteError.message : 'Não foi possível atualizar o favorito.');
    }
  };

  const setCategory = async (document: DocumentItem, category: string) => {
    if (category === document.category) return;
    setBusy(true);
    setError('');
    try {
      await apiJson(`/api/documents/${document.id}/category`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category }),
      });
      await load();
      flash(`Catálogo movido para ${category}.`);
    } catch (categoryError) {
      setError(categoryError instanceof Error ? categoryError.message : 'Não foi possível alterar a seção do catálogo.');
    } finally {
      setBusy(false);
    }
  };

  const action = async (id: string, actionName: 'archive' | 'restore' | 'reprocess') => {
    if (actionName === 'archive' && !window.confirm('Arquivar este catálogo? Ele deixará de aparecer nas buscas, mas poderá ser restaurado.')) return;
    setBusy(true);
    setError('');
    try {
      await json(await api(`/api/documents/${id}/${actionName}`, { method: 'POST' }));
      await load();
      flash(actionName === 'reprocess' ? 'Reprocessamento iniciado.' : actionName === 'archive' ? 'Catálogo arquivado.' : 'Catálogo restaurado.');
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Não foi possível concluir a ação.');
    } finally {
      setBusy(false);
    }
  };

  const removePdf = async (document: DocumentItem) => {
    if (!window.confirm(`Excluir definitivamente o PDF "${document.filename}"? O arquivo não poderá ser restaurado, mas o registro de auditoria será mantido.`)) return;
    setBusy(true);
    setError('');
    try {
      await json(await api(`/api/documents/${document.id}`, { method: 'DELETE' }));
      await load();
      flash('PDF excluído com segurança.');
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Não foi possível excluir o PDF.');
    } finally {
      setBusy(false);
    }
  };


  const badge = (document: DocumentItem) =>
    document.processingActive
      ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
      : document.status === 'COMPLETED'
        ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
        : document.status === 'FAILED'
          ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300'
          : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';

  const statusLabel = (document: DocumentItem) => {
    if (document.processingActive) {
      if (document.processingStage === 'QUEUED_REEXTRACT') return 'Na fila para reextração';
      if (document.processingStage === 'DOWNLOADING') return 'Preparando PDF';
      if (document.processingStage === 'EXTRACTING') return 'Extraindo peças';
      if (document.processingStage === 'AI_EXTRACTION') return 'Lendo páginas com IA';
      if (document.processingStage === 'INDEXING') return `Indexando ${document.processingCurrent || 0}/${document.processingTotal || 0}`;
      if (document.processingStage === 'RETRYING') return 'Nova tentativa agendada';
      return document.status === 'PENDING' ? 'Na fila' : 'Processando';
    }
    if (document.status === 'COMPLETED') return 'Pronto';
    return document.status === 'PROCESSING' ? 'Processando' : document.status === 'PENDING' ? 'Na fila' : 'Falhou';
  };

  const statusButtons: Array<[StatusFilter, string, number]> = [
    ['ALL', 'Todos', activeDocs.length],
    ['FAILED', 'Falhas', failedCount],
    ['REVIEW', 'Revisar', reviewCount],
    ['READY', 'Prontos', readyCount],
  ];

  return (
    <section>
      <div className="cv-page-heading">
        <div>
          <p className="cv-kicker">Biblioteca técnica</p>
          <h1 className="cv-page-title">Catálogos</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
            Consulte manuais de peças Husqvarna por família, abra vistas explodidas e consulte peças diretamente na fonte.
          </p>
        </div>
        {admin && (
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <input type="checkbox" checked={archived} onChange={event => setArchived(event.target.checked)} /> Mostrar arquivados
          </label>
        )}
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/30 p-3 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      <div className="mb-5 grid gap-3 rounded-[22px] border border-blue-200 dark:border-blue-600/80 bg-[linear-gradient(135deg,#eff6ff,#f8fbff)] p-4 text-xs leading-5 text-slate-600 dark:text-slate-400 md:grid-cols-[auto_1fr]">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#173f76] font-bold text-white">PNC</div>
        <div>
          <b className="text-slate-900 dark:text-slate-100">Modelo e PNC são dados diferentes.</b> O modelo identifica a família da máquina; o PNC identifica uma variante de produto. Um IPL pode não imprimir PNC, trazer um único PNC ou reunir vários.
        </div>
      </div>

      {admin && <BatchCatalogUploader onComplete={load} onNotice={flash} onError={setError} />}

      {admin && failedCount > 0 && !archived && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-900/30 p-4">
          <div>
            <div className="text-sm font-semibold text-amber-950">{failedCount} catálogo{failedCount === 1 ? ' precisa' : 's precisam'} de recuperação</div>
            <p className="mt-1 text-xs leading-5 text-amber-800 dark:text-amber-300">Veja o motivo classificado e a próxima ação recomendada antes de repetir o processamento.</p>
          </div>
          <button type="button" onClick={() => setStatusFilter('FAILED')} className="rounded-xl border border-amber-300 bg-white dark:bg-slate-800 px-4 py-2.5 text-xs font-semibold text-amber-900 dark:text-amber-300">
            Ver falhas
          </button>
        </div>
      )}

      {admin && qualityPending > 0 && !archived && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 dark:border-blue-600 bg-blue-50 dark:bg-[#123867]/60 p-4">
          <div>
            <div className="text-sm font-semibold text-blue-950">{qualityPending} catálogo{qualityPending === 1 ? ' ainda precisa' : 's ainda precisam'} da análise de qualidade</div>
            <p className="mt-1 text-xs leading-5 text-blue-800 dark:text-blue-300">A análise usa somente as peças já extraídas. Não consome cota do Gemini.</p>
          </div>
          <button type="button" disabled={analyzingQuality || processing} onClick={() => void analyzeQuality()} className="rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {analyzingQuality ? 'Atualizando…' : 'Atualizar diagnóstico'}
          </button>
        </div>
      )}

      {/* Biblioteca por Seção */}
      <div className="cv-surface mb-6 rounded-[22px] p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="font-semibold text-slate-800 dark:text-slate-200">Biblioteca por seção</div>
            <p className="mt-1 text-xs leading-5 text-slate-400">Classificação automática por tipo de máquina Husqvarna:</p>
          </div>
          <div className="text-xs font-medium text-slate-400">{activeDocs.length} catálogo{activeDocs.length === 1 ? '' : 's'}</div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          <button
            type="button"
            onClick={() => setCategoryFilter('ALL')}
            className={`rounded-2xl border px-4 py-3 text-left transition ${effectiveCategoryFilter === 'ALL' ? 'border-blue-700 bg-[#0d2348] text-white shadow-md' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:border-slate-600'}`}
          >
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <span>📚</span>
              <span>Todos</span>
            </div>
            <div className={`mt-1 text-xs ${effectiveCategoryFilter === 'ALL' ? 'text-blue-200' : 'text-slate-400'}`}>
              {activeDocs.length} catálogo{activeDocs.length === 1 ? '' : 's'}
            </div>
          </button>
          {visibleCategories.map(category => {
            const count = categoryCounts.get(category) || 0;
            const selected = effectiveCategoryFilter === category;
            const icon = categoryIcon(category);
            return (
              <button
                key={category}
                type="button"
                onClick={() => setCategoryFilter(category)}
                className={`rounded-2xl border px-4 py-3 text-left transition ${selected ? 'border-blue-700 bg-[#0d2348] text-white shadow-md' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:border-slate-600'}`}
              >
                <div className="flex items-center gap-1.5 text-sm font-semibold truncate">
                  <span>{icon}</span>
                  <span className="truncate">{category}</span>
                </div>
                <div className={`mt-1 text-xs ${selected ? 'text-blue-200' : 'text-slate-400'}`}>
                  {count} catálogo{count === 1 ? '' : 's'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Catalog View Container */}
      <div className="cv-surface overflow-hidden rounded-[22px]">
        {/* Filter bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-700 p-4">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <label htmlFor="catalog-search" className="sr-only">Buscar catálogos</label>
            <input
              id="catalog-search"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Buscar por modelo (ex.: 143RII, 120, 345FR), arquivo, PNC ou seção…"
              className="cv-field w-full max-w-xl text-sm"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="flex items-center rounded-xl px-2.5 sm:px-3 text-xs font-semibold text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:text-slate-300"
              >
                Limpar
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Sort Selector with Native Dark Theme Styling */}
            <div ref={sortRef} className="relative inline-block text-left">
              <button
                type="button"
                id="catalog-sort-menu-button"
                aria-haspopup="listbox"
                aria-expanded={sortOpen}
                onClick={() => setSortOpen(prev => !prev)}
                className="group flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-xs hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition active:scale-95 cursor-pointer"
                title="Ordenar catálogo por nome, data ou quantidade de peças"
              >
                <span className="flex items-center gap-1.5 text-slate-400 dark:text-slate-400 font-medium">
                  <svg className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500 transition-colors" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M2.24 6.8a.75.75 0 001.06-.04l1.95-2.1v8.59a.75.75 0 001.5 0V4.66l1.95 2.1a.75.75 0 101.1-1.02l-3.25-3.5a.75.75 0 00-1.1 0L2.2 5.74a.75.75 0 00.04 1.06zm8 6.4a.75.75 0 00-.04 1.06l3.25 3.5a.75.75 0 001.1 0l3.25-3.5a.75.75 0 10-1.1-1.02l-1.95 2.1V6.75a.75.75 0 00-1.5 0v8.59l-1.95-2.1a.75.75 0 00-1.06-.04z" clipRule="evenodd" />
                  </svg>
                  <span>Ordem:</span>
                </span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {SORT_OPTIONS.find(opt => opt.value === sortMode)?.label || 'Nome / Modelo (A-Z)'}
                </span>
                <svg
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${sortOpen ? 'rotate-180 text-blue-500' : ''}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </button>

              {sortOpen && (
                <div
                  role="listbox"
                  aria-labelledby="catalog-sort-menu-button"
                  className="absolute right-0 z-50 mt-1.5 w-64 origin-top-right rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-1.5 shadow-2xl shadow-slate-950/20 ring-1 ring-black/5"
                >
                  <div className="px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Critério de ordenação
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {SORT_OPTIONS.map(opt => {
                      const isSelected = sortMode === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => {
                            changeSortMode(opt.value);
                            setSortOpen(false);
                          }}
                          className={`w-full flex items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition ${
                            isSelected
                              ? 'bg-blue-50 dark:bg-[#123867]/80 text-blue-700 dark:text-blue-200'
                              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                          }`}
                        >
                          <span className="text-base leading-none mt-0.5">{opt.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold leading-none">{opt.label}</span>
                              {isSelected && (
                                <span className="text-blue-600 dark:text-blue-400 font-bold text-xs">✓</span>
                              )}
                            </div>
                            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-400 leading-tight">
                              {opt.description}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-1">
              <button
                type="button"
                onClick={() => changeViewMode('grid')}
                title="Visualização em Grade"
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition flex items-center gap-1 ${
                  viewMode === 'grid'
                    ? 'bg-white dark:bg-slate-700 text-[#1d4f91] dark:text-blue-300 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <span>⊞</span>
                <span>Grade</span>
              </button>
              <button
                type="button"
                onClick={() => changeViewMode('table')}
                title="Visualização em Tabela"
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition flex items-center gap-1 ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-slate-700 text-[#1d4f91] dark:text-blue-300 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <span>☰</span>
                <span>Tabela</span>
              </button>
            </div>

            {/* Status pills */}
            <div className="flex flex-wrap gap-1.5">
              {statusButtons.map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${statusFilter === value ? 'border-slate-800 bg-slate-900 text-white' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:border-slate-600'}`}
                >
                  {label} · {count}
                </button>
              ))}
            </div>

            {effectiveCategoryFilter !== 'ALL' && (
              <button
                type="button"
                onClick={() => setCategoryFilter('ALL')}
                className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400"
              >
                Limpar seção
              </button>
            )}
          </div>
        </div>

        {/* View Mode: Card Grid */}
        {viewMode === 'grid' ? (
          <div className="p-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map(document => {
              const recovery = failureGuidance(document);
              const pncs = catalogPncs(document);
              const isFav = favoritesByDocument.has(document.id);
              const icon = categoryIcon(document.category);

              return (
                <article
                  key={document.id}
                  className="flex flex-col justify-between rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-800/80 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md group"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      {admin ? (
                        <div className="relative flex items-center">
                          <span className="pointer-events-none absolute left-2 text-xs">{icon}</span>
                          <select
                            aria-label={`Seção de ${document.filename}`}
                            disabled={busy || document.processingActive}
                            value={document.category}
                            onChange={event => void setCategory(document, event.target.value)}
                            className="rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100/90 dark:bg-slate-700/60 pl-6 pr-4 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[160px] truncate cursor-pointer transition disabled:opacity-50"
                          >
                            {categories.map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <span className="flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-700/60 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                          <span>{icon}</span>
                          <span className="truncate max-w-[140px]">{document.category}</span>
                        </span>
                      )}
                      <button
                        type="button"
                        title={isFav ? 'Remover dos favoritos' : 'Favoritar catálogo'}
                        onClick={() => void toggleFavorite(document)}
                        disabled={Boolean(document.archivedAt)}
                        className="text-lg leading-none text-amber-400 hover:scale-110 transition disabled:opacity-30"
                      >
                        {isFav ? '★' : '☆'}
                      </button>
                    </div>

                    <div className="mt-3">
                      <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 truncate" title={formatEngineOrCatalogModel(document.model, document.manufacturer, document.filename) || document.filename}>
                        {formatEngineOrCatalogModel(document.model, document.manufacturer, document.filename) || document.model || 'Modelo não confirmado'}
                      </h3>
                      <div className="mt-0.5 text-xs text-slate-400 truncate" title={document.filename}>
                        {document.filename}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className={`rounded-full px-2 py-0.5 font-bold ${badge(document)}`}>
                        {statusLabel(document)}
                      </span>
                      <span className="rounded-full bg-blue-50 dark:bg-[#123867] px-2 py-0.5 font-semibold text-[#1d4f91] dark:text-blue-300">
                        {document.partCount} peças
                      </span>
                      {document.status === 'COMPLETED' && (
                        <span className={`font-semibold ${qualityTone(document)}`}>
                          {qualityLabel(document)}
                        </span>
                      )}
                    </div>

                    {pncs.length > 0 && (
                      <div className="mt-3">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">PNCs</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {pncs.slice(0, 3).map(pnc => (
                            <span key={pnc} className="rounded-md bg-blue-50 dark:bg-[#123867]/60 px-1.5 py-0.5 text-[10px] font-mono font-medium text-blue-700 dark:text-blue-300">
                              {pnc}
                            </span>
                          ))}
                          {pncs.length > 3 && (
                            <span className="rounded-md bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400">
                              +{pncs.length - 3}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {document.applications && document.applications.length > 0 && (
                      <div className="mt-2.5">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">{document.category === 'Motores' ? 'Equipamento que usa este motor' : 'Aplicação em equipamentos'}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {document.applications.slice(0, 4).map((app, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => onSearch ? onSearch(app.machineModel) : setSearch(app.machineModel)}
                              title={`Filtrar / buscar peças da máquina ${app.machineModel}`}
                              className="inline-flex items-center gap-1 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition active:scale-95 cursor-pointer"
                            >
                              <span>⚡</span>
                              <span>{app.label}</span>
                              <span className="opacity-60 text-[9px]">→</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {document.engineApplications && document.engineApplications.length > 0 && (
                      <div className="mt-2.5">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">Motor Original</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {document.engineApplications.slice(0, 3).map((app, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setSearch(app.engineModel)}
                              title={`Filtrar pelo motor ${app.engineModel}`}
                              className="inline-flex items-center gap-1 rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition active:scale-95 cursor-pointer"
                            >
                              <span>⚙️</span>
                              <span>{app.label}</span>
                              <span className="opacity-60 text-[9px]">→</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {recovery && (
                      <div className={`mt-3 rounded-xl border p-2.5 text-[10px] leading-4 ${recovery.tone}`}>
                        <b>{recovery.title}</b>
                        <p className="mt-0.5 opacity-85">{recovery.description}</p>
                      </div>
                    )}
                  </div>

                  <div className="mt-5 border-t border-slate-100 dark:border-slate-700/60 pt-3 flex flex-wrap items-center gap-1.5">
                    {document.status === 'COMPLETED' && !document.archivedAt && (
                      <>
                        <button
                          type="button"
                          onClick={() => void access(document.id, 'view', document.filename)}
                          className="flex-1 rounded-xl bg-blue-50 dark:bg-[#123867] hover:bg-blue-100 dark:hover:bg-blue-900/60 px-2.5 py-1.5 text-center text-xs font-bold text-[#1d4f91] dark:text-blue-300 transition active:scale-95"
                        >
                          📄 PDF
                        </button>
                        {onSearch && (
                          <button
                            type="button"
                            onClick={() => onSearch(document.model || document.filename)}
                            className="flex-1 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 px-2.5 py-1.5 text-center text-xs font-bold transition shadow-xs active:scale-95"
                          >
                            🔍 Peças
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void access(document.id, 'download', document.filename)}
                          title="Baixar arquivo PDF"
                          className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1.5 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                        >
                          ⬇
                        </button>
                      </>
                    )}

                    {admin && (
                      <div className="w-full flex items-center justify-between pt-1 text-[11px] text-slate-400">
                        <button
                          type="button"
                          disabled={busy || document.processingActive}
                          onClick={() => void action(document.id, 'reprocess')}
                          className="hover:text-blue-600 disabled:opacity-40 font-medium"
                        >
                          Reextrair
                        </button>
                        <button
                          type="button"
                          disabled={busy || document.processingActive}
                          onClick={() => void action(document.id, 'archive')}
                          className="hover:text-rose-600 disabled:opacity-40 font-medium"
                        >
                          Arquivar
                        </button>
                        <button
                          type="button"
                          disabled={busy || document.processingActive}
                          onClick={() => void removePdf(document)}
                          className="hover:text-rose-600 disabled:opacity-40 font-medium"
                        >
                          Excluir
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          /* View Mode: Table */
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1160px] text-sm">
              <thead className="bg-slate-50/80 dark:bg-slate-800 text-left text-[11px] uppercase tracking-[.08em] text-slate-400">
                <tr>
                  <th className="p-4">Catálogo</th>
                  <th>Seção</th>
                  <th>Modelo / PNC</th>
                  <th>Status / qualidade</th>
                  <th>Peças</th>
                  <th className="p-4">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(document => {
                  const recovery = failureGuidance(document);
                  const pncs = catalogPncs(document);
                  return (
                    <tr key={document.id} className="border-t border-slate-100 dark:border-slate-800 transition hover:bg-slate-50/60 dark:bg-slate-800">
                      <td className="p-4">
                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            title="Favoritar"
                            aria-label={favoritesByDocument.has(document.id) ? `Remover ${document.filename} dos favoritos` : `Favoritar ${document.filename}`}
                            disabled={Boolean(document.archivedAt)}
                            onClick={() => void toggleFavorite(document)}
                            className="text-lg leading-5 text-amber-500 disabled:opacity-30"
                          >
                            {favoritesByDocument.has(document.id) ? '★' : '☆'}
                          </button>
                          <div>
                            <b className="font-semibold text-slate-800 dark:text-slate-200">{document.filename}</b>
                            <div className="mt-1 text-xs text-slate-400">{document.manufacturer || 'Husqvarna'} · {fmtDate(document.createdAt)}</div>
                            {document.extractionMethod && <div className="mt-1 text-[10px] font-medium text-slate-400">{extractionLabel(document.extractionMethod)}</div>}
                            {document.archivedAt && <span className="text-xs text-rose-600">Arquivado</span>}
                          </div>
                        </div>
                      </td>
                      <td className="pr-4">
                        {admin ? (
                          <select
                            aria-label={`Seção de ${document.filename}`}
                            disabled={busy || document.processingActive}
                            value={document.category}
                            onChange={event => void setCategory(document, event.target.value)}
                            className="max-w-[220px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 disabled:opacity-50"
                          >
                            {categories.map(category => (
                              <option key={category} value={category}>{category}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="rounded-full bg-slate-100 dark:bg-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                            {document.category}
                          </span>
                        )}
                      </td>
                      <td className="pr-4 text-slate-600 dark:text-slate-400">
                        <div className={document.modelNeedsReview ? 'font-semibold text-rose-700 dark:text-rose-300' : 'font-medium text-slate-700 dark:text-slate-300'}>
                          {formatEngineOrCatalogModel(document.model, document.manufacturer, document.filename) || document.model || 'Modelo não confirmado'}
                        </div>
                        {document.suggestedModel && <div className="mt-1 text-[10px] font-semibold text-blue-700 dark:text-blue-300">Sugestão: {document.suggestedModel}</div>}
                        {document.applications && document.applications.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {document.applications.slice(0, 3).map((app, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => onSearch ? onSearch(app.machineModel) : setSearch(app.machineModel)}
                                title={`Filtrar / buscar peças da máquina ${app.machineModel}`}
                                className="inline-flex items-center gap-1 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition cursor-pointer"
                              >
                                <span>⚡</span>
                                <span>{app.label}</span>
                                <span className="opacity-60 text-[8px]">→</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {document.engineApplications && document.engineApplications.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {document.engineApplications.slice(0, 3).map((app, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => setSearch(app.engineModel)}
                                title={`Filtrar pelo motor ${app.engineModel}`}
                                className="inline-flex items-center gap-1 rounded bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/50 px-1.5 py-0.5 text-[9px] font-semibold text-blue-800 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition cursor-pointer"
                              >
                                <span>⚙️</span>
                                <span>{app.label}</span>
                                <span className="opacity-60 text-[8px]">→</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {pncs.length ? (
                          <div className="mt-1.5">
                            <div className="text-[10px] font-semibold uppercase tracking-[.06em] text-slate-400">
                              {pncs.length === 1 ? 'PNC' : 'PNCs encontrados'}{pncs.length > 1 ? ` · ${pncs.length}` : ''}
                            </div>
                            <div className="mt-1 flex max-w-[280px] flex-wrap gap-1" title={pncs.join(', ')}>
                              {pncs.slice(0, 4).map(value => (
                                <span key={value} className="rounded-md bg-blue-50 dark:bg-[#123867] px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-300">
                                  {value}
                                </span>
                              ))}
                              {pncs.length > 4 && (
                                <span className="rounded-md bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                  +{pncs.length - 4}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="mt-1 text-[10px] text-slate-400">PNC não identificado no PDF</div>
                        )}
                      </td>
                      <td className="pr-4">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${badge(document)}`}>{statusLabel(document)}</span>
                        {document.status === 'COMPLETED' && <div className={`mt-1 text-[10px] font-semibold ${qualityTone(document)}`}>{qualityLabel(document)}</div>}
                        {document.reviewReasons?.[0] && document.reviewStatus === 'NEEDS_REVIEW' && (
                          <div className="mt-1 max-w-72 text-[10px] leading-4 text-rose-600">{document.reviewReasons[0]}</div>
                        )}
                        {recovery && (
                          <div className={`mt-2 max-w-80 rounded-xl border p-2.5 text-[10px] leading-4 ${recovery.tone}`}>
                            <b className="block text-[11px]">{recovery.title}</b>
                            <span className="mt-1 block opacity-80">{recovery.description}</span>
                            {document.processingError && (
                              <details className="mt-1.5 opacity-75">
                                <summary className="cursor-pointer font-semibold">Detalhe técnico</summary>
                                <div className="mt-1">{document.processingError}</div>
                              </details>
                            )}
                          </div>
                        )}
                        {!recovery && document.processingError && (
                          <div className="mt-1 max-w-72 text-[10px] leading-4 text-slate-500 dark:text-slate-400">{document.processingError}</div>
                        )}
                      </td>
                      <td className="pr-4 text-slate-600 dark:text-slate-400 font-semibold">{document.partCount}</td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1.5">
                          {document.status === 'COMPLETED' && !document.archivedAt && (
                            <>
                              <button
                                type="button"
                                onClick={() => void access(document.id, 'view', document.filename)}
                                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-700"
                              >
                                Visualizar
                              </button>
                              {onSearch && (
                                <button
                                  type="button"
                                  onClick={() => onSearch(document.model || document.filename)}
                                  className="rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 px-2.5 py-1.5 text-xs font-bold transition shadow-xs"
                                >
                                  Ver Peças
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => void access(document.id, 'download', document.filename)}
                                className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium"
                              >
                                Baixar
                              </button>
                            </>
                          )}
                          {admin && !document.archivedAt && (
                            <>
                              {document.status === 'COMPLETED' && document.modelNeedsReview && onQuality && (
                                <button type="button" onClick={onQuality} className="rounded-lg border border-blue-200 dark:border-blue-600 bg-blue-50 dark:bg-[#123867] px-2.5 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
                                  Corrigir dados
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={busy || document.processingActive || ['PENDING', 'PROCESSING'].includes(document.status)}
                                onClick={() => void action(document.id, 'reprocess')}
                                className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {document.status === 'COMPLETED' ? 'Reextrair peças' : recovery?.retryLabel || 'Tentar novamente'}
                              </button>
                              <button
                                type="button"
                                disabled={busy || document.processingActive}
                                onClick={() => void action(document.id, 'archive')}
                                className="rounded-lg border border-rose-200 dark:border-rose-800 px-2.5 py-1.5 text-xs font-medium text-rose-600 disabled:opacity-40"
                              >
                                Arquivar
                              </button>
                              <button
                                type="button"
                                disabled={busy || document.processingActive}
                                onClick={() => void removePdf(document)}
                                className="rounded-lg border border-rose-300 px-2.5 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 disabled:opacity-40"
                              >
                                Excluir PDF
                              </button>
                            </>
                          )}
                          {admin && document.archivedAt && (
                            <button type="button" disabled={busy} onClick={() => void action(document.id, 'restore')} className="rounded-lg border border-emerald-200 dark:border-emerald-800 px-2.5 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                              Restaurar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!filtered.length && (
          <div className="p-10 text-center">
            {activeDocs.length === 0 ? (
              <div className="mx-auto max-w-md rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center">
                <span className="text-4xl">📚</span>
                <h3 className="mt-3 text-base font-semibold text-slate-800 dark:text-slate-200">
                  {archived ? 'Nenhum catálogo arquivado' : 'Nenhum catálogo disponível'}
                </h3>
                <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {archived
                    ? 'Não existem catálogos no arquivo no momento.'
                    : 'Nenhum catálogo foi encontrado no banco de dados. Se você é administrador, utilize o painel de upload acima para adicionar catálogos Husqvarna.'}
                </p>
              </div>
            ) : (
              <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 p-6 text-center">
                <span className="text-3xl">🔍</span>
                <h3 className="mt-2 text-base font-semibold text-slate-800 dark:text-slate-200">
                  Nenhum catálogo encontrado para os filtros atuais
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Existem <b>{activeDocs.length} catálogo{activeDocs.length === 1 ? '' : 's'}</b> cadastrados no sistema, mas nenhum corresponde à busca ou aos filtros selecionados.
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                    >
                      Limpar busca "{search}"
                    </button>
                  )}
                  {effectiveCategoryFilter !== 'ALL' && (
                    <button
                      type="button"
                      onClick={() => setCategoryFilter('ALL')}
                      className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                    >
                      Ver todas as seções
                    </button>
                  )}
                  {statusFilter !== 'ALL' && (
                    <button
                      type="button"
                      onClick={() => setStatusFilter('ALL')}
                      className="rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                    >
                      Ver todos os status
                    </button>
                  )}
                  {(search || effectiveCategoryFilter !== 'ALL' || statusFilter !== 'ALL') && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch('');
                        setCategoryFilter('ALL');
                        setStatusFilter('ALL');
                      }}
                      className="rounded-xl bg-blue-700 hover:bg-blue-800 text-white px-3 py-1.5 text-xs font-semibold transition shadow-xs"
                    >
                      Redefinir todos os filtros
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {pdf && (
        <div onMouseDown={e => { if (e.target === e.currentTarget) setPdf(null); }} className="fixed inset-0 z-[90] bg-slate-950/90 p-3 md:p-6">
          <div id="catalog-pdf-modal-container" className="mx-auto flex h-full max-w-[1500px] flex-col overflow-hidden rounded-[22px] bg-white dark:bg-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-700 px-4 py-3">
              <div>
                <div className="text-sm font-semibold">{pdf.title}</div>
                <div className="text-xs text-slate-400">Visualizador técnico de catálogo</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById('catalog-pdf-modal-container');
                    if (document.fullscreenElement) {
                      void document.exitFullscreen();
                    } else if (el) {
                      void el.requestFullscreen();
                    }
                  }}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                  title="Alternar tela cheia"
                >
                  ⛶ Tela cheia
                </button>
                <a
                  href={pdf.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-[#1d4f91] dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-slate-700 transition"
                >
                  Nova aba ↗
                </a>
                <button type="button" autoFocus onClick={() => setPdf(null)} className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm font-semibold">
                  Fechar <span className="ml-1 text-[10px] text-slate-400">Esc</span>
                </button>
              </div>
            </div>
            <iframe title={pdf.title} src={pdf.url} className="h-full w-full border-0" />
          </div>
        </div>
      )}
    </section>
  );
}
