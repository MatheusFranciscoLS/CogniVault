import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'sonner';
import { api, apiJson, cleanErpCode, classifyPartKind } from '../../lib';
import { playCopySound } from '../../lib/sound';
import { useQuoteCart } from '../../context/QuoteCartContext';
import { useCounterSession } from '../../context/CounterSessionContext';
import type { MaintenanceKitItem, OfficialVerification, PartClassificationKind, PartDetail } from '../../types';
import OfficialVerificationApprovalPanel from '../OfficialVerificationApprovalPanel';
import PartVerificationDialog, { effectivePartNumber, isSupersededForCode, looksLikePartNumber, normalizePartCode } from '../PartVerificationDialog';
import CrossReferenceDialog from '../CrossReferenceDialog';
import ChatPanel from '../ChatPanel';
import CounterSessionBar from '../CounterSessionBar';
import CounterQuoteRail from '../CounterQuoteRail';
import CommercialPartRow from './CommercialPartRow';
import PartDetailDrawer from './PartDetailDrawer';
import PartQuickPreview from './PartQuickPreview';
import PartResultRow from './PartResultRow';
import SourceBadge from './SourceBadge';
import { recordQuoteUsage } from './quoteUsage';
import type { CommercialPart, HusqvarnaLivePart, OfficialFallbackResult, PdfPreview, PriceSection, SearchDocument, SearchResultPart, SearchStreamMessage } from './types';

type Props = { initialQuery: string; onQueryChange: (query: string) => void; admin?: boolean; storageScope?: string };
type ResultFilter = 'ALL' | PartClassificationKind;
type Selection = { kind: 'technical' | 'commercial'; id: string } | null;

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

