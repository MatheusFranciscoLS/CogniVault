import { useEffect, useMemo, useState } from 'react';
import { apiJson, fmtDate } from '../lib';
import type { AiQualityData, BenchmarkRun, QualityCatalog, SearchRadarItem } from '../types';
import PortfolioCoveragePanel from './PortfolioCoveragePanel';
import type { PortfolioCoverage } from './PortfolioCoveragePanel';
import OfficialVerificationApprovalPanel from './OfficialVerificationApprovalPanel';

function fetchQuality() {
  return apiJson<{ quality: AiQualityData; portfolioCoverage: PortfolioCoverage }>('/api/admin/quality');
}

function healthTone(score: number) {
  return score >= 90
    ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
    : score >= 70
      ? 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
      : 'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300';
}

function reviewLabel(status: QualityCatalog['reviewStatus']) {
  return status === 'REVIEWED' ? 'Revisado' : status === 'READY' ? 'Pronto' : status === 'NEEDS_REVIEW' ? 'Revisar' : 'Pendente';
}

function extractionLabel(method: string | null) {
  if (!method) return 'Método não registrado';
  if (method.toUpperCase().startsWith('GEMINI:')) return `Leitura visual · ${method.split(':').slice(1).join(':')}`;
  if (method.toUpperCase().includes('IPL_TEXT')) return 'Leitura textual local';
  return method;
}

function radarLabel(status: SearchRadarItem['status']) {
  return status === 'AMBIGUOUS' ? 'Ambígua'
    : status === 'NOT_FOUND' ? 'Sem resultado'
      : status === 'PNC_REQUIRED' ? 'Faltou PNC'
        : status === 'MODEL_REQUIRED' ? 'Faltou modelo'
          : 'Faltou peça';
}

function radarSearchQuery(item: SearchRadarItem) {
  if (!item.pnc) return item.query;
  const queryDigits = item.query.replace(/\D/g, '');
  const pncDigits = item.pnc.replace(/\D/g, '');
  return pncDigits && queryDigits.includes(pncDigits) ? item.query : `${item.query} · PNC ${item.pnc}`;
}

function latestBenchmark(data: AiQualityData | null): BenchmarkRun | null {
  return data?.benchmarkRuns?.[0] || null;
}

