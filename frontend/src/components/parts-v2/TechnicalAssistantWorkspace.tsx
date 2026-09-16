import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'sonner';
import { api, apiJson, cleanErpCode } from '../../lib';
import { playCopySound } from '../../lib/sound';
import { useCounterSession } from '../../context/CounterSessionContext';
import { useQuoteCart } from '../../context/QuoteCartContext';
import type { OfficialVerification, PartDetail } from '../../types';
import PartVerificationDialog, { isSupersededForCode, looksLikePartNumber, normalizePartCode } from '../PartVerificationDialog';
import CrossReferenceDialog from '../CrossReferenceDialog';
import ChatPanel from '../ChatPanel';
import CounterSessionBar from '../CounterSessionBar';
import CounterQuoteRail from '../CounterQuoteRail';
import CommercialPartRow from './CommercialPartRow';
import PartDetailDrawer from './PartDetailDrawer';
import PartQuickPreview from './PartQuickPreview';
import PartResultRow from './PartResultRow';
import SourceBadge from './SourceBadge';
import type { CommercialPart, HusqvarnaLivePart, OfficialFallbackResult, PdfPreview, PriceSection, SearchDocument, SearchResultPart, SearchStreamMessage } from './types';

type Props = { initialQuery: string; onQueryChange: (query: string) => void; admin?: boolean; storageScope?: string };
type Selection = { kind: 'technical' | 'commercial'; id: string } | null;

const examples = [
  { label: 'Código exato', value: '587106701' },
  { label: 'Peça + modelo', value: 'carburador 143RII' },
  { label: 'Pergunta técnica', value: 'qual carburador serve na 143RII?' },
];

function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || (target instanceof HTMLElement && target.isContentEditable);
}

function looksLikeQuestion(value: string) {
  const clean = value.trim().toLocaleLowerCase('pt-BR');
  if (!clean) return false;
  if (clean.includes('?')) return true;
  return /^(qual|quais|como|onde|por que|porque|o que|posso|pode|preciso|serve|essa|esse|esta|este|me ajude|tenho uma dúvida)\b/.test(clean);
}

async function consumeSearchStream(response: Response, signal: AbortSignal | undefined, onMessage: (message: SearchStreamMessage) => void) {
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
      const dataLine = event.split('\n').find(line => line.startsWith('data: '));
      if (!dataLine) continue;
      try {
        onMessage(JSON.parse(dataLine.slice(6)) as SearchStreamMessage);
      } catch (error) {
        console.error('Não foi possível interpretar uma atualização da busca:', error);
      }
    }
  }
}

