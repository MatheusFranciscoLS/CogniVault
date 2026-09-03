import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, MouseEvent as ReactMouseEvent } from 'react';
import { api, apiJson, json } from '../lib';
import { toast } from 'sonner';
import type { OfficialVerification, PartDetail, SearchPart } from '../types';
import OfficialVerificationApprovalPanel from './OfficialVerificationApprovalPanel';
import ChatPanel from './ChatPanel';
import PartVerificationDialog, {
  effectivePartNumber,
  husqvarnaPortalUrl,
  isSupersededForCode,
  looksLikePartNumber,
  normalizePartCode,
  VerificationBadge,
} from './PartVerificationDialog';

type SearchDocument = {
  id: string;
  filename: string;
  manufacturer: string | null;
  model: string | null;
  pnc: string | null;
  partCount: number;
};

type PdfPreview = {
  url: string;
  page: number | null;
  title: string;
};

type VerificationTarget = Pick<SearchPart, 'partNumber' | 'name'>;

type Props = {
  initialQuery: string;
  onQueryChange: (query: string) => void;
  admin?: boolean;
  storageScope?: string;
};

function isTextEditingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || target.isContentEditable;
}



function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="cv-empty">
      <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-400" aria-hidden="true">⌕</div>
      <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</div>
      <div className="mt-1 text-xs leading-5 text-slate-400">{description}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[.1em] text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-200">{value}</div>
    </div>
  );
}

