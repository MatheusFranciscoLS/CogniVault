import { useState } from 'react';
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

type PortalCacheSummary = {
  HIT: number;
  STALE: number;
  MISS: number;
  FALLBACK: number;
};

export type PortfolioCoverage = {
  scope: 'BR_LOCAL';
  portalChecked: boolean;
  checkedCount?: number;
  checkedModels?: string[];
  portalCache?: PortalCacheSummary;
  total: number;
  localIpl: number;
  portalIpl: number;
  unverified: number;
  covered: number;
  coverageRate: number;
  gaps: PortfolioCoverageGap[];
};

function signalLabel(count: number) {
  return `${count} referência${count === 1 ? '' : 's'} comercial${count === 1 ? '' : 'is'}`;
}

function portalDiagnostic(state: PortfolioCoverageGap['portalVerification']) {
  if (state === 'NO_EXACT_MATCH') return 'Sem match exato no Portal BR';
  if (state === 'NO_IPL') return 'Produto exato sem IPL estruturada';
  if (state === 'INCONCLUSIVE') return 'Consulta ao Portal inconclusiva';
  if (state === 'VERIFIED') return 'IPL confirmada no Portal BR';
  return 'Portal não consultado';
}

function portalCacheLabel(cache?: PortalCacheSummary) {
  if (!cache) return null;
  const parts: string[] = [];
  if (cache.HIT) parts.push(`${cache.HIT} reaproveitado${cache.HIT === 1 ? '' : 's'}`);
  if (cache.MISS) parts.push(`${cache.MISS} consulta${cache.MISS === 1 ? '' : 's'} nova${cache.MISS === 1 ? '' : 's'}`);
  if (cache.STALE) parts.push(`${cache.STALE} em revalidação`);
  if (cache.FALLBACK) parts.push(`${cache.FALLBACK} fallback${cache.FALLBACK === 1 ? '' : 's'}`);
  return parts.length ? parts.join(' · ') : null;
}

