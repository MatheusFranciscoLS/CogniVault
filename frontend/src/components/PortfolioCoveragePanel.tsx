import { useEffect, useState } from 'react';
import { apiJson } from '../lib';

type PortfolioCoverageGap = {
  model: string;
  normalizedModel: string;
  status: 'UNVERIFIED';
  commercialSignals: number;
  commercialEvidence: string[];
  portalVerification: 'NOT_CHECKED' | 'VERIFIED' | 'NO_EXACT_MATCH' | 'NO_IPL' | 'INCONCLUSIVE';
  portalVerificationNote: string | null;
};

type PortfolioCoverage = {
  scope: 'BR_LOCAL';
  portalChecked: boolean;
  total: number;
  localIpl: number;
  portalIpl: number;
  unverified: number;
  covered: number;
  coverageRate: number;
  gaps: PortfolioCoverageGap[];
};

async function fetchPortfolioCoverage() {
  return apiJson<{ portfolioCoverage: PortfolioCoverage }>('/api/admin/quality');
}

function signalLabel(count: number) {
  return `${count} referência${count === 1 ? '' : 's'} comercial${count === 1 ? '' : 'is'}`;
}

export default function PortfolioCoveragePanel() {
  const [coverage, setCoverage] = useState<PortfolioCoverage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetchPortfolioCoverage();
      setCoverage(response.portfolioCoverage);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar a cobertura do portfólio.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    void fetchPortfolioCoverage()
      .then(response => {
        if (active) setCoverage(response.portfolioCoverage);
      })
      .catch(loadError => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar a cobertura do portfólio.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  if (loading) {
    return <div className="cv-surface mb-5 rounded-[24px] p-6 text-sm text-slate-500 dark:text-slate-400">Conferindo a cobertura do portfólio brasileiro…</div>;
  }

  if (error || !coverage) {
    return (
      <div className="mb-5 rounded-[24px] border border-rose-200 bg-rose-50/70 p-5 dark:border-rose-800 dark:bg-rose-900/20">
        <div className="text-sm font-semibold text-rose-800 dark:text-rose-300">Cobertura do portfólio indisponível</div>
        <p className="mt-1 text-xs text-rose-700/80 dark:text-rose-300/80">{error || 'Não foi possível carregar este diagnóstico.'}</p>
        <button type="button" onClick={() => void load()} className="cv-secondary mt-3 px-3 py-2 text-xs font-semibold">Tentar novamente</button>
      </div>
    );
  }

  const coveragePercent = Math.round(coverage.coverageRate * 100);
  const gaps = coverage.gaps.slice(0, 8);

  return (
    <section className="cv-surface mb-5 overflow-hidden rounded-[24px]">
      <div className="border-b border-slate-200 bg-slate-50/70 p-5 dark:border-slate-700/80 dark:bg-slate-800/60">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Cobertura do portfólio BR</h2>
              <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300">Base local</span>
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500 dark:text-slate-400">
              Mostra quais modelos citados na lista comercial brasileira já têm IPL técnica local. Aplicações comerciais servem apenas para priorizar investigação e nunca comprovam compatibilidade de peça, PNC ou número de série.
            </p>
          </div>
          <button type="button" onClick={() => void load()} className="cv-secondary px-3 py-2 text-xs font-semibold">Atualizar cobertura</button>
        </div>
      </div>

      <div className="p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="text-[10px] font-bold uppercase tracking-[.09em] text-slate-500 dark:text-slate-400">Cobertura local</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{coveragePercent}%</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{coverage.localIpl} de {coverage.total} modelos com IPL local</div>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
            <div className="text-[10px] font-bold uppercase tracking-[.09em] text-emerald-700 dark:text-emerald-300">Com IPL local</div>
            <div className="mt-2 text-2xl font-semibold text-emerald-950 dark:text-emerald-200">{coverage.localIpl}</div>
            <div className="mt-1 text-xs text-emerald-800/70 dark:text-emerald-300/70">Catálogos técnicos já presentes no CogniVault</div>
          </div>
          <div className={`rounded-2xl border p-4 ${coverage.unverified ? 'border-amber-200 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-900/20' : 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-900/20'}`}>
            <div className={`text-[10px] font-bold uppercase tracking-[.09em] ${coverage.unverified ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}`}>Sem IPL local confirmada</div>
            <div className={`mt-2 text-2xl font-semibold ${coverage.unverified ? 'text-amber-950 dark:text-amber-200' : 'text-emerald-950 dark:text-emerald-200'}`}>{coverage.unverified}</div>
            <div className={`mt-1 text-xs ${coverage.unverified ? 'text-amber-800/70 dark:text-amber-300/70' : 'text-emerald-800/70 dark:text-emerald-300/70'}`}>Pendências priorizadas pelas referências comerciais</div>
          </div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="h-full rounded-full bg-[#1d4f91] transition-all duration-500" style={{ width: `${coveragePercent}%` }} />
        </div>

        {!coverage.portalChecked && (
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/60 px-4 py-3 text-xs leading-5 text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
            O Portal Husqvarna Brasil não é consultado automaticamente nesta tela. Um modelo pendente aqui significa apenas <b>sem IPL local confirmada</b>; não significa que a IPL não exista no Portal BR.
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Maiores lacunas para investigar</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Ordenadas pela quantidade de vezes que o modelo aparece nas aplicações da base comercial.</p>
          </div>
          <span className="text-xs font-semibold text-slate-400">Top {gaps.length}</span>
        </div>

        {gaps.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 text-sm font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">Nenhuma lacuna local identificada.</div>
        ) : (
          <div className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
            {gaps.map(gap => (
              <div key={gap.normalizedModel} className="flex flex-wrap items-start justify-between gap-3 bg-white px-4 py-3 dark:bg-slate-900">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-sm text-slate-900 dark:text-slate-100">{gap.model}</b>
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300">Sem IPL local</span>
                  </div>
                  {gap.commercialEvidence[0] && <div className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400" title={gap.commercialEvidence[0]}>Exemplo comercial: {gap.commercialEvidence[0]}</div>}
                </div>
                <span className="shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">{signalLabel(gap.commercialSignals)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
