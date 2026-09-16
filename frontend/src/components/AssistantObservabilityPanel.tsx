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

type PerformanceResponse = {
  performance: {
    assistant: AssistantPerformance;
  };
};

function number(value: number) {
  return new Intl.NumberFormat('pt-BR').format(value || 0);
}

function metricLabel(action: string) {
  if (action === 'CHAT_INTENT_PARSE') return 'Interpretação de pergunta';
  if (action === 'REACT_AGENT_DECISION') return 'Desempate técnico';
  if (action.includes('EXTRACTION')) return 'Extração visual';
  return action.replaceAll('_', ' ').toLowerCase();
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-[9px] font-black uppercase tracking-[.1em] text-slate-400">{label}</div>
      <div className="mt-1 text-xl font-black tracking-tight text-slate-950 dark:text-white">{value}</div>
      <div className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400">{detail}</div>
    </div>
  );
}

export default function AssistantObservabilityPanel() {
  const [data, setData] = useState<AssistantPerformance | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void apiJson<PerformanceResponse>('/api/admin/performance')
      .then(response => {
        if (!active) return;
        setData(response.performance.assistant);
        setError('');
      })
      .catch(requestError => {
        if (!active) return;
        setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar a telemetria.');
      });
    return () => { active = false; };
  }, []);

  const cachedDecisions = useMemo(
    () => data?.reusableDecisionCache.reduce((sum, item) => sum + item.entries, 0) || 0,
    [data],
  );

  if (error) {
    return <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">Observabilidade indisponível agora: {error}</div>;
  }

  if (!data) {
    return <div className="mt-5 rounded-xl border border-slate-200 bg-white px-4 py-4 text-xs text-slate-400 dark:border-slate-800 dark:bg-slate-900">Carregando operação do assistente…</div>;
  }

  const portfolio = data.portfolioCoverage;
  const budgetPercent = data.interactive.budgetTokens > 0
    ? Math.min(100, Math.round((data.interactive.usedBudgetTokens / data.interactive.budgetTokens) * 100))
    : 0;

  return (
    <section className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[.13em] text-[#1d4f91] dark:text-blue-300">Operação do assistente</div>
          <h2 className="mt-1 text-base font-black text-slate-950 dark:text-white">Uso, cache e cobertura técnica</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400">Métricas do dia para acompanhar custo de IA e quanto do trabalho já é resolvido por evidência reutilizável.</p>
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

      <div className="grid gap-4 border-t border-slate-100 p-4 lg:grid-cols-[1.2fr_.8fr] dark:border-slate-800">
        <div>
          <div className="mb-2 text-[9px] font-black uppercase tracking-[.1em] text-slate-400">Onde a IA foi usada hoje</div>
          {!data.actions.length ? (
            <div className="rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-500 dark:bg-slate-950/40 dark:text-slate-400">Nenhuma chamada de IA registrada hoje. A operação ficou nos caminhos locais/cacheados.</div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {data.actions.slice(0, 5).map(action => (
                <div key={action.action} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2.5 text-xs">
                  <span className="font-semibold capitalize text-slate-700 dark:text-slate-200">{metricLabel(action.action)}</span>
                  <span className="text-slate-400">{number(action.calls)} chamadas</span>
                  <span className="font-mono font-bold text-slate-600 dark:text-slate-300">{number(action.totalTokens)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 text-[9px] font-black uppercase tracking-[.1em] text-slate-400">Cobertura de portfólio</div>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            {portfolio ? (
              <>
                <div className="flex items-center justify-between text-xs"><span className="text-slate-500 dark:text-slate-400">Modelos descobertos</span><b>{portfolio.totalModels}</b></div>
                <div className="mt-2 flex items-center justify-between text-xs"><span className="text-slate-500 dark:text-slate-400">Com IPL local</span><b className="text-emerald-700 dark:text-emerald-300">{portfolio.localIplModels}</b></div>
                <div className="mt-2 flex items-center justify-between text-xs"><span className="text-slate-500 dark:text-slate-400">Sem IPL local</span><b className="text-amber-700 dark:text-amber-300">{portfolio.withoutLocalIpl}</b></div>

                {portfolio.priorityGaps.length > 0 && (
                  <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-[9px] font-black uppercase tracking-[.1em] text-slate-400">Prioridade de cobertura</span>
                      <span className="text-[9px] font-semibold text-slate-400">sinais comerciais</span>
                    </div>
                    <div className="space-y-1.5">
                      {portfolio.priorityGaps.slice(0, 6).map(item => (
                        <Link
                          key={item.normalizedModel}
                          to={`/husqvarna?search=${encodeURIComponent(item.model)}`}
                          className="flex items-center justify-between gap-3 rounded-md border border-slate-100 px-2.5 py-2 text-xs transition hover:border-blue-200 hover:bg-blue-50/50 dark:border-slate-800 dark:hover:border-blue-900 dark:hover:bg-blue-950/20"
                        >
                          <span className="min-w-0 truncate font-bold text-slate-700 dark:text-slate-200">{item.model}</span>
                          <span className="shrink-0 font-mono text-[10px] font-bold text-[#1d4f91] dark:text-blue-300">{number(item.commercialSignals)} · verificar →</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                <p className="mt-3 border-t border-slate-100 pt-3 text-[10px] leading-4 text-slate-400 dark:border-slate-800">“Sem IPL local” não significa incompatível. A fila acima só prioriza onde buscar evidência primeiro; a fonte oficial continua sendo necessária antes de liberar aplicação.</p>
              </>
            ) : (
              <div className="text-xs text-slate-500 dark:text-slate-400">Inventário de cobertura indisponível nesta leitura.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
