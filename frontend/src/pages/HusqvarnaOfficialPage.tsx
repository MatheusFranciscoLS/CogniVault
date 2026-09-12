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
    setResult(null);
    setError('');
    if (!validPnc) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
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
      .finally(() => {
        if (active) setLoading(false);
      });

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
    setModelQuery(initialSearch);
    void runOfficialSearch(initialSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const backQuery = pnc || modelQuery.trim();

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100 md:px-8">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to={`/dashboard?tab=parts${backQuery ? `&q=${encodeURIComponent(backQuery)}` : ''}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">← Voltar à busca</Link>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[.18em] text-[#1d4f91]">Husqvarna oficial</div>
              <h1 className="text-xl font-black">Dados técnicos e busca oficial</h1>
            </div>
          </div>
          {pnc && <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs font-black text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">PNC {pnc}</div>}
        </div>

        <form onSubmit={searchOfficialProducts} className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-2 md:flex-row">
            <input value={modelQuery} onChange={event => setModelQuery(event.target.value)} placeholder="Buscar modelo, PNC, peça, acessório, documento ou categoria…" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-950" />
            <button type="submit" disabled={searchLoading || modelQuery.trim().length < 2} className="rounded-xl bg-[#123867] px-5 py-3 text-xs font-black text-white disabled:opacity-50">{searchLoading ? 'Pesquisando…' : 'Buscar na Husqvarna'}</button>
          </div>
          <div className="mt-2 text-[10px] font-semibold text-slate-400">Uma busca consulta produtos, peças, acessórios, documentos e categorias diretamente na fonte oficial.</div>
        </form>

        {searchError && <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">{searchError}</div>}

        {searchResults.length > 0 && <div className="mb-5 space-y-5">
          {(['PRODUCT', 'SPARE_PART', 'ACCESSORY', 'DOCUMENT', 'CATEGORY'] as HusqvarnaOfficialSearchKind[]).map(kind => {
            const items = groupedResults.get(kind) || [];
            if (!items.length) return null;
            return <section key={kind}>
              <div className="mb-2 flex items-center gap-2"><h2 className="text-xs font-black uppercase tracking-wide text-slate-500">{SEARCH_KIND_LABELS[kind]}</h2><span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-black text-slate-600">{items.length}</span></div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {items.map(item => {
                  const href = resultHref(item);
                  const external = item.kind === 'ACCESSORY' || item.kind === 'DOCUMENT' || item.kind === 'CATEGORY' || (!item.pnc && Boolean(item.portalUrl));
                  const date = formatDate(item.lastUpdated);
                  const body = <>
                    {item.imageUrl && <img src={item.imageUrl} alt={item.title} className="h-20 w-20 shrink-0 rounded-xl object-contain" loading="lazy" />}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-black">{item.title}</div>
                      {item.pnc && <div className="mt-1 font-mono text-xs font-bold text-[#123867]">PNC {item.pnc}</div>}
                      {item.partNumber && <div className="mt-1 font-mono text-xs font-bold text-[#123867]">Peça {item.partNumber}</div>}
                      <div className="mt-1 text-[10px] text-slate-400">
                        {item.categoryName || item.subtitle || item.documentType || SEARCH_KIND_LABELS[item.kind]}
                        {item.discontinued ? ' · descontinuado' : ''}
                        {item.numberOfVariants ? ` · ${item.numberOfVariants} variante(s)` : ''}
                        {item.productCount != null ? ` · ${item.productCount} produto(s)` : ''}
                        {item.languages.length ? ` · ${item.languages.join(', ')}` : ''}
                        {date ? ` · ${date}` : ''}
                      </div>
                      <div className="mt-2 text-[10px] font-black text-blue-700">{item.kind === 'SPARE_PART' ? 'Buscar no CogniVault →' : item.kind === 'DOCUMENT' ? 'Abrir documento ↗' : item.kind === 'CATEGORY' ? 'Abrir categoria ↗' : item.kind === 'ACCESSORY' ? 'Abrir na Husqvarna ↗' : 'Abrir dados técnicos →'}</div>
                    </div>
                  </>;
                  if (!href) return <div key={`${item.kind}-${item.id}`} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">{body}</div>;
                  return <a key={`${item.kind}-${item.id}`} href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">{body}</a>;
                })}
              </div>
            </section>;
          })}
        </div>}

        {!validPnc && !searchLoading && !searchResults.length && !searchError && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">Digite um modelo, PNC, código de peça ou termo acima para consultar a Husqvarna.</div>}
        {loading && <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900">Confirmando o produto diretamente na Husqvarna…</div>}
        {!loading && error && <div className="rounded-2xl border border-rose-200 bg-white p-8 text-center dark:border-rose-900 dark:bg-slate-900"><div className="text-sm font-black text-rose-700 dark:text-rose-300">Não foi possível abrir os dados oficiais</div><p className="mx-auto mt-2 max-w-2xl text-xs leading-5 text-slate-500">{error}</p></div>}
        {!loading && result && <OfficialHusqvarnaPanel result={result} />}
      </div>
    </main>
  );
}
