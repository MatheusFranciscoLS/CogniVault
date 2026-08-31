import { useEffect, useMemo, useState } from 'react';
import { apiJson, fmtDate } from '../lib';
import type { AiQualityData, BenchmarkRun, QualityCatalog, SearchRadarItem } from '../types';

function fetchQuality() {
  return apiJson<{ quality: AiQualityData }>('/api/admin/quality');
}

function healthTone(score: number) {
  return score >= 90
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : score >= 70
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-rose-200 bg-rose-50 text-rose-700';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [benchmarking, setBenchmarking] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [semanticIndexing, setSemanticIndexing] = useState(false);
  const [retryingVisual, setRetryingVisual] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [queueFilter, setQueueFilter] = useState('');
  const [draft, setDraft] = useState({ manufacturer: '', model: '', pnc: '' });

  const load = async () => {
    const response = await fetchQuality();
    setData(response.quality);
    setError('');
  };

  useEffect(() => {
    let active = true;
    void fetchQuality()
      .then(response => { if (active) setData(response.quality); })
      .catch(loadError => { if (active) setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar o diagnóstico.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const runBenchmark = async () => {
    setBenchmarking(true); setError(''); setNotice('');
    try {
      await apiJson('/api/admin/quality/benchmark', { method: 'POST', timeoutMs: 120_000 });
      await load();
      setNotice('Teste de regressão concluído. O resultado foi salvo para comparação.');
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Não foi possível executar o teste de regressão.');
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

  const indexSemantics = async () => {
    setSemanticIndexing(true); setError(''); setNotice('');
    try {
      const response = await apiJson<{ message: string }>('/api/admin/quality/index-semantics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: data?.semanticIndex.batchLimit || 120 }),
        timeoutMs: 120_000,
      });
      await load();
      setNotice(response.message);
    } catch (indexError) {
      setError(indexError instanceof Error ? indexError.message : 'Não foi possível indexar o próximo lote.');
    } finally { setSemanticIndexing(false); }
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
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Uma fila simples do que realmente exige ação: catálogos incompletos, perguntas sem resposta, aprendizado do balcão e conferências oficiais.</p>
      </div>
      <button type="button" disabled={rebuilding || benchmarking || loading} onClick={() => void rebuildKnowledge()} className="cv-secondary px-4 py-2.5 text-sm font-semibold">
        {rebuilding ? 'Atualizando diagnóstico…' : 'Atualizar diagnóstico'}
      </button>
    </div>

    {notice && <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}
    {error && <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
    {loading && <div className="cv-surface rounded-[22px] p-8 text-sm text-slate-500">Conferindo a base técnica…</div>}

    {data && <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Catálogos utilizáveis" value={data.summary.readyCatalogs} description="Com peças disponíveis para consulta" tone="navy" />
        <SummaryCard label="Precisam de atenção" value={data.summary.needsReview} description="Revisão de dados ou extração" tone={data.summary.needsReview ? 'warning' : 'success'} />
        <SummaryCard label="Perguntas pendentes" value={data.searchRadar.length} description="Consultas reais ainda sem código seguro" tone={data.searchRadar.length ? 'warning' : 'success'} />
        <SummaryCard label="Sinais do balcão" value={data.learning.uniqueSignals} description={data.learning.nextMilestone ? `Próximo nível com ${data.learning.nextMilestone} confirmações` : 'Base de aprendizado já estabelecida'} tone={data.learning.level === 'COLD_START' ? 'neutral' : 'success'} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <div className={`rounded-[22px] border p-5 ${data.visualRetry.candidates ? 'border-amber-200 bg-amber-50/80' : 'border-emerald-200 bg-emerald-50/70'}`}>
          <div className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-500">Leitura visual de PDFs</div>
          <div className="mt-2 text-lg font-semibold text-slate-900">{data.visualRetry.candidates ? `${data.visualRetry.candidates} aguardando cota` : 'Nenhuma falha de cota'}</div>
          <p className="mt-2 text-xs leading-5 text-slate-600">{data.visualRetry.eligible ? `${data.visualRetry.documents[0]?.filename || 'Catálogo'} pode ser reenviado agora.` : data.visualRetry.coolingDown ? `Uma tentativa recente está no intervalo seguro de ${data.visualRetry.cooldownHours} horas.` : 'A leitura visual está sem pendências conhecidas.'}</p>
          {data.visualRetry.candidates > 0 && <button type="button" disabled={!data.visualRetry.eligible || retryingVisual} onClick={() => void retryVisualCatalogs()} className="cv-secondary mt-4 px-3 py-2 text-xs font-semibold disabled:opacity-50">{retryingVisual ? 'Reenviando…' : 'Retomar 1 catálogo'}</button>}
        </div>

        <div className="rounded-[22px] border border-blue-200 bg-blue-50/65 p-5">
          <div className="text-[10px] font-bold uppercase tracking-[.1em] text-blue-700">Busca semântica com limite</div>
          <div className="mt-2 text-lg font-semibold text-slate-900">{data.semanticIndex.indexedParts} de {data.semanticIndex.totalParts} peças</div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-[#1d4f91]" style={{ width: `${data.semanticIndex.totalParts ? Math.max(2, Math.round(data.semanticIndex.indexedParts / data.semanticIndex.totalParts * 100)) : 0}%` }} /></div>
          <p className="mt-2 text-xs leading-5 text-slate-600">Lotes de até {data.semanticIndex.batchLimit} itens · {data.semanticIndex.runsToday}/{data.semanticIndex.dailyRuns} usados hoje. A busca textual continua cobrindo 100% das peças.</p>
          <button type="button" disabled={!data.semanticIndex.canRun || semanticIndexing} onClick={() => void indexSemantics()} className="cv-secondary mt-4 px-3 py-2 text-xs font-semibold disabled:opacity-50">{semanticIndexing ? 'Indexando lote…' : 'Indexar próximo lote'}</button>
        </div>

        <div className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_14px_40px_rgba(15,35,72,.04)]">
          <div className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-500">Portal oficial</div>
          <div className="mt-2 text-lg font-semibold text-slate-900">{data.officialVerification.approved} aprovações reutilizáveis</div>
          <p className="mt-2 text-xs leading-5 text-slate-600">{data.officialVerification.pending} aguardando aprovação · {data.officialVerification.stale} vencidas. Cada conferência vale {data.officialVerification.cacheDays} dias e depois volta para revisão humana.</p>
          <div className="mt-4 text-xs font-semibold text-[#1d4f91]">Sem robô de login: cache aprovado + conferência no portal</div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_.75fr]">
        <div className="cv-surface overflow-hidden rounded-[24px]">
          <div className="border-b border-slate-200/80 bg-slate-50/70 p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><h2 className="text-base font-semibold text-slate-900">Catálogos para conferir</h2><p className="mt-1 text-xs leading-5 text-slate-500">Comece pelos modelos sugeridos. Nenhum código é alterado apenas por abrir esta tela.</p></div>
              <input value={queueFilter} onChange={event => setQueueFilter(event.target.value)} placeholder="Filtrar por arquivo, modelo ou motivo" className="cv-field w-full max-w-xs text-xs" />
            </div>
          </div>
          {!filteredQueue.length
            ? <div className="p-10 text-center"><div className="font-semibold text-emerald-700">Nenhuma pendência neste filtro</div><p className="mt-1 text-xs text-slate-500">A base continua disponível para o balcão.</p></div>
            : <div className="divide-y divide-slate-100">{filteredQueue.map(catalog => <div key={catalog.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-sm text-slate-900">{catalog.filename}</b>
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${healthTone(catalog.healthScore)}`}>{catalog.healthScore}/100</span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{reviewLabel(catalog.reviewStatus)}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">Modelo: {catalog.model || 'não confirmado'} · PNC: {catalog.pnc || 'não impresso/confirmado'} · {extractionLabel(catalog.extractionMethod)}</div>
                  {catalog.suggestedModel && <div className="mt-3 inline-flex rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">Modelo sugerido pelo arquivo: {catalog.suggestedModel}</div>}
                  {catalog.reviewReasons.length > 0 && <div className="mt-3 grid gap-1">{catalog.reviewReasons.slice(0, 4).map(reason => <div key={reason} className="text-xs leading-5 text-amber-900">• {reason}</div>)}</div>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => openEdit(catalog)} className="cv-secondary px-3 py-2 text-xs font-semibold">Corrigir dados</button>
                  <button type="button" disabled={busyId === catalog.id || Boolean(catalog.modelNeedsReview)} onClick={() => void confirmReview(catalog)} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">Marcar como conferido</button>
                </div>
              </div>
              {editing === catalog.id && <div className="mt-4 rounded-2xl border border-blue-100 bg-[#f4f8fd] p-4">
                <div className="mb-3 text-xs leading-5 text-slate-600"><b>Importante:</b> PNC identifica a variante do equipamento. Número de série não deve ser informado como PNC. Salvar relê o PDF para propagar o modelo às peças.</div>
                <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto_auto]">
                  <input className="cv-field text-xs" value={draft.manufacturer} onChange={event => setDraft({ ...draft, manufacturer: event.target.value })} placeholder="Fabricante" />
                  <input className="cv-field text-xs" value={draft.model} onChange={event => setDraft({ ...draft, model: event.target.value })} placeholder="Modelo (ex.: 143RII)" />
                  <input className="cv-field text-xs" value={draft.pnc} onChange={event => setDraft({ ...draft, pnc: event.target.value })} placeholder="PNC opcional" inputMode="numeric" />
                  <button type="button" disabled={busyId === catalog.id} onClick={() => void saveMetadata(catalog)} className="cv-primary px-3 py-2 text-xs font-semibold">Salvar e reextrair</button>
                  <button type="button" onClick={() => setEditing(null)} className="px-3 py-2 text-xs font-semibold text-slate-500">Cancelar</button>
                </div>
              </div>}
            </div>)}</div>}
        </div>

        <div className="grid content-start gap-4">
          <div className="rounded-[24px] bg-[#10284d] p-5 text-white shadow-[0_18px_55px_rgba(15,35,72,.16)]">
            <div className="text-xs font-bold uppercase tracking-[.12em] text-amber-300">Sobre o PNC</div>
            <p className="mt-3 text-sm leading-6 text-slate-200">Uma vista explodida pode atender <b className="text-white">nenhum, um ou vários PNCs</b>. O sistema não deve inventar um PNC quando o catálogo informa apenas modelo ou faixa de série.</p>
          </div>
          <div className="cv-surface rounded-[24px] p-5">
            <h2 className="text-sm font-semibold text-slate-900">Leitura rápida</h2>
            <div className="mt-4 grid gap-3">
              <InfoRow label="Peças consultáveis" value={data.summary.parts} />
              <InfoRow label="Sem página de origem" value={data.summary.partsWithoutPage} />
              <InfoRow label="Sem vista/seção" value={data.summary.partsWithoutSection} />
              <InfoRow label="Memórias por página/vista" value={data.summary.technicalMemoryChunks} />
            </div>
          </div>
        </div>
      </div>

      <div className="cv-surface mt-5 overflow-hidden rounded-[24px]">
        <div className="border-b border-slate-200/80 bg-slate-50/70 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold text-slate-900">Consultas que ainda precisam de solução</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Agrupa perguntas reais que terminaram sem um código seguro. Quando uma consulta equivalente passa a ser encontrada, ela sai da lista automaticamente.</p></div><span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">{data.searchRadar.length} pendência{data.searchRadar.length === 1 ? '' : 's'}</span></div></div>
        {!data.searchRadar.length ? <div className="p-8 text-center text-sm text-emerald-700">Nenhuma consulta recorrente permanece sem solução.</div> : <div className="divide-y divide-slate-100">{data.searchRadar.map(item => <div key={`${item.query}|${item.pnc || ''}`} className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><b className="text-sm text-slate-800">{item.query}</b><span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">{radarLabel(item.status)}</span>{item.count > 1 && <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700">{item.count} ocorrências</span>}</div><div className="mt-1 text-xs text-slate-400">{item.model ? `Modelo ${item.model}` : 'Modelo não confirmado'}{item.pnc ? ` · PNC ${item.pnc}` : ''} · última em {fmtDate(item.lastSeen)}</div>{item.partDescription && item.partDescription.toLowerCase() !== item.query.toLowerCase() && <div className="mt-2 text-[11px] text-slate-500">Interpretação local: {item.partDescription}</div>}</div>
          {onSearch && <button type="button" onClick={() => onSearch(radarSearchQuery(item))} className="cv-secondary px-3 py-2 text-xs font-semibold">Pesquisar na base atual</button>}
        </div>)}</div>}
      </div>

      <details className="cv-surface mt-5 rounded-[24px] p-5">
        <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">Ferramentas técnicas avançadas <span className="ml-2 text-xs font-normal text-slate-400">uso eventual</span></summary>
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <div className="rounded-2xl bg-slate-50 p-4">
            <h3 className="text-sm font-semibold">IA e indexação</h3>
            <p className="mt-2 text-xs leading-5 text-slate-600">O modelo {data.runtime.generativeModel} interpreta perguntas e PDFs visuais. Os códigos continuam vindo das peças estruturadas, nunca da imaginação da IA.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3"><RuntimeStat label="Leitura visual" value={data.runtime.extraction.geminiCatalogs} /><RuntimeStat label="Leitura local" value={data.runtime.extraction.parserCatalogs} /><RuntimeStat label="Legados" value={data.runtime.extraction.unknownCatalogs} /></div>
            <p className="mt-3 text-[11px] leading-5 text-slate-500">Aprendizado: {data.learning.positive} confirmações positivas e {data.learning.corrected} correções explícitas. Um voto isolado tem peso pequeno; concordância entre usuários aumenta o sinal com teto seguro.</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <h3 className="text-sm font-semibold">Teste de regressão da busca</h3>
            <p className="mt-2 text-xs leading-5 text-slate-600">Confere {metrics?.goldenTotal || 30} perguntas reais de balcão com códigos comprovados nos PDFs, incluindo peças parecidas que não podem vencer a correta. Use após mudanças na busca.</p>
            {metrics && <div className="mt-3 grid grid-cols-2 gap-2"><Metric label="Primeiro resultado correto" value={`${metrics.top1Percent}%`} /><Metric label="Correto entre os 5" value={`${metrics.recallAt5Percent}%`} /></div>}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" disabled={benchmarking || rebuilding} onClick={() => void runBenchmark()} className="cv-secondary px-3 py-2 text-xs font-semibold">{benchmarking ? 'Executando teste…' : 'Executar teste agora'}</button>
              {benchmark && <span className="text-[11px] text-slate-400">Último: {fmtDate(benchmark.createdAt)}</span>}
            </div>
          </div>
        </div>
      </details>
    </>}
  </section>;
}

function SummaryCard({ label, value, description, tone }: { label: string; value: number; description: string; tone: 'navy' | 'success' | 'warning' | 'danger' | 'neutral' }) {
  const tones = {
    navy: 'border-[#183965] bg-[#10284d] text-white',
    success: 'border-emerald-200 bg-emerald-50/90 text-emerald-950',
    warning: 'border-amber-200 bg-amber-50/90 text-amber-950',
    danger: 'border-rose-200 bg-rose-50/90 text-rose-950',
    neutral: 'border-slate-200 bg-slate-100/90 text-slate-900',
  };
  return <div className={`rounded-[22px] border p-5 shadow-[0_14px_40px_rgba(15,35,72,.055)] ${tones[tone]}`}><div className="text-[11px] font-bold uppercase tracking-[.09em] opacity-60">{label}</div><div className="mt-2 text-3xl font-semibold tracking-[-.04em]">{value}</div><div className="mt-2 text-xs leading-5 opacity-65">{description}</div></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-3"><div className="text-[9px] font-semibold uppercase tracking-[.08em] text-slate-400">{label}</div><div className="mt-1 text-xl font-semibold text-slate-900">{value}</div></div>;
}

function InfoRow({ label, value }: { label: string; value: number }) {
  return <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5"><span className="text-xs text-slate-500">{label}</span><b className="text-sm text-slate-800">{value}</b></div>;
}

function RuntimeStat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-slate-200 bg-white px-3 py-3"><div className="text-[9px] font-bold uppercase tracking-[.08em] text-slate-400">{label}</div><div className="mt-1 text-lg font-semibold text-slate-900">{value}</div></div>;
}
