import { useEffect, useRef, useState } from 'react';
import { apiJson } from '../lib';

type PortfolioCoverageGap = {
  model: string;
  normalizedModel: string;
  status: 'UNVERIFIED';
  commercialSignals: number;
  commercialEvidence: string[];
  commercialCategory?: string | null;
  portalVerification: 'NOT_CHECKED' | 'VERIFIED' | 'DOCUMENT_ONLY' | 'NO_EXACT_MATCH' | 'NO_IPL' | 'INCONCLUSIVE';
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
  /** Modelos ainda sem resposta do Portal (o que a conferência automática vai percorrer). */
  remaining?: number;
  portalCache?: PortalCacheSummary;
  total: number;
  localIpl: number;
  portalIpl: number;
  /** Modelos que o Portal só tem como IPL em documento (PDF), sem lista estruturada. */
  portalDocument?: number;
  /** Sem lista no Portal e fora da lista vigente de máquinas: fora de linha, acessório ou marca secundária. */
  notApplicable?: number;
  outOfLine?: Array<{ model: string; normalizedModel: string; commercialCategory: string | null }>;
  unverified: number;
  covered: number;
  coverageRate: number;
  gaps: PortfolioCoverageGap[];
};

function signalLabel(count: number) {
  return `${count} referência${count === 1 ? '' : 's'} comercial${count === 1 ? '' : 'is'}`;
}