function Starter({ hasContext, onExample }: { hasContext: boolean; onExample: (value: string) => void }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xs font-black text-slate-800 dark:text-slate-100">Pesquise como você falaria no balcão</div>
          <p className="mt-1 max-w-2xl text-[11px] leading-5 text-slate-400">
            {hasContext
              ? 'Modelo e PNC do atendimento já serão considerados. Você pode digitar só a peça, o código ou fazer uma pergunta.'
              : 'Código, descrição, modelo ou uma pergunta técnica. O CogniVault escolhe a melhor combinação entre catálogo, cadastro, fonte oficial e assistência por IA.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {examples.map(example => (
            <button key={example.label} type="button" onClick={() => onExample(example.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-blue-200 hover:bg-blue-50/50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-800 dark:hover:bg-blue-950/20">
              <span className="block text-[9px] font-black uppercase tracking-[.1em] text-slate-400">{example.label}</span>
              <span className="mt-0.5 block text-[11px] font-semibold text-slate-700 dark:text-slate-200">{example.value}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      {[0, 1, 2].map(item => (
        <div key={item} className="grid animate-pulse gap-3 border-b border-slate-100 px-4 py-4 last:border-0 dark:border-slate-800 lg:grid-cols-[145px_minmax(0,1fr)_170px_auto]">
          <div className="h-4 w-28 rounded bg-slate-100 dark:bg-slate-800" />
          <div className="h-4 w-3/5 rounded bg-slate-100 dark:bg-slate-800" />
          <div className="h-4 w-24 rounded bg-slate-100 dark:bg-slate-800" />
          <div className="h-8 w-28 rounded bg-slate-100 dark:bg-slate-800" />
        </div>
      ))}
    </div>
  );
}

export default function TechnicalAssistantWorkspace({ initialQuery, onQueryChange, storageScope }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const quoteCart = useQuoteCart();
  const { session, hasContext } = useCounterSession();
  const contextRevisionRef = useRef(`${session.machineModel}\u0000${session.pnc}`);

  const [query, setQuery] = useState(initialQuery);
  const [lastQuery, setLastQuery] = useState(initialQuery.trim());
  const [parts, setParts] = useState<SearchResultPart[]>([]);
  const [documents, setDocuments] = useState<SearchDocument[]>([]);
  const [commercialParts, setCommercialParts] = useState<CommercialPart[]>([]);
  const [priceSections, setPriceSections] = useState<PriceSection[]>([]);
  const [priceSection, setPriceSection] = useState('');
  const [loading, setLoading] = useState(false);
  const [commercialLoading, setCommercialLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState('');
  const [selection, setSelection] = useState<Selection>(null);
  const [officialResult, setOfficialResult] = useState<OfficialFallbackResult | null>(null);
  const [officialLoading, setOfficialLoading] = useState(false);
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

  const loadVerifications = useCallback(async (items: Array<{ partNumber: string }>, replace = false) => {
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
    if (!looksLikePartNumber(value)) return value;
    try {
      const data = await apiJson<{ verifications: OfficialVerification[] }>(`/api/part-verifications?codes=${encodeURIComponent(value)}`);
      const verification = data.verifications[0];
      if (verification && isSupersededForCode(value, verification)) return verification.currentPartNumber;
    } catch {
      // A busca continua com o código informado se a conferência salva não responder.
    }
    return value;
  }, []);

  const buildTechnicalQuery = useCallback((value: string) => {
    const base = value.trim();
    const lowerBase = base.toLocaleLowerCase('pt-BR');
    const additions: string[] = [];
    const model = session.machineModel.trim();
    const pnc = session.pnc.trim();
    if (model && !lowerBase.includes(model.toLocaleLowerCase('pt-BR'))) additions.push(model);
    if (pnc) {
      const compactBase = base.replace(/\W/g, '').toLowerCase();
      const compactPnc = pnc.replace(/\W/g, '').toLowerCase();
      if (compactPnc && !compactBase.includes(compactPnc)) additions.push(pnc);
    }
    return [base, ...additions].filter(Boolean).join(' ');
  }, [session.machineModel, session.pnc]);

  const fetchCommercial = useCallback(async (value: string, section = '', signal?: AbortSignal) => {
    setCommercialLoading(true);
    try {
      const sectionQuery = section ? `&section=${encodeURIComponent(section)}` : '';
      const data = await apiJson<{ parts: CommercialPart[]; sections: PriceSection[] }>(`/api/master-parts/search?q=${encodeURIComponent(value)}${sectionQuery}`, signal ? { signal, timeoutMs: 45_000 } : { timeoutMs: 45_000 });
      if (signal?.aborted) return [];
      setCommercialParts(data.parts);
      setPriceSections(data.sections);
      return data.parts;
    } catch (commercialError) {
      if (commercialError instanceof Error && commercialError.name === 'AbortError') return [];
      console.error('Cadastro comercial indisponível:', commercialError);
      return [];
    } finally {
      if (!signal?.aborted) setCommercialLoading(false);
    }
  }, []);

  const consultOfficial = useCallback(async (value: string) => {
    const clean = value.trim();
    if (!clean) return;
    setOfficialLoading(true);
    try {
      const data = await apiJson<{ result: OfficialFallbackResult }>(`/api/official-fallback?q=${encodeURIComponent(clean)}`, { timeoutMs: 20_000 });
      setOfficialResult(data.result);
    } catch (officialError) {
      setOfficialResult({ status: 'REVIEW', source: 'ONLINE', query: clean, url: 'https://www.husqvarna.com/br/pecas-sobressalentes/', message: officialError instanceof Error ? officialError.message : 'A consulta oficial não respondeu.' });
    } finally {
      setOfficialLoading(false);
    }
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
    setCommercialParts([]);
    setOfficialResult(null);
    setPriceSection('');
    setSelection(null);
    setVerifications({});

    try {
      const resolvedQuery = await resolveSearchCode(clean);
      if (signal?.aborted) return;
      const technicalQuery = buildTechnicalQuery(resolvedQuery);
      const commercialPromise = fetchCommercial(resolvedQuery, '', signal);
      const response = await api(`/api/search/stream?q=${encodeURIComponent(technicalQuery)}`, signal ? { signal, timeoutMs: 60_000 } : { timeoutMs: 60_000 });
      if (!response.ok) throw new Error('Não foi possível concluir a pesquisa técnica.');

      let accumulated: SearchResultPart[] = [];
      await consumeSearchStream(response, signal, message => {
        if (message.type === 'lexical') {
          if (message.error) {
            setError(message.error);
            return;
          }
          accumulated = (message.parts ?? []).map(part => ({ ...part, source: 'CATALOG' as const }));
          setParts(accumulated);
          setDocuments(message.documents ?? []);
          if (accumulated[0]) setSelection({ kind: 'technical', id: accumulated[0].id });
          return;
        }
        if (message.type === 'semantic') {
          const semantic = (message.parts ?? []).map(part => ({ ...part, source: 'CATALOG' as const }));
          setParts(current => {
            const existingIds = new Set(current.map(part => part.id));
            const additions = semantic.filter(part => !existingIds.has(part.id));
            accumulated = [...current, ...additions];
            return accumulated;
          });
        }
      });

      const commercial = await commercialPromise;
      if (signal?.aborted) return;
      if (accumulated.length > 0) void loadVerifications(accumulated, true);
      else if (commercial[0]) setSelection({ kind: 'commercial', id: commercial[0].id });
      else await consultOfficial(resolvedQuery);
    } catch (searchError) {
      if (searchError instanceof Error && searchError.name === 'AbortError') return;
      setError(searchError instanceof Error ? searchError.message : 'Erro ao pesquisar.');
      const commercial = await fetchCommercial(clean, '', signal);
      if (!signal?.aborted && !commercial.length) await consultOfficial(clean);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [buildTechnicalQuery, consultOfficial, fetchCommercial, loadVerifications, resolveSearchCode]);

  useEffect(() => {
    const value = initialQuery.trim();
    if (value.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => void runSearch(value, controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [initialQuery, runSearch]);

  useEffect(() => {
    const nextRevision = `${session.machineModel}\u0000${session.pnc}`;
    if (contextRevisionRef.current === nextRevision) return;
    contextRevisionRef.current = nextRevision;
    if (!hasSearched || lastQuery.length < 2) return;
    const timer = window.setTimeout(() => void runSearch(lastQuery), 450);
    return () => window.clearTimeout(timer);
  }, [hasSearched, lastQuery, runSearch, session.machineModel, session.pnc]);

  const selectedTechnical = useMemo(() => selection?.kind === 'technical' ? parts.find(part => part.id === selection.id) : undefined, [parts, selection]);
  const selectedCommercial = useMemo(() => selection?.kind === 'commercial' ? commercialParts.find(part => part.id === selection.id) : undefined, [commercialParts, selection]);
  const selectedVerification = selectedTechnical ? verifications[normalizePartCode(selectedTechnical.partNumber)] : undefined;
  const hasLocalResults = parts.length > 0 || commercialParts.length > 0;
  const showSideRail = Boolean(selectedTechnical || selectedCommercial || quoteCart.totalItems > 0);

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

  const openAi = useCallback((prompt: string) => {
    setAiPrompt(prompt);
    setAiOpen(true);
  }, []);

  const beginSearch = useCallback((value: string) => {
    const clean = value.trim();
    if (clean.length < 2) return;
    setQuery(clean);
    if (looksLikeQuestion(clean)) openAi(clean);
    if (clean !== initialQuery.trim()) onQueryChange(clean);
    else void runSearch(clean);
  }, [initialQuery, onQueryChange, openAi, runSearch]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (query.trim().length < 2) {
      setError('Digite ao menos 2 caracteres.');
      inputRef.current?.focus();
      return;
    }
    beginSearch(query);
  };

  const clearSearch = () => {
    setQuery('');
    setLastQuery('');
    setParts([]);
    setDocuments([]);
    setCommercialParts([]);
    setOfficialResult(null);
    setHasSearched(false);
    setSelection(null);
    setError('');
    setPriceSection('');
    onQueryChange('');
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const openPart = useCallback(async (id: string) => {
    setDetailLoadingId(id);
    setError('');
    setLiveData(null);
    try {
      const data = await apiJson<{ part: PartDetail }>(`/api/parts/${id}`);
      setDetail(data.part);
      void loadVerifications([data.part]);
      void apiJson<{ livePart: HusqvarnaLivePart }>(`/api/parts/${encodeURIComponent(data.part.partNumber)}/live-data`)
        .then(response => setLiveData(response.livePart))
        .catch(() => undefined);
    } catch (partError) {
      setError(partError instanceof Error ? partError.message : 'Não foi possível abrir a peça.');
    } finally {
      setDetailLoadingId(null);
    }
  }, [loadVerifications]);

  const accessPdf = useCallback(async (documentId: string, page: number | null, title: string) => {
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

  const changePriceSection = (section: string) => {
    setPriceSection(section);
    setSelection(null);
    if (lastQuery.length >= 2) {
      void fetchCommercial(lastQuery, section).then(items => {
        if (items?.[0]) setSelection({ kind: 'commercial', id: items[0].id });
      });
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (aiOpen) setAiOpen(false);
        else if (pdf) setPdf(null);
        else if (verificationTarget) setVerificationTarget(null);
        else if (crossReference) setCrossReference(null);
        else if (detail) setDetail(null);
        return;
      }
      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !isTypingTarget(event.target)) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [aiOpen, crossReference, detail, pdf, verificationTarget]);

  const detailVerification = detail ? verifications[normalizePartCode(detail.partNumber)] : undefined;

  return (
    <section className="space-y-4">
      <CounterSessionBar />

      <div className="px-1">
        <div className="text-[10px] font-black uppercase tracking-[.15em] text-[#1d4f91] dark:text-blue-300">Assistência técnica</div>
        <h1 className="mt-1 text-2xl font-black tracking-[-.03em] text-slate-950 dark:text-white">Encontre a peça certa. Entenda por quê.</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Catálogo técnico, cadastro comercial, fonte oficial e IA baseada em evidências no mesmo fluxo.</p>
      </div>

      <form onSubmit={submit} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 p-2">
          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
            <input
              ref={inputRef}
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={hasContext ? 'Peça, código ou pergunta sobre este equipamento…' : 'Código, peça, modelo ou descreva o que você precisa…'}
              autoComplete="off"
              className="h-12 w-full rounded-lg border-0 bg-slate-50 pl-10 pr-4 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-800"
            />
          </div>
          {query && <button type="button" onClick={clearSearch} className="hidden h-10 rounded-lg px-3 text-xs font-bold text-slate-400 hover:text-slate-700 sm:block dark:hover:text-slate-200">Limpar</button>}
          <button type="submit" disabled={loading} className="h-12 rounded-lg bg-[#123867] px-5 text-sm font-black text-white transition hover:bg-[#0d2c52] disabled:opacity-60">{loading ? 'Analisando…' : 'Buscar'}</button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2 text-[10px] text-slate-400 dark:border-slate-800">
          <span>Busca direta para códigos e peças · perguntas naturais recebem assistência técnica automaticamente.</span>
          {hasContext && <span className="font-bold text-emerald-600 dark:text-emerald-400">Contexto: {session.machineModel || 'modelo'}{session.pnc ? ` · PNC ${session.pnc}` : ''}</span>}
        </div>
      </form>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}

      {!hasSearched && <Starter hasContext={hasContext} onExample={beginSearch} />}

      <div className={showSideRail ? 'grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]' : ''}>
        <div className="min-w-0 space-y-5">
          {loading && !hasLocalResults ? <LoadingRows /> : null}

          {parts.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between gap-3 px-1">
                <div className="flex items-center gap-2"><SourceBadge source="CATALOG" /><span className="text-xs font-black text-slate-700 dark:text-slate-200">Evidência técnica</span></div>
                <span className="text-[10px] text-slate-400">{parts.length} resultado{parts.length === 1 ? '' : 's'} em catálogo</span>
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                {parts.map(part => (
                  <PartResultRow
                    key={part.id}
                    part={part}
                    verification={verifications[normalizePartCode(part.partNumber)]}
                    verificationLoading={verificationLoading}
                    selected={selection?.kind === 'technical' && selection.id === part.id}
                    opening={detailLoadingId === part.id}
                    onSelect={() => setSelection({ kind: 'technical', id: part.id })}
                    onOpen={() => void openPart(part.id)}
                    onCopy={code => void copyCode(code)}
                    onCrossReference={(code, name) => setCrossReference({ code, name })}
                  />
                ))}
              </div>
            </section>
          )}

          {(commercialParts.length > 0 || commercialLoading || priceSections.length > 0) && (
            <section>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-3 px-1">
                <div className="flex items-center gap-2"><SourceBadge source="PRICE_LIST" /><span className="text-xs font-black text-slate-700 dark:text-slate-200">Cadastro comercial</span><span className="text-[10px] text-slate-400">{commercialLoading ? 'Consultando…' : `${commercialParts.length} resultado${commercialParts.length === 1 ? '' : 's'}`}</span></div>
                {priceSections.length > 1 && (
                  <select value={priceSection} onChange={event => changePriceSection(event.target.value)} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-bold text-slate-600 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    <option value="">Todas as seções</option>
                    {priceSections.map(section => <option key={section.name} value={section.name}>{section.name} · {section.count}</option>)}
                  </select>
                )}
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                {commercialParts.map(part => <CommercialPartRow key={part.id} part={part} selected={selection?.kind === 'commercial' && selection.id === part.id} onSelect={() => setSelection({ kind: 'commercial', id: part.id })} onCopy={code => void copyCode(code)} onOfficial={item => void consultOfficial(item.partNumber)} />)}
              </div>
            </section>
          )}

          {hasSearched && !loading && !commercialLoading && !hasLocalResults && (
            <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <SourceBadge source={officialResult?.status === 'FOUND' ? 'OFFICIAL' : 'REVIEW'} />
                  {officialLoading ? (
                    <div className="mt-3 text-sm font-semibold text-slate-500">Consultando fonte oficial…</div>
                  ) : officialResult?.status === 'FOUND' ? (
                    <>
                      <h2 className="mt-3 text-base font-black text-slate-900 dark:text-white">{officialResult.name}</h2>
                      {officialResult.partNumber && <div className="mt-1 font-mono text-xl font-black text-[#123867] dark:text-blue-300">{cleanErpCode(officialResult.partNumber)}</div>}
                      {officialResult.message && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">{officialResult.message}</p>}
                    </>
                  ) : (
                    <>
                      <h2 className="mt-3 text-base font-black text-slate-900 dark:text-white">Não há evidência suficiente nas fontes locais</h2>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">{officialResult?.message || 'A consulta não retornou uma peça segura. Use a assistência técnica para entender o que precisa ser confirmado.'}</p>
                    </>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {officialResult?.partNumber && <button type="button" onClick={() => void copyCode(officialResult.partNumber!)} className="rounded-lg bg-[#123867] px-3 py-2 text-xs font-black text-white">Copiar código</button>}
                  <button type="button" onClick={() => openAi(lastQuery)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 transition hover:border-blue-200 hover:text-[#1d4f91] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">Pedir orientação</button>
                </div>
              </div>
            </section>
          )}

          {documents.length > 0 && (
            <section>
              <div className="mb-2 px-1 text-[10px] font-black uppercase tracking-[.14em] text-slate-400">Catálogos relacionados</div>
              <div className="grid gap-2 md:grid-cols-2">
                {documents.slice(0, 4).map(document => <button key={document.id} type="button" onClick={() => void accessPdf(document.id, null, document.filename)} className="rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-blue-300 dark:border-slate-800 dark:bg-slate-900"><div className="truncate text-xs font-black text-slate-800 dark:text-slate-100">{document.filename}</div><div className="mt-1 text-[10px] text-slate-400">{document.model || 'Modelo não informado'} · {document.partCount} peças</div></button>)}
              </div>
            </section>
          )}
        </div>

        {showSideRail && (
          <aside className="min-w-0 space-y-3 xl:sticky xl:top-[84px] xl:self-start">
            {(selectedTechnical || selectedCommercial) && (
              <PartQuickPreview
                technical={selectedTechnical}
                commercial={selectedCommercial}
                verification={selectedVerification}
                onCopy={code => void copyCode(code)}
                onOpenTechnical={id => void openPart(id)}
                onCrossReference={(code, name) => setCrossReference({ code, name })}
                onOfficial={value => void consultOfficial(value)}
              />
            )}
            <CounterQuoteRail />
          </aside>
        )}
      </div>

      {detail && <PartDetailDrawer detail={detail} verification={detailVerification} verificationLoading={verificationLoading} liveData={liveData} onClose={() => setDetail(null)} onCopy={code => void copyCode(code)} onOpenPdf={(documentId, page, title) => void accessPdf(documentId, page, title)} onOpenRelated={id => void openPart(id)} onToggleFavorite={() => void toggleFavorite()} onVerify={() => setVerificationTarget({ partNumber: detail.partNumber, name: detail.name })} onCrossReference={(code, name) => setCrossReference({ code, name })} onAskAi={openAi} />}
      {verificationTarget && <PartVerificationDialog target={verificationTarget} existing={verifications[normalizePartCode(verificationTarget.partNumber)]} onClose={() => setVerificationTarget(null)} onSaved={() => { setVerificationTarget(null); toast.success('Conferência enviada para aprovação.'); if (detail) void loadVerifications([detail]); }} />}
      {crossReference && <CrossReferenceDialog partCode={crossReference.code} partName={crossReference.name} onClose={() => setCrossReference(null)} />}

      {pdf && (
        <div className="fixed inset-0 z-[90] bg-slate-950/90 p-3 md:p-5">
          <div className="mx-auto flex h-full max-w-[1500px] flex-col overflow-hidden rounded-2xl bg-white dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800"><div className="truncate text-sm font-black">{pdf.title}</div><button type="button" onClick={() => setPdf(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold dark:border-slate-700">Fechar</button></div>
            <iframe title={pdf.title} src={`${pdf.url}${pdf.page ? `#page=${pdf.page}` : ''}`} className="h-full w-full border-0" />
          </div>
        </div>
      )}

      {aiOpen && (
        <div className="fixed inset-0 z-[80] flex justify-end">
          <button type="button" aria-label="Fechar assistente" onClick={() => setAiOpen(false)} className="absolute inset-0 bg-slate-950/45 backdrop-blur-[1px]" />
          <div className="relative z-10 h-full w-full max-w-[600px] bg-white shadow-2xl dark:bg-slate-900"><ChatPanel storageScope={storageScope || 'balcao-v3'} initialPrompt={aiPrompt} onClose={() => setAiOpen(false)} isDrawer /></div>
        </div>
      )}
    </section>
  );
}
