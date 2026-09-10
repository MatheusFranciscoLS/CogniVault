import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'sonner';
import { api, apiJson, cleanErpCode, classifyPartKind } from '../../lib';
import { playCopySound } from '../../lib/sound';
import { useQuoteCart } from '../../context/QuoteCartContext';
import type {
  MaintenanceKitItem,
  OfficialVerification,
  PartDetail,
  PartClassificationKind,
} from '../../types';
import OfficialVerificationApprovalPanel from '../OfficialVerificationApprovalPanel';
import PartVerificationDialog, {
  effectivePartNumber,
  isSupersededForCode,
  looksLikePartNumber,
  normalizePartCode,
} from '../PartVerificationDialog';
import CrossReferenceDialog from '../CrossReferenceDialog';
import ChatPanel from '../ChatPanel';
import PartDetailDrawer from './PartDetailDrawer';
import PartResultRow from './PartResultRow';
import type {
  HusqvarnaLivePart,
  PdfPreview,
  SearchDocument,
  SearchResultPart,
  SearchStreamMessage,
} from './types';

type Props = {
  initialQuery: string;
  onQueryChange: (query: string) => void;
  admin?: boolean;
  storageScope?: string;
};

type ResultFilter = 'ALL' | PartClassificationKind;

const filterOptions: Array<{ id: ResultFilter; label: string }> = [
  { id: 'ALL', label: 'Todos' },
  { id: 'ASSEMBLY', label: 'Conjuntos' },
  { id: 'REPAIR_KIT', label: 'Kits de reparo' },
  { id: 'INDIVIDUAL_PART', label: 'Componentes' },
];

function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || (target instanceof HTMLElement && target.isContentEditable);
}

async function consumeSearchStream(
  response: Response,
  signal: AbortSignal | undefined,
  onMessage: (message: SearchStreamMessage) => void,
) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Seu navegador não conseguiu abrir a busca em tempo real.');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    if (signal?.aborted) {
      await reader.cancel();
      return;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';

    for (const event of events) {
      const dataLine = event
        .split('\n')
        .find(line => line.startsWith('data: '));

      if (!dataLine) continue;

      try {
        const message = JSON.parse(dataLine.slice(6)) as SearchStreamMessage;
        onMessage(message);
      } catch (error) {
        console.error('Não foi possível interpretar uma atualização da busca:', error);
      }
    }
  }
}

