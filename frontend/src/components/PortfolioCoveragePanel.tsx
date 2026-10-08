import { useEffect, useRef, useState } from 'react';
import { ApiError, apiJson } from '../lib';
import { retryTransient } from '../lib/transient-retry';
import { categoryLabel } from '../lib/category-label';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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
  /** Categorias desligadas da conta por decisão do dono (Automower, por enquanto). */
  paused?: number;
  pausedModels?: Array<{ model: string; normalizedModel: string; commercialCategory: string | null }>;
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
    <section aria-label="Cobertura técnica do portfólio" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold leading-8">Cobertura do portfólio</h2>
        <div className="flex flex-wrap gap-2">
          {onRefresh && (
            <Button type="button" variant="outline" disabled={refreshing || checkingPortal} onClick={() => void refreshLocal()}>
              {refreshing ? 'Recarregando…' : 'Recarregar base local'}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={checkingPortal || refreshing || gaps.length === 0 || !(displayCoverage.remaining ?? coverage.remaining)}
            onClick={() => void checkPortal()}
          >
            {checkingPortal ? `Conferindo no Portal… ${progress.done} de ${progress.total}` : 'Conferir no Portal de novo'}
          </Button>
        </div>
      </div>

      {portalError && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-base text-destructive">
          {portalError}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-sm font-semibold text-muted-foreground">Cobertura técnica</div>
          <div className="mt-2 text-3xl font-semibold tabular-nums">{coveragePercent}%</div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={coveragePercent} aria-valuemin={0} aria-valuemax={100} aria-label="Cobertura técnica">
            <div className="h-full rounded-full bg-ok transition-[width] duration-500" style={{ width: `${coveragePercent}%` }} />
          </div>
          <div className="mt-2 text-sm text-muted-foreground">{displayCoverage.covered} de {displayCoverage.total - (displayCoverage.notApplicable ?? 0) - (displayCoverage.paused ?? 0)} modelos em linha</div>
        </div>
        <CoverageCard label="Catálogos em PDF" value={displayCoverage.localIpl.toLocaleString('pt-BR')}>
          Na biblioteca do CogniVault
        </CoverageCard>
        <CoverageCard label="Portal BR" value={(displayCoverage.portalIpl + (displayCoverage.portalDocument ?? 0)).toLocaleString('pt-BR')}>
          {displayCoverage.portalIpl} com lista de peças · {displayCoverage.portalDocument ?? 0} só com IPL em PDF
        </CoverageCard>
        <CoverageCard label="Em linha, sem vista no Portal" value={displayCoverage.unverified.toLocaleString('pt-BR')} tone={displayCoverage.unverified ? 'warn' : 'ok'}>
          {checkingPortal ? 'Conferência em andamento' : displayCoverage.remaining ? 'Ainda falta conferir' : 'Só o SAC da Husqvarna resolve'}
        </CoverageCard>
      </div>

      {checkingPortal ? (
        <div role="status" className="rounded-xl border border-border bg-card px-4 py-3 text-base text-muted-foreground">
          {waiting ? 'O servidor está ocupado; tentando de novo em instantes. ' : ''}Conferindo no Portal, 8 modelos por vez ({progress.done} de {progress.total}). Pode continuar usando o sistema.
        </div>
      ) : displayCoverage.remaining ? (
        <div className="rounded-xl border border-warn/40 bg-warn-soft px-4 py-3 text-base text-warn">
          Faltam {displayCoverage.remaining} modelos para conferir no Portal. Use "Conferir no Portal de novo" para continuar.
        </div>
      ) : (
        <div className="rounded-xl border border-ok/40 bg-ok-soft px-4 py-3 text-base text-ok">
          Todos os modelos foram conferidos. {displayCoverage.notApplicable ?? 0} estão fora de linha (fora da lista vigente e sem lista no Portal).
        </div>
      )}

      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-lg font-semibold">Em linha, sem vista explodida no Portal</h3>
        <span className="text-base text-muted-foreground tabular-nums">{gaps.length} {gaps.length === 1 ? 'modelo' : 'modelos'}</span>
      </div>

      {gaps.length === 0 ? (
        <div className="rounded-xl border border-ok/40 bg-ok-soft p-5 text-base font-semibold text-ok">Nenhum modelo em linha está sem vista explodida.</div>
      ) : (
        <Table containerClassName="max-h-[520px] overflow-y-auto">
          <TableHeader className="sticky top-0 z-10">
            <TableRow className="hover:bg-transparent">
              <TableHead>Modelo</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Situação no Portal</TableHead>
              <TableHead className="text-right">Referências</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {gaps.map(gap => (
              <TableRow key={gap.normalizedModel}>
                <TableCell className="max-w-0">
                  <div className="font-semibold">{gap.model}</div>
                  {gap.commercialEvidence[0] && <div className="truncate text-sm text-muted-foreground" title={gap.commercialEvidence[0]}>{gap.commercialEvidence[0]}</div>}
                </TableCell>
                <TableCell className="text-muted-foreground">{gap.commercialCategory ? categoryLabel(gap.commercialCategory) : '—'}</TableCell>
                <TableCell>
                  <span className="inline-flex rounded-md bg-warn-soft px-2 py-0.5 text-sm font-semibold text-warn">{portalDiagnostic(gap.portalVerification)}</span>
                  {gap.portalVerificationNote && gap.portalVerification !== 'NOT_CHECKED' && (
                    <div className="mt-1 max-w-md text-sm text-muted-foreground">{gap.portalVerificationNote}</div>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">{signalLabel(gap.commercialSignals)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {(displayCoverage.pausedModels?.length ?? 0) > 0 && (
        <details className="rounded-xl border border-border bg-card">
          <summary className="cursor-pointer px-4 py-3 text-base font-semibold">
            Em pausa: {displayCoverage.pausedModels?.length} modelos
            <span className="ml-2 font-normal text-muted-foreground">fora da conta por enquanto</span>
          </summary>
          <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
            {displayCoverage.pausedModels?.map(item => (
              <span key={item.normalizedModel} className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-sm text-muted-foreground">
                <b className="text-foreground">{item.model}</b>{item.commercialCategory ? ` · ${categoryLabel(item.commercialCategory)}` : ''}
              </span>
            ))}
          </div>
        </details>
      )}

      {(displayCoverage.outOfLine?.length ?? 0) > 0 && (
        <details className="rounded-xl border border-border bg-card">
          <summary className="cursor-pointer px-4 py-3 text-base font-semibold">
            Fora de linha: {displayCoverage.outOfLine?.length} modelos
          </summary>
          <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
            {displayCoverage.outOfLine?.map(item => (
              <span key={item.normalizedModel} className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-sm text-muted-foreground">
                <b className="text-foreground">{item.model}</b>{item.commercialCategory ? ` · ${categoryLabel(item.commercialCategory)}` : ''}
              </span>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