export default function PortfolioCoveragePanel({
  coverage,
  onRefresh,
  refreshing = false,
}: {
  coverage: PortfolioCoverage;
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
}) {
  const [portalCoverage, setPortalCoverage] = useState<PortfolioCoverage | null>(null);
  const [checkingPortal, setCheckingPortal] = useState(false);
  const [portalError, setPortalError] = useState('');
  const displayCoverage = portalCoverage ?? coverage;

  const refreshLocal = async () => {
    setPortalCoverage(null);
    setPortalError('');
    await onRefresh?.();
  };

  const checkPortal = async () => {
    setCheckingPortal(true);
    setPortalError('');
    try {
      const result = await apiJson<PortfolioCoverage>('/api/admin/quality/portal-coverage', {
        method: 'POST',
        timeoutMs: 120_000,
      });
      setPortalCoverage(result);
    } catch (error) {
      setPortalError(error instanceof Error ? error.message : 'Não foi possível consultar o Portal Husqvarna Brasil agora.');
    } finally {
      setCheckingPortal(false);
    }
  };

  const coveragePercent = Math.round(displayCoverage.coverageRate * 100);
  const gaps = displayCoverage.gaps.slice(0, 8);
  const cacheLabel = portalCacheLabel(displayCoverage.portalCache);

  return (
    <section className="cv-surface mb-5 overflow-hidden rounded-[24px]">
      <div className="border-b border-slate-200 bg-slate-50/70 p-5 dark:border-slate-700/80 dark:bg-slate-800/60">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Cobertura do portfólio BR</h2>
              <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300">Brasil/local</span>
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500 dark:text-slate-400">
              Mostra quais modelos citados na lista comercial brasileira têm fonte técnica comprovada. Aplicações comerciais servem apenas para priorizar investigação e nunca comprovam compatibilidade de peça, PNC ou número de série.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {onRefresh && (
              <button type="button" disabled={refreshing || checkingPortal} onClick={() => void refreshLocal()} className="cv-secondary px-3 py-2 text-xs font-semibold disabled:opacity-50">
                {refreshing ? 'Recarregando…' : 'Recarregar base local'}
              </button>
            )}
            <button
              type="button"
              disabled={checkingPortal || refreshing || gaps.length === 0}
              onClick={() => void checkPortal()}
              className="cv-secondary px-3 py-2 text-xs font-semibold disabled:opacity-50"
            >
              {checkingPortal ? 'Consultando Portal BR…' : 'Consultar Portal BR (Top 8)'}
            </button>
          </div>
        </div>
      </div>

      <div className="p-5">
        {portalError && (
          <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300">
            {portalError}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="text-[10px] font-bold uppercase tracking-[.09em] text-slate-500 dark:text-slate-400">Cobertura técnica</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{coveragePercent}%</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{displayCoverage.covered} de {displayCoverage.total} modelos com fonte técnica</div>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
            <div className="text-[10px] font-bold uppercase tracking-[.09em] text-emerald-700 dark:text-emerald-300">IPL local</div>
            <div className="mt-2 text-2xl font-semibold text-emerald-950 dark:text-emerald-200">{displayCoverage.localIpl}</div>
            <div className="mt-1 text-xs text-emerald-800/70 dark:text-emerald-300/70">Catálogos técnicos presentes no CogniVault</div>
          </div>
          <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-800 dark:bg-blue-900/20">
            <div className="text-[10px] font-bold uppercase tracking-[.09em] text-blue-700 dark:text-blue-300">Portal BR</div>
            <div className="mt-2 text-2xl font-semibold text-blue-950 dark:text-blue-200">{displayCoverage.portalIpl}</div>
            <div className="mt-1 text-xs text-blue-800/70 dark:text-blue-300/70">
              {displayCoverage.portalChecked ? 'IPLs oficiais confirmadas nesta consulta' : 'Portal ainda não consultado nesta carga'}
            </div>
          </div>
          <div className={`rounded-2xl border p-4 ${displayCoverage.unverified ? 'border-amber-200 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-900/20' : 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-900/20'}`}>
            <div className={`text-[10px] font-bold uppercase tracking-[.09em] ${displayCoverage.unverified ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}`}>Sem fonte técnica comprovada</div>
            <div className={`mt-2 text-2xl font-semibold ${displayCoverage.unverified ? 'text-amber-950 dark:text-amber-200' : 'text-emerald-950 dark:text-emerald-200'}`}>{displayCoverage.unverified}</div>
            <div className={`mt-1 text-xs ${displayCoverage.unverified ? 'text-amber-800/70 dark:text-amber-300/70' : 'text-emerald-800/70 dark:text-emerald-300/70'}`}>Pendências priorizadas pelas referências comerciais</div>
          </div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="h-full rounded-full bg-[#1d4f91] transition-all duration-500" style={{ width: `${coveragePercent}%` }} />
        </div>

        {!displayCoverage.portalChecked ? (
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/60 px-4 py-3 text-xs leading-5 text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
            O Portal Husqvarna Brasil não é consultado automaticamente. Use o botão acima para homologar somente as <b>8 maiores lacunas</b>, com limite e concorrência controlados. Uma pendência significa apenas ausência de fonte técnica comprovada até aqui.
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-xs leading-5 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
            Portal Husqvarna Brasil consultado para <b>{displayCoverage.checkedCount ?? 0} modelo(s)</b> priorizado(s). Uma consulta inconclusiva nunca é tratada como ausência de IPL, e a lista comercial continua separada da evidência técnica oficial.
            {cacheLabel && (
              <div className="mt-1 text-[11px] font-semibold text-emerald-700/80 dark:text-emerald-300/80">
                Cache do Portal: {cacheLabel}.
              </div>
            )}
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
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 text-sm font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">Nenhuma lacuna técnica identificada.</div>
        ) : (
          <div className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
            {gaps.map(gap => (
              <div key={gap.normalizedModel} className="flex flex-wrap items-start justify-between gap-3 bg-white px-4 py-3 dark:bg-slate-900">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-sm text-slate-900 dark:text-slate-100">{gap.model}</b>
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300">Sem IPL local</span>
                    {displayCoverage.portalChecked && (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {portalDiagnostic(gap.portalVerification)}
                      </span>
                    )}
                  </div>
                  {gap.commercialEvidence[0] && <div className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400" title={gap.commercialEvidence[0]}>Exemplo comercial: {gap.commercialEvidence[0]}</div>}
                  {displayCoverage.portalChecked && gap.portalVerificationNote && (
                    <div className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400">Portal BR: {gap.portalVerificationNote}</div>
                  )}
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
