import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiJson } from '../../lib';
import { useCounterSession } from '../../context/CounterSessionContext';
import OfficialHusqvarnaPanel from '../parts-v2/OfficialHusqvarnaPanel';
import MaintenanceKitPanel from './MaintenanceKitPanel';
import type { HusqvarnaOfficialSearchKind, HusqvarnaOfficialSearchResult, OfficialFallbackResult } from '../parts-v2/types';

type Props = {
  initialPnc: string;
  initialSearch: string;
  onStateChange: (state: { pnc: string; search: string }) => void;
  onSearchPart: (code: string) => void;
  storageScope?: string;
};

type RecentMachine = { pnc: string; name: string; meta: string | null };

const RECENT_LIMIT = 8;
const PNC_PATTERN = /^\d{8,14}$/;
const SEARCH_KIND_LABELS: Record<HusqvarnaOfficialSearchKind, string> = {
  PRODUCT: 'Máquinas',
  SPARE_PART: 'Peças',
  ACCESSORY: 'Acessórios',
  DOCUMENT: 'Documentos',
  CATEGORY: 'Categorias',
};
const KIND_ORDER: HusqvarnaOfficialSearchKind[] = ['PRODUCT', 'SPARE_PART', 'ACCESSORY', 'DOCUMENT', 'CATEGORY'];

function normalizePnc(value: string) {
  return value.replace(/\D/g, '');
}

function recentStorageKey(scope?: string) {
  return `cognivault_recent_machines${scope ? `:${scope}` : ''}`;
}

function readRecentMachines(scope?: string): RecentMachine[] {
  try {
    const raw = localStorage.getItem(recentStorageKey(scope));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is RecentMachine => typeof item === 'object' && item !== null && typeof (item as RecentMachine).pnc === 'string')
      .slice(0, RECENT_LIMIT);
  } catch {
    // Modo privativo ou storage bloqueado: o balcão só perde os atalhos.
    return [];
  }
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('pt-BR', { month: '2-digit', year: 'numeric' }).format(date);
}

function normalizeOfficialSearchResults(value: unknown): HusqvarnaOfficialSearchResult[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(raw => {
    const item = raw as Record<string, unknown>;
    if (typeof item.kind === 'string' && typeof item.title === 'string') return [item as unknown as HusqvarnaOfficialSearchResult];
    // O endpoint antigo devolvia apenas produtos; a leitura continua aqui para
    // o balcão não quebrar durante uma promoção parcial do backend.
    if (typeof item.productName === 'string' && typeof item.pnc === 'string') {
      return [{
        kind: 'PRODUCT' as const,
        id: String(item.pnc),
        title: String(item.productName),
        subtitle: null,
        pnc: String(item.pnc),
        partNumber: null,
        categoryName: typeof item.categoryName === 'string' ? item.categoryName : null,
        portalUrl: typeof item.portalUrl === 'string' ? item.portalUrl : null,
        imageUrl: typeof item.imageUrl === 'string' ? item.imageUrl : null,
        discontinued: Boolean(item.discontinued),
        numberOfVariants: typeof item.numberOfVariants === 'number' ? item.numberOfVariants : null,
        documentType: null,
        languages: [],
        lastUpdated: null,
        productCount: null,
      }];
    }
    return [];
  });
}

