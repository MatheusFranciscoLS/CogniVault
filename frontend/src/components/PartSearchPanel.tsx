import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, MouseEvent as ReactMouseEvent } from 'react';
import { api, apiJson, formatHusqvarnaPartNumber, json } from '../lib';
import { toast } from 'sonner';
import type { OfficialVerification, PartDetail, SearchPart } from '../types';
import OfficialVerificationApprovalPanel from './OfficialVerificationApprovalPanel';
import ChatPanel from './ChatPanel';
import { useQuoteCart } from '../context/QuoteCartContext';
import { playCopySound } from '../lib/sound';
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

function exportPartsCsv(partsToExport: SearchPart[], searchQuery: string) {
  const header = ['Código Oficial', 'Código Formatado', 'Descrição da Peça', 'Modelo', 'PNC', 'Posição', 'Catálogo', 'Observações'];
  const rows = partsToExport.map(p => [
    p.partNumber,
    formatHusqvarnaPartNumber(p.partNumber),
    `"${(p.name || '').replace(/"/g, '""')}"`,
    `"${(p.model || '').replace(/"/g, '""')}"`,
    `"${(p.pnc || '').replace(/"/g, '""')}"`,
    `"${(p.position || '').replace(/"/g, '""')}"`,
    `"${(p.filename || '').replace(/"/g, '""')}"`,
    `"${(p.notes || '').replace(/"/g, '""')}"`,
  ]);
  const csvContent = '\uFEFF' + [header.join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const cleanName = searchQuery.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'pecas';
  link.setAttribute('download', `cognivault_${cleanName}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  toast.success('Planilha CSV de peças exportada com sucesso!');
}

const SYSTEM_FILTERS = [
  { key: 'ALL', label: 'Todos', icon: '🔍', regex: /.*/ },
  { key: 'MOTOR', label: 'Motor & Pistão', icon: '⚙️', regex: /pist[aã]o|cilindr|anel|virabrequim|biela|c[aá]rter|bloco|virabr|retentor/i },
  { key: 'CARBURADOR', label: 'Carburador & Combustível', icon: '⛽', regex: /carburad|diafrag|junta carb|combust|tanque|pescador|mangueira|purga|primer|afogad|gicl/i },
  { key: 'PARTIDA', label: 'Partida & Ignição', icon: '⚡', regex: /arranque|partida|corda|recolh|mola part|bobina|vela|volante|igni[cç]|cabo vela/i },
  { key: 'CORTE', label: 'Corte, Lâmina & Sabre', icon: '🪚', regex: /sabre|corrente|l[aâ]mina|faca|cabe[cç]ote|carretel|nylon|skid|flange|prato|prote[cç][aã]o/i },
  { key: 'TRANSMISSAO', label: 'Embreagem & Transmissão', icon: '🔄', regex: /embreag|tambor|pinh[aã]o|sapata|mola emb|eixo|tubo|engrenag|redutor/i },
  { key: 'FILTRO_ESCAPE', label: 'Filtros & Escape', icon: '💨', regex: /filtro|ar|espuma|silencios|escapamento|abafador|tampa filtro/i },
] as const;

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
  const [activeSystemFilter, setActiveSystemFilter] = useState<string>('ALL');
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const quoteCart = useQuoteCart();

  const availableSystemFilters = useMemo(() => {
    if (parts.length < 3) return [];
    return SYSTEM_FILTERS.filter(filter => {
      if (filter.key === 'ALL') return true;
      return parts.some(p => filter.regex.test(p.name) || filter.regex.test(p.section || ''));
    });
  }, [parts]);

  const displayedParts = useMemo(() => {
    if (activeSystemFilter === 'ALL') return parts;
    const target = SYSTEM_FILTERS.find(f => f.key === activeSystemFilter);
    if (!target) return parts;
    return parts.filter(p => target.regex.test(p.name) || target.regex.test(p.section || ''));
  }, [parts, activeSystemFilter]);

  const quickFilters = useMemo(() => [
    { label: '🌿 143RII', query: '143RII' },
    { label: '🌲 120 Mark II', query: '120 Mark II' },
    { label: '⚙️ 345FR', query: '345FR' },
    { label: '🔥 272XP', query: '272XP' },
    { label: '💨 Soprador 125B', query: '125B' },
    { label: '⭐ Carburadores', query: 'carburador' },
    { label: '⚡ Velas & Purga', query: 'vela' },
    { label: '🔄 Substituição Oficial', query: '587106701' },
  ], []);

  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('cognivault_recent_searches');
      return stored ? (JSON.parse(stored) as string[]) : [];
    } catch {
      return [];
    }
  });

  const saveRecentSearch = useCallback((term: string) => {
    const clean = term.trim();
    if (!clean || clean.length < 2) return;
    setRecentSearches(prev => {
      const next = [clean, ...prev.filter(t => t.toLowerCase() !== clean.toLowerCase())].slice(0, 8);
      try {
        localStorage.setItem('cognivault_recent_searches', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const clearRecentSearches = useCallback(() => {
    try {
      localStorage.removeItem('cognivault_recent_searches');
    } catch {
      // ignore
    }
    setRecentSearches([]);
    toast.success('Histórico de pesquisas recentes limpo.');
  }, []);

  const copyPartDirectLink = useCallback(async (partCode: string) => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?tab=parts&code=${encodeURIComponent(partCode)}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      playCopySound();
      toast.success('Link direto da peça copiado com sucesso!');
    } catch {
      toast.info(`Link direto: ${shareUrl}`);
    }
  }, []);

  const sendPartWhatsApp = useCallback((partDetail: PartDetail, codeToUse: string) => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?tab=parts&code=${encodeURIComponent(codeToUse)}`;
    const formatted = formatHusqvarnaPartNumber(codeToUse);
    const text = `*Peça Husqvarna — Vardão Máquinas*\n\n` +
      `🔧 *Peça:* ${partDetail.name}\n` +
      `🔢 *Código:* ${formatted}${codeToUse !== partDetail.partNumber ? ` (Substitui: ${formatHusqvarnaPartNumber(partDetail.partNumber)})` : ''}\n` +
      `🚜 *Aplicação:* ${partDetail.model}${partDetail.pnc ? ` · PNC ${partDetail.pnc}` : ''}\n` +
      (partDetail.position ? `📍 *Posição:* ${partDetail.position}${partDetail.page ? ` (Pág. ${partDetail.page})` : ''}\n` : '') +
      `\n🔗 *Consulte no catálogo:* ${shareUrl}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank', 'noreferrer');
  }, []);

  const sendCardPartWhatsApp = useCallback((partItem: SearchPart, codeToUse: string) => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?tab=parts&code=${encodeURIComponent(codeToUse)}`;
    const formatted = formatHusqvarnaPartNumber(codeToUse);
    const text = `*Peça Husqvarna — Vardão Máquinas*\n\n` +
      `🔧 *Peça:* ${partItem.name}\n` +
      `🔢 *Código:* ${formatted}${codeToUse !== partItem.partNumber ? ` (Substitui: ${formatHusqvarnaPartNumber(partItem.partNumber)})` : ''}\n` +
      `🚜 *Aplicação:* ${partItem.model}${partItem.pnc ? ` · PNC ${partItem.pnc}` : ''}\n` +
      (partItem.position ? `📍 *Posição:* ${partItem.position}${partItem.page ? ` (Pág. ${partItem.page})` : ''}\n` : '') +
      (partItem.section ? `📂 *Seção:* ${partItem.section}\n` : '') +
      `\n🔗 *Consulte no catálogo:* ${shareUrl}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank', 'noreferrer');
  }, []);

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
    setActiveSystemFilter('ALL');
    saveRecentSearch(value);

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
  }, [loadVerifications, resolveSearchCode, saveRecentSearch]);

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
      playCopySound();
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
      saveRecentSearch(value);
      onQueryChange(value);
      return;
    }
    saveRecentSearch(value);
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
  const detailFormattedCode = useMemo(
    () => detailCode ? formatHusqvarnaPartNumber(detailCode) : '',
    [detailCode],
  );
  const detailInCart = useMemo(
    () => detail ? quoteCart.items.find(i => normalizePartCode(i.partNumber) === normalizePartCode(detailCode) || normalizePartCode(i.partNumber) === normalizePartCode(detail.partNumber)) : undefined,
    [detail, detailCode, quoteCart.items],
  );

  const [userNoteOverride, setUserNoteOverride] = useState<{ code: string; text: string } | null>(null);
  const [editingNote, setEditingNote] = useState(false);

  const warehouseNote = useMemo(() => {
    if (!detailCode) return '';
    if (userNoteOverride && userNoteOverride.code === detailCode) {
      return userNoteOverride.text;
    }
    try {
      return localStorage.getItem(`cognivault_part_note_${detailCode}`) || '';
    } catch {
      return '';
    }
  }, [detailCode, userNoteOverride]);

  const saveWarehouseNote = (text: string) => {
    if (!detailCode) return;
    try {
      if (text.trim()) {
        localStorage.setItem(`cognivault_part_note_${detailCode}`, text.trim());
      } else {
        localStorage.removeItem(`cognivault_part_note_${detailCode}`);
      }
      setUserNoteOverride({ code: detailCode, text: text.trim() });
      setEditingNote(false);
      toast.success('Localização de estoque registrada.');
    } catch {
      // ignore
    }
  };

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

      {/* Atalhos Rápidos de Balcão */}
      <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 cv-scrollbar">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
          Atalhos rápidos:
        </span>
        {quickFilters.map(filter => (
          <button
            key={filter.query}
            type="button"
            onClick={() => {
              setQuery(filter.query);
              onQueryChange(filter.query);
              void runSearch(filter.query);
            }}
            className="shrink-0 rounded-full border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70 px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 shadow-sm transition hover:border-[#1d4f91] hover:bg-blue-50 dark:hover:bg-slate-700 active:scale-95"
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Buscas Recentes */}
      {recentSearches.length > 0 && (
        <div className="mt-2.5 flex items-center gap-2 overflow-x-auto pb-1 cv-scrollbar">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
            Recentes:
          </span>
          {recentSearches.map(term => (
            <button
              key={term}
              type="button"
              onClick={() => {
                setQuery(term);
                onQueryChange(term);
                void runSearch(term);
              }}
              className="shrink-0 rounded-full border border-blue-200 dark:border-blue-700/60 bg-blue-50/70 dark:bg-blue-900/30 px-2.5 py-1 text-xs font-medium text-[#1d4f91] dark:text-blue-300 shadow-2xs transition hover:bg-blue-100 dark:hover:bg-blue-900/50 active:scale-95 flex items-center gap-1"
            >
              <span className="text-[10px] text-blue-400">🕒</span>
              <span>{term}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={clearRecentSearches}
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            Limpar
          </button>
        </div>
      )}

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
              {parts.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => exportPartsCsv(displayedParts, activeSystemFilter !== 'ALL' ? `${query}_${activeSystemFilter}` : query)}
                    title="Exportar resultados para planilha Excel / CSV"
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:border-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-400 transition shadow-2xs active:scale-95"
                  >
                    <span>📊</span>
                    <span className="hidden sm:inline">Exportar CSV</span>
                  </button>
                  <span className="cv-soft-badge hidden sm:inline-flex">Selecione para ver compatibilidade</span>
                </>
              )}
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

          {/* Filtro por Sistema / Categoria */}
          {availableSystemFilters.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 px-4 py-2 cv-scrollbar">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0 mr-1">
                Filtrar:
              </span>
              {availableSystemFilters.map(filter => {
                const count = filter.key === 'ALL'
                  ? parts.length
                  : parts.filter(p => filter.regex.test(p.name) || filter.regex.test(p.section || '')).length;
                const active = activeSystemFilter === filter.key;
                return (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => setActiveSystemFilter(filter.key)}
                    className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition flex items-center gap-1.5 active:scale-95 ${
                      active
                        ? 'bg-[#123867] text-white shadow-2xs font-bold'
                        : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span>{filter.icon}</span>
                    <span>{filter.label}</span>
                    <span className={`rounded-full px-1.5 py-0.2 text-[9px] font-bold ${
                      active
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {loading ? <SearchSkeleton /> : (
            <div className="divide-y divide-slate-100">
              {displayedParts.map((part, index) => {
                const selected = selectedIndex === index;
                const opening = detailLoadingId === part.id;
                const verification = verifications[normalizePartCode(part.partNumber)];
                const superseded = isSupersededForCode(part.partNumber, verification);
                const codeToUse = effectivePartNumber(part.partNumber, verification);
                const isCurrentReplacement = verification?.state === 'SUPERSEDED'
                  && !superseded
                  && normalizePartCode(part.partNumber) === normalizePartCode(verification.currentPartNumber);

                const formattedCode = formatHusqvarnaPartNumber(codeToUse);
                const inCart = quoteCart.items.find(i => i.partNumber === part.partNumber && i.model === part.model);

                return (
                  <article key={part.id} className={`grid gap-3 p-3.5 rounded-2xl transition sm:grid-cols-[minmax(0,1fr)_220px] ${selected ? 'bg-blue-50/90 dark:bg-[#123867]/80 ring-2 ring-blue-400/50 shadow-md' : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/60 border border-slate-100 dark:border-slate-800/80'}`}>
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
                          <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{part.name}</div>
                          <div className="mt-1 flex flex-wrap items-baseline gap-2">
                            <span className="text-xl font-extrabold font-mono tracking-tight text-[#1d4f91] dark:text-blue-300">
                              {superseded ? (
                                <>
                                  <span className="text-slate-400 line-through text-base mr-1">{formatHusqvarnaPartNumber(part.partNumber)}</span>
                                  <span className="text-emerald-600 dark:text-emerald-400">→ {formattedCode}</span>
                                </>
                              ) : formattedCode}
                            </span>
                            {formattedCode !== codeToUse && (
                              <span className="text-[11px] font-mono text-slate-400">
                                ({codeToUse})
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void copyCode(formattedCode);
                              }}
                              title="Copiar código formatado"
                              className="ml-1 inline-flex items-center rounded-md p-1 text-slate-400 hover:text-[#1d4f91] dark:hover:text-blue-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                            >
                              📋
                            </button>
                          </div>
                          {isCurrentReplacement && <div className="mt-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">Código atual de {verification?.queriedPartNumber}</div>}
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
                        <div className="flex items-center gap-1.5 shrink-0">
                          {part.position && <span className="rounded-full bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 px-2.5 py-1 text-[10px] font-bold text-slate-600 dark:text-slate-300">Pos. {part.position}</span>}
                          {part.page && <span className="rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 px-2.5 py-1 text-[10px] font-bold text-[#1d4f91] dark:text-blue-300">Pág. {part.page}</span>}
                        </div>
                      </div>
                      <div className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
                        <div><span className="block text-[9px] font-bold uppercase tracking-[.1em] text-slate-400">Modelo</span><strong className="mt-0.5 block text-slate-700 dark:text-slate-200">{part.model}</strong></div>
                        <div><span className="block text-[9px] font-bold uppercase tracking-[.1em] text-slate-400">PNC</span><strong className="mt-0.5 block text-slate-700 dark:text-slate-200">{part.pnc || '—'}</strong></div>
                        <div><span className="block text-[9px] font-bold uppercase tracking-[.1em] text-slate-400">Catálogo</span><strong className="mt-0.5 block truncate text-slate-700 dark:text-slate-200">{part.filename}</strong></div>
                      </div>
                    </button>

                    <div className="flex flex-wrap items-center gap-2 self-center px-2 pb-2 sm:flex-col sm:items-stretch sm:pb-0">
                      <VerificationBadge verification={verification} loading={verificationLoading} />
                      
                      {/* Botão de Adicionar ao Orçamento */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          quoteCart.addItem({
                            partNumber: part.partNumber,
                            effectiveCode: codeToUse,
                            name: part.name,
                            model: part.model,
                            pnc: part.pnc,
                            section: part.section,
                            position: part.position,
                            isSuperseded: Boolean(superseded),
                            originalCode: superseded ? part.partNumber : undefined,
                            notes: part.notes,
                          });
                        }}
                        className={`rounded-xl px-3 py-2 text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm active:scale-95 ${
                          inCart
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                            : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-amber-500/20'
                        }`}
                      >
                        <span>{inCart ? '✓' : '+'}</span>
                        <span>{inCart ? `No Orçamento (${inCart.quantity}x)` : 'Adicionar ao Orçamento'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void copyCode(formattedCode)}
                        className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-[#1d4f91] dark:text-blue-300 transition hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-slate-700"
                      >
                        Copiar código
                      </button>

                      <button
                        type="button"
                        onClick={() => openAiAssistant(`Tenho uma dúvida sobre a peça ${part.name} (código ${codeToUse}) do modelo ${part.model}. Pode me ajudar com a aplicação e compatibilidade?`)}
                        className="rounded-xl border border-indigo-200 dark:border-indigo-800/80 bg-indigo-50/60 dark:bg-indigo-950/40 px-3 py-1.5 text-center text-xs font-semibold text-indigo-700 dark:text-indigo-300 transition hover:bg-indigo-100 dark:hover:bg-indigo-900/60"
                      >
                        ✦ Perguntar à IA
                      </button>

                      {/* Ações Rápidas de Balcão: WhatsApp + Vista Explodida do Catálogo */}
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            sendCardPartWhatsApp(part, codeToUse);
                          }}
                          title="Enviar dados da peça no WhatsApp do cliente"
                          className="flex-1 rounded-xl border border-emerald-300 dark:border-emerald-700/80 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 px-2 py-1.5 text-[11px] font-bold transition flex items-center justify-center gap-1 active:scale-95"
                        >
                          <span>💬</span>
                          <span>WhatsApp</span>
                        </button>
                        {part.documentId ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void accessPdf(part.documentId, part.page, `${part.model} — ${part.filename}`);
                            }}
                            title={`Abrir vista explodida do catálogo (${part.filename}${part.page ? ` - Pág. ${part.page}` : ''})`}
                            className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-1.5 text-[11px] font-semibold transition flex items-center justify-center gap-1 active:scale-95"
                          >
                            <span>📄</span>
                            <span>{part.page ? `Pág. ${part.page}` : 'Catálogo'}</span>
                          </button>
                        ) : null}
                      </div>

                      {/* Detalhes & Link Oficial */}
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void openPart(part.id)}
                          disabled={opening}
                          className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
                        >
                          {opening ? 'Abrindo…' : 'Detalhes'}
                        </button>
                        <a
                          href={verification?.officialUrl || husqvarnaPortalUrl(codeToUse)}
                          target="_blank"
                          rel="noreferrer"
                          title="Verificar no portal oficial Husqvarna"
                          className="rounded-xl border border-blue-200 dark:border-blue-600 bg-blue-50 dark:bg-[#123867] px-2.5 py-1.5 text-center text-[11px] font-semibold text-[#1d4f91] dark:text-blue-300 transition hover:bg-blue-100 dark:hover:bg-blue-900/60"
                        >
                          Husqvarna ↗
                        </a>
                      </div>
                    </div>
                  </article>
                );
              })}

              {parts.length > 0 && displayedParts.length === 0 && (
                <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  <span>Nenhuma peça encontrada no filtro selecionado.</span>
                  <button
                    type="button"
                    onClick={() => setActiveSystemFilter('ALL')}
                    className="ml-2 font-bold text-[#1d4f91] dark:text-blue-300 hover:underline"
                  >
                    Ver todas as {parts.length} peças
                  </button>
                </div>
              )}

              {!parts.length && (
                <div className="p-6 text-center">
                  <EmptyState
                    title={hasSearched ? 'Nenhuma peça encontrada' : 'Pronto para pesquisar'}
                    description={hasSearched ? `Não encontramos “${lastQuery}”. Tente o código sem pontuação, o modelo ou o PNC.` : 'Digite ao menos 2 caracteres para consultar a base indexada.'}
                  />
                  {hasSearched && (
                    <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => openAiAssistant(`Não encontrei a peça "${lastQuery}" pela busca direta. Pode me ajudar a identificar o código original ou peça correspondente no catálogo Husqvarna?`)}
                        className="inline-flex items-center gap-2 rounded-xl border border-indigo-300/60 dark:border-indigo-500/60 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 text-xs font-semibold shadow-sm transition"
                      >
                        <span className="text-amber-300 font-bold" aria-hidden="true">✦</span>
                        <span>Perguntar ao Assistente IA sobre “{lastQuery}”</span>
                      </button>
                      <button
                        type="button"
                        onClick={clearSearch}
                        className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                      >
                        Nova pesquisa
                      </button>
                    </div>
                  )}
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
                <div className="rounded-[22px] bg-gradient-to-br from-[#0a1b38] to-[#122e5a] p-6 text-white shadow-xl relative overflow-hidden">
                  <div className="text-xs font-semibold tracking-wider uppercase text-blue-200/80">Código da peça</div>
                  <div className="mt-2 flex flex-wrap items-baseline gap-3">
                    <div className="break-all text-3xl font-bold tracking-[-.04em]">
                      {detailWasSuperseded ? (
                        <>
                          <span className="text-slate-400 line-through text-2xl mr-2">{formatHusqvarnaPartNumber(detail.partNumber)}</span>
                          <span className="text-emerald-400 font-extrabold">{detailFormattedCode}</span>
                        </>
                      ) : (
                        <span>{detailFormattedCode}</span>
                      )}
                    </div>
                    {detailCode !== detailFormattedCode && (
                      <span className="text-xs text-blue-200/70 font-mono">({detailCode})</span>
                    )}
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        quoteCart.addItem({
                          partNumber: detailCode,
                          name: detail.name,
                          model: detail.model,
                          position: detail.position,
                          isSuperseded: detailWasSuperseded,
                          originalCode: detailWasSuperseded ? detail.partNumber : undefined,
                          notes: detail.notes,
                        });
                        toast.success(`Peça adicionada ao orçamento de balcão!`);
                      }}
                      className={`rounded-xl px-4 py-2.5 text-xs font-bold transition flex items-center gap-2 shadow-md active:scale-95 ${
                        detailInCart
                          ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20'
                          : 'bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 shadow-amber-500/30'
                      }`}
                    >
                      <span className="text-sm font-black">{detailInCart ? '✓' : '+'}</span>
                      <span>{detailInCart ? `No Orçamento (${detailInCart.quantity}x)` : 'Adicionar ao Orçamento'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void copyCode(detailFormattedCode)}
                      className="rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 px-3.5 py-2.5 text-xs font-semibold text-white transition active:scale-95"
                    >
                      Copiar código ({detailFormattedCode})
                    </button>

                    <button
                      type="button"
                      onClick={() => void copyPartDirectLink(detailCode)}
                      className="rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 px-3.5 py-2.5 text-xs font-semibold text-white transition active:scale-95 flex items-center gap-1.5"
                    >
                      <span>🔗</span>
                      <span>Copiar link</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => sendPartWhatsApp(detail, detailCode)}
                      className="rounded-xl border border-emerald-400/50 bg-emerald-600 hover:bg-emerald-500 px-3.5 py-2.5 text-xs font-bold text-white transition active:scale-95 flex items-center gap-1.5 shadow-sm"
                    >
                      <span>📱</span>
                      <span>Enviar no WhatsApp</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const targetName = detail.name;
                        const targetCode = detailCode;
                        const targetModel = detail.model;
                        setDetail(null);
                        openAiAssistant(`Tenho uma dúvida sobre a peça ${targetName} (código ${targetCode}) do modelo ${targetModel}. Pode me orientar sobre aplicação e compatibilidade?`);
                      }}
                      className="rounded-xl border border-indigo-400/50 bg-indigo-600/90 hover:bg-indigo-500 text-white px-3.5 py-2.5 text-xs font-semibold shadow-sm transition"
                    >
                      ✦ Perguntar à IA
                    </button>

                    <button
                      type="button"
                      onClick={() => void toggleFavorite()}
                      className="rounded-xl border border-white/20 bg-white/5 hover:bg-white/15 px-3 py-2.5 text-xs font-semibold text-white transition"
                    >
                      {detail.favoriteId ? '★ Favoritada' : '☆ Favoritar'}
                    </button>

                    <button
                      type="button"
                      onClick={() => void accessPdf(detail.documentId, detail.page, detail.filename)}
                      className="rounded-xl border border-white/20 bg-white/5 hover:bg-white/15 px-3 py-2.5 text-xs font-semibold text-white transition"
                    >
                      Visualizar no catálogo PDF
                    </button>

                    <a
                      href={detailVerification?.officialUrl || husqvarnaPortalUrl(detailCode)}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl border border-blue-400/40 bg-blue-500/20 hover:bg-blue-500/30 px-3 py-2.5 text-xs font-semibold text-blue-200 transition"
                    >
                      Portal Husqvarna ↗
                    </a>
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

                {/* Localização de Estoque / Anotação da Oficina */}
                <div className="mt-4 rounded-[18px] border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base" aria-hidden="true">📍</span>
                      <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                        Localização de Estoque / Prateleira:
                      </span>
                    </div>
                    {!editingNote && (
                      <button
                        type="button"
                        onClick={() => setEditingNote(true)}
                        className="text-[11px] font-semibold text-[#1d4f91] dark:text-blue-300 hover:underline"
                      >
                        {warehouseNote ? 'Editar' : '+ Inserir gaveta / prateleira'}
                      </button>
                    )}
                  </div>
                  {editingNote ? (
                    <div className="mt-2.5 flex items-center gap-2">
                      <input
                        type="text"
                        defaultValue={warehouseNote}
                        id="warehouse-note-input"
                        placeholder="Ex.: Prateleira A4 - Caixa 12"
                        className="flex-1 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-850 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-[#1d4f91]"
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            saveWarehouseNote((e.target as HTMLInputElement).value);
                          } else if (e.key === 'Escape') {
                            setEditingNote(false);
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const el = document.getElementById('warehouse-note-input') as HTMLInputElement | null;
                          if (el) saveWarehouseNote(el.value);
                        }}
                        className="rounded-xl bg-[#1d4f91] hover:bg-[#123867] text-white px-3 py-1.5 text-xs font-bold transition shadow-xs"
                      >
                        Salvar
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingNote(false)}
                        className="rounded-xl border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs text-slate-500"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : warehouseNote ? (
                    <div className="mt-2 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                      <span className="rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1 shadow-2xs text-[#1d4f91] dark:text-blue-300 font-mono">
                        🏷️ {warehouseNote}
                      </span>
                    </div>
                  ) : (
                    <p className="mt-1 text-[11px] text-slate-400">
                      Nenhuma localização registrada neste terminal. Clique em &quot;Inserir gaveta / prateleira&quot; para agilizar a retirada da peça.
                    </p>
                  )}
                </div>

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
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold">Peças relacionadas</div>
                    {detail.related.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          let addedCount = 0;
                          for (const item of detail.related) {
                            quoteCart.addItem({
                              partNumber: item.partNumber,
                              effectiveCode: formatHusqvarnaPartNumber(item.partNumber),
                              name: item.name,
                              model: item.model || detail.document.model || '',
                              pnc: item.pnc || detail.document.pnc || null,
                              section: item.section || null,
                              position: item.position || null,
                              filename: detail.filename,
                              page: item.page || detail.page || null,
                            });
                            addedCount++;
                          }
                          toast.success(`${addedCount} peças relacionadas adicionadas ao orçamento!`);
                        }}
                        className="rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 text-[11px] font-bold transition shadow-sm"
                      >
                        + Orçar Todas ({detail.related.length})
                      </button>
                    )}
                  </div>
                  <div className="mt-3 grid gap-2">
                    {detail.related.map(item => {
                      const inCart = quoteCart.items.find(i => i.partNumber === item.partNumber);
                      return (
                        <div key={item.id} className="flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 p-2">
                          <button type="button" onClick={() => void openPart(item.id)} className="min-w-0 flex-1 p-1 text-left">
                            <div className="text-xs font-semibold">{item.name}</div>
                            <div className="mt-1 text-xs text-slate-400">{formatHusqvarnaPartNumber(item.partNumber)} · posição {item.position || '—'}</div>
                          </button>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                quoteCart.addItem({
                                  partNumber: item.partNumber,
                                  effectiveCode: formatHusqvarnaPartNumber(item.partNumber),
                                  name: item.name,
                                  model: item.model || detail.document.model || '',
                                  pnc: item.pnc || detail.document.pnc || null,
                                  section: item.section || null,
                                  position: item.position || null,
                                  filename: detail.filename,
                                  page: item.page || detail.page || null,
                                });
                                toast.success(`${item.name} adicionada ao orçamento!`);
                              }}
                              className={`rounded-lg px-2 py-1.5 text-[10px] font-semibold transition ${
                                inCart
                                  ? 'bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300'
                                  : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                              }`}
                              title="Adicionar ao carrinho de orçamento rápido"
                            >
                              {inCart ? `✓ No Orçamento (${inCart.quantity})` : '+ Orçar'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void copyCode(item.partNumber)}
                              aria-label={`Copiar código ${item.partNumber}`}
                              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-[10px] font-semibold text-[#1d4f91] dark:text-blue-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                            >
                              Copiar
                            </button>
                          </div>
                        </div>
                      );
                    })}
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
          <div id="pdf-modal-container" role="dialog" aria-modal="true" aria-labelledby="pdf-preview-title" className="mx-auto flex h-full max-w-[1500px] flex-col overflow-hidden rounded-[22px] bg-white dark:bg-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-700 px-4 py-3">
              <div>
                <div id="pdf-preview-title" className="text-sm font-semibold">{pdf.title}</div>
                <div className="text-xs text-slate-400">{pdf.page ? `Abrindo na página ${pdf.page}` : 'Visualização do catálogo'}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById('pdf-modal-container');
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
                <a href={`${pdf.url}${pdf.page ? `#page=${pdf.page}` : ''}`} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-[#1d4f91] dark:text-blue-300">Nova aba ↗</a>
                <button type="button" autoFocus onClick={() => setPdf(null)} className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm font-semibold">Fechar <span className="ml-1 text-[10px] text-slate-400">Esc</span></button>
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