function EmptySearch({ hasContext }: { hasContext: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center dark:border-slate-700 dark:bg-slate-900">
      <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-lg text-[#1d4f91] dark:bg-blue-950/30 dark:text-blue-300">⌕</div>
      <h2 className="mt-4 text-base font-black text-slate-900 dark:text-white">Pronto para o próximo item</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">
        {hasContext
          ? 'Digite apenas a peça ou o código. Modelo e PNC do atendimento serão usados automaticamente para refinar a busca técnica.'
          : 'Pesquise por código, descrição, modelo ou PNC. O CogniVault cruza catálogo, cadastro comercial e validação oficial.'}
      </p>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      {[0, 1, 2, 3].map(item => (
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

export default function PartSearchWorkspace({ initialQuery, onQueryChange, admin = false, storageScope }: Props) {
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
  const [filter, setFilter] = useState<ResultFilter>('ALL');
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
      // Mantém o código informado quando a validação salva não estiver disponível.
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
    setFilter('ALL');
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

  const displayedParts = useMemo(() => filter === 'ALL' ? parts : parts.filter(part => (part.classification ?? classifyPartKind(part.name, part.section, part.notes)).kind === filter), [filter, parts]);
  const filterCounts = useMemo(() => {
    const counts: Record<ResultFilter, number> = { ALL: parts.length, ASSEMBLY: 0, REPAIR_KIT: 0, INDIVIDUAL_PART: 0 };
    for (const part of parts) counts[(part.classification ?? classifyPartKind(part.name, part.section, part.notes)).kind] += 1;
    return counts;
  }, [parts]);
  const activeModel = useMemo(() => {
    const models = [...new Set(parts.map(part => part.model).filter(Boolean))];
    return models.length === 1 ? models[0] : '';
  }, [parts]);
  const maintenanceModel = activeModel || session.machineModel.trim();
  const selectedTechnical = useMemo(() => selection?.kind === 'technical' ? displayedParts.find(part => part.id === selection.id) : undefined, [displayedParts, selection]);
  const selectedCommercial = useMemo(() => selection?.kind === 'commercial' ? commercialParts.find(part => part.id === selection.id) : undefined, [commercialParts, selection]);
  const selectedVerification = selectedTechnical ? verifications[normalizePartCode(selectedTechnical.partNumber)] : undefined;

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
      if (lastQuery) {
        void apiJson('/api/analytics/search-usage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: lastQuery, partId: data.part.id, partNumber: data.part.partNumber, name: data.part.name, model: data.part.model, pnc: data.part.pnc, sourceFilename: data.part.filename }),
        }).catch(() => undefined);
      }
      void apiJson<{ livePart: HusqvarnaLivePart }>(`/api/parts/${encodeURIComponent(data.part.partNumber)}/live-data`)
        .then(response => setLiveData(response.livePart))
        .catch(() => undefined);
    } catch (partError) {
      setError(partError instanceof Error ? partError.message : 'Não foi possível abrir a peça.');
    } finally {
      setDetailLoadingId(null);
    }
  }, [lastQuery, loadVerifications]);

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

  const addMaintenanceKit = useCallback(async () => {
    if (!maintenanceModel) return;
    try {
      const data = await apiJson<{ items: MaintenanceKitItem[] }>(`/api/models/${encodeURIComponent(maintenanceModel)}/maintenance-kit`);
      const items = data.items
        .filter((item): item is MaintenanceKitItem & { part: NonNullable<MaintenanceKitItem['part']> } => Boolean(item.part))
        .map(item => {
          const code = cleanErpCode(item.part.partNumber);
          return { partNumber: code, effectiveCode: code, name: item.part.name, model: item.part.model || maintenanceModel, pnc: item.part.pnc, section: item.part.section || item.label, position: item.part.position, filename: item.part.filename, page: item.part.page };
        });
      if (!items.length) {
        toast.info(`Nenhum kit de revisão cadastrado para ${maintenanceModel}.`);
        return;
      }
      quoteCart.addItems(items);
    } catch (kitError) {
      toast.error(kitError instanceof Error ? kitError.message : 'Não foi possível carregar o kit de revisão.');
    }
  }, [maintenanceModel, quoteCart]);

  const beginSearch = (value: string) => {
    const clean = value.trim();
    if (clean.length < 2) return;
    setQuery(clean);
    if (clean !== initialQuery.trim()) onQueryChange(clean);
    else void runSearch(clean);
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
    setCommercialParts([]);
    setOfficialResult(null);
    setLastQuery('');
    setHasSearched(false);
    setError('');
    setSelection(null);
    setFilter('ALL');
    setPriceSection('');
    onQueryChange('');
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const changePriceSection = (section: string) => {
    setPriceSection(section);
    setSelection(null);
    if (lastQuery.length >= 2) {
      void fetchCommercial(lastQuery, section).then(items => {
        if (items?.[0]) setSelection({ kind: 'commercial', id: items[0].id });
      });
    }
  };

  const openAi = (prompt: string) => {
    setAiPrompt(prompt);
    setAiOpen(true);
  };

  const addSelectedToQuote = useCallback(() => {
    if (selectedTechnical) {
      const verification = verifications[normalizePartCode(selectedTechnical.partNumber)];
      const code = cleanErpCode(effectivePartNumber(selectedTechnical.partNumber, verification));
      const superseded = isSupersededForCode(selectedTechnical.partNumber, verification);
      recordQuoteUsage([...quoteCart.items, { partNumber: code, model: selectedTechnical.model }], quoteCart.items.length === 0);
      quoteCart.addItem({
        partNumber: code,
        effectiveCode: code,
        name: selectedTechnical.name,
        model: selectedTechnical.model,
        pnc: selectedTechnical.pnc,
        section: selectedTechnical.section,
        position: selectedTechnical.position,
        filename: selectedTechnical.filename,
        page: selectedTechnical.page,
        isSuperseded: superseded,
        originalCode: superseded ? cleanErpCode(selectedTechnical.partNumber) : undefined,
        notes: selectedTechnical.notes,
        unitPrice: selectedTechnical.price ?? undefined,
      });
      return;
    }

    if (selectedCommercial) {
      const code = cleanErpCode(selectedCommercial.partNumber);
      const applications = selectedCommercial.applications?.length
        ? selectedCommercial.applications
        : selectedCommercial.application
          ? [selectedCommercial.application]
          : [];
      const application = applications[0] || selectedCommercial.productCategories[0] || session.machineModel || 'Aplicação não informada';
      recordQuoteUsage([...quoteCart.items, { partNumber: code, model: application }], quoteCart.items.length === 0);
      quoteCart.addItem({
        partNumber: code,
        effectiveCode: code,
        name: selectedCommercial.name,
        model: application,
        pnc: session.pnc || null,
        section: selectedCommercial.priceSections[0] || 'Cadastro comercial',
        position: null,
        filename: 'Cadastro comercial',
        page: null,
        unitPrice: selectedCommercial.price ?? undefined,
      });
    }
  }, [quoteCart, selectedCommercial, selectedTechnical, session.machineModel, session.pnc, verifications]);

  const visibleSelection = useMemo(() => [
    ...displayedParts.map(part => ({ kind: 'technical' as const, id: part.id })),
    ...commercialParts.map(part => ({ kind: 'commercial' as const, id: part.id })),
  ], [commercialParts, displayedParts]);

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
        return;
      }
      if (isTypingTarget(event.target) || detail || pdf || aiOpen || verificationTarget || crossReference || !visibleSelection.length) return;
      const currentIndex = selection ? visibleSelection.findIndex(item => item.kind === selection.kind && item.id === selection.id) : -1;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        const base = currentIndex < 0 ? (direction > 0 ? -1 : 0) : currentIndex;
        const next = (base + direction + visibleSelection.length) % visibleSelection.length;
        setSelection(visibleSelection[next]);
        return;
      }
      if (event.key === 'Enter' && selection?.kind === 'technical') {
        event.preventDefault();
        void openPart(selection.id);
        return;
      }
      if (event.key.toLowerCase() === 'a') {
        event.preventDefault();
        addSelectedToQuote();
        return;
      }
      if (event.key.toLowerCase() === 'c') {
        const technical = selection?.kind === 'technical' ? displayedParts.find(part => part.id === selection.id) : undefined;
        const commercial = selection?.kind === 'commercial' ? commercialParts.find(part => part.id === selection.id) : undefined;
        if (technical) {
          event.preventDefault();
          void copyCode(effectivePartNumber(technical.partNumber, verifications[normalizePartCode(technical.partNumber)]));
        } else if (commercial) {
          event.preventDefault();
          void copyCode(commercial.partNumber);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [addSelectedToQuote, aiOpen, commercialParts, copyCode, crossReference, detail, displayedParts, openPart, pdf, selection, verificationTarget, verifications, visibleSelection]);

  const detailVerification = detail ? verifications[normalizePartCode(detail.partNumber)] : undefined;
  const hasLocalResults = parts.length > 0 || commercialParts.length > 0;

  return (
    <section className="space-y-4">
      <CounterSessionBar />

      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[.15em] text-[#1d4f91] dark:text-blue-300">Área de atendimento</div>
          <h1 className="mt-1 text-2xl font-black tracking-[-.03em] text-slate-950 dark:text-white">Localizar peça</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Catálogo técnico, cadastro comercial e validação oficial no mesmo fluxo.</p>
        </div>
        {maintenanceModel && (
          <button type="button" onClick={() => void addMaintenanceKit()} className="h-9 rounded-lg border border-amber-300 bg-amber-50 px-3 text-[10px] font-black text-amber-900 transition hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">+ Kit de revisão · {maintenanceModel}</button>
        )}
      </div>

      <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
            <input
              ref={inputRef}
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={hasContext ? 'Digite a peça ou código deste atendimento...' : 'Código, descrição, modelo ou PNC...'}
              autoComplete="off"
              className="h-12 w-full rounded-xl border-0 bg-slate-50 pl-10 pr-4 text-sm font-semibold text-slate-900 outline-none transition focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-800"
            />
          </div>
          {query && <button type="button" onClick={clearSearch} className="hidden h-10 rounded-lg px-3 text-xs font-bold text-slate-400 hover:text-slate-700 sm:block dark:hover:text-slate-200">Limpar</button>}
          <button type="submit" disabled={loading} className="h-12 rounded-xl bg-[#123867] px-5 text-sm font-black text-white transition hover:bg-[#0d2c52] disabled:opacity-60">{loading ? 'Buscando…' : 'Buscar'}</button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 pb-1 pt-2 text-[10px] font-medium text-slate-400 dark:border-slate-800">
          <div className="flex flex-wrap gap-x-4 gap-y-1"><span><kbd>/</kbd> focar</span><span><kbd>↑</kbd><kbd>↓</kbd> selecionar</span><span><kbd>Enter</kbd> detalhes</span><span><kbd>A</kbd> orçamento</span><span><kbd>C</kbd> copiar</span></div>
          {hasContext && <span className="font-bold text-emerald-600 dark:text-emerald-400">Busca técnica com contexto · {session.machineModel || 'modelo'}{session.pnc ? ` · PNC ${session.pnc}` : ''}</span>}
        </div>
      </form>

      {admin && (
        <details className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
          <summary className="cursor-pointer text-xs font-black text-slate-600 dark:text-slate-300">Conferências oficiais pendentes</summary>
          <div className="mt-4"><OfficialVerificationApprovalPanel onChanged={() => { if (parts.length) void loadVerifications(parts, true); if (detail) void loadVerifications([detail]); }} /></div>
        </details>
      )}

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}

      {parts.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <div className="flex flex-wrap gap-1.5">
            {filterOptions.map(option => {
              const count = filterCounts[option.id];
              if (option.id !== 'ALL' && count === 0) return null;
              return <button key={option.id} type="button" onClick={() => { setFilter(option.id); setSelection(null); }} className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold ${filter === option.id ? 'border-[#123867] bg-[#123867] text-white' : 'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}>{option.label} <span className="ml-1 opacity-70">{count}</span></button>;
            })}
          </div>
          <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-400"><SourceBadge source="CATALOG" compact /> {displayedParts.length} resultado{displayedParts.length === 1 ? '' : 's'}</div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0 space-y-5">
          {loading && parts.length === 0 && commercialParts.length === 0 ? <LoadingRows /> : null}

          {displayedParts.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between gap-3 px-1">
                <div className="flex items-center gap-2"><SourceBadge source="CATALOG" /><span className="text-xs font-black text-slate-700 dark:text-slate-200">Resultado técnico</span></div>
                <span className="text-[10px] text-slate-400">Aplicação e posição do catálogo</span>
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                {displayedParts.map(part => (
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
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1">
                <div>
                  <div className="flex items-center gap-2"><SourceBadge source="PRICE_LIST" /><span className="text-xs font-black text-slate-700 dark:text-slate-200">Cadastro comercial</span></div>
                  <p className="mt-1 text-[10px] text-slate-400">Preço e cadastro persistidos no PostgreSQL.</p>
                </div>
                <span className="text-xs font-semibold text-slate-400">{commercialLoading ? 'Consultando…' : `${commercialParts.length} resultado${commercialParts.length === 1 ? '' : 's'}`}</span>
              </div>
              {priceSections.length > 0 && (
                <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                  <button type="button" onClick={() => changePriceSection('')} className={`whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[10px] font-black ${!priceSection ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900'}`}>Todas</button>
                  {priceSections.map(section => <button key={section.name} type="button" onClick={() => changePriceSection(section.name)} className={`whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[10px] font-black ${priceSection === section.name ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900'}`}>{section.name} · {section.count}</button>)}
                </div>
              )}
              <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                {commercialParts.map(part => <CommercialPartRow key={part.id} part={part} selected={selection?.kind === 'commercial' && selection.id === part.id} onSelect={() => setSelection({ kind: 'commercial', id: part.id })} onCopy={code => void copyCode(code)} onOfficial={item => void consultOfficial(item.partNumber)} />)}
              </div>
            </section>
          )}

          {hasSearched && !loading && !commercialLoading && !hasLocalResults && (
            <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
              <div className="flex justify-center"><SourceBadge source={officialResult?.status === 'FOUND' ? 'OFFICIAL' : 'REVIEW'} /></div>
              {officialLoading ? (
                <div className="mt-4 text-sm font-semibold text-slate-500">Consultando fonte oficial…</div>
              ) : officialResult?.status === 'FOUND' ? (
                <div className="mt-4">
                  <h2 className="text-base font-black text-slate-900 dark:text-white">{officialResult.name}</h2>
                  {officialResult.message && <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">{officialResult.message}</p>}
                  {officialResult.partNumber && <div className="mt-2 font-mono text-2xl font-black text-[#123867] dark:text-blue-300">{cleanErpCode(officialResult.partNumber)}</div>}
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {officialResult.partNumber && <button type="button" onClick={() => void copyCode(officialResult.partNumber!)} className="rounded-lg bg-[#123867] px-4 py-2 text-xs font-black text-white">Copiar código</button>}
                    {officialResult.url ? <a href={officialResult.url} target="_blank" rel="noreferrer" className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-black text-indigo-700">Abrir fonte oficial ↗</a> : <span className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-500">Produto confirmado · link direto indisponível</span>}
                  </div>
                </div>
              ) : (
                <div className="mt-4">
                  <h2 className="text-base font-black text-slate-900 dark:text-white">Catálogo ainda não disponível no CogniVault</h2>
                  <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">{officialResult?.message || 'Não encontrei uma resposta segura nas fontes locais.'}</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <a href={officialResult?.url || 'https://www.husqvarna.com/br/pecas-sobressalentes/'} target="_blank" rel="noreferrer" className="rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-black text-white">Continuar no localizador Husqvarna ↗</a>
                    <button type="button" onClick={() => openAi(`Não encontrei "${lastQuery}" nas fontes locais. Ajude a identificar o que deve ser conferido na fonte oficial.`)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-600 dark:border-slate-700 dark:text-slate-300">Perguntar à IA</button>
                  </div>
                </div>
              )}
            </section>
          )}

          {!hasSearched && <EmptySearch hasContext={hasContext} />}

          {documents.length > 0 && (
            <section>
              <div className="mb-2 px-1 text-[10px] font-black uppercase tracking-[.14em] text-slate-400">Catálogos encontrados</div>
              <div className="grid gap-2 md:grid-cols-2">
                {documents.map(document => <button key={document.id} type="button" onClick={() => void accessPdf(document.id, null, document.filename)} className="rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-blue-300 dark:border-slate-800 dark:bg-slate-900"><div className="truncate text-xs font-black text-slate-800 dark:text-slate-100">{document.filename}</div><div className="mt-1 text-[10px] text-slate-400">{document.model || 'Modelo não informado'} · {document.partCount} peças</div></button>)}
              </div>
            </section>
          )}
        </div>

        <aside className="min-w-0 space-y-4">
          <CounterQuoteRail />
          <PartQuickPreview
            technical={selectedTechnical}
            commercial={selectedCommercial}
            verification={selectedVerification}
            onCopy={code => void copyCode(code)}
            onOpenTechnical={id => void openPart(id)}
            onCrossReference={(code, name) => setCrossReference({ code, name })}
            onOfficial={value => void consultOfficial(value)}
          />
        </aside>
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
          <button type="button" aria-label="Fechar assistente" onClick={() => setAiOpen(false)} className="absolute inset-0 bg-slate-950/40" />
          <div className="relative z-10 h-full w-full max-w-[560px] bg-white shadow-2xl dark:bg-slate-900"><ChatPanel storageScope={storageScope || 'balcao-v2'} initialPrompt={aiPrompt} onClose={() => setAiOpen(false)} isDrawer /></div>
        </div>
      )}
    </section>
  );
}