function resultMeta(item: HusqvarnaOfficialSearchResult) {
  const values = [item.categoryName || item.subtitle || item.documentType || SEARCH_KIND_LABELS[item.kind]];
  if (item.discontinued) values.push('descontinuado');
  if (item.numberOfVariants) values.push(`${item.numberOfVariants} variante(s)`);
  if (item.productCount != null) values.push(`${item.productCount} produto(s)`);
  if (item.languages.length) values.push(item.languages.join(', '));
  const date = formatDate(item.lastUpdated);
  if (date) values.push(date);
  return values.filter(Boolean).join(' · ');
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function MachinesWorkspace({ initialPnc, initialSearch, onStateChange, onSearchPart, storageScope }: Props) {
  const { session, updateSession } = useCounterSession();

  const [query, setQuery] = useState(initialSearch);
  const [submittedQuery, setSubmittedQuery] = useState(initialSearch.trim());
  const [pnc, setPnc] = useState(() => (PNC_PATTERN.test(normalizePnc(initialPnc)) ? normalizePnc(initialPnc) : ''));
  const [inputError, setInputError] = useState('');
  const [recent, setRecent] = useState<RecentMachine[]>(() => readRecentMachines(storageScope));

  const rememberMachine = useCallback((machine: RecentMachine) => {
    setRecent(current => {
      const next = [machine, ...current.filter(item => item.pnc !== machine.pnc)].slice(0, RECENT_LIMIT);
      try {
        localStorage.setItem(recentStorageKey(storageScope), JSON.stringify(next));
      } catch {
        // Sem storage a lista ainda vale para a sessão aberta.
      }
      return next;
    });
  }, [storageScope]);

  const machineQuery = useQuery({
    queryKey: ['official-machine', pnc],
    enabled: PNC_PATTERN.test(pnc),
    queryFn: async () => {
      const data = await apiJson<{ result: OfficialFallbackResult }>(`/api/official-fallback?q=${encodeURIComponent(pnc)}`, { timeoutMs: 25_000 });
      if (data.result.status !== 'FOUND' || data.result.kind !== 'PRODUCT_CATALOG') {
        throw new Error(data.result.message || 'A Husqvarna não confirmou este PNC como máquina.');
      }
      const loaded: OfficialFallbackResult = { ...data.result, url: data.result.portalUrl || null };
      rememberMachine({
        pnc,
        name: loaded.name || `PNC ${pnc}`,
        meta: loaded.categoryName || loaded.articleDescription || null,
      });
      return loaded;
    },
  });

  const searchQuery = useQuery({
    queryKey: ['official-machine-search', submittedQuery],
    enabled: submittedQuery.length >= 2,
    queryFn: async () => {
      const response = await apiJson<{ results: unknown }>(`/api/husqvarna/products/search?q=${encodeURIComponent(submittedQuery)}`, { timeoutMs: 15_000 });
      return normalizeOfficialSearchResults(response.results);
    },
  });

  const machine = machineQuery.data ?? null;
  const machineLoading = machineQuery.isLoading;
  const machineError = machineQuery.error ? errorMessage(machineQuery.error, 'Não foi possível consultar a Husqvarna.') : '';
  const results = useMemo(() => searchQuery.data ?? [], [searchQuery.data]);
  const searchLoading = searchQuery.isLoading;
  const searchError = searchQuery.error
    ? errorMessage(searchQuery.error, 'Não foi possível pesquisar na Husqvarna.')
    : searchQuery.isSuccess && !results.length
      ? 'Nenhum resultado oficial para esta busca. Confira o modelo ou use o PNC da etiqueta.'
      : '';

  const openMachine = useCallback((value: string) => {
    const clean = normalizePnc(value);
    if (!PNC_PATTERN.test(clean)) {
      setInputError('PNC inválido. Use os números da etiqueta da máquina.');
      return;
    }
    setInputError('');
    setPnc(clean);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }, []);

  useEffect(() => {
    onStateChange({ pnc, search: submittedQuery });
  }, [onStateChange, pnc, submittedQuery]);

  useEffect(() => {
    // O atendimento pede a vista explodida sem desmontar este workspace, então
    // a ponte entre as duas telas é um evento e não uma navegação de rota.
    const open = (event: Event) => {
      const target = (event as CustomEvent<string>).detail;
      if (typeof target === 'string' && target) openMachine(target);
    };
    window.addEventListener('cognivault:open-machine', open);
    return () => window.removeEventListener('cognivault:open-machine', open);
  }, [openMachine]);

  const grouped = useMemo(() => {
    const groups = new Map<HusqvarnaOfficialSearchKind, HusqvarnaOfficialSearchResult[]>();
    for (const item of results) {
      const list = groups.get(item.kind) ?? [];
      list.push(item);
      groups.set(item.kind, list);
    }
    return groups;
  }, [results]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const clean = query.trim().replace(/\s+/g, ' ');
    if (clean.length < 2) return;
    // Uma etiqueta de PNC abre a máquina direto; qualquer outro texto vale como
    // busca no catálogo oficial.
    if (/^[\d\s-]+$/.test(clean) && PNC_PATTERN.test(normalizePnc(clean))) {
      openMachine(clean);
      return;
    }
    setInputError('');
    setSubmittedQuery(clean);
  };

  const selectMachine = (item: HusqvarnaOfficialSearchResult) => {
    if (!item.pnc) return;
    // O contexto do atendimento passa a valer também para a busca de peças.
    updateSession({ machineModel: item.title, pnc: item.pnc });
    openMachine(item.pnc);
  };

  // O catálogo interno indexa o modelo sem a marca ("143RII", não
  // "Husqvarna 143R-II"), então o nome oficial entra limpo na busca do kit.
  const kitModel = useMemo(() => {
    const fromMachine = (machine?.name || '').replace(/^husqvarna\s+/i, '').trim();
    return fromMachine || session.machineModel.trim();
  }, [machine?.name, session.machineModel]);

  const contextPnc = normalizePnc(session.pnc);
  const canUseContext = PNC_PATTERN.test(contextPnc) && contextPnc !== pnc;

  return (
    <section className="space-y-4">
      <div className="px-1">
        <div className="text-[10px] font-black uppercase tracking-[.15em] text-[#1d4f91] dark:text-blue-300">Máquinas</div>
        <h1 className="mt-1 text-2xl font-black tracking-[-.03em] text-slate-950 dark:text-white">Vista explodida na tela, sem abrir PDF.</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Busque a máquina por modelo ou PNC e clique direto na posição da vista para pegar o código e mandar para o orçamento.</p>
      </div>

      <form onSubmit={submit} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-2 p-2 md:flex-row">
          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Modelo da máquina ou PNC da etiqueta. Ex.: 143RII ou 967 17 65-01"
              autoComplete="off"
              className="h-12 w-full rounded-lg border-0 bg-slate-50 pl-10 pr-4 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-800"
            />
          </div>
          <button type="submit" disabled={query.trim().length < 2} className="h-12 rounded-lg bg-[#123867] px-5 text-sm font-black text-white transition hover:bg-[#0d2c52] disabled:opacity-50">
            {searchLoading || machineLoading ? 'Consultando…' : 'Abrir máquina'}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-2 dark:border-slate-800">
          <span className="text-[10px] font-semibold text-slate-400">PNC abre a máquina direto · texto pesquisa no catálogo oficial Husqvarna.</span>
          {canUseContext && (
            <button type="button" onClick={() => openMachine(contextPnc)} className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700 transition hover:border-emerald-300 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
              Abrir PNC do atendimento · {session.pnc}
            </button>
          )}
        </div>
      </form>

      {inputError && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">{inputError}</div>
      )}

      {recent.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-1">
          <span className="text-[10px] font-black uppercase tracking-[.12em] text-slate-400">Máquinas recentes</span>
          {recent.map(item => (
            <button
              key={item.pnc}
              type="button"
              onClick={() => openMachine(item.pnc)}
              title={item.meta || `PNC ${item.pnc}`}
              className={`max-w-[240px] truncate rounded-full border px-3 py-1.5 text-[11px] font-bold transition ${item.pnc === pnc ? 'border-[#1d4f91] bg-[#eef4fb] text-[#123867] dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-200' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-[#1d4f91] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}
            >
              {item.name}
            </button>
          ))}
        </div>
      )}

      {machineLoading && (
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-8 text-center text-sm font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          Abrindo as vistas oficiais desta máquina…
        </div>
      )}

      {!machineLoading && machineError && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {machineError}
        </div>
      )}

      {!machineLoading && machine && (
        <>
          <OfficialHusqvarnaPanel
            key={machine.pnc || machine.query}
            result={machine}
            autoExpand
            onOpenPnc={openMachine}
            onOpenPart={onSearchPart}
            onOpenSearch={value => { setQuery(value); setSubmittedQuery(value.trim()); }}
          />
          {kitModel && <MaintenanceKitPanel model={kitModel} pnc={machine.pnc ?? pnc} />}
        </>
      )}

      {searchError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          {searchError}
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-4">
          {KIND_ORDER.map(kind => {
            const items = grouped.get(kind) ?? [];
            if (!items.length) return null;
            return (
              <section key={kind} className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
                  <h2 className="text-[10px] font-black uppercase tracking-[.1em] text-slate-500 dark:text-slate-400">{SEARCH_KIND_LABELS[kind]}</h2>
                  <span className="text-[10px] font-bold text-slate-400">{items.length}</span>
                </div>
                <div>
                  {items.map(item => {
                    const content = (
                      <>
                        <div className="flex min-w-0 items-center gap-3">
                          {item.imageUrl && <img src={item.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg bg-white object-contain" loading="lazy" />}
                          <div className="min-w-0">
                            <div className="truncate text-sm font-black text-slate-900 dark:text-white">{item.title}</div>
                            <div className="mt-1 truncate text-[11px] text-slate-400">{resultMeta(item)}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-5">
                          <div className="hidden text-right md:block">
                            {item.pnc && <div className="font-mono text-xs font-black text-[#123867] dark:text-blue-300">PNC {item.pnc}</div>}
                            {item.partNumber && <div className="font-mono text-xs font-black text-[#123867] dark:text-blue-300">{item.partNumber}</div>}
                          </div>
                          <span className="shrink-0 text-xs font-black text-[#1d4f91] dark:text-blue-300">
                            {item.kind === 'PRODUCT' && item.pnc ? 'Abrir vistas' : item.kind === 'SPARE_PART' && item.partNumber ? 'Consultar peça' : 'Abrir na Husqvarna ↗'}
                          </span>
                        </div>
                      </>
                    );
                    const base = 'grid w-full gap-3 border-b border-slate-100 px-4 py-3.5 text-left transition last:border-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center dark:border-slate-800';
                    const interactive = `${base} hover:bg-slate-50/80 dark:hover:bg-slate-800/45`;

                    if (item.kind === 'PRODUCT' && item.pnc) {
                      return <button key={`${item.kind}-${item.id}`} type="button" onClick={() => selectMachine(item)} className={interactive}>{content}</button>;
                    }
                    if (item.kind === 'SPARE_PART' && item.partNumber) {
                      return <button key={`${item.kind}-${item.id}`} type="button" onClick={() => onSearchPart(item.partNumber as string)} className={interactive}>{content}</button>;
                    }
                    if (item.portalUrl) {
                      return <a key={`${item.kind}-${item.id}`} href={item.portalUrl} target="_blank" rel="noreferrer" className={interactive}>{content}</a>;
                    }
                    return <div key={`${item.kind}-${item.id}`} className={base}>{content}</div>;
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {!machineLoading && !machine && !searchLoading && !results.length && !searchError && !machineError && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center dark:border-slate-700 dark:bg-slate-900">
          <div className="text-sm font-bold text-slate-700 dark:text-slate-200">Comece pela máquina do cliente</div>
          <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-400">
            Digite o modelo ou o PNC da etiqueta. A vista explodida abre aqui dentro, com código, preço e botão de orçamento em cada posição.
          </p>
        </div>
      )}
    </section>
  );
}
