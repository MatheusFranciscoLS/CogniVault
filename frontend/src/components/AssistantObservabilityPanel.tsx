import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiJson } from '../lib';

type ActionMetric = {
  action: string;
  calls: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
};

type AssistantPerformance = {
  window: { since: string; timezone: string };
  totals: { calls: number; totalTokens: number; promptTokens: number; completionTokens: number };
  interactive: {
    calls: number;
    totalTokens: number;
    budgetTokens: number;
    remainingTokens: number;
    allowed: boolean;
    usedBudgetTokens: number;
  };
  actions: ActionMetric[];
  reusableDecisionCache: Array<{ purpose: string; entries: number }>;
  officialHusqvarnaCacheEntries: number;
  portfolioCoverage: null | {
    totalModels: number;
    localIplModels: number;
    withoutLocalIpl: number;
    localCoveragePercent: number;
    priorityGaps: Array<{
      model: string;
      normalizedModel: string;
      commercialSignals: number;
    }>;
  };
};

type RoutePerformance = {
  route: string;
  requests: number;
  samples: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
  lastMs: number;
  errors: number;
  errorRate: number;
  cacheHits: number;
  cacheMisses: number;
  cacheStales: number;
  cacheFallbacks: number;
  cacheHitRate: number | null;
  lastStatus: number;
  updatedAt: string;
};

type PerformanceResponse = {
  performance: {
    assistant: AssistantPerformance;
    routes: RoutePerformance[];
    runtime: {
      uptimeSeconds: number;
    };
  };
};

function number(value: number) {
  return new Intl.NumberFormat('pt-BR').format(value || 0);
}