function SearchSkeleton() {
  return (
    <div className="divide-y divide-slate-100" aria-hidden="true">
      {[0, 1, 2].map(item => (
        <div key={item} className="animate-pulse p-5">
          <div className="h-3 w-2/5 rounded-full bg-slate-200 dark:bg-slate-600" />
          <div className="mt-3 h-6 w-1/3 rounded-lg bg-blue-100" />
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-700" />
            <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-700" />
            <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-700" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PartSearchPanel({ initialQuery, onQueryChange, admin = false, storageScope }: Props) {
  const normalizedInitialQuery = initialQuery.trim();
  const [query, setQuery] = useState(initialQuery);
  const [lastQuery, setLastQuery] = useState(normalizedInitialQuery);
  const [parts, setParts] = useState<SearchPart[]>([]);
  const [documents, setDocuments] = useState<SearchDocument[]>([]);
  const [loading, setLoading] = useState(normalizedInitialQuery.length >= 2);
  const [hasSearched, setHasSearched] = useState(normalizedInitialQuery.length >= 2);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [detail, setDetail] = useState<PartDetail | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [pdf, setPdf] = useState<PdfPreview | null>(null);
  const [error, setError] = useState('');
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verifications, setVerifications] = useState<Record<string, OfficialVerification>>({});
  const [replacementVerification, setReplacementVerification] = useState<OfficialVerification | null>(null);
  const [verificationTarget, setVerificationTarget] = useState<VerificationTarget | null>(null);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [aiInitialPrompt, setAiInitialPrompt] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const openAiAssistant = useCallback((prompt?: string) => {
    setAiInitialPrompt(prompt || (query.trim() ? `Tenho uma dúvida sobre a pesquisa "${query.trim()}". Pode me ajudar?` : ''));
    setAiDrawerOpen(true);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (aiDrawerOpen) {
          setAiDrawerOpen(false);
        } else if (pdf) {
          setPdf(null);
        } else if (verificationTarget) {
          setVerificationTarget(null);
        } else if (detail) {
          setDetail(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [aiDrawerOpen, pdf, verificationTarget, detail]);

  const loadVerifications = useCallback(async (items: Array<Pick<SearchPart, 'partNumber'>>, replace = false) => {
    if (!items.length) {
      if (replace) setVerifications({});
      return;
    }

    setVerificationLoading(true);
    try {
      const codes = [...new Set(items.map(item => item.partNumber))].join(',');
      const data = await apiJson<{ verifications: OfficialVerification[] }>(`/api/part-verifications?codes=${encodeURIComponent(codes)}`);
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
    if (!looksLikePartNumber(value)) return { value, verification: null as OfficialVerification | null };
    try {
      const data = await apiJson<{ verifications: OfficialVerification[] }>(`/api/part-verifications?codes=${encodeURIComponent(value)}`);
      const verification = data.verifications[0] || null;
      if (verification && isSupersededForCode(value, verification)) {
        return { value: verification.currentPartNumber, verification };
      }
    } catch {
      // A busca técnica continua normalmente se o estado oficial estiver indisponível.
    }
    return { value, verification: null as OfficialVerification | null };
  }, []);

  const runSearch = useCallback(async (value: string, signal?: AbortSignal) => {
    setLoading(true);
    setHasSearched(true);
    setLastQuery(value);
    setError('');
    setParts([]);
    setDocuments([]);
    setSelectedIndex(-1);
    setVerifications({});
    setReplacementVerification(null);

    try {
      const resolved = await resolveSearchCode(value);
      if (signal?.aborted) return;
      setReplacementVerification(resolved.verification);

      const data = await apiJson<{ parts: SearchPart[]; documents: SearchDocument[] }>(
        `/api/search?q=${encodeURIComponent(resolved.value)}`,
        signal ? { signal } : undefined,
      );
      if (signal?.aborted) return;
      setParts(data.parts);
      setDocuments(data.documents);
      setSelectedIndex(data.parts.length ? 0 : -1);
      void loadVerifications(data.parts, true);
    } catch (searchError) {
      if (searchError instanceof Error && searchError.name === 'AbortError') return;
      setError(searchError instanceof Error ? searchError.message : 'Erro ao pesquisar.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [loadVerifications, resolveSearchCode]);

  useEffect(() => {
    if (normalizedInitialQuery.length < 2) return;
    const controller = new AbortController();

    void (async () => {
      try {
        const resolved = await resolveSearchCode(normalizedInitialQuery);
        if (controller.signal.aborted) return;
        setReplacementVerification(resolved.verification);

        const data = await apiJson<{ parts: SearchPart[]; documents: SearchDocument[] }>(
          `/api/search?q=${encodeURIComponent(resolved.value)}`,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setParts(data.parts);
        setDocuments(data.documents);
        setSelectedIndex(data.parts.length ? 0 : -1);
        void loadVerifications(data.parts, true);
      } catch (searchError) {
        if (searchError instanceof Error && searchError.name === 'AbortError') return;
        setError(searchError instanceof Error ? searchError.message : 'Erro ao pesquisar.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [loadVerifications, normalizedInitialQuery, resolveSearchCode]);

  const copyCode = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`Código ${value} copiado.`);
    } catch {
      toast.info(`Código: ${value}`);
    }
  }, []);

  const openPart = useCallback(async (id: string) => {
    setDetailLoadingId(id);
    setError('');
    try {
      const data = await apiJson<{ part: PartDetail }>(`/api/parts/${id}`);
      setDetail(data.part);
      void loadVerifications([data.part]);
    } catch (partError) {
      setError(partError instanceof Error ? partError.message : 'Não foi possível abrir a peça.');
    } finally {
      setDetailLoadingId(null);
    }
  }, [loadVerifications]);

  const accessPdf = useCallback(async (documentId: string, page: number | null, title: string) => {
    setError('');
    try {
      const data = await apiJson<{ url: string }>(`/api/documents/${documentId}/access?mode=view`);
      setPdf({ url: data.url, page, title });
    } catch (pdfError) {
      setError(pdfError instanceof Error ? pdfError.message : 'Não foi possível abrir o catálogo.');
    }
  }, []);

  const toggleFavorite = useCallback(async () => {
    if (!detail) return;
    try {
      if (detail.favoriteId) {
        await json(await api(`/api/favorites/${detail.favoriteId}`, { method: 'DELETE' }));
        setDetail(current => current ? { ...current, favoriteId: null } : current);
        toast.success('Favorito removido.');
      } else {
        const data = await apiJson<{ favorite: { id: string } }>('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ partId: detail.id }),
        });
        setDetail(current => current ? { ...current, favoriteId: data.favorite.id } : current);
        toast.success('Peça adicionada aos favoritos.');
      }
    } catch (favoriteError) {
      setError(favoriteError instanceof Error ? favoriteError.message : 'Não foi possível atualizar o favorito.');
    }
  }, [detail]);

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (aiDrawerOpen) {
          event.preventDefault();
          setAiDrawerOpen(false);
          return;
        }
        if (verificationTarget) {
          event.preventDefault();
          setVerificationTarget(null);
          return;
        }
        if (pdf) {
          event.preventDefault();
          setPdf(null);
          return;
        }
        if (detail) {
          event.preventDefault();
          setDetail(null);
          return;
        }
      }

      const target = event.target;
      const targetElement = target instanceof HTMLElement ? target : null;
      const isSearchInput = targetElement === inputRef.current;
      const isResultButton = targetElement?.dataset.partResult === 'true';
      const isEditing = isTextEditingTarget(target) && !isSearchInput;

      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !isTextEditingTarget(target)) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        return;
      }

      if (aiDrawerOpen || detail || pdf || verificationTarget || isEditing || !parts.length) return;

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (!isSearchInput && !isResultButton && targetElement !== document.body) return;
        event.preventDefault();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        setSelectedIndex(current => {
          const base = current < 0 ? 0 : current;
          const next = (base + direction + parts.length) % parts.length;
          window.requestAnimationFrame(() => {
            resultRefs.current[next]?.focus({ preventScroll: true });
            resultRefs.current[next]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          });
          return next;
        });
        return;
      }

      if (event.key.toLowerCase() === 'c' && isResultButton && selectedIndex >= 0) {
        event.preventDefault();
        const selectedPart = parts[selectedIndex];
        const verification = verifications[normalizePartCode(selectedPart.partNumber)];
        void copyCode(effectivePartNumber(selectedPart.partNumber, verification));
      }
    };

    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [aiDrawerOpen, copyCode, detail, parts, pdf, selectedIndex, verificationTarget, verifications]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (value.length < 2) {
      setParts([]);
      setDocuments([]);
      setHasSearched(false);
      setError('Digite ao menos 2 caracteres para pesquisar.');
      inputRef.current?.focus();
      return;
    }
    if (value !== normalizedInitialQuery) {
      onQueryChange(value);
      return;
    }
    void runSearch(value);
  };

  const clearSearch = () => {
    setQuery('');
    setParts([]);
    setDocuments([]);
    setHasSearched(false);
    setLastQuery('');
    setSelectedIndex(-1);
    setError('');
    setVerifications({});
    setReplacementVerification(null);
    onQueryChange('');
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const closeDetailFromBackdrop = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) setDetail(null);
  };

  const closePdfFromBackdrop = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) setPdf(null);
  };

  const resultSummary = loading
    ? 'Pesquisando na base técnica…'
    : hasSearched
      ? `${parts.length} ${parts.length === 1 ? 'peça encontrada' : 'peças encontradas'}${lastQuery ? ` para “${lastQuery}”` : ''}`
      : 'Informe um código, uma descrição, um modelo ou um PNC.';

  const detailVerification = useMemo(
    () => detail ? verifications[normalizePartCode(detail.partNumber)] : undefined,
    [detail, verifications],
  );
  const detailCode = detail ? effectivePartNumber(detail.partNumber, detailVerification) : '';
  const detailWasSuperseded = detail ? isSupersededForCode(detail.partNumber, detailVerification) : false;

  const refreshApprovedVerifications = useCallback(() => {
    if (parts.length) void loadVerifications(parts, true);
    if (detail) void loadVerifications([detail]);
  }, [detail, loadVerifications, parts]);

  return (
    <section>
      <p className="cv-kicker">Atendimento rápido</p>
      <h1 className="cv-page-title">Peças e catálogos</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Encontre, confira e copie o código sem interromper o atendimento ao cliente.</p>

      {admin && <OfficialVerificationApprovalPanel onChanged={refreshApprovedVerifications} />}

      <form onSubmit={submit} className="cv-surface mt-6 rounded-[22px] p-2">
        <div className="flex gap-2">
          <label htmlFor="parts-search" className="sr-only">Buscar peça, código, modelo ou PNC</label>
          <input
            ref={inputRef}
            id="parts-search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Ex.: 537 04 19-01, carburador 143RS ou PNC"
            autoFocus
            autoComplete="off"
            aria-describedby="parts-search-help"
            className="min-w-0 flex-1 rounded-2xl border-0 px-4 py-3 text-sm outline-none"
          />
          {query && (
            <button type="button" onClick={clearSearch} className="flex items-center rounded-xl px-2.5 sm:px-3 text-xs font-semibold text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:text-slate-300">
              Limpar
            </button>
          )}
          <button type="submit" disabled={loading} className="cv-primary min-w-[92px] px-5 text-sm font-semibold">
            {loading ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
        <div id="parts-search-help" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 dark:border-slate-800 px-3 pb-1 pt-2 text-[10px] text-slate-400">
          <span><kbd>/</kbd> focar busca</span>
          <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
          <span><kbd>Enter</kbd> abrir</span>
          <span><kbd>C</kbd> copiar código</span>
          <span><kbd>Esc</kbd> fechar</span>
        </div>
      </form>

      {replacementVerification && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 dark:border-blue-600 bg-blue-50 dark:bg-[#123867] p-3 text-sm text-blue-800 dark:text-blue-300">
          <span><strong>Substituição oficial:</strong> {replacementVerification.queriedPartNumber} → {replacementVerification.currentPartNumber}. A busca foi direcionada ao código atual.</span>
          <a href={replacementVerification.officialUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[#1d4f91] dark:text-blue-300">Abrir fonte oficial →</a>
        </div>
      )}

      {error && (
        <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/30 p-3 text-sm text-rose-700 dark:text-rose-300">
          <span>{error}</span>
          {lastQuery.length >= 2 && (
            <button type="button" onClick={() => void runSearch(lastQuery)} className="rounded-lg border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold">
              Tentar novamente
            </button>
          )}
        </div>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,.55fr)]">
        <div className="cv-surface overflow-hidden rounded-[22px]" aria-busy={loading}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-700 px-5 py-4">
            <div>
              <div className="font-semibold">Resultado da consulta</div>
              <div role="status" aria-live="polite" className="mt-0.5 text-xs text-slate-400">{resultSummary}</div>
            </div>
            <div className="flex items-center gap-2">
              {parts.length > 0 && <span className="cv-soft-badge hidden sm:inline-flex">Selecione para ver compatibilidade</span>}
              <button
                type="button"
                onClick={() => openAiAssistant(query.trim() ? `Tenho uma dúvida sobre a pesquisa "${query.trim()}". Pode me ajudar?` : undefined)}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:border-blue-400 dark:hover:border-blue-500 hover:text-[#1d4f91] dark:hover:text-blue-300 transition shadow-sm"
              >
                <span className="text-amber-500 font-bold" aria-hidden="true">✦</span>
                <span>Assistente IA</span>
              </button>
            </div>
          </div>

          {loading ? <SearchSkeleton /> : (
            <div className="divide-y divide-slate-100">
              {parts.map((part, index) => {
                const selected = selectedIndex === index;
                const opening = detailLoadingId === part.id;
                const verification = verifications[normalizePartCode(part.partNumber)];
                const superseded = isSupersededForCode(part.partNumber, verification);
                const codeToUse = effectivePartNumber(part.partNumber, verification);
                const isCurrentReplacement = verification?.state === 'SUPERSEDED'
                  && !superseded
                  && normalizePartCode(part.partNumber) === normalizePartCode(verification.currentPartNumber);

                return (
                  <article key={part.id} className={`grid gap-3 p-3 transition sm:grid-cols-[minmax(0,1fr)_210px] ${selected ? 'bg-blue-50 dark:bg-[#123867]/70 ring-1 ring-inset ring-blue-200' : 'hover:bg-slate-50 dark:bg-slate-800/50'}`}>
                    <button
                      type="button"
                      ref={element => { resultRefs.current[index] = element; }}
                      data-part-result="true"
                      onFocus={() => setSelectedIndex(index)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={() => void openPart(part.id)}
                      className="min-w-0 rounded-xl p-2 text-left"
                      aria-label={`Abrir ${part.name}, código ${codeToUse}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{part.name}</div>
                          <div className="mt-1 text-xl font-bold tracking-tight text-[#1d4f91] dark:text-blue-300">
                            {superseded ? (
                              <><span className="text-slate-400 line-through">{part.partNumber}</span> <span>→ {verification?.currentPartNumber}</span></>
                            ) : part.partNumber}
                          </div>
                          {isCurrentReplacement && <div className="mt-1 text-[11px] font-medium text-blue-700 dark:text-blue-300">Código atual de {verification?.queriedPartNumber}</div>}
                          {part.notes && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {part.notes.includes('Substituição oficial') ? (
                                <span className="inline-flex items-center gap-1 rounded-md border border-amber-400/40 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:text-amber-200">
                                  <span aria-hidden="true" className="text-amber-500">★</span> {part.notes}
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-md border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-300">
                                  {part.notes}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        {part.position && <span className="rounded-full bg-slate-100 dark:bg-slate-700 px-2.5 py-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">Pos. {part.position}</span>}
                      </div>
                      <div className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
                        <div><span className="block text-[9px] font-bold uppercase tracking-[.1em] text-slate-400">Modelo</span><strong className="mt-0.5 block text-slate-700 dark:text-slate-300">{part.model}</strong></div>
                        <div><span className="block text-[9px] font-bold uppercase tracking-[.1em] text-slate-400">PNC</span><strong className="mt-0.5 block text-slate-700 dark:text-slate-300">{part.pnc || '—'}</strong></div>
                        <div><span className="block text-[9px] font-bold uppercase tracking-[.1em] text-slate-400">Fonte</span><strong className="mt-0.5 block truncate text-slate-700 dark:text-slate-300">{part.filename}</strong></div>
                      </div>
                    </button>
                    <div className="flex flex-wrap items-center gap-2 self-center px-2 pb-2 sm:flex-col sm:items-stretch sm:pb-0">
                      <VerificationBadge verification={verification} loading={verificationLoading} />
                      <button
                        type="button"
                        onClick={() => openAiAssistant(`Tenho uma dúvida sobre a peça ${part.name} (código ${codeToUse}) do modelo ${part.model}. Pode me ajudar com a aplicação e compatibilidade?`)}
                        className="rounded-xl border border-indigo-200 dark:border-indigo-800/80 bg-indigo-50/60 dark:bg-indigo-950/40 px-3 py-2 text-center text-xs font-semibold text-indigo-700 dark:text-indigo-300 transition hover:bg-indigo-100 dark:hover:bg-indigo-900/60"
                      >
                        ✦ Perguntar à IA
                      </button>
                      <a href={verification?.officialUrl || husqvarnaPortalUrl(codeToUse)} target="_blank" rel="noreferrer" className="rounded-xl border border-blue-200 dark:border-blue-600 bg-blue-50 dark:bg-[#123867] px-3 py-2 text-center text-xs font-semibold text-[#1d4f91] dark:text-blue-300 transition hover:bg-blue-100">
                        Verificar no portal Husqvarna
                      </a>
                      <button type="button" onClick={() => void copyCode(codeToUse)} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-[#1d4f91] dark:text-blue-300 transition hover:border-blue-200 dark:border-blue-600 hover:bg-blue-50 dark:bg-[#123867]">
                        Copiar código
                      </button>
                      <button type="button" onClick={() => void openPart(part.id)} disabled={opening} className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 transition hover:bg-slate-100 dark:bg-slate-700 hover:text-slate-800 dark:text-slate-200 disabled:opacity-50">
                        {opening ? 'Abrindo…' : 'Ver detalhes'}
                      </button>
                      <button type="button" onClick={() => setVerificationTarget({ partNumber: part.partNumber, name: part.name })} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-50 dark:bg-slate-800/50">
                        Registrar conferência
                      </button>
                    </div>
                  </article>
                );
              })}

              {!parts.length && (
                <div className="p-5">
                  <EmptyState
                    title={hasSearched ? 'Nenhuma peça encontrada' : 'Pronto para pesquisar'}
                    description={hasSearched ? `Não encontramos “${lastQuery}”. Tente o código sem pontuação, o modelo ou o PNC.` : 'Digite ao menos 2 caracteres para consultar a base indexada.'}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <aside className="cv-surface h-fit rounded-[22px] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold">Catálogos relacionados</div>
              <div className="mt-1 text-xs text-slate-400">Abra a fonte técnica sem sair da tela.</div>
            </div>
            {documents.length > 0 && <span className="cv-soft-badge">{documents.length}</span>}
          </div>
          <div className="mt-4 grid gap-2">
            {documents.map(document => (
              <div key={document.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <div className="truncate text-sm font-semibold" title={document.filename}>{document.filename}</div>
                <div className="mt-1 text-xs leading-5 text-slate-400">
                  {document.manufacturer || 'Fabricante não informado'}<br />
                  {document.model || 'Modelo não informado'} · PNC {document.pnc || '—'} · {document.partCount} peças
                </div>
                <button type="button" onClick={() => void accessPdf(document.id, null, document.filename)} className="mt-3 text-xs font-semibold text-[#1d4f91] dark:text-blue-300">
                  Abrir catálogo →
                </button>
              </div>
            ))}
            {!documents.length && <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-4 text-xs leading-5 text-slate-400">Os catálogos associados à pesquisa aparecerão aqui.</div>}
          </div>
        </aside>
      </div>

      {detail && (
        <div onMouseDown={closeDetailFromBackdrop} className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm md:items-center md:p-6">
          <div role="dialog" aria-modal="true" aria-labelledby="part-detail-title" className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-t-[28px] bg-white dark:bg-slate-800 shadow-2xl md:rounded-[28px]">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-800/95 px-5 py-4 backdrop-blur">
              <div>
                <div className="text-xs font-bold uppercase tracking-[.12em] text-[#1d4f91] dark:text-blue-300">Detalhe da peça</div>
                <div id="part-detail-title" className="mt-1 text-lg font-semibold">{detail.name}</div>
              </div>
              <button type="button" autoFocus onClick={() => setDetail(null)} className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm">Fechar <span className="ml-1 text-[10px] text-slate-400">Esc</span></button>
            </div>

            <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div>
                <div className="rounded-[22px] bg-[#0d2348] p-6 text-white">
                  <div className="text-xs text-slate-400">Código da peça</div>
                  <div className="mt-2 break-all text-3xl font-semibold tracking-[-.04em]">
                    {detailWasSuperseded ? <><span className="text-slate-400 line-through">{detail.partNumber}</span> → {detailCode}</> : detail.partNumber}
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void copyCode(detailCode)} className="rounded-xl bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-[#0d2348]">Copiar código</button>
                    <button
                      type="button"
                      onClick={() => {
                        const targetName = detail.name;
                        const targetCode = detailCode;
                        const targetModel = detail.model;
                        setDetail(null);
                        openAiAssistant(`Tenho uma dúvida sobre a peça ${targetName} (código ${targetCode}) do modelo ${targetModel}. Pode me orientar sobre aplicação e compatibilidade?`);
                      }}
                      className="rounded-xl border border-indigo-300/60 dark:border-indigo-500/60 bg-indigo-600/90 hover:bg-indigo-600 text-white px-3 py-2 text-xs font-semibold shadow-sm transition"
                    >
                      ✦ Perguntar à IA
                    </button>
                    <button type="button" onClick={() => void toggleFavorite()} className="rounded-xl border border-white/20 px-3 py-2 text-xs font-semibold">{detail.favoriteId ? '★ Favoritada' : '☆ Favoritar'}</button>
                    <button type="button" onClick={() => void accessPdf(detail.documentId, detail.page, detail.filename)} className="rounded-xl border border-white/20 px-3 py-2 text-xs font-semibold">Abrir no catálogo</button>
                    <a href={detailVerification?.officialUrl || husqvarnaPortalUrl(detailCode)} target="_blank" rel="noreferrer" className="rounded-xl border border-white/20 px-3 py-2 text-xs font-semibold">Verificar no portal Husqvarna</a>
                  </div>
                </div>

                <div className="mt-4 rounded-[18px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[.1em] text-slate-400">Verificação oficial</div>
                      <div className="mt-2"><VerificationBadge verification={detailVerification} loading={verificationLoading} /></div>
                      {detailVerification?.state === 'SUPERSEDED' && (
                        <div className="mt-2 text-xs font-semibold text-blue-700 dark:text-blue-300">{detailVerification.queriedPartNumber} → {detailVerification.currentPartNumber}</div>
                      )}
                      {detailVerification?.verifiedAt && (
                        <div className="mt-2 text-xs text-slate-400">Verificado em {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(detailVerification.verifiedAt))}{detailVerification.verifiedBy ? ` por ${detailVerification.verifiedBy}` : ''}</div>
                      )}
                      {detailVerification?.note && <div className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{detailVerification.note}</div>}
                    </div>
                    <button type="button" onClick={() => setVerificationTarget({ partNumber: detail.partNumber, name: detail.name })} className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Registrar nova conferência
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Info label="Modelo" value={detail.model} />
                  <Info label="PNC" value={detail.pnc || '—'} />
                  <Info label="Seção" value={detail.section || '—'} />
                  <Info label="Posição / página" value={`${detail.position || '—'} · pág. ${detail.page ?? '—'}`} />
                </div>

                {detail.notes && <div className="mt-4 rounded-[18px] border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 p-4 text-sm leading-6 text-amber-900 dark:text-amber-300">{detail.notes}</div>}

                <div className="mt-5">
                  <div className="font-semibold">Compatibilidade encontrada</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {detail.compatibility.map((item, index) => (
                      <span key={`${item.model}-${item.pnc}-${index}`} className="rounded-full border border-blue-100 dark:border-blue-700 bg-blue-50 dark:bg-[#123867] px-3 py-1.5 text-xs font-medium text-blue-800 dark:text-blue-300">
                        {item.model} · PNC {item.pnc || '—'}
                      </span>
                    ))}
                    {!detail.compatibility.length && <span className="text-xs text-slate-400">Nenhuma compatibilidade adicional cadastrada.</span>}
                  </div>
                </div>
              </div>

              <div>
                <div className="rounded-[22px] border border-slate-200 dark:border-slate-700 p-4">
                  <div className="text-xs uppercase tracking-[.1em] text-slate-400">Fonte técnica</div>
                  <div className="mt-2 break-words text-sm font-semibold">{detail.filename}</div>
                  <div className="mt-1 text-xs text-slate-400">{detail.document.manufacturer || '—'} · {detail.document.model || '—'}</div>
                </div>
                <div className="mt-4 rounded-[22px] border border-slate-200 dark:border-slate-700 p-4">
                  <div className="font-semibold">Peças relacionadas</div>
                  <div className="mt-3 grid gap-2">
                    {detail.related.map(item => (
                      <div key={item.id} className="flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 p-2">
                        <button type="button" onClick={() => void openPart(item.id)} className="min-w-0 flex-1 p-1 text-left">
                          <div className="text-xs font-semibold">{item.name}</div>
                          <div className="mt-1 text-xs text-slate-400">{item.partNumber} · posição {item.position || '—'}</div>
                        </button>
                        <button type="button" onClick={() => void copyCode(item.partNumber)} aria-label={`Copiar código ${item.partNumber}`} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-[10px] font-semibold text-[#1d4f91] dark:text-blue-300">Copiar</button>
                      </div>
                    ))}
                    {!detail.related.length && <span className="text-xs text-slate-400">Nenhuma peça relacionada encontrada.</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
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
            refreshApprovedVerifications();
          }}
        />
      )}

      {pdf && (
        <div onMouseDown={closePdfFromBackdrop} className="fixed inset-0 z-[90] bg-slate-950/90 p-3 md:p-6">
          <div role="dialog" aria-modal="true" aria-labelledby="pdf-preview-title" className="mx-auto flex h-full max-w-[1500px] flex-col overflow-hidden rounded-[22px] bg-white dark:bg-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-700 px-4 py-3">
              <div>
                <div id="pdf-preview-title" className="text-sm font-semibold">{pdf.title}</div>
                <div className="text-xs text-slate-400">{pdf.page ? `Abrindo na página ${pdf.page}` : 'Visualização do catálogo'}</div>
              </div>
              <div className="flex items-center gap-2">
                <a href={`${pdf.url}${pdf.page ? `#page=${pdf.page}` : ''}`} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-[#1d4f91] dark:text-blue-300">Nova aba</a>
                <button type="button" autoFocus onClick={() => setPdf(null)} className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm">Fechar <span className="ml-1 text-[10px] text-slate-400">Esc</span></button>
              </div>
            </div>
            <iframe title={pdf.title} src={`${pdf.url}${pdf.page ? `#page=${pdf.page}` : ''}`} className="h-full w-full border-0" />
          </div>
        </div>
      )}

      {aiDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm transition-opacity"
            onClick={() => setAiDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 flex h-full w-full max-w-[560px] flex-col bg-white dark:bg-slate-900 shadow-2xl">
            <ChatPanel
              storageScope={storageScope || 'balcao'}
              initialPrompt={aiInitialPrompt}
              onClose={() => setAiDrawerOpen(false)}
              isDrawer
            />
          </div>
        </div>
      )}
    </section>
  );
}
