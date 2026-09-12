import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import OfficialHusqvarnaPanel from '../components/parts-v2/OfficialHusqvarnaPanel';
import type { HusqvarnaProductSearchResult, OfficialFallbackResult } from '../components/parts-v2/types';
import { apiJson, getToken } from '../lib';

export default function HusqvarnaOfficialPage() {
  const navigate = useNavigate();
  const [pnc] = useState(() => new URLSearchParams(window.location.search).get('pnc')?.replace(/\D/g, '') || '');
  const validPnc = /^\d{8,14}$/.test(pnc);
  const [result, setResult] = useState<OfficialFallbackResult | null>(null);
  const [loading, setLoading] = useState(validPnc);
  const [error, setError] = useState(validPnc ? '' : '');
  const [modelQuery, setModelQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchResults, setSearchResults] = useState<HusqvarnaProductSearchResult[]>([]);

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
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [navigate, pnc, validPnc]);

  const searchOfficialProducts = async (event: FormEvent) => {
    event.preventDefault();
    const query = modelQuery.trim();
    if (query.length < 2) return;

    const numeric = query.replace(/\D/g, '');
    if (/^\d{8,14}$/.test(numeric) && numeric.length === query.replace(/[\s.-]/g, '').length) {
      navigate(`/husqvarna?pnc=${encodeURIComponent(numeric)}`);
      return;
    }

    setSearchLoading(true);
    setSearchError('');
    setSearchResults([]);
    try {
      const response = await apiJson<{ results: HusqvarnaProductSearchResult[] }>(`/api/husqvarna/products/search?q=${encodeURIComponent(query)}`, { timeoutMs: 12_000 });
      setSearchResults(response.results);
      if (!response.results.length) setSearchError('Nenhum produto oficial encontrado para esta busca.');
    } catch (searchRequestError) {
      setSearchError(searchRequestError instanceof Error ? searchRequestError.message : 'Não foi possível pesquisar produtos na Husqvarna.');
    } finally {
      setSearchLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100 md:px-8">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to={`/dashboard?tab=parts${pnc ? `&q=${encodeURIComponent(pnc)}` : ''}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">← Voltar à busca</Link>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[.18em] text-[#1d4f91]">Husqvarna oficial</div>
              <h1 className="text-xl font-black">Dados técnicos do produto</h1>
            </div>
          </div>
          {pnc && <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs font-black text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">PNC {pnc}</div>}
        </div>

        <form onSubmit={searchOfficialProducts} className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-2 md:flex-row">
            <input value={modelQuery} onChange={event => setModelQuery(event.target.value)} placeholder="Buscar produto oficial por modelo ou PNC, ex.: 327P5x, 55, 445…" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-950" />
            <button type="submit" disabled={searchLoading || modelQuery.trim().length < 2} className="rounded-xl bg-[#123867] px-5 py-3 text-xs font-black text-white disabled:opacity-50">{searchLoading ? 'Pesquisando…' : 'Buscar na Husqvarna'}</button>
          </div>
          <div className="mt-2 text-[10px] font-semibold text-slate-400">A busca usa o catálogo oficial do Portal e não tenta adivinhar PNC por nome.</div>
        </form>

        {searchError && <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">{searchError}</div>}
        {searchResults.length > 0 && <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {searchResults.map(item => <a key={`${item.pnc}-${item.productName}`} href={`/husqvarna?pnc=${encodeURIComponent(item.pnc)}`} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
            {item.imageUrl && <img src={item.imageUrl} alt={item.productName} className="h-20 w-20 shrink-0 rounded-xl object-contain" loading="lazy" />}
            <div className="min-w-0 flex-1"><div className="text-sm font-black">{item.productName}</div><div className="mt-1 font-mono text-xs font-bold text-[#123867]">PNC {item.pnc}</div><div className="mt-1 text-[10px] text-slate-400">{item.categoryName || 'Categoria não informada'}{item.discontinued ? ' · descontinuado' : ''}{item.numberOfVariants ? ` · ${item.numberOfVariants} variante(s)` : ''}</div><div className="mt-2 text-[10px] font-black text-blue-700">Abrir dados técnicos →</div></div>
          </a>)}
        </div>}

        {!validPnc && !searchLoading && !searchResults.length && !searchError && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">Digite um modelo ou PNC acima para localizar o produto diretamente no catálogo oficial Husqvarna.</div>}
        {loading && <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900">Confirmando o produto diretamente na Husqvarna…</div>}
        {!loading && error && <div className="rounded-2xl border border-rose-200 bg-white p-8 text-center dark:border-rose-900 dark:bg-slate-900"><div className="text-sm font-black text-rose-700 dark:text-rose-300">Não foi possível abrir os dados oficiais</div><p className="mx-auto mt-2 max-w-2xl text-xs leading-5 text-slate-500">{error}</p></div>}
        {!loading && result && <OfficialHusqvarnaPanel result={result} />}
      </div>
    </main>
  );
}