function portalDiagnostic(state: PortfolioCoverageGap['portalVerification']) {
  if (state === 'NO_EXACT_MATCH') return 'Portal: sem lista de peças';
  if (state === 'NO_IPL') return 'Portal: só manual, sem lista de peças';
  if (state === 'INCONCLUSIVE') return 'Portal: não respondeu, tentar de novo';
  if (state === 'VERIFIED') return 'Lista de peças confirmada no Portal';
  if (state === 'DOCUMENT_ONLY') return 'Portal: IPL em PDF';
  return 'Ainda não conferido no Portal';
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
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const stopped = useRef(false);
  const started = useRef(false);
  const displayCoverage = portalCoverage ?? coverage;

  const refreshLocal = async () => {
    setPortalCoverage(null);
    setPortalError('');
    await onRefresh?.();
  };

  // Confere no Portal os modelos que ainda não têm resposta, 8 por vez. Cada resposta fica
  // guardada no servidor, então abrir a tela de novo só consulta o que falta ou venceu.
  const checkPortal = async () => {
    setCheckingPortal(true);
    setPortalError('');
    const attempted = new Set<string>();
    setProgress({ done: 0, total: coverage.remaining ?? 0 });
    try {
      for (let round = 0; round < 80 && !stopped.current; round += 1) {
        const result = await apiJson<PortfolioCoverage>('/api/admin/quality/portal-coverage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ exclude: [...attempted] }),
          timeoutMs: 120_000,
        });
        for (const model of result.checkedModels ?? []) attempted.add(model);
        setPortalCoverage(result);
        setProgress(current => ({ done: attempted.size, total: Math.max(current.total, attempted.size) }));
        if (!result.remaining || !result.checkedCount) break;
      }
    } catch (error) {
      setPortalError(error instanceof Error ? error.message : 'Não foi possível consultar o Portal Husqvarna Brasil agora.');
    } finally {
      setCheckingPortal(false);
    }
  };

  // Abrir a tela já começa a conferência do que falta; sair da tela interrompe.
  useEffect(() => {
    stopped.current = false;
    if (started.current || !(coverage.remaining && coverage.remaining > 0)) return undefined;
    started.current = true;
    const timer = window.setTimeout(() => void checkPortal(), 0);
    return () => { window.clearTimeout(timer); stopped.current = true; started.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverage.remaining]);

  const coveragePercent = Math.round(displayCoverage.coverageRate * 100);
  const gaps = displayCoverage.gaps;

  return (
    <section className="cv-surface mb-5 overflow-hidden rounded-[24px]">
      <div className="border-b border-ink-200 bg-ink-50/70 p-5 dark:border-ink-700/80 dark:bg-ink-800/60">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-ink-900 dark:text-ink-100">Cobertura do portfólio BR</h2>
              <span className="rounded-full border border-brand-200 bg-brand-50 px-2 py-1 text-sm font-bold   text-brand-700 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-300">Brasil/local</span>
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-5 text-ink-500 dark:text-ink-400">
              Mostra quais modelos citados na lista comercial brasileira têm fonte técnica comprovada. Aplicações comerciais servem apenas para priorizar investigação e nunca comprovam compatibilidade de peça, PNC ou número de série.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {onRefresh && (
              <button type="button" disabled={refreshing || checkingPortal} onClick={() => void refreshLocal()} className="cv-secondary px-3 py-2 text-sm font-semibold disabled:opacity-50">
                {refreshing ? 'Recarregando…' : 'Recarregar base local'}
              </button>
            )}
            <button
              type="button"
              disabled={checkingPortal || refreshing || gaps.length === 0 || !(displayCoverage.remaining ?? coverage.remaining)}
              onClick={() => void checkPortal()}
              className="cv-secondary px-3 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {checkingPortal ? `Conferindo no Portal… ${progress.done} de ${progress.total}` : 'Conferir no Portal de novo'}
            </button>
          </div>
        </div>
      </div>

      <div className="p-5">
        {portalError && (
          <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300">
            {portalError}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-ink-200 bg-white p-4 dark:border-ink-700 dark:bg-ink-800">
            <div className="text-sm font-bold   text-ink-500 dark:text-ink-400">Cobertura técnica</div>
            <div className="mt-2 text-2xl font-semibold text-ink-900 dark:text-ink-100">{coveragePercent}%</div>
            <div className="mt-1 text-sm text-ink-500 dark:text-ink-400">{displayCoverage.covered} de {displayCoverage.total - (displayCoverage.notApplicable ?? 0)} modelos em linha com fonte técnica</div>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
            <div className="text-sm font-bold   text-emerald-700 dark:text-emerald-300">IPL local</div>
            <div className="mt-2 text-2xl font-semibold text-emerald-950 dark:text-emerald-200">{displayCoverage.localIpl}</div>
            <div className="mt-1 text-sm text-emerald-800 dark:text-emerald-200">Catálogos técnicos presentes no CogniVault</div>
          </div>
          <div className="rounded-2xl border border-brand-200 bg-brand-50/70 p-4 dark:border-brand-800 dark:bg-brand-900/20">
            <div className="text-sm font-bold   text-brand-700 dark:text-brand-300">Portal BR</div>
            <div className="mt-2 text-2xl font-semibold text-brand-950 dark:text-brand-200">{displayCoverage.portalIpl + (displayCoverage.portalDocument ?? 0)}</div>
            <div className="mt-1 text-sm text-brand-800 dark:text-brand-200">
              {displayCoverage.portalIpl} com lista de peças · {displayCoverage.portalDocument ?? 0} só com IPL em PDF
            </div>
          </div>
          <div className={`rounded-2xl border p-4 ${displayCoverage.unverified ? 'border-amber-200 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-900/20' : 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-900/20'}`}>
            <div className={`text-sm font-bold   ${displayCoverage.unverified ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}`}>Em linha, sem vista no Portal</div>
            <div className={`mt-2 text-2xl font-semibold ${displayCoverage.unverified ? 'text-amber-950 dark:text-amber-200' : 'text-emerald-950 dark:text-emerald-200'}`}>{displayCoverage.unverified}</div>
            <div className={`mt-1 text-sm ${displayCoverage.unverified ? 'text-amber-800 dark:text-amber-200' : 'text-emerald-800 dark:text-emerald-200'}`}>{checkingPortal ? 'Conferência no Portal em andamento' : displayCoverage.remaining ? 'Ainda falta conferir no Portal' : 'A Husqvarna vende hoje e o Portal não publica a vista'}</div>
          </div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
          <div className="h-full rounded-full bg-brand-600 transition-all duration-500" style={{ width: `${coveragePercent}%` }} />
        </div>

        {checkingPortal ? (
          <div role="status" className="mt-4 rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-3 text-sm leading-5 text-brand-800 dark:border-brand-800 dark:bg-brand-900/20 dark:text-brand-300">
            Conferindo os modelos no Portal Husqvarna Brasil, 8 por vez ({progress.done} de {progress.total}). Pode continuar usando o sistema.
          </div>
        ) : displayCoverage.remaining ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm leading-5 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
            Faltam {displayCoverage.remaining} modelos para conferir no Portal. Use o botão acima para continuar.
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm leading-5 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
            Todos os modelos já foram conferidos. {displayCoverage.notApplicable ?? 0} estão fora de linha (não constam na lista vigente de máquinas e o Portal não tem lista). Os {displayCoverage.unverified} abaixo constam na lista vigente e o Portal não publica a vista explodida.
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-100">Em linha, sem vista explodida no Portal</h3>
            <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{displayCoverage.remaining ? 'Os que ainda não foram conferidos aparecem como pendentes. ' : 'Para estes, a única saída é o SAC da Husqvarna. '}Ordenados pela quantidade de aplicações na base comercial.</p>
          </div>
          <span className="text-sm font-semibold text-ink-500 dark:text-ink-400">{gaps.length} {gaps.length === 1 ? 'modelo' : 'modelos'}</span>
        </div>

        {(displayCoverage.outOfLine?.length ?? 0) > 0 && (
          <details className="mt-4 rounded-2xl border border-ink-200 dark:border-ink-700">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ink-700 dark:text-ink-200">
              Fora de linha: {displayCoverage.outOfLine?.length} modelos (não constam na lista vigente de máquinas e o Portal não tem lista de peças)
            </summary>
            <div className="flex flex-wrap gap-2 border-t border-ink-100 px-4 py-3 dark:border-ink-800">
              {displayCoverage.outOfLine?.map(item => (
                <span key={item.normalizedModel} className="rounded-full border border-ink-200 bg-ink-50 px-2 py-0.5 text-sm text-ink-600 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-300">
                  <b>{item.model}</b>{item.commercialCategory ? ` · ${item.commercialCategory}` : ''}
                </span>
              ))}
            </div>
          </details>
        )}

        {gaps.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 text-sm font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">Nenhum modelo em linha está sem vista explodida.</div>
        ) : (
          <div className="mt-3 max-h-[520px] divide-y divide-ink-100 overflow-auto rounded-2xl border border-ink-200 dark:divide-ink-800 dark:border-ink-700">
            {gaps.map(gap => (
              <div key={gap.normalizedModel} className="flex flex-wrap items-start justify-between gap-3 bg-white px-4 py-3 dark:bg-ink-900">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-sm text-ink-900 dark:text-ink-100">{gap.model}</b>
                    {gap.commercialCategory && (
                      <span className="rounded-full border border-ink-200 bg-ink-50 px-2 py-0.5 text-sm font-semibold text-ink-600 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-300">{gap.commercialCategory}</span>
                    )}
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-sm font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                      {portalDiagnostic(gap.portalVerification)}
                    </span>
                  </div>
                  {gap.commercialEvidence[0] && <div className="mt-1 truncate text-sm text-ink-500 dark:text-ink-400" title={gap.commercialEvidence[0]}>Exemplo comercial: {gap.commercialEvidence[0]}</div>}
                  {gap.portalVerificationNote && gap.portalVerification !== 'NOT_CHECKED' && (
                    <div className="mt-1 text-sm leading-4 text-ink-500 dark:text-ink-400">Portal BR: {gap.portalVerificationNote}</div>
                  )}
                </div>
                <span className="shrink-0 text-sm font-semibold text-ink-500 dark:text-ink-400">{signalLabel(gap.commercialSignals)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
