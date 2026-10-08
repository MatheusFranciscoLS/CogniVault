import { useEffect, useMemo, useState } from 'react';
import PageFrame from './PageFrame';
import { apiJson, fmtDate } from '../lib';
import { useConfirm } from '../context/confirm';
import type { AiQualityData, BenchmarkRun, QualityCatalog, SearchRadarItem } from '../types';
import { Button } from '@/components/ui/button';
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
  const confirm = useConfirm();
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
    if (!(await confirm({ title: 'Remover os embeddings antigos?', description: 'Tira os vetores antigos das peças e seções para a busca ficar direta e limpa.', confirmLabel: 'Remover', destructive: true }))) return;
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
    setDraft({ manufacturer: catalog.manufacturer || '', model: catalog.suggestedModel || catalog.model || '', pnc: catalog.pnc || '' });
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
          ...(catalog.manufacturer ? { manufacturer: catalog.manufacturer } : {}),
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
    if (!(await confirm({ title: 'Dispensar as consultas pendentes?', description: 'Todas as consultas pendentes do radar serão dispensadas.', confirmLabel: 'Dispensar' }))) return;
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

  return <PageFrame title="Qualidade" action={
      <Button type="button" variant="outline" disabled={rebuilding || benchmarking || loading} onClick={() => void rebuildKnowledge()}>
        {rebuilding ? 'Atualizando diagnóstico…' : 'Atualizar diagnóstico'}
      </Button>
    }>

    {notice && <div role="status" className="mb-5 rounded-xl border border-ok/40 bg-ok-soft p-3 text-sm text-ok">{notice}</div>}
    {error && <div role="alert" className="mb-5 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
    {loading && <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">Conferindo a base técnica…</div>}
    {data && coverage && <PortfolioCoveragePanel coverage={coverage} onRefresh={refreshCoverage} refreshing={refreshingCoverage} />}

    {data && <>
      {/* NAVEGAÇÃO DE ABAS */}
      <div role="tablist" aria-label="Seções da Qualidade" className="mb-6 flex space-x-1 rounded-xl bg-muted p-1">
        <button
          type="button" role="tab" aria-selected={activeTab === 'geral'}
          onClick={() => setActiveTab('geral')}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/60 ${activeTab === 'geral' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-card/60'}`}
        >
          Visão Geral
        </button>
        <button
          type="button" role="tab" aria-selected={activeTab === 'acao'}
          onClick={() => setActiveTab('acao')}
          className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/60 ${activeTab === 'acao' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-card/60'}`}
        >
          Fila de Ação
          {(data.summary.needsReview > 0 || data.searchRadar.length > 0 || data.officialVerification.pending > 0) && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-destructive/10 text-sm font-bold text-destructive">
              {data.summary.needsReview + data.searchRadar.length + data.officialVerification.pending}
            </span>
          )}
        </button>
        <button
          type="button" role="tab" aria-selected={activeTab === 'tecnico'}
          onClick={() => setActiveTab('tecnico')}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/60 ${activeTab === 'tecnico' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-card/60'}`}
        >
          Técnico & IA
        </button>
      </div>

      {activeTab === 'geral' && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Catálogos utilizáveis" value={data.summary.readyCatalogs} description="Com peças disponíveis para consulta" tone="neutral" />
            <SummaryCard label="Precisam de atenção" value={data.summary.needsReview} description="Revisão de dados ou extração" tone={data.summary.needsReview ? 'warning' : 'success'} />
            <SummaryCard label="Perguntas pendentes" value={data.searchRadar.length} description="Consultas reais ainda sem código seguro" tone={data.searchRadar.length ? 'warning' : 'success'} />
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="text-sm font-semibold text-muted-foreground">Peças consultáveis</div>
              <div className="mt-2 text-3xl font-semibold tabular-nums">{data.summary.parts.toLocaleString('pt-BR')}</div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>Busca por código, modelo e substituição</span>
                {Boolean(data.semanticIndex && data.semanticIndex.indexedParts > 0) && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={clearingSemantics}
                    onClick={() => void clearSemantics()}
                    title={`Remove os vetores legados de ${data.semanticIndex.indexedParts.toLocaleString('pt-BR')} peças`}
                  >
                    {clearingSemantics ? 'Limpando…' : 'Limpar vetores antigos'}
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="text-sm font-semibold text-muted-foreground">Leitura visual de PDFs</div>
              <div className={`mt-2 text-lg font-semibold ${data.visualRetry.candidates ? 'text-warn' : 'text-ok'}`}>{data.visualRetry.candidates ? `${data.visualRetry.candidates} aguardando cota` : 'Nenhuma falha de cota'}</div>
              <p className="mt-2 text-base text-muted-foreground">{data.visualRetry.eligible ? `${data.visualRetry.documents[0]?.filename || 'Catálogo'} pode ser reenviado agora.` : data.visualRetry.coolingDown ? `Uma tentativa recente está no intervalo seguro de ${data.visualRetry.cooldownHours} horas.` : 'Sem pendências conhecidas.'}</p>
              {data.visualRetry.candidates > 0 && <Button type="button" variant="outline" className="mt-4" disabled={!data.visualRetry.eligible || retryingVisual} onClick={() => void retryVisualCatalogs()}>{retryingVisual ? 'Reenviando…' : 'Retomar 1 catálogo'}</Button>}
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <div className="text-sm font-semibold text-muted-foreground">Conferência no Portal</div>
              <div className="mt-2 text-lg font-semibold">{data.officialVerification.approved} {data.officialVerification.approved === 1 ? 'aprovação reutilizável' : 'aprovações reutilizáveis'}</div>
              <p className="mt-2 text-base text-muted-foreground">{data.officialVerification.pending} aguardando aprovação · {data.officialVerification.stale} vencidas. Cada conferência vale {data.officialVerification.cacheDays} dias e depois volta para revisão humana.</p>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold text-muted-foreground">Estatísticas de extração</h2>
              <dl className="mt-3 divide-y divide-border text-base">
                {[
                  ['Sem página de origem', data.summary.partsWithoutPage],
                  ['Sem vista/seção', data.summary.partsWithoutSection],
                  ['Memórias por página/vista', data.summary.technicalMemoryChunks],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between py-2"><dt className="text-muted-foreground">{label}</dt><dd className="font-semibold tabular-nums">{Number(value).toLocaleString('pt-BR')}</dd></div>
                ))}
              </dl>
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
              <p className="mt-1 text-sm leading-5 text-brand-800 dark:text-brand-300">
                Uma vista explodida pode atender <b>nenhum, um ou vários PNCs</b>. O sistema não deve inventar um PNC quando o catálogo informa apenas modelo ou faixa de série. <b>Importante:</b> PNC identifica a variante do equipamento. Número de série não deve ser informado como PNC.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="border-b border-border bg-muted p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-foreground">Catálogos para conferir</h2>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">Comece pelos modelos sugeridos. Nenhum código é alterado apenas por abrir esta tela.</p>
                </div>
                <input value={queueFilter} onChange={event => setQueueFilter(event.target.value)} placeholder="Filtrar por arquivo, modelo ou motivo" className="h-10 rounded-md border border-input bg-card px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/60 w-full max-w-xs text-sm" />
              </div>
            </div>
            {!filteredQueue.length
              ? <div className="p-10 text-center"><div className="font-semibold text-ok">Nenhuma pendência neste filtro</div><p className="mt-1 text-sm text-muted-foreground">A base continua disponível para o balcão.</p></div>
              : <div className="divide-y divide-border">{filteredQueue.map(catalog => <div key={catalog.id} className="p-5 hover:bg-accent/50 transition-colors">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <b className="text-sm text-foreground">{catalog.filename}</b>
                      <span className={`rounded-full border px-2 py-1 text-sm font-semibold ${healthTone(catalog.healthScore)}`}>{catalog.healthScore}/100</span>
                      <span className="rounded-full bg-muted px-2 py-1 text-sm font-semibold text-muted-foreground">{reviewLabel(catalog.reviewStatus)}</span>
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">Modelo: {catalog.model || 'não confirmado'} · PNC: {catalog.pnc || 'não impresso/confirmado'} · {extractionLabel(catalog.extractionMethod)}</div>
                    {catalog.suggestedModel && <div className="mt-3 inline-flex rounded-xl border border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-900/30 px-3 py-2 text-sm font-semibold text-brand-800 dark:text-brand-300">Modelo sugerido pelo arquivo: {catalog.suggestedModel}</div>}
                    {catalog.reviewReasons.length > 0 && <div className="mt-3 grid gap-1">{catalog.reviewReasons.slice(0, 4).map(reason => <div key={reason} className="text-sm leading-5 text-warn">• {reason}</div>)}</div>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {catalog.suggestedModel && (
                      <button
                        type="button"
                        disabled={busyId === catalog.id}
                        onClick={() => void approveSuggestedModel(catalog)}
                        className="inline-flex items-center gap-1 rounded-xl bg-brand-600 hover:bg-brand-700 text-white px-3 py-2 text-sm font-semibold shadow-xs transition disabled:opacity-50"
                      >
                        <span>✦ Aprovar modelo &quot;{catalog.suggestedModel}&quot;</span>
                      </button>
                    )}
                    <button type="button" onClick={() => openEdit(catalog)} className="inline-flex items-center justify-center gap-2 rounded-md border border-input bg-card font-semibold text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/60 disabled:opacity-60 px-3 py-2 text-sm font-semibold">Corrigir dados</button>
                    <button type="button" disabled={busyId === catalog.id || Boolean(catalog.modelNeedsReview)} onClick={() => void confirmReview(catalog)} className="rounded-xl border border-ok/40 bg-ok-soft px-3 py-2 text-sm font-semibold text-ok hover:bg-ok-soft transition-colors disabled:cursor-not-allowed disabled:opacity-40">Marcar como conferido</button>
                  </div>
                </div>
                {editing === catalog.id && <div className="mt-4 rounded-2xl border border-brand-200 dark:border-brand-800 bg-brand-50/50 dark:bg-brand-900/20 p-4">
                  <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto_auto]">
                    <input className="h-10 rounded-md border border-input bg-card px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/60 text-sm" value={draft.manufacturer} onChange={event => setDraft({ ...draft, manufacturer: event.target.value })} placeholder="Fabricante" />
                    <input className="h-10 rounded-md border border-input bg-card px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/60 text-sm" value={draft.model} onChange={event => setDraft({ ...draft, model: event.target.value })} placeholder="Modelo (ex.: 143RII)" />
                    <input className="h-10 rounded-md border border-input bg-card px-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/60 text-sm" value={draft.pnc} onChange={event => setDraft({ ...draft, pnc: event.target.value })} placeholder="PNC opcional" inputMode="numeric" />
                    <button type="button" disabled={busyId === catalog.id} onClick={() => void saveMetadata(catalog)} className="inline-flex items-center justify-center gap-2 rounded-md bg-primary font-semibold text-primary-foreground outline-none transition-colors hover:bg-primary-hover focus-visible:ring-3 focus-visible:ring-ring/60 disabled:opacity-60 px-3 py-2 text-sm font-semibold">Salvar e reextrair</button>
                    <button type="button" onClick={() => setEditing(null)} className="px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground">Cancelar</button>
                  </div>
                </div>}
              </div>)}</div>}
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="border-b border-border bg-muted p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-foreground">Consultas sem solução</h2>
                  <p className="mt-1 max-w-3xl text-sm leading-5 text-muted-foreground">Agrupa perguntas reais que terminaram sem um código seguro. Quando uma consulta equivalente passa a ser encontrada, ela sai da lista automaticamente.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-warn-soft px-3 py-1.5 text-sm font-semibold text-warn border border-warn/40">{data.searchRadar.length} pendência{data.searchRadar.length === 1 ? '' : 's'}</span>
                  {data.searchRadar.length > 0 && (
                    <button
                      type="button"
                      disabled={resolvingRadar}
                      onClick={() => void clearAllRadar()}
                      className="rounded-xl border border-border bg-card px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-accent transition disabled:opacity-50"
                    >
                      {resolvingRadar ? 'Limpando…' : 'Limpar todas'}
                    </button>
                  )}
                </div>
              </div>
            </div>
            {!data.searchRadar.length ? <div className="p-8 text-center text-sm text-ok">Nenhuma consulta recorrente permanece sem solução.</div> : <div className="divide-y divide-border">{data.searchRadar.map(item => <div key={`${item.query}|${item.pnc || ''}`} className="flex flex-wrap items-center justify-between gap-4 p-5 hover:bg-accent/50 transition-colors">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="text-sm text-foreground">{item.query}</b>
                  <span className="rounded-full bg-warn-soft px-2 py-1 text-sm font-semibold text-warn border border-warn/40">{radarLabel(item.status)}</span>
                  {item.count > 1 && <span className="rounded-full bg-brand-50 dark:bg-brand-900/30 px-2 py-1 text-sm font-semibold text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800/50">{item.count} ocorrências</span>}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">{item.model ? `Modelo ${item.model}` : 'Modelo não confirmado'}{item.pnc ? ` · PNC ${item.pnc}` : ''} · última em {fmtDate(item.lastSeen)}</div>
                {item.partDescription && item.partDescription.toLowerCase() !== item.query.toLowerCase() && <div className="mt-2 text-sm text-muted-foreground">Interpretação local: {item.partDescription}</div>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={resolvingRadar}
                  onClick={() => void dismissRadarItem(item)}
                  className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-accent transition disabled:opacity-50"
                >
                  Dispensar
                </button>
                {onSearch && <button type="button" onClick={() => onSearch(radarSearchQuery(item))} className="inline-flex items-center justify-center gap-2 rounded-md border border-input bg-card font-semibold text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/60 disabled:opacity-60 px-3 py-2 text-sm font-semibold">Pesquisar na base atual</button>}
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
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="text-sm font-semibold text-foreground">IA e indexação</h3>
              <p className="mt-2 text-sm leading-5 text-muted-foreground">O modelo {data.runtime.generativeModel} interpreta perguntas e PDFs visuais. Os códigos continuam vindo das peças estruturadas, nunca da imaginação da IA.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <RuntimeStat label="Leitura visual" value={data.runtime.extraction.geminiCatalogs} />
                <RuntimeStat label="Leitura local" value={data.runtime.extraction.parserCatalogs} />
                <RuntimeStat label="Legados" value={data.runtime.extraction.unknownCatalogs} />
              </div>

              {data.runtime.extraction.rejectedParts > 0 && (
                <div className="mt-4 rounded-xl border border-warn/40 bg-warn-soft p-3">
                  <div className="text-sm font-bold text-warn">
                    Códigos barrados na gravação
                  </div>
                  <p className="mt-1 text-sm leading-4 text-warn">
                    <strong className="tabular-nums">{data.runtime.extraction.rejectedParts}</strong> linha(s) em{' '}
                    <strong className="tabular-nums">{data.runtime.extraction.catalogsWithRejectedParts}</strong> catálogo(s)
                    tinham código implausível — tipicamente a posição ou a quantidade lida como código — e não entraram na
                    busca. Esses catálogos merecem conferência no PDF.
                  </p>
                </div>
              )}

              <FallbackReasons reasons={data.runtime.extraction.fallbackReasons} />
              <p className="mt-4 rounded-xl bg-muted p-3 text-sm leading-5 text-muted-foreground">
                Aprendizado: {data.learning.positive} confirmações positivas e {data.learning.corrected} correções explícitas. Um voto isolado tem peso pequeno; concordância entre usuários aumenta o sinal com teto seguro.
              </p>
            </div>
            
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="text-sm font-semibold text-foreground">Teste de regressão da busca</h3>
              <p className="mt-2 text-sm leading-5 text-muted-foreground">Confere {metrics?.goldenTotal || 30} perguntas reais de balcão com códigos comprovados nos PDFs, incluindo peças parecidas que não podem vencer a correta. Use após mudanças na busca.</p>
              {metrics && <div className="mt-4 grid grid-cols-2 gap-3"><Metric label="Primeiro resultado correto" value={`${metrics.top1Percent}%`} /><Metric label="Correto entre os 5" value={`${metrics.recallAt5Percent}%`} /></div>}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button type="button" disabled={benchmarking || rebuilding} onClick={() => void runBenchmark()} className="inline-flex items-center justify-center gap-2 rounded-md border border-input bg-card font-semibold text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/60 disabled:opacity-60 px-4 py-2 text-sm font-semibold">{benchmarking ? 'Executando teste…' : 'Executar teste agora'}</button>
                {benchmark && <span className="text-sm text-muted-foreground">Último: {fmtDate(benchmark.createdAt)}</span>}
              </div>
            </div>
          </div>
        </div>
      )}
    </>}
  </PageFrame>;
}

function SummaryCard({ label, value, description, tone }: { label: string; value: number; description: string; tone: 'navy' | 'success' | 'warning' | 'danger' | 'neutral' }) {
  // A cor mora só no número: um painel de cartões todos pintados não diz qual precisa de atenção.
  const valueTone = { navy: '', neutral: '', success: 'text-ok', warning: 'text-warn', danger: 'text-destructive' }[tone];
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="text-sm font-semibold text-muted-foreground">{label}</div>
      <div className={`mt-2 text-3xl font-semibold tabular-nums ${valueTone}`}>{value.toLocaleString('pt-BR')}</div>
      <div className="mt-2 text-sm text-muted-foreground">{description}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border bg-card p-3"><div className="text-sm font-semibold text-muted-foreground">{label}</div><div className="mt-1 text-xl font-semibold text-foreground">{value}</div></div>;
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
    <div className="mt-4 rounded-xl border border-border bg-card p-3">
      <div className="text-sm font-bold text-muted-foreground">
        Por que caíram na leitura visual
      </div>
      <p className="mt-1 text-sm leading-4 text-muted-foreground">
        Cada catálogo movido para a leitura local passa a sair com código exato e sem consumir IA.
      </p>
      <ul className="mt-2 space-y-1.5">
        {rows.map(([reason, count]) => {
          const info = FALLBACK_REASON_INFO[reason] || { label: reason, acao: '' };
          return (
            <li key={reason} className="flex items-start justify-between gap-3 border-t border-border pt-1.5 first:border-0 first:pt-0">
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">{info.label}</span>
                {info.acao && <span className="block text-sm leading-4 text-muted-foreground">{info.acao}</span>}
              </span>
              <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">{count}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RuntimeStat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-border bg-card px-4 py-3"><div className="text-sm font-bold text-muted-foreground">{label}</div><div className="mt-1 text-lg font-semibold text-foreground">{value}</div></div>;
}