function duration(value: number) {
  if (value >= 1000) return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value / 1000)} s`;
  return `${Math.round(value)} ms`;
}

function metricLabel(action: string) {
  if (action === 'CHAT_INTENT_PARSE') return 'Interpretação de pergunta';
  if (action === 'REACT_AGENT_DECISION') return 'Desempate técnico';
  if (action.includes('EXTRACTION')) return 'Extração visual';
  return action.replaceAll('_', ' ').toLowerCase();
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white px-4 py-3 dark:border-ink-800 dark:bg-ink-900">
      <div className="text-[9px] font-black uppercase tracking-[.1em] text-ink-400">{label}</div>
      <div className="mt-1 text-xl font-black tracking-tight text-ink-950 dark:text-white">{value}</div>
      <div className="mt-1 text-[11px] leading-4 text-ink-500 dark:text-ink-400">{detail}</div>
    </div>
  );
}

export default function AssistantObservabilityPanel() {
  const [performance, setPerformance] = useState<PerformanceResponse['performance'] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void apiJson<PerformanceResponse>('/api/admin/performance')
      .then(response => {
        if (!active) return;
        setPerformance(response.performance);
        setError('');
      })
      .catch(requestError => {
        if (!active) return;
        setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar a telemetria.');
      });
    return () => { active = false; };
  }, []);

  const data = performance?.assistant ?? null;
  const portalRoute = performance?.routes.find(item => item.route === 'POST /api/admin/quality/portal-coverage') ?? null;
  const cachedDecisions = useMemo(
    () => data?.reusableDecisionCache.reduce((sum, item) => sum + item.entries, 0) || 0,
    [data],
  );

  if (error) {
    return <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">Observabilidade indisponível agora: {error}</div>;
  }

  if (!data || !performance) {
    return <div className="mt-5 rounded-xl border border-ink-200 bg-white px-4 py-4 text-xs text-ink-400 dark:border-ink-800 dark:bg-ink-900">Carregando operação do assistente…</div>;
  }

  const portfolio = data.portfolioCoverage;
  const budgetPercent = data.interactive.budgetTokens > 0
    ? Math.min(100, Math.round((data.interactive.usedBudgetTokens / data.interactive.budgetTokens) * 100))
    : 0;

  return (
    <section className="mt-6 overflow-hidden rounded-xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-5 py-4 dark:border-ink-800">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[.13em] text-brand-600 dark:text-brand-300">Operação do assistente</div>
          <h2 className="mt-1 text-base font-black text-ink-950 dark:text-white">Uso, cache e cobertura técnica</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-ink-500 dark:text-ink-400">Métricas do dia para acompanhar custo de IA e quanto do trabalho já é resolvido por evidência reutilizável.</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${data.interactive.allowed ? 'border-emerald-200 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300' : 'border-amber-200 text-amber-700 dark:border-amber-800 dark:text-amber-300'}`}>
          {data.interactive.allowed ? 'IA interativa disponível' : 'IA interativa limitada'}
        </span>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Chamadas de IA hoje" value={number(data.totals.calls)} detail={`${number(data.totals.totalTokens)} tokens registrados`} />
        <Stat label="Orçamento interativo" value={`${budgetPercent}%`} detail={`${number(data.interactive.remainingTokens)} tokens restantes`} />
        <Stat label="Decisões reutilizadas" value={number(cachedDecisions)} detail="Cache persistente ainda válido" />
        <Stat label="Cache Husqvarna" value={number(data.officialHusqvarnaCacheEntries)} detail="Entradas oficiais ainda válidas" />
        <Stat
          label="Cobertura IPL local"
          value={portfolio ? `${portfolio.localCoveragePercent}%` : '—'}
          detail={portfolio ? `${portfolio.localIplModels} de ${portfolio.totalModels} modelos descobertos` : 'Inventário indisponível'}
        />
      </div>

      <div className="mx-4 mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-ink-200 bg-ink-50/70 px-3 py-2.5 text-[11px] text-ink-500 dark:border-ink-800 dark:bg-ink-950/30 dark:text-ink-400">
        <span className="font-black uppercase tracking-[.08em] text-ink-700 dark:text-ink-200">Portal BR · rota</span>
        {portalRoute ? (
          <>
            <span><b className="text-ink-700 dark:text-ink-200">{number(portalRoute.requests)}</b> execuções</span>
            <span><b className="text-ink-700 dark:text-ink-200">{portalRoute.cacheHitRate ?? 0}%</b> integralmente cacheadas</span>
            <span>p95 <b className="text-ink-700 dark:text-ink-200">{duration(portalRoute.p95Ms)}</b></span>
            <span>última <b className="text-ink-700 dark:text-ink-200">{duration(portalRoute.lastMs)}</b></span>
            {portalRoute.cacheFallbacks > 0 && (
              <span className="font-bold text-amber-700 dark:text-amber-300">{number(portalRoute.cacheFallbacks)} fallback{portalRoute.cacheFallbacks === 1 ? '' : 's'}</span>
            )}
            {portalRoute.errors > 0 && (
              <span className="font-bold text-rose-700 dark:text-rose-300">{number(portalRoute.errors)} erro{portalRoute.errors === 1 ? '' : 's'} 5xx</span>
            )}
          </>
        ) : (
          <span>Sem amostras desde o último deploy. A rota só aparece depois de uma consulta manual ao Portal.</span>
        )}
      </div>

      <div className="grid gap-4 border-t border-ink-100 p-4 lg:grid-cols-[1.2fr_.8fr] dark:border-ink-800">
        <div>
          <div className="mb-2 text-[9px] font-black uppercase tracking-[.1em] text-ink-400">Onde a IA foi usada hoje</div>
          {!data.actions.length ? (
            <div className="rounded-lg bg-ink-50 px-3 py-3 text-xs text-ink-500 dark:bg-ink-950/40 dark:text-ink-400">Nenhuma chamada de IA registrada hoje. A operação ficou nos caminhos locais/cacheados.</div>
          ) : (
            <div className="divide-y divide-ink-100 rounded-lg border border-ink-200 dark:divide-ink-800 dark:border-ink-800">
              {data.actions.slice(0, 5).map(action => (
                <div key={action.action} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2.5 text-xs">
                  <span className="font-semibold capitalize text-ink-700 dark:text-ink-200">{metricLabel(action.action)}</span>
                  <span className="text-ink-400">{number(action.calls)} chamadas</span>
                  <span className="font-mono font-bold text-ink-600 dark:text-ink-300">{number(action.totalTokens)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 text-[9px] font-black uppercase tracking-[.1em] text-ink-400">Cobertura de portfólio</div>
          <div className="rounded-lg border border-ink-200 p-3 dark:border-ink-800">
            {portfolio ? (
              <>
                <div className="flex items-center justify-between text-xs"><span className="text-ink-500 dark:text-ink-400">Modelos descobertos</span><b>{portfolio.totalModels}</b></div>
                <div className="mt-2 flex items-center justify-between text-xs"><span className="text-ink-500 dark:text-ink-400">Com IPL local</span><b className="text-emerald-700 dark:text-emerald-300">{portfolio.localIplModels}</b></div>
                <div className="mt-2 flex items-center justify-between text-xs"><span className="text-ink-500 dark:text-ink-400">Sem IPL local</span><b className="text-amber-700 dark:text-amber-300">{portfolio.withoutLocalIpl}</b></div>

                {portfolio.priorityGaps.length > 0 && (
                  <div className="mt-3 border-t border-ink-100 pt-3 dark:border-ink-800">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-[9px] font-black uppercase tracking-[.1em] text-ink-400">Prioridade de cobertura</span>
                      <span className="text-[9px] font-semibold text-ink-400">sinais comerciais</span>
                    </div>
                    <div className="space-y-1.5">
                      {portfolio.priorityGaps.slice(0, 6).map(item => (
                        <Link
                          key={item.normalizedModel}
                          to={`/dashboard?tab=machines&search=${encodeURIComponent(item.model)}`}
                          className="flex items-center justify-between gap-3 rounded-md border border-ink-100 px-2.5 py-2 text-xs transition hover:border-brand-200 hover:bg-brand-50/50 dark:border-ink-800 dark:hover:border-brand-900 dark:hover:bg-brand-950/20"
                        >
                          <span className="min-w-0 truncate font-bold text-ink-700 dark:text-ink-200">{item.model}</span>
                          <span className="shrink-0 font-mono text-[10px] font-bold text-brand-600 dark:text-brand-300">{number(item.commercialSignals)} · verificar →</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                <p className="mt-3 border-t border-ink-100 pt-3 text-[10px] leading-4 text-ink-400 dark:border-ink-800">“Sem IPL local” não significa incompatível. A fila acima só prioriza onde buscar evidência primeiro; a fonte oficial continua sendo necessária antes de liberar aplicação.</p>
              </>
            ) : (
              <div className="text-xs text-ink-500 dark:text-ink-400">Inventário de cobertura indisponível nesta leitura.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