function EmptySearch({
  recent,
  onSearch,
}: {
  recent: string[];
  onSearch: (query: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-xl text-[#1d4f91] dark:bg-blue-950/40 dark:text-blue-300">⌕</div>
      <h2 className="mt-4 text-base font-black text-slate-900 dark:text-white">Pronto para consultar</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500 dark:text-slate-400">
        Pesquise pelo código da peça, descrição, modelo da máquina ou PNC.
      </p>

      {recent.length > 0 && (
        <div className="mt-5">
          <div className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">Pesquisas recentes</div>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {recent.slice(0, 6).map(term => (
              <button
                key={term}
                type="button"
                onClick={() => onSearch(term)}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-[#1d4f91] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-3">
      {[0, 1, 2, 3].map(item => (
        <div key={item} className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="h-3 w-2/5 rounded-full bg-slate-200 dark:bg-slate-700" />
          <div className="mt-3 h-7 w-40 rounded-lg bg-slate-100 dark:bg-slate-800" />
          <div className="mt-4 h-3 w-3/5 rounded-full bg-slate-100 dark:bg-slate-800" />
        </div>
      ))}
    </div>
  );
}

export default function PartSearchWorkspace({
  initialQuery,
  onQueryChange,
  admin = false,
  storageScope,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const quoteCart = useQuoteCart();

  const [query, setQuery] = useState(initialQuery);
  const [lastQuery, setLastQuery] = useState('');
  const [parts, setParts] = useState<SearchResultPart[]>([]);
  const [documents, setDocuments] = useState<SearchDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [filter, setFilter] = useState<ResultFilter>('ALL');

  const [detail, setDetail] = useState<PartDetail | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [liveData, setLiveData] = useState<HusqvarnaLivePart | null>(null);
  const [pdf, setPdf] = useState<PdfPreview | null>(null);

  const [verifications, setVerifications] = useState<Record<string, OfficialVerification>>({});
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationTarget, setVerificationTarget] = useState<{ partNumber: string; name: string } | null>(null);

  const [crossReference, setCrossReference] = useState<{ code: string; name: string } | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');

  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('cognivault_recent_searches');
      return stored ? JSON.parse(stored) as string[] : [];
    } catch {
      return [];
    }
  });

  const saveRecentSearch = useCallback((term: string) => {
    const value = term.trim();
    if (value.length < 2) return;

    setRecentSearches(current => {
      const next = [
        value,
        ...current.filter(item => item.toLowerCase() !== value.toLowerCase()),
      ].slice(0, 8);

      try {
        localStorage.setItem('cognivault_recent_searches', JSON.stringify(next));
      } catch {
        // O histórico local é apenas uma conveniência de interface.
      }

      return next;
    });
  }, []);

  const loadVerifications = useCallback(async (
    items: Array<{ partNumber: string }>,
    replace = false,
  ) => {
    if (!items.length) {
      if (replace) setVerifications({});
      return;
    }

    setVerificationLoading(true);

    try {
      const codes = [...new Set(items.map(item => item.partNumber))].join(',');
      const data = await apiJson<{ verifications: OfficialVerification[] }>(
        `/api/part-verifications?codes=${encodeURIComponent(codes)}`,
      );

      const next: Record<string, OfficialVerification> = {};

      for (const verification of data.verifications) {
        next[normalizePartCode(verification.queriedPartNumber)] = verification;
        next[normalizePartCode(verification.currentPartNumber)] = verification;
      }

      setVerifications(current => replace ? next : { ...current, ...next });
    } catch {
      if (replace) setVerifications({});
    } finally {
      setVerificationLoading(false);
    }
  }, []);

  const resolveSearchCode = useCallback(async (value: string) => {
    if (!looksLikePartNumber(value)) return value;

    try {
      const data = await apiJson<{ verifications: OfficialVerification[] }>(
        `/api/part-verifications?codes=${encodeURIComponent(value)}`,
      );
      const verification = data.verifications[0];

      if (verification && isSupersededForCode(value, verification)) {
        return verification.currentPartNumber;
      }
    } catch {
      // A busca técnica continua mesmo se a conferência estiver indisponível.
    }

    return value;
  }, []);

  const runSearch = useCallback(async (value: string, signal?: AbortSignal) => {
    const clean = value.trim();
    if (clean.length < 2) return;

    setLoading(true);
    setHasSearched(true);
    setLastQuery(clean);
    setError('');
    setParts([]);
    setDocuments([]);
    setFilter('ALL');
    setSelectedIndex(-1);
    setVerifications({});
    saveRecentSearch(clean);

    try {
      const resolvedQuery = await resolveSearchCode(clean);
      if (signal?.aborted) return;

      const response = await api(
        `/api/search/stream?q=${encodeURIComponent(resolvedQuery)}`,
        signal ? { signal, timeoutMs: 60_000 } : { timeoutMs: 60_000 },
      );

      if (!response.ok) {
        throw new Error('Não foi possível concluir a pesquisa.');
      }

      let accumulated: SearchResultPart[] = [];

      await consumeSearchStream(response, signal, message => {
        if (message.type === 'lexical') {
          if (message.error) {
            setError(message.error);
            return;
          }

          const nextParts = message.parts ?? [];
          accumulated = nextParts;
          setParts(nextParts);
          setDocuments(message.documents ?? []);
          setSelectedIndex(nextParts.length ? 0 : -1);
          return;
        }

        if (message.type === 'semantic') {
          const semantic = message.parts ?? [];

          setParts(current => {
            const existingIds = new Set(current.map(part => part.id));
            const additions = semantic.filter(part => !existingIds.has(part.id));
            accumulated = [...current, ...additions];
            return accumulated;
          });
        }
      });

      if (signal?.aborted) return;

      if (accumulated.length > 0) {
        void loadVerifications(accumulated, true);
      }
    } catch (searchError) {
      if (searchError instanceof Error && searchError.name === 'AbortError') return;
      setError(searchError instanceof Error ? searchError.message : 'Erro ao pesquisar.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [loadVerifications, resolveSearchCode, saveRecentSearch]);

  useEffect(() => {
    const value = initialQuery.trim();
    setQuery(initialQuery);

    if (value.length < 2) {
      if (!value) {
        setParts([]);
        setDocuments([]);
        setHasSearched(false);
        setLastQuery('');
      }
      return;
    }

    const controller = new AbortController();
    void runSearch(value, controller.signal);
    return () => controller.abort();
  }, [initialQuery, runSearch]);

  const displayedParts = useMemo(() => {
    if (filter === 'ALL') return parts;

    return parts.filter(part => {
      const classification = part.classification ?? classifyPartKind(part.name, part.section, part.notes);
      return classification.kind === filter;
    });
  }, [filter, parts]);

  useEffect(() => {
    setSelectedIndex(displayedParts.length ? 0 : -1);
  }, [displayedParts.length, filter]);

  const filterCounts = useMemo(() => {
    const counts: Record<ResultFilter, number> = {
      ALL: parts.length,
      ASSEMBLY: 0,
      REPAIR_KIT: 0,
      INDIVIDUAL_PART: 0,
    };

    for (const part of parts) {
      const classification = part.classification ?? classifyPartKind(part.name, part.section, part.notes);
      counts[classification.kind] += 1;
    }

    return counts;
  }, [parts]);

  const activeModel = useMemo(() => {
    const models = [...new Set(parts.map(part => part.model).filter(Boolean))];
    return models.length === 1 ? models[0] : '';
  }, [parts]);

  const copyCode = useCallback(async (code: string) => {
    const raw = cleanErpCode(code);

    try {
      await navigator.clipboard.writeText(raw);
      playCopySound();
      toast.success(`Código ${raw} copiado.`);
    } catch {
      toast.info(`Código: ${raw}`);
    }
  }, []);

  const openPart = useCallback(async (id: string) => {
    setDetailLoadingId(id);
    setError('');
    setLiveData(null);

    try {
      const data = await apiJson<{ part: PartDetail }>(`/api/parts/${id}`);
      setDetail(data.part);
      void loadVerifications([data.part]);

      void apiJson<{ livePart: HusqvarnaLivePart }>(
        `/api/parts/${encodeURIComponent(data.part.partNumber)}/live-data`,
      )
        .then(response => setLiveData(response.livePart))
        .catch(() => undefined);
    } catch (partError) {
      setError(partError instanceof Error ? partError.message : 'Não foi possível abrir a peça.');
    } finally {
      setDetailLoadingId(null);
    }
  }, [loadVerifications]);

  const accessPdf = useCallback(async (
    documentId: string,
    page: number | null,
    title: string,
  ) => {
    try {
      const data = await apiJson<{ url: string }>(`/api/documents/${documentId}/access?mode=view`);
      setPdf({ url: data.url, page, title });
    } catch (pdfError) {
      toast.error(pdfError instanceof Error ? pdfError.message : 'Não foi possível abrir o catálogo.');
    }
  }, []);

  const toggleFavorite = useCallback(async () => {
    if (!detail) return;

    try {
      if (detail.favoriteId) {
        await apiJson(`/api/favorites/${detail.favoriteId}`, { method: 'DELETE' });
        setDetail(current => current ? { ...current, favoriteId: null } : current);
        toast.success('Removida dos favoritos.');
      } else {
        const data = await apiJson<{ favorite: { id: string } }>('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ partId: detail.id }),
        });

        setDetail(current => current ? { ...current, favoriteId: data.favorite.id } : current);
        toast.success('Adicionada aos favoritos.');
      }
    } catch (favoriteError) {
      toast.error(favoriteError instanceof Error ? favoriteError.message : 'Não foi possível atualizar o favorito.');
    }
  }, [detail]);

  const addMaintenanceKit = useCallback(async () => {
    if (!activeModel) return;

    try {
      const data = await apiJson<{ items: MaintenanceKitItem[] }>(
        `/api/models/${encodeURIComponent(activeModel)}/maintenance-kit`,
      );

      const items = data.items
        .filter((item): item is MaintenanceKitItem & { part: NonNullable<MaintenanceKitItem['part']> } => Boolean(item.part))
        .map(item => {
          const code = cleanErpCode(item.part.partNumber);
          return {
            partNumber: code,
            effectiveCode: code,
            name: item.part.name,
            model: item.part.model || activeModel,
            pnc: item.part.pnc,
            section: item.part.section || item.label,
            position: item.part.position,
            filename: item.part.filename,
            page: item.part.page,
          };
        });

      if (!items.length) {
        toast.info(`Nenhum kit de revisão cadastrado para ${activeModel}.`);
        return;
      }

      quoteCart.addItems(items);
    } catch (kitError) {
      toast.error(kitError instanceof Error ? kitError.message : 'Não foi possível carregar o kit de revisão.');
    }
  }, [activeModel, quoteCart]);

  const beginSearch = (value: string) => {
    const clean = value.trim();
    if (clean.length < 2) return;

    setQuery(clean);

    if (clean !== initialQuery.trim()) {
      onQueryChange(clean);
    } else {
      void runSearch(clean);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const value = query.trim();

    if (value.length < 2) {
      setError('Digite ao menos 2 caracteres.');
      inputRef.current?.focus();
      return;
    }

    beginSearch(value);
  };

  const clearSearch = () => {
    setQuery('');
    setParts([]);
    setDocuments([]);
    setLastQuery('');
    setHasSearched(false);
    setError('');
    setSelectedIndex(-1);
    setFilter('ALL');
    onQueryChange('');
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const openAi = (prompt: string) => {
    setAiPrompt(prompt);
    setAiOpen(true);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (aiOpen) {
          setAiOpen(false);
          return;
        }
        if (pdf) {
          setPdf(null);
          return;
        }
        if (verificationTarget) {
          setVerificationTarget(null);
          return;
        }
        if (crossReference) {
          setCrossReference(null);
          return;
        }
        if (detail) {
          setDetail(null);
        }
        return;
      }

      if (
        event.key === '/'
        && !event.ctrlKey
        && !event.metaKey
        && !event.altKey
        && !isTypingTarget(event.target)
      ) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        return;
      }

      if (isTypingTarget(event.target) || detail || pdf || aiOpen || verificationTarget || crossReference) return;
      if (!displayedParts.length) return;

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        setSelectedIndex(current => {
          const base = current < 0 ? 0 : current;
          return (base + direction + displayedParts.length) % displayedParts.length;
        });
        return;
      }

      if (event.key === 'Enter' && selectedIndex >= 0 && selectedIndex < displayedParts.length) {
        event.preventDefault();
        void openPart(displayedParts[selectedIndex].id);
        return;
      }

      if (event.key.toLowerCase() === 'c' && selectedIndex >= 0 && selectedIndex < displayedParts.length) {
        event.preventDefault();
        const part = displayedParts[selectedIndex];
        const verification = verifications[normalizePartCode(part.partNumber)];
        void copyCode(cleanErpCode(effectivePartNumber(part.partNumber, verification)));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    aiOpen,
    copyCode,
    crossReference,
    detail,
    displayedParts,
    openPart,
    pdf,
    selectedIndex,
    verificationTarget,
    verifications,
  ]);

  const detailVerification = detail
    ? verifications[normalizePartCode(detail.partNumber)]
    : undefined;

  const resultLabel = loading
    ? 'Pesquisando…'
    : hasSearched
      ? `${displayedParts.length}${filter !== 'ALL' ? ` de ${parts.length}` : ''} ${displayedParts.length === 1 ? 'resultado' : 'resultados'}`
      : 'Aguardando pesquisa';

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[.15em] text-[#1d4f91] dark:text-blue-300">Operação de balcão</div>
          <h1 className="mt-1 text-2xl font-black tracking-[-.03em] text-slate-950 dark:text-white">Buscar peças</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Código, descrição, modelo ou PNC. O código copiado sempre sai sem espaços.
          </p>
        </div>

        {activeModel && (
          <button
            type="button"
            onClick={() => void addMaintenanceKit()}
            className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-black text-amber-900 transition hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
          >
            + Kit de revisão · {activeModel}
          </button>
        )}
      </div>

      <form onSubmit={submit} className="mt-5 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
            <input
              ref={inputRef}
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Ex.: 537183507, carburador 143RS, Z248F..."
              autoComplete="off"
              className="h-12 w-full rounded-xl border-0 bg-slate-50 pl-10 pr-4 text-sm font-semibold text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-100 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-800 dark:focus:ring-blue-900"
            />
          </div>

          {query && (
            <button
              type="button"
              onClick={clearSearch}
              className="hidden rounded-xl px-3 py-2 text-xs font-bold text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 sm:block dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              Limpar
            </button>
          )}

          <button
            type="submit"
            disabled={loading}
            className="h-12 rounded-xl bg-[#123867] px-5 text-sm font-black text-white transition hover:bg-[#0d2d57] disabled:opacity-60"
          >
            {loading ? 'Buscando…' : 'Buscar'}
          </button>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 px-3 pb-1 pt-2 text-[10px] font-medium text-slate-400 dark:border-slate-800">
          <span><kbd>/</kbd> focar</span>
          <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
          <span><kbd>Enter</kbd> abrir</span>
          <span><kbd>C</kbd> copiar código</span>
        </div>
      </form>

      {admin && (
        <details className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
          <summary className="cursor-pointer text-xs font-black text-slate-600 dark:text-slate-300">
            Conferências oficiais pendentes
          </summary>
          <div className="mt-4">
            <OfficialVerificationApprovalPanel onChanged={() => {
              if (parts.length) void loadVerifications(parts, true);
              if (detail) void loadVerifications([detail]);
            }} />
          </div>
        </details>
      )}

      {error && (
        <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          <span>{error}</span>
          {lastQuery.length >= 2 && (
            <button type="button" onClick={() => void runSearch(lastQuery)} className="text-xs font-black underline">
              Tentar novamente
            </button>
          )}
        </div>
      )}

      {parts.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {filterOptions.map(option => {
              const count = filterCounts[option.id];
              if (option.id !== 'ALL' && count === 0) return null;

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setFilter(option.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                    filter === option.id
                      ? 'border-[#123867] bg-[#123867] text-white'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                >
                  {option.label} <span className="ml-1 opacity-70">{count}</span>
                </button>
              );
            })}
          </div>

          <div className="text-xs font-semibold text-slate-400">{resultLabel}</div>
        </div>
      )}

      <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          {loading && parts.length === 0 ? (
            <LoadingRows />
          ) : displayedParts.length > 0 ? (
            <div className="space-y-3">
              {displayedParts.map((part, index) => {
                const verification = verifications[normalizePartCode(part.partNumber)];

                return (
                  <PartResultRow
                    key={part.id}
                    part={part}
                    verification={verification}
                    verificationLoading={verificationLoading}
                    selected={selectedIndex === index}
                    opening={detailLoadingId === part.id}
                    onSelect={() => setSelectedIndex(index)}
                    onOpen={() => void openPart(part.id)}
                    onCopy={code => void copyCode(code)}
                    onCrossReference={(code, name) => setCrossReference({ code, name })}
                  />
                );
              })}
            </div>
          ) : hasSearched && !loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-base font-black text-slate-900 dark:text-white">Nenhuma peça encontrada</h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Tente o código sem pontuação, o modelo da máquina ou uma descrição mais curta.
              </p>
              <button
                type="button"
                onClick={() => openAi(`Não encontrei "${lastQuery}" na busca de peças. Ajude a identificar a peça ou o código correto para essa aplicação.`)}
                className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-black text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-300"
              >
                Perguntar à IA
              </button>
            </div>
          ) : (
            <EmptySearch recent={recentSearches} onSearch={beginSearch} />
          )}
        </div>

        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">Fontes técnicas</div>
          <div className="mt-1 text-sm font-black text-slate-900 dark:text-white">Catálogos da pesquisa</div>

          <div className="mt-3 space-y-2">
            {documents.map(document => (
              <button
                key={document.id}
                type="button"
                onClick={() => void accessPdf(document.id, null, document.filename)}
                className="w-full rounded-xl bg-slate-50 p-3 text-left transition hover:bg-blue-50 dark:bg-slate-800/60 dark:hover:bg-slate-800"
              >
                <div className="truncate text-xs font-black text-slate-800 dark:text-slate-100" title={document.filename}>{document.filename}</div>
                <div className="mt-1 text-[11px] leading-5 text-slate-400">
                  {document.model || 'Modelo não informado'} · PNC {document.pnc || '—'}
                </div>
                <div className="mt-1 text-[10px] font-bold text-[#1d4f91] dark:text-blue-300">{document.partCount} peças</div>
              </button>
            ))}

            {!documents.length && (
              <div className="rounded-xl bg-slate-50 px-3 py-5 text-center text-xs leading-5 text-slate-400 dark:bg-slate-800/50">
                Os catálogos relacionados aparecerão aqui.
              </div>
            )}
          </div>
        </aside>
      </div>

      {detail && (
        <PartDetailDrawer
          detail={detail}
          verification={detailVerification}
          verificationLoading={verificationLoading}
          liveData={liveData}
          onClose={() => setDetail(null)}
          onCopy={code => void copyCode(code)}
          onOpenPdf={(documentId, page, title) => void accessPdf(documentId, page, title)}
          onOpenRelated={id => void openPart(id)}
          onToggleFavorite={() => void toggleFavorite()}
          onVerify={() => setVerificationTarget({ partNumber: detail.partNumber, name: detail.name })}
          onCrossReference={(code, name) => setCrossReference({ code, name })}
          onAskAi={openAi}
        />
      )}

      {verificationTarget && (
        <PartVerificationDialog
          key={`${normalizePartCode(verificationTarget.partNumber)}:${verifications[normalizePartCode(verificationTarget.partNumber)]?.id || 'new'}`}
          target={verificationTarget}
          existing={verifications[normalizePartCode(verificationTarget.partNumber)]}
          onClose={() => setVerificationTarget(null)}
          onSaved={() => {
            setVerificationTarget(null);
            toast.success('Conferência enviada para aprovação.');
            if (detail) void loadVerifications([detail]);
          }}
        />
      )}

      {crossReference && (
        <CrossReferenceDialog
          partCode={crossReference.code}
          partName={crossReference.name}
          onClose={() => setCrossReference(null)}
        />
      )}

      {pdf && (
        <div className="fixed inset-0 z-[90] bg-slate-950/90 p-3 md:p-5">
          <div className="mx-auto flex h-full max-w-[1500px] flex-col overflow-hidden rounded-2xl bg-white dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div className="min-w-0">
                <div className="truncate text-sm font-black text-slate-900 dark:text-white">{pdf.title}</div>
                <div className="mt-0.5 text-xs text-slate-400">{pdf.page ? `Página ${pdf.page}` : 'Catálogo técnico'}</div>
              </div>
              <div className="flex gap-2">
                <a
                  href={`${pdf.url}${pdf.page ? `#page=${pdf.page}` : ''}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-[#1d4f91] dark:border-slate-700 dark:text-blue-300"
                >
                  Nova aba ↗
                </a>
                <button
                  type="button"
                  onClick={() => setPdf(null)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300"
                >
                  Fechar
                </button>
              </div>
            </div>
            <iframe
              title={pdf.title}
              src={`${pdf.url}${pdf.page ? `#page=${pdf.page}` : ''}`}
              className="h-full w-full border-0"
            />
          </div>
        </div>
      )}

      {aiOpen && (
        <div className="fixed inset-0 z-[80] flex justify-end">
          <button
            type="button"
            aria-label="Fechar assistente"
            onClick={() => setAiOpen(false)}
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
          />
          <div className="relative z-10 h-full w-full max-w-[560px] bg-white shadow-2xl dark:bg-slate-900">
            <ChatPanel
              storageScope={storageScope || 'balcao-v2'}
              initialPrompt={aiPrompt}
              onClose={() => setAiOpen(false)}
              isDrawer
            />
          </div>
        </div>
      )}
    </section>
  );
}
