import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import OfficialHusqvarnaPanel from '../components/parts-v2/OfficialHusqvarnaPanel';
import type { OfficialFallbackResult } from '../components/parts-v2/types';
import { apiJson, getToken } from '../lib';

export default function HusqvarnaOfficialPage() {
  const navigate = useNavigate();
  const [pnc] = useState(() => new URLSearchParams(window.location.search).get('pnc')?.replace(/\D/g, '') || '');
  const validPnc = /^\d{8,14}$/.test(pnc);
  const [result, setResult] = useState<OfficialFallbackResult | null>(null);
  const [loading, setLoading] = useState(validPnc);
  const [error, setError] = useState(validPnc ? '' : 'PNC inválido ou não informado.');

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
        // Dentro do workspace dedicado, o botão secundário deve continuar apontando
        // para o Portal oficial, não de volta para esta própria rota interna.
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

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100 md:px-8">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to={`/dashboard?tab=parts&q=${encodeURIComponent(pnc)}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">← Voltar à busca</Link>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[.18em] text-[#1d4f91]">Husqvarna oficial</div>
              <h1 className="text-xl font-black">Dados técnicos do produto</h1>
            </div>
          </div>
          <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs font-black text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">PNC {pnc || '—'}</div>
        </div>

        {loading && <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900">Confirmando o produto diretamente na Husqvarna…</div>}
        {!loading && error && <div className="rounded-2xl border border-rose-200 bg-white p-8 text-center dark:border-rose-900 dark:bg-slate-900"><div className="text-sm font-black text-rose-700 dark:text-rose-300">Não foi possível abrir os dados oficiais</div><p className="mx-auto mt-2 max-w-2xl text-xs leading-5 text-slate-500">{error}</p></div>}
        {!loading && result && <OfficialHusqvarnaPanel result={result} />}
      </div>
    </main>
  );
}