export default function QualityPanel({ onSearch }: { onSearch?: (query: string) => void }) {
  const [data, setData] = useState<AiQualityData | null>(null);
  const [coverage, setCoverage] = useState<PortfolioCoverage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [benchmarking, setBenchmarking] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [refreshingCoverage, setRefreshingCoverage] = useState(false);
  const [clearingSemantics, setClearingSemantics] = useState(false);
  const [retryingVisual, setRetryingVisual] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [queueFilter, setQueueFilter] = useState('');
  const [draft, setDraft] = useState({ manufacturer: '', model: '', pnc: '' });
  
  const [activeTab, setActiveTab] = useState<'geral' | 'acao' | 'tecnico'>('geral');

  const load = async () => {
    const response = await fetchQuality();
    setData(response.quality);
    setCoverage(response.portfolioCoverage);
    setError('');
  };

  useEffect(() => {
    let active = true;
    void fetchQuality()
      .then(response => {
        if (!active) return;
        setData(response.quality);
        setCoverage(response.portfolioCoverage);
      })
      .catch(loadError => { if (active) setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar o diagnóstico.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const refreshCoverage = async () => {
    setRefreshingCoverage(true); setError('');
    try {
      await load();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível atualizar a cobertura do portfólio.');
    } finally {
      setRefreshingCoverage(false);
    }
  };

  const runBenchmark = async () => {
    setBenchmarking(true); setError(''); setNotice('');
    try {
      const response = await apiJson<{ message: string }>('/api/admin/quality/benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 40 }),
        timeoutMs: 120_000,
      });
      await load();
      setNotice(response.message);
    } catch (benchmarkError) {
      setError(benchmarkError instanceof Error ? benchmarkError.message : 'Não foi possível executar o teste de regressão.');
    } finally { setBenchmarking(false); }
  };

  const rebuildKnowledge = async () => {
    setRebuilding(true); setError(''); setNotice('');
    try {
      const response = await apiJson<{ message: string }>('/api/admin/quality/rebuild-knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 500 }),
        timeoutMs: 120_000,
      });
      await load();
      setNotice(response.message);
    } catch (rebuildError) {
      setError(rebuildError instanceof Error ? rebuildError.message : 'Não foi possível atualizar o diagnóstico.');
    } finally { setRebuilding(false); }
  };

  const clearSemantics = async () => {
    if (!window.confirm('Deseja remover os embeddings antigos das peças e seções para manter a busca 100% direta e limpa?')) return;
    setClearingSemantics(true); setError(''); setNotice('');
    try {
      const response = await apiJson<{ message: string }>('/api/admin/quality/clear-semantics', {
        method: 'POST',
      });
      await load();
      setNotice(response.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível limpar os embeddings antigos.');
    } finally { setClearingSemantics(false); }
  };

  const retryVisualCatalogs = async () => {
    setRetryingVisual(true); setError(''); setNotice('');
    try {
      const response = await apiJson<{ message: string }>('/api/admin/quality/retry-visual-catalogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 1 }),
      });
      await load();
      setNotice(response.message);
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : 'Não foi possível retomar a leitura visual.');
    } finally { setRetryingVisual(false); }
  };

  const openEdit = (catalog: QualityCatalog) => {
    setEditing(catalog.id);
    setDraft({ manufacturer: catalog.manufacturer || 'Husqvarna', model: catalog.suggestedModel || catalog.model || '', pnc: catalog.pnc || '' });
  };

  const saveMetadata = async (catalog: QualityCatalog) => {
    setBusyId(catalog.id); setError(''); setNotice('');
    try {
      await apiJson(`/api/admin/quality/catalogs/${catalog.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      setEditing(null);
      await load();
      setNotice('Dados corrigidos. O PDF foi enviado para uma reextração segura.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar os dados.');
    } finally { setBusyId(null); }
  };

  const confirmReview = async (catalog: QualityCatalog) => {
    setBusyId(catalog.id); setError(''); setNotice('');
    try {
      await apiJson(`/api/admin/quality/catalogs/${catalog.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      await load();
      setNotice('Conferência administrativa registrada.');
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'Não foi possível confirmar a conferência.');
    } finally { setBusyId(null); }
  };

  const approveSuggestedModel = async (catalog: QualityCatalog) => {
    if (!catalog.suggestedModel) return;
    setBusyId(catalog.id); setError(''); setNotice('');
    try {
      await apiJson(`/api/admin/quality/catalogs/${catalog.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manufacturer: catalog.manufacturer || 'Husqvarna',
          model: catalog.suggestedModel,
          pnc: catalog.pnc || null,
        }),
      });
      await load();
      setNotice(`Modelo "${catalog.suggestedModel}" aprovado com sucesso!`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível aprovar o modelo.');
    } finally {
      setBusyId(null);
    }
  };

  const [resolvingRadar, setResolvingRadar] = useState(false);

  const dismissRadarItem = async (item: SearchRadarItem) => {
    setResolvingRadar(true); setError(''); setNotice('');
    try {
      await apiJson('/api/admin/quality/radar/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: item.query, pnc: item.pnc }),
      });
      setNotice(`Consulta "${item.query}" dispensada.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao dispensar consulta.');
    } finally {
      setResolvingRadar(false);
    }
  };

  const clearAllRadar = async () => {
    if (!window.confirm('Deseja dispensar todas as consultas pendentes do radar?')) return;
    setResolvingRadar(true); setError(''); setNotice('');
    try {
      const res = await apiJson<{ message: string }>('/api/admin/quality/radar/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      setNotice(res.message);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao limpar radar.');
    } finally {
      setResolvingRadar(false);
    }
  };

  const normalizedFilter = queueFilter.trim().toLowerCase();
  const filteredQueue = useMemo(() => data?.reviewQueue.filter(catalog => [
    catalog.filename, catalog.manufacturer, catalog.model, catalog.pnc, catalog.suggestedModel,
    catalog.category?.name, ...catalog.reviewReasons,
  ].some(value => value?.toLowerCase().includes(normalizedFilter))) || [], [data, normalizedFilter]);

  const benchmark = latestBenchmark(data);
  const metrics = benchmark?.metrics;

  return <section>
    <div className="cv-page-heading">
      <div>
        <p className="cv-kicker">Confiabilidade operacional</p>
        <h1 className="cv-page-title">Confiabilidade</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-500 dark:text-ink-400">Uma fila simples do que realmente exige ação: catálogos incompletos, perguntas sem resposta, aprendizado do balcão e conferências oficiais.</p>
      </div>
      <button type="button" disabled={rebuilding || benchmarking || loading} onClick={() => void rebuildKnowledge()} className="cv-secondary px-4 py-2.5 text-sm font-semibold">
        {rebuilding ? 'Atualizando diagnóstico…' : 'Atualizar diagnóstico'}
      </button>
    </div>

    {notice && <div role="status" className="mb-5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/30 p-3 text-sm text-emerald-700 dark:text-emerald-300">{notice}</div>}
    {error && <div role="alert" className="mb-5 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/30 p-3 text-sm text-rose-700 dark:text-rose-300">{error}</div>}
    {loading && <div className="cv-surface rounded-[22px] p-8 text-sm text-ink-500 dark:text-ink-400">Conferindo a base técnica…</div>}
    {data && coverage && <PortfolioCoveragePanel coverage={coverage} onRefresh={refreshCoverage} refreshing={refreshingCoverage} />}

    {data && <>
      {/* NAVEGAÇÃO DE ABAS */}
      <div className="mb-6 flex space-x-1 rounded-xl bg-ink-200/50 dark:bg-ink-800/50 p-1">
        <button
          onClick={() => setActiveTab('geral')}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all ${activeTab === 'geral' ? 'bg-white dark:bg-ink-700 text-brand-600 dark:text-white shadow' : 'text-ink-600 dark:text-ink-400 hover:text-ink-900 dark:hover:text-ink-200 hover:bg-white/50 dark:hover:bg-ink-700/50'}`}
        >
          Visão Geral
        </button>
        <button
          onClick={() => setActiveTab('acao')}
          className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all ${activeTab === 'acao' ? 'bg-white dark:bg-ink-700 text-brand-600 dark:text-white shadow' : 'text-ink-600 dark:text-ink-400 hover:text-ink-900 dark:hover:text-ink-200 hover:bg-white/50 dark:hover:bg-ink-700/50'}`}
        >
          Fila de Ação
          {(data.summary.needsReview > 0 || data.searchRadar.length > 0 || data.officialVerification.pending > 0) && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-900/50 text-[10px] font-bold text-rose-600 dark:text-rose-300">
              {data.summary.needsReview + data.searchRadar.length + data.officialVerification.pending}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('tecnico')}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all ${activeTab === 'tecnico' ? 'bg-white dark:bg-ink-700 text-brand-600 dark:text-white shadow' : 'text-ink-600 dark:text-ink-400 hover:text-ink-900 dark:hover:text-ink-200 hover:bg-white/50 dark:hover:bg-ink-700/50'}`}
        >
          Técnico & IA
        </button>
      </div>

      {activeTab === 'geral' && (
        <div className="space-y-5 animate-in fade-in duration-300">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Catálogos utilizáveis" value={data.summary.readyCatalogs} description="Com peças disponíveis para consulta" tone="navy" />
            <SummaryCard label="Precisam de atenção" value={data.summary.needsReview} description="Revisão de dados ou extração" tone={data.summary.needsReview ? 'warning' : 'success'} />
            <SummaryCard label="Perguntas pendentes" value={data.searchRadar.length} description="Consultas reais ainda sem código seguro" tone={data.searchRadar.length ? 'warning' : 'success'} />
            <div className="rounded-[22px] border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-900/20 p-5 shadow-[0_14px_40px_rgba(30,30,29,.03)] transition-transform hover:-translate-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[.09em] text-emerald-800 dark:text-emerald-300">Sinais do balcão</span>
                <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/60 px-2 py-0.5 text-[9px] font-bold uppercase text-emerald-800 dark:text-emerald-300">Evolução da IA</span>
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-3xl font-semibold tracking-[-.04em] text-emerald-950 dark:text-emerald-200">{data.learning.uniqueSignals}</span>
                <span className="text-sm font-medium text-emerald-700/80 dark:text-emerald-400">/ {data.learning.nextMilestone || 5} confirmações</span>
              </div>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-emerald-200 dark:bg-emerald-900/50">
                <div className="h-full rounded-full bg-emerald-600 transition-all duration-500" style={{ width: `${Math.min(100, Math.round((data.learning.uniqueSignals / (data.learning.nextMilestone || 5)) * 100))}%` }} />
              </div>
              <div className="mt-2 text-xs leading-5 text-emerald-900/70 dark:text-emerald-300/70">
                {data.learning.nextMilestone
                  ? `Falta ${data.learning.nextMilestone - data.learning.uniqueSignals} confirmação para subir o nível da IA.`
                  : 'Base de aprendizado contínuo ativa.'}
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className={`rounded-[22px] border p-5 ${data.visualRetry.candidates ? 'border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-900/30' : 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-900/30'}`}>
              <div className="text-[10px] font-bold uppercase tracking-[.1em] text-ink-500 dark:text-ink-400">Leitura visual de PDFs</div>
              <div className="mt-2 text-lg font-semibold text-ink-900 dark:text-ink-100">{data.visualRetry.candidates ? `${data.visualRetry.candidates} aguardando cota` : 'Nenhuma falha de cota'}</div>
              <p className="mt-2 text-xs leading-5 text-ink-600 dark:text-ink-400">{data.visualRetry.eligible ? `${data.visualRetry.documents[0]?.filename || 'Catálogo'} pode ser reenviado agora.` : data.visualRetry.coolingDown ? `Uma tentativa recente está no intervalo seguro de ${data.visualRetry.cooldownHours} horas.` : 'A leitura visual está sem pendências conhecidas.'}</p>
              {data.visualRetry.candidates > 0 && <button type="button" disabled={!data.visualRetry.eligible || retryingVisual} onClick={() => void retryVisualCatalogs()} className="cv-secondary mt-4 px-3 py-2 text-xs font-semibold disabled:opacity-50">{retryingVisual ? 'Reenviando…' : 'Retomar 1 catálogo'}</button>}
            </div>

            <div className="rounded-[22px] border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-900/30 p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[.1em] text-emerald-800 dark:text-emerald-300">Motor de Busca Instantânea</span>
                <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/60 px-2 py-0.5 text-[9px] font-bold uppercase text-emerald-800 dark:text-emerald-300">100% Ativo</span>
              </div>
              <div className="mt-2 text-lg font-semibold text-ink-900 dark:text-ink-100">{data.summary.parts} peças consultáveis</div>
              <p className="mt-2 text-xs leading-5 text-ink-600 dark:text-ink-400">
                Busca de alta velocidade por código exato, modelo, substituições e vocabulário de balcão, sem dependência de cotas ou limites diários.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  <span>Cobertura total imediata</span>
                </div>
                {Boolean(data.semanticIndex && data.semanticIndex.indexedParts > 0) && (
                  <button
                    type="button"
                    disabled={clearingSemantics}
                    onClick={() => void clearSemantics()}
                    className="rounded-lg border border-ink-200 dark:border-ink-700 bg-white/80 dark:bg-ink-800/80 px-2.5 py-1 text-[11px] font-semibold text-ink-500 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-200 transition disabled:opacity-50"
                    title="Remove os vetores legados das 554 peças"
                  >
                    {clearingSemantics ? 'Limpando…' : 'Limpar vetores antigos'}
                  </button>
                )}
              </div>
            </div>

            <div className="rounded-[22px] border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 p-5 shadow-[0_14px_40px_rgba(30,30,29,.04)]">
              <div className="text-[10px] font-bold uppercase tracking-[.1em] text-ink-500 dark:text-ink-400">Portal oficial</div>
              <div className="mt-2 text-lg font-semibold text-ink-900 dark:text-ink-100">{data.officialVerification.approved} aprovações reutilizáveis</div>
              <p className="mt-2 text-xs leading-5 text-ink-600 dark:text-ink-400">{data.officialVerification.pending} aguardando aprovação · {data.officialVerification.stale} vencidas. Cada conferência vale {data.officialVerification.cacheDays} dias e depois volta para revisão humana.</p>
              <div className="mt-4 text-xs font-semibold text-brand-600 dark:text-brand-300">Sem robô de login: cache aprovado + conferência no portal</div>
            </div>
          </div>

          <div className="cv-surface rounded-[24px] p-6 max-w-lg">
            <h2 className="text-sm font-semibold text-ink-900 dark:text-ink-100">Estatísticas de Extração</h2>
            <div className="mt-4 grid gap-3">
              <InfoRow label="Peças consultáveis" value={data.summary.parts} />
              <InfoRow label="Sem página de origem" value={data.summary.partsWithoutPage} />
              <InfoRow label="Sem vista/seção" value={data.summary.partsWithoutSection} />
              <InfoRow label="Memórias por página/vista" value={data.summary.technicalMemoryChunks} />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'acao' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="rounded-xl border border-brand-200 dark:border-brand-800 bg-brand-50/50 dark:bg-brand-900/20 p-4 flex gap-3">
            <div className="text-brand-700 dark:text-brand-300 mt-0.5">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div>
              <div className="text-sm font-bold text-brand-900 dark:text-brand-200">Sobre o PNC</div>
              <p className="mt-1 text-xs leading-5 text-brand-800 dark:text-brand-300">
                Uma vista explodida pode atender <b>nenhum, um ou vários PNCs</b>. O sistema não deve inventar um PNC quando o catálogo informa apenas modelo ou faixa de série. <b>Importante:</b> PNC identifica a variante do equipamento. Número de série não deve ser informado como PNC.
              </p>
            </div>
          </div>

          <div className="cv-surface overflow-hidden rounded-[24px]">
            <div className="border-b border-ink-200 dark:border-ink-700/80 bg-ink-50/70 dark:bg-ink-800 p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-ink-900 dark:text-ink-100">Catálogos para conferir</h2>
                  <p className="mt-1 text-xs leading-5 text-ink-500 dark:text-ink-400">Comece pelos modelos sugeridos. Nenhum código é alterado apenas por abrir esta tela.</p>
                </div>
                <input value={queueFilter} onChange={event => setQueueFilter(event.target.value)} placeholder="Filtrar por arquivo, modelo ou motivo" className="cv-field w-full max-w-xs text-xs" />
              </div>
            </div>
            {!filteredQueue.length
              ? <div className="p-10 text-center"><div className="font-semibold text-emerald-700 dark:text-emerald-300">Nenhuma pendência neste filtro</div><p className="mt-1 text-xs text-ink-500 dark:text-ink-400">A base continua disponível para o balcão.</p></div>
              : <div className="divide-y divide-ink-100 dark:divide-ink-800">{filteredQueue.map(catalog => <div key={catalog.id} className="p-5 hover:bg-ink-50/50 dark:hover:bg-ink-800/30 transition-colors">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="text-sm text-ink-900 dark:text-ink-100">{catalog.filename}</b>
                      <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${healthTone(catalog.healthScore)}`}>{catalog.healthScore}/100</span>
                      <span className="rounded-full bg-ink-100 dark:bg-ink-700 px-2 py-1 text-[10px] font-semibold text-ink-600 dark:text-ink-300">{reviewLabel(catalog.reviewStatus)}</span>
                    </div>
                    <div className="mt-1 text-xs text-ink-500 dark:text-ink-400">Modelo: {catalog.model || 'não confirmado'} · PNC: {catalog.pnc || 'não impresso/confirmado'} · {extractionLabel(catalog.extractionMethod)}</div>
                    {catalog.suggestedModel && <div className="mt-3 inline-flex rounded-xl border border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-900/30 px-3 py-2 text-xs font-semibold text-brand-800 dark:text-brand-300">Modelo sugerido pelo arquivo: {catalog.suggestedModel}</div>}
                    {catalog.reviewReasons.length > 0 && <div className="mt-3 grid gap-1">{catalog.reviewReasons.slice(0, 4).map(reason => <div key={reason} className="text-xs leading-5 text-amber-900 dark:text-amber-300">• {reason}</div>)}</div>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {catalog.suggestedModel && (
                      <button
                        type="button"
                        disabled={busyId === catalog.id}
                        onClick={() => void approveSuggestedModel(catalog)}
                        className="inline-flex items-center gap-1 rounded-xl bg-brand-600 hover:bg-brand-700 text-white px-3 py-2 text-xs font-semibold shadow-sm transition disabled:opacity-50"
                      >
                        <span>✦ Aprovar modelo &quot;{catalog.suggestedModel}&quot;</span>
                      </button>
                    )}
                    <button type="button" onClick={() => openEdit(catalog)} className="cv-secondary px-3 py-2 text-xs font-semibold">Corrigir dados</button>
                    <button type="button" disabled={busyId === catalog.id || Boolean(catalog.modelNeedsReview)} onClick={() => void confirmReview(catalog)} className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/30 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors disabled:cursor-not-allowed disabled:opacity-40">Marcar como conferido</button>
                  </div>
                </div>
                {editing === catalog.id && <div className="mt-4 rounded-2xl border border-brand-200 dark:border-brand-800 bg-brand-50/50 dark:bg-brand-900/20 p-4">
                  <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto_auto]">
                    <input className="cv-field text-xs" value={draft.manufacturer} onChange={event => setDraft({ ...draft, manufacturer: event.target.value })} placeholder="Fabricante" />
                    <input className="cv-field text-xs" value={draft.model} onChange={event => setDraft({ ...draft, model: event.target.value })} placeholder="Modelo (ex.: 143RII)" />
                    <input className="cv-field text-xs" value={draft.pnc} onChange={event => setDraft({ ...draft, pnc: event.target.value })} placeholder="PNC opcional" inputMode="numeric" />
                    <button type="button" disabled={busyId === catalog.id} onClick={() => void saveMetadata(catalog)} className="cv-primary px-3 py-2 text-xs font-semibold">Salvar e reextrair</button>
                    <button type="button" onClick={() => setEditing(null)} className="px-3 py-2 text-xs font-semibold text-ink-500 dark:text-ink-400 hover:text-ink-900 dark:hover:text-ink-200">Cancelar</button>
                  </div>
                </div>}
              </div>)}</div>}
          </div>

          <div className="cv-surface overflow-hidden rounded-[24px]">
            <div className="border-b border-ink-200 dark:border-ink-700/80 bg-ink-50/70 dark:bg-ink-800 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-ink-900 dark:text-ink-100">Consultas sem solução</h2>
                  <p className="mt-1 max-w-3xl text-xs leading-5 text-ink-500 dark:text-ink-400">Agrupa perguntas reais que terminaram sem um código seguro. Quando uma consulta equivalente passa a ser encontrada, ela sai da lista automaticamente.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-amber-50 dark:bg-amber-900/30 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">{data.searchRadar.length} pendência{data.searchRadar.length === 1 ? '' : 's'}</span>
                  {data.searchRadar.length > 0 && (
                    <button
                      type="button"
                      disabled={resolvingRadar}
                      onClick={() => void clearAllRadar()}
                      className="rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 px-3 py-1.5 text-xs font-semibold text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-700 transition disabled:opacity-50"
                    >
                      {resolvingRadar ? 'Limpando…' : 'Limpar todas'}
                    </button>
                  )}
                </div>
              </div>
            </div>
            {!data.searchRadar.length ? <div className="p-8 text-center text-sm text-emerald-700 dark:text-emerald-300">Nenhuma consulta recorrente permanece sem solução.</div> : <div className="divide-y divide-ink-100 dark:divide-ink-800">{data.searchRadar.map(item => <div key={`${item.query}|${item.pnc || ''}`} className="flex flex-wrap items-center justify-between gap-4 p-5 hover:bg-ink-50/50 dark:hover:bg-ink-800/30 transition-colors">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="text-sm text-ink-800 dark:text-ink-200">{item.query}</b>
                  <span className="rounded-full bg-amber-50 dark:bg-amber-900/30 px-2 py-1 text-[10px] font-semibold text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50">{radarLabel(item.status)}</span>
                  {item.count > 1 && <span className="rounded-full bg-brand-50 dark:bg-brand-900/30 px-2 py-1 text-[10px] font-semibold text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800/50">{item.count} ocorrências</span>}
                </div>
                <div className="mt-1 text-xs text-ink-500 dark:text-ink-400">{item.model ? `Modelo ${item.model}` : 'Modelo não confirmado'}{item.pnc ? ` · PNC ${item.pnc}` : ''} · última em {fmtDate(item.lastSeen)}</div>
                {item.partDescription && item.partDescription.toLowerCase() !== item.query.toLowerCase() && <div className="mt-2 text-[11px] text-ink-500 dark:text-ink-400">Interpretação local: {item.partDescription}</div>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={resolvingRadar}
                  onClick={() => void dismissRadarItem(item)}
                  className="rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 px-3 py-2 text-xs font-semibold text-ink-500 hover:text-ink-800 dark:hover:text-ink-200 hover:bg-ink-50 dark:hover:bg-ink-700 transition disabled:opacity-50"
                >
                  Dispensar
                </button>
                {onSearch && <button type="button" onClick={() => onSearch(radarSearchQuery(item))} className="cv-secondary px-3 py-2 text-xs font-semibold">Pesquisar na base atual</button>}
              </div>
            </div>)}</div>}
          </div>

          {/* O card "Portal oficial" na Visão Geral já mostrava quantas conferências
              estavam aguardando aprovação, e a notificação do sininho já apontava
              pra cá — mas não existia nenhuma tela em que um admin pudesse de fato
              aprovar ou rejeitar. Esse painel fecha esse ciclo. */}
          <OfficialVerificationApprovalPanel onChanged={() => void load()} />
        </div>
      )}

      {activeTab === 'tecnico' && (
        <div className="space-y-5 animate-in fade-in duration-300">
          <div className="grid gap-5 xl:grid-cols-2">
            <div className="cv-surface rounded-[24px] p-6">
              <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-100">IA e indexação</h3>
              <p className="mt-2 text-xs leading-5 text-ink-600 dark:text-ink-400">O modelo {data.runtime.generativeModel} interpreta perguntas e PDFs visuais. Os códigos continuam vindo das peças estruturadas, nunca da imaginação da IA.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <RuntimeStat label="Leitura visual" value={data.runtime.extraction.geminiCatalogs} />
                <RuntimeStat label="Leitura local" value={data.runtime.extraction.parserCatalogs} />
                <RuntimeStat label="Legados" value={data.runtime.extraction.unknownCatalogs} />
              </div>

              {data.runtime.extraction.rejectedParts > 0 && (
                <div className="mt-4 rounded-xl border border-gold-500/40 bg-gold-100 p-3 dark:bg-gold-500/10">
                  <div className="text-[9px] font-bold uppercase tracking-[.08em] text-gold-800 dark:text-gold-300">
                    Códigos barrados na gravação
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-gold-800 dark:text-gold-300">
                    <strong className="tabular-nums">{data.runtime.extraction.rejectedParts}</strong> linha(s) em{' '}
                    <strong className="tabular-nums">{data.runtime.extraction.catalogsWithRejectedParts}</strong> catálogo(s)
                    tinham código implausível — tipicamente a posição ou a quantidade lida como código — e não entraram na
                    busca. Esses catálogos merecem conferência no PDF.
                  </p>
                </div>
              )}

              <FallbackReasons reasons={data.runtime.extraction.fallbackReasons} />
              <p className="mt-4 rounded-xl bg-ink-50 dark:bg-ink-800/50 p-3 text-[11px] leading-5 text-ink-500 dark:text-ink-400">
                Aprendizado: {data.learning.positive} confirmações positivas e {data.learning.corrected} correções explícitas. Um voto isolado tem peso pequeno; concordância entre usuários aumenta o sinal com teto seguro.
              </p>
            </div>
            
            <div className="cv-surface rounded-[24px] p-6">
              <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-100">Teste de regressão da busca</h3>
              <p className="mt-2 text-xs leading-5 text-ink-600 dark:text-ink-400">Confere {metrics?.goldenTotal || 30} perguntas reais de balcão com códigos comprovados nos PDFs, incluindo peças parecidas que não podem vencer a correta. Use após mudanças na busca.</p>
              {metrics && <div className="mt-4 grid grid-cols-2 gap-3"><Metric label="Primeiro resultado correto" value={`${metrics.top1Percent}%`} /><Metric label="Correto entre os 5" value={`${metrics.recallAt5Percent}%`} /></div>}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button type="button" disabled={benchmarking || rebuilding} onClick={() => void runBenchmark()} className="cv-secondary px-4 py-2 text-sm font-semibold">{benchmarking ? 'Executando teste…' : 'Executar teste agora'}</button>
                {benchmark && <span className="text-xs text-ink-500 dark:text-ink-400">Último: {fmtDate(benchmark.createdAt)}</span>}
              </div>
            </div>
          </div>
        </div>
      )}
    </>}
  </section>;
}

function SummaryCard({ label, value, description, tone }: { label: string; value: number; description: string; tone: 'navy' | 'success' | 'warning' | 'danger' | 'neutral' }) {
  const tones = {
    navy: 'border-brand-700 bg-ink-900 text-white',
    success: 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-950 dark:text-emerald-300',
    warning: 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 text-amber-950 dark:text-amber-300',
    danger: 'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/30 text-rose-950 dark:text-rose-300',
    neutral: 'border-ink-200 dark:border-ink-700 bg-ink-100 dark:bg-ink-800/80 text-ink-900 dark:text-ink-100',
  };
  return <div className={`rounded-[22px] border p-5 shadow-[0_14px_40px_rgba(30,30,29,.03)] transition-transform hover:-translate-y-1 ${tones[tone]}`}><div className="text-[11px] font-bold uppercase tracking-[.09em] opacity-60">{label}</div><div className="mt-2 text-3xl font-semibold tracking-[-.04em]">{value}</div><div className="mt-2 text-xs leading-5 opacity-70">{description}</div></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 p-3"><div className="text-[9px] font-semibold uppercase tracking-[.08em] text-ink-500 dark:text-ink-400">{label}</div><div className="mt-1 text-xl font-semibold text-ink-900 dark:text-ink-100">{value}</div></div>;
}

function InfoRow({ label, value }: { label: string; value: number }) {
  return <div className="flex items-center justify-between rounded-xl bg-ink-50 dark:bg-ink-800/50 px-3 py-2.5"><span className="text-xs text-ink-500 dark:text-ink-400">{label}</span><b className="text-sm text-ink-800 dark:text-ink-200">{value}</b></div>;
}

// Espelha DeterministicDeclineReason do backend, em linguagem de dono de loja.
// `acao` é o que diferencia: uns são lacuna do parser (dá para consertar e
// passam a sair de graça e exatos), outros são limite do próprio PDF.
const FALLBACK_REASON_INFO: Record<string, { label: string; acao: string }> = {
  NO_TEXT_LAYER: { label: 'PDF digitalizado (sem texto)', acao: 'Limite do arquivo: leitura visual é o caminho certo.' },
  NO_SIGNATURE: { label: 'Não reconhecido como lista de peças', acao: 'Lacuna do leitor local — dá para ensinar esse formato.' },
  NO_MODEL: { label: 'Modelo não identificado', acao: 'Informe o modelo no upload e reprocesse: costuma resolver.' },
  NO_ROWS: { label: 'Tabela não lida', acao: 'Lacuna do leitor local — dá para ensinar esse formato.' },
  TOO_FEW_OCCURRENCES: { label: 'Poucas peças lidas', acao: 'Catálogo curto ou tabela lida pela metade. Vale revisar.' },
  READ_ERROR: { label: 'Falha ao abrir o PDF', acao: 'Arquivo pode estar corrompido ou protegido.' },
  UNKNOWN: { label: 'Processado antes deste registro', acao: 'Reprocesse para descobrir o motivo.' },
};

function FallbackReasons({ reasons }: { reasons: Record<string, number> }) {
  const rows = Object.entries(reasons || {}).sort((left, right) => right[1] - left[1]);
  if (!rows.length) return null;

  return (
    <div className="mt-4 rounded-xl border border-ink-200 bg-white p-3 dark:border-ink-700 dark:bg-ink-800">
      <div className="text-[9px] font-bold uppercase tracking-[.08em] text-ink-500 dark:text-ink-400">
        Por que caíram na leitura visual
      </div>
      <p className="mt-1 text-[11px] leading-4 text-ink-500 dark:text-ink-400">
        Cada catálogo movido para a leitura local passa a sair com código exato e sem consumir IA.
      </p>
      <ul className="mt-2 space-y-1.5">
        {rows.map(([reason, count]) => {
          const info = FALLBACK_REASON_INFO[reason] || { label: reason, acao: '' };
          return (
            <li key={reason} className="flex items-start justify-between gap-3 border-t border-ink-100 pt-1.5 first:border-0 first:pt-0 dark:border-ink-700">
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-ink-900 dark:text-ink-100">{info.label}</span>
                {info.acao && <span className="block text-[10px] leading-4 text-ink-500 dark:text-ink-400">{info.acao}</span>}
              </span>
              <span className="shrink-0 text-sm font-bold tabular-nums text-ink-900 dark:text-ink-100">{count}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RuntimeStat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 px-4 py-3"><div className="text-[9px] font-bold uppercase tracking-[.08em] text-ink-500 dark:text-ink-400">{label}</div><div className="mt-1 text-lg font-semibold text-ink-900 dark:text-ink-100">{value}</div></div>;
}
