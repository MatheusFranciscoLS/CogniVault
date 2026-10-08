import { useEffect, useRef, useState } from 'react';
import { ApiError, apiJson } from '../lib';
import { retryTransient } from '../lib/transient-retry';

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

/**
 * Falha que passa sozinha: outra conferência ainda rodando no servidor (409), servidor reiniciando por um deploy ou acordando
 * (502/503/504), Portal lento (500/429) ou a conexão que caiu. A conferência espera e tenta de novo em vez de parar no primeiro erro.
 */
function isTransientCoverageError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return error.status === null || [409, 429, 500, 502, 503, 504].includes(error.status);
}

const RETRY_WAIT_MS = [5_000, 10_000, 20_000, 30_000, 45_000];

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

/** Cartão de número da cobertura: neutro, com a cor só no valor (o amarelo/verde de fundo escondia qual cartão pede ação). */
function CoverageCard({ label, value, tone, children }: { label: string; value: string; tone?: 'ok' | 'warn'; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-sm font-semibold text-muted-foreground">{label}</div>
      <div className={`mt-2 text-2xl font-semibold tabular-nums ${tone === 'warn' ? 'text-warn' : tone === 'ok' ? 'text-ok' : ''}`}>{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{children}</div>
    </div>
  );
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
  const [waiting, setWaiting] = useState(false);
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
        const result = await retryTransient(
          () => apiJson<PortfolioCoverage>('/api/admin/quality/portal-coverage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ exclude: [...attempted] }),
            timeoutMs: 120_000,
          }),
          { isTransient: isTransientCoverageError, waits: RETRY_WAIT_MS, onWaiting: setWaiting, shouldStop: () => stopped.current },
        );
        if (result === null) return;
        for (const model of result.checkedModels ?? []) attempted.add(model);
        setPortalCoverage(result);
        setProgress(current => ({ done: attempted.size, total: Math.max(current.total, attempted.size) }));
        if (!result.remaining || !result.checkedCount) break;
      }
    } catch (error) {
      setPortalError(isTransientCoverageError(error)
        ? 'O servidor está ocupado ou reiniciando. O que já foi conferido ficou guardado; use o botão para continuar.'
        : (error instanceof Error ? error.message : 'Não foi possível consultar o Portal Husqvarna Brasil agora.'));
    } finally {
      setWaiting(false);
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
    <section className="rounded-xl border border-border bg-card mb-5 overflow-hidden">
      <div className="border-b border-border bg-muted p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">Cobertura do portfólio BR</h2>
              <span className="rounded-full border border-brand-200 bg-brand-50 px-2 py-1 text-sm font-bold   text-brand-700 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-300">Brasil/local</span>
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-5 text-muted-foreground">
              Mostra quais modelos citados na lista comercial brasileira têm fonte técnica comprovada. Aplicações comerciais servem apenas para priorizar investigação e nunca comprovam compatibilidade de peça, PNC ou número de série.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {onRefresh && (
              <button type="button" disabled={refreshing || checkingPortal} onClick={() => void refreshLocal()} className="inline-flex items-center justify-center gap-2 rounded-md border border-input bg-card font-semibold text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/60 disabled:opacity-60 px-3 py-2 text-sm font-semibold disabled:opacity-50">
                {refreshing ? 'Recarregando…' : 'Recarregar base local'}
              </button>
            )}
            <button
              type="button"
              disabled={checkingPortal || refreshing || gaps.length === 0 || !(displayCoverage.remaining ?? coverage.remaining)}
              onClick={() => void checkPortal()}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-input bg-card font-semibold text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/60 disabled:opacity-60 px-3 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {checkingPortal ? `Conferindo no Portal… ${progress.done} de ${progress.total}` : 'Conferir no Portal de novo'}
            </button>
          </div>
        </div>
      </div>

      <div className="p-5">
        {portalError && (
          <div role="alert" className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {portalError}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <CoverageCard label="Cobertura técnica" value={`${coveragePercent}%`}>
            {displayCoverage.covered} de {displayCoverage.total - (displayCoverage.notApplicable ?? 0)} modelos em linha com fonte técnica
          </CoverageCard>
          <CoverageCard label="Catálogos em PDF" value={displayCoverage.localIpl.toLocaleString('pt-BR')}>
            Na biblioteca do CogniVault
          </CoverageCard>
          <CoverageCard label="Portal BR" value={(displayCoverage.portalIpl + (displayCoverage.portalDocument ?? 0)).toLocaleString('pt-BR')}>
            {displayCoverage.portalIpl} com lista de peças · {displayCoverage.portalDocument ?? 0} só com IPL em PDF
          </CoverageCard>
          <CoverageCard label="Em linha, sem vista no Portal" value={displayCoverage.unverified.toLocaleString('pt-BR')} tone={displayCoverage.unverified ? 'warn' : 'ok'}>
            {checkingPortal ? 'Conferência no Portal em andamento' : displayCoverage.remaining ? 'Ainda falta conferir no Portal' : 'A Husqvarna vende hoje e o Portal não publica a vista'}
          </CoverageCard>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-brand-600 transition-[width] duration-500" style={{ width: `${coveragePercent}%` }} />
        </div>

        {checkingPortal ? (
          <div role="status" className="mt-4 rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-3 text-sm leading-5 text-brand-800 dark:border-brand-800 dark:bg-brand-900/20 dark:text-brand-300">
            {waiting ? 'O servidor está ocupado; tentando de novo em instantes. ' : ''}Conferindo os modelos no Portal Husqvarna Brasil, 8 por vez ({progress.done} de {progress.total}). Pode continuar usando o sistema.
          </div>
        ) : displayCoverage.remaining ? (
          <div className="mt-4 rounded-xl border border-warn/40 bg-warn-soft px-4 py-3 text-sm leading-5 text-warn">
            Faltam {displayCoverage.remaining} modelos para conferir no Portal. Use o botão acima para continuar.
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-ok/40 bg-ok-soft px-4 py-3 text-sm leading-5 text-ok">
            Todos os modelos já foram conferidos. {displayCoverage.notApplicable ?? 0} estão fora de linha (não constam na lista vigente de máquinas e o Portal não tem lista). Os {displayCoverage.unverified} abaixo constam na lista vigente e o Portal não publica a vista explodida.
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Em linha, sem vista explodida no Portal</h3>
            <p className="mt-1 text-sm text-muted-foreground">{displayCoverage.remaining ? 'Os que ainda não foram conferidos aparecem como pendentes. ' : 'Para estes, a única saída é o SAC da Husqvarna. '}Ordenados pela quantidade de aplicações na base comercial.</p>
          </div>
          <span className="text-sm font-semibold text-muted-foreground">{gaps.length} {gaps.length === 1 ? 'modelo' : 'modelos'}</span>
        </div>

        {(displayCoverage.outOfLine?.length ?? 0) > 0 && (
          <details className="mt-4 rounded-2xl border border-border">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-foreground">
              Fora de linha: {displayCoverage.outOfLine?.length} modelos (não constam na lista vigente de máquinas e o Portal não tem lista de peças)
            </summary>
            <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
              {displayCoverage.outOfLine?.map(item => (
                <span key={item.normalizedModel} className="rounded-full border border-border bg-muted px-2 py-0.5 text-sm text-muted-foreground">
                  <b>{item.model}</b>{item.commercialCategory ? ` · ${item.commercialCategory}` : ''}
                </span>
              ))}
            </div>
          </details>
        )}

        {gaps.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-ok/40 bg-ok-soft p-5 text-sm font-semibold text-ok">Nenhum modelo em linha está sem vista explodida.</div>
        ) : (
          <div className="mt-3 max-h-[520px] divide-y divide-ink-100 overflow-auto rounded-2xl border border-border dark:divide-ink-800">
            {gaps.map(gap => (
              <div key={gap.normalizedModel} className="flex flex-wrap items-start justify-between gap-3 bg-card px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-sm text-foreground">{gap.model}</b>
                    {gap.commercialCategory && (
                      <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-sm font-semibold text-muted-foreground">{gap.commercialCategory}</span>
                    )}
                    <span className="rounded-full border border-warn/40 bg-warn-soft px-2 py-0.5 text-sm font-semibold text-warn">
                      {portalDiagnostic(gap.portalVerification)}
                    </span>
                  </div>
                  {gap.commercialEvidence[0] && <div className="mt-1 truncate text-sm text-muted-foreground" title={gap.commercialEvidence[0]}>Exemplo comercial: {gap.commercialEvidence[0]}</div>}
                  {gap.portalVerificationNote && gap.portalVerification !== 'NOT_CHECKED' && (
                    <div className="mt-1 text-sm leading-4 text-muted-foreground">Portal BR: {gap.portalVerificationNote}</div>
                  )}
                </div>
                <span className="shrink-0 text-sm font-semibold text-muted-foreground">{signalLabel(gap.commercialSignals)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
