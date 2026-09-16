import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import OfficialHusqvarnaPanel from '../components/parts-v2/OfficialHusqvarnaPanel';
import type { HusqvarnaOfficialSearchKind, HusqvarnaOfficialSearchResult, OfficialFallbackResult } from '../components/parts-v2/types';
import { apiJson, getToken } from '../lib';

const SEARCH_KIND_LABELS: Record<HusqvarnaOfficialSearchKind, string> = {
  PRODUCT: 'Produtos',
  SPARE_PART: 'Peças',
  ACCESSORY: 'Acessórios',
  DOCUMENT: 'Documentos',
  CATEGORY: 'Categorias',
};

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

export default function HusqvarnaOfficialPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pnc = (searchParams.get('pnc') || '').replace(/\D/g, '');
  const initialSearch = (searchParams.get('search') || '').trim();
  const validPnc = /^\d{8,14}$/.test(pnc);

  const [result, setResult] = useState<OfficialFallbackResult | null>(null);
  const [loading, setLoading] = useState(validPnc);
  const [error, setError] = useState('');
  const [modelQuery, setModelQuery] = useState(initialSearch);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchResults, setSearchResults] = useState<HusqvarnaOfficialSearchResult[]>([]);

  useEffect(() => {
    if (!getToken()) {
      navigate('/login', { replace: true });
      return;
    }
    if (!validPnc) return;

    let active = true;
    void apiJson<{ result: OfficialFallbackResult }>(`/api/official-fallback?q=${encodeURIComponent(pnc)}`, { timeoutMs: 20_000 })
      .then(data => {
        if (!active) return;
        if (data.result.status !== 'FOUND' || data.result.kind !== 'PRODUCT_CATALOG') {
          setError(data.result.message || 'A Husqvarna não confirmou este PNC como produto.');
          return;
        }
        setResult({ ...data.result, url: data.result.portalUrl || null });
      })
      .catch(requestError => {
        if (!active) return;
        setError(requestError instanceof Error ? requestError.message : 'Não foi possível consultar a Husqvarna.');
      })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [navigate, pnc, validPnc]);

  const runOfficialSearch = async (rawQuery: string) => {
    const query = rawQuery.trim().replace(/\s+/g, ' ');
    if (query.length < 2) return;
    setSearchLoading(true);
    setSearchError('');
    setSearchResults([]);
    try {
      const response = await apiJson<{ results: unknown }>(`/api/husqvarna/products/search?q=${encodeURIComponent(query)}`, { timeoutMs: 12_000 });
      const normalized = normalizeOfficialSearchResults(response.results);
      setSearchResults(normalized);
      if (!normalized.length) setSearchError('Nenhum resultado oficial encontrado para esta busca.');
    } catch (searchRequestError) {
      setSearchError(searchRequestError instanceof Error ? searchRequestError.message : 'Não foi possível pesquisar na Husqvarna.');
    } finally {
      setSearchLoading(false);
    }
  };

  useEffect(() => {
    if (!initialSearch || initialSearch.length < 2 || !getToken()) return;
    const timer = window.setTimeout(() => { void runOfficialSearch(initialSearch); }, 0);
    return () => window.clearTimeout(timer);
  }, [initialSearch]);

  const searchOfficialProducts = async (event: FormEvent) => {
    event.preventDefault();
    await runOfficialSearch(modelQuery);
  };

  const groupedResults = useMemo(() => {
    const groups = new Map<HusqvarnaOfficialSearchKind, HusqvarnaOfficialSearchResult[]>();
    for (const item of searchResults) {
      const items = groups.get(item.kind) || [];
      items.push(item);
      groups.set(item.kind, items);
    }
    return groups;
  }, [searchResults]);

  const resultHref = (item: HusqvarnaOfficialSearchResult): string | null => {
    if (item.kind === 'PRODUCT' && item.pnc) return `/husqvarna?pnc=${encodeURIComponent(item.pnc)}`;
    if (item.kind === 'SPARE_PART' && item.partNumber) return `/dashboard?tab=parts&q=${encodeURIComponent(item.partNumber)}`;
    return item.portalUrl;
  };

  const resultAction = (item: HusqvarnaOfficialSearchResult) => {
    if (item.kind === 'SPARE_PART') return 'Consultar peça';
    if (item.kind === 'DOCUMENT') return 'Abrir documento ↗';
    if (item.kind === 'CATEGORY') return 'Abrir categoria ↗';
    if (item.kind === 'ACCESSORY') return 'Abrir na Husqvarna ↗';
    return 'Abrir dados técnicos';
  };

  const backQuery = pnc || modelQuery.trim();

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-900 dark:bg-[#060d1c] dark:text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xl dark:border-slate-800 dark:bg-[#0a1222]/95">
        <div className="mx-auto flex h-[68px] max-w-[1460px] items-center justify-between gap-4 px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link to={`/dashboard?tab=parts${backQuery ? `&q=${encodeURIComponent(backQuery)}` : ''}`} className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-500 transition hover:border-blue-300 hover:text-[#1d4f91] dark:border-slate-700 dark:text-slate-300">← Atendimento</Link>
            <div className="min-w-0">
              <div className="text-[9px] font-black uppercase tracking-[.15em] text-[#1d4f91] dark:text-blue-300">Fonte oficial</div>
              <div className="truncate text-sm font-black text-slate-900 dark:text-white">Husqvarna</div>
            </div>
          </div>
          {pnc && <div className="rounded-lg border border-slate-200 px-3 py-1.5 font-mono text-xs font-black text-slate-600 dark:border-slate-700 dark:text-slate-300">PNC {pnc}</div>}
        </div>
      </header>

      <div className="mx-auto max-w-[1400px] space-y-5 px-4 py-6 md:px-6">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[.15em] text-[#1d4f91] dark:text-blue-300">Consulta oficial</div>
          <h1 className="mt-1 text-2xl font-black tracking-[-.03em] text-slate-950 dark:text-white">Dados técnicos Husqvarna</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">Confirme produtos, peças, acessórios e documentação diretamente na fonte oficial quando o atendimento exigir essa evidência.</p>
        </div>

        <form onSubmit={searchOfficialProducts} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-2 p-2 md:flex-row">
            <div className="relative min-w-0 flex-1">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">⌕</span>
              <input value={modelQuery} onChange={event => setModelQuery(event.target.value)} placeholder="Modelo, PNC, peça, acessório, documento ou categoria…" className="h-12 w-full rounded-lg border-0 bg-slate-50 pl-10 pr-4 text-sm font-semibold outline-none transition focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:bg-slate-800 dark:focus:bg-slate-800" />
            </div>
            <button type="submit" disabled={searchLoading || modelQuery.trim().length < 2} className="h-12 rounded-lg bg-[#123867] px-5 text-xs font-black text-white transition hover:bg-[#0d2c52] disabled:opacity-50">{searchLoading ? 'Consultando…' : 'Consultar fonte oficial'}</button>
          </div>
          <div className="border-t border-slate-100 px-4 py-2 text-[10px] font-semibold text-slate-400 dark:border-slate-800">A busca oficial complementa o CogniVault; ausência de resultado não é tratada como prova de incompatibilidade.</div>
        </form>

        {searchError && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">{searchError}</div>}

        {searchResults.length > 0 && (
          <div className="space-y-4">
            {(['PRODUCT', 'SPARE_PART', 'ACCESSORY', 'DOCUMENT', 'CATEGORY'] as HusqvarnaOfficialSearchKind[]).map(kind => {
              const items = groupedResults.get(kind) || [];
              if (!items.length) return null;
              return (
                <section key={kind} className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
                    <h2 className="text-[10px] font-black uppercase tracking-[.1em] text-slate-500 dark:text-slate-400">{SEARCH_KIND_LABELS[kind]}</h2>
                    <span className="text-[10px] font-bold text-slate-400">{items.length}</span>
                  </div>
                  <div>
                    {items.map(item => {
                      const href = resultHref(item);
                      const external = item.kind === 'ACCESSORY' || item.kind === 'DOCUMENT' || item.kind === 'CATEGORY' || (!item.pnc && Boolean(item.portalUrl));
                      const content = (
                        <>
                          <div className="flex min-w-0 items-center gap-3">
                            {item.imageUrl && <img src={item.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-contain" loading="lazy" />}
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
                            <span className="shrink-0 text-xs font-black text-[#1d4f91] dark:text-blue-300">{href ? resultAction(item) : 'Sem ação'}</span>
                          </div>
                        </>
                      );

                      const className = 'grid gap-3 border-b border-slate-100 px-4 py-3.5 last:border-0 transition md:grid-cols-[minmax(0,1fr)_auto] md:items-center dark:border-slate-800';
                      if (!href) return <div key={`${item.kind}-${item.id}`} className={className}>{content}</div>;
                      return <a key={`${item.kind}-${item.id}`} href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined} className={`${className} hover:bg-slate-50/80 dark:hover:bg-slate-800/45`}>{content}</a>;
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {!validPnc && !searchLoading && !searchResults.length && !searchError && (
          <div className="border-t border-slate-200 py-10 text-center dark:border-slate-800">
            <div className="text-sm font-bold text-slate-700 dark:text-slate-200">Pronto para uma consulta oficial</div>
            <p className="mt-1 text-xs text-slate-400">Informe modelo, PNC, código de peça ou termo técnico acima.</p>
          </div>
        )}
        {loading && <div className="rounded-xl border border-slate-200 bg-white px-5 py-8 text-center text-sm font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900">Confirmando o produto diretamente na Husqvarna…</div>}
        {!loading && error && <div className="rounded-xl border border-rose-200 bg-white px-5 py-8 text-center dark:border-rose-900 dark:bg-slate-900"><div className="text-sm font-black text-rose-700 dark:text-rose-300">Não foi possível abrir os dados oficiais</div><p className="mx-auto mt-2 max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400">{error}</p></div>}
        {!loading && result && <OfficialHusqvarnaPanel result={result} />}
      </div>
    </main>
  );
}
