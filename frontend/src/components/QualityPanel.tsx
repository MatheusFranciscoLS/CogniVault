import { useEffect, useState } from 'react';
import { apiJson, fmtDate } from '../lib';
import type { AiQualityData, BenchmarkRun, QualityCatalog } from '../types';

function fetchQuality() { return apiJson<{quality:AiQualityData}>('/api/admin/quality'); }

function healthTone(score:number) {
  return score >= 90 ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : score >= 70 ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-rose-200 bg-rose-50 text-rose-700';
}

function reviewLabel(status:QualityCatalog['reviewStatus']) {
  return status==='REVIEWED'?'Revisado':status==='READY'?'Pronto':status==='NEEDS_REVIEW'?'Revisar':'Pendente';
}

function latestBenchmark(data:AiQualityData|null):BenchmarkRun|null { return data?.benchmarkRuns?.[0] || null; }

export default function QualityPanel() {
  const [data,setData]=useState<AiQualityData|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [benchmarking,setBenchmarking]=useState(false);
  const [busyId,setBusyId]=useState<string|null>(null);
  const [editing,setEditing]=useState<string|null>(null);
  const [draft,setDraft]=useState({manufacturer:'',model:'',pnc:''});

  const load=async()=>{const response=await fetchQuality();setData(response.quality);setError('')};
  useEffect(()=>{
    let active=true;
    void fetchQuality().then(response=>{if(active)setData(response.quality)}).catch(loadError=>{if(active)setError(loadError instanceof Error?loadError.message:'Não foi possível carregar a qualidade.')}).finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[]);

  const runBenchmark=async()=>{
    setBenchmarking(true);setError('');
    try{await apiJson('/api/admin/quality/benchmark',{method:'POST'});await load()}catch(runError){setError(runError instanceof Error?runError.message:'Não foi possível executar o benchmark.')}finally{setBenchmarking(false)}
  };
  const openEdit=(catalog:QualityCatalog)=>{setEditing(catalog.id);setDraft({manufacturer:catalog.manufacturer||'',model:catalog.model||'',pnc:catalog.pnc||''})};
  const saveMetadata=async(catalog:QualityCatalog)=>{
    setBusyId(catalog.id);setError('');
    try{
      await apiJson(`/api/admin/quality/catalogs/${catalog.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft)});
      setEditing(null);await load();
    }catch(saveError){setError(saveError instanceof Error?saveError.message:'Não foi possível salvar os metadados.')}finally{setBusyId(null)}
  };
  const confirmReview=async(catalog:QualityCatalog)=>{
    setBusyId(catalog.id);setError('');
    try{await apiJson(`/api/admin/quality/catalogs/${catalog.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:true})});await load()}catch(reviewError){setError(reviewError instanceof Error?reviewError.message:'Não foi possível confirmar a revisão.')}finally{setBusyId(null)}
  };

  const benchmark=latestBenchmark(data);
  const metrics=benchmark?.metrics;
  const cards=data?[
    ['Saúde média',`${data.summary.averageHealth}%`,'Estrutura dos catálogos ativos'],
    ['Precisam revisão',data.summary.needsReview,'Metadados ou extração a conferir'],
    ['Peças ativas',data.summary.parts,'Autoridade dos códigos consultados'],
    ['Memória técnica',data.summary.technicalMemoryChunks,'Chunks por página e conjunto'],
  ]:[];

  return <section>
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div><p className="cv-kicker">Confiabilidade</p><h1 className="cv-page-title">Qualidade IA</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Monitore a qualidade dos catálogos, revise metadados e meça a busca com casos reais antes de confiar em uma alteração de IA.</p></div>
      <button type="button" disabled={benchmarking||loading} onClick={()=>void runBenchmark()} className="cv-primary px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">{benchmarking?'Executando benchmark…':'Executar benchmark real'}</button>
    </div>
    {error&&<div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
    {loading&&<div className="cv-surface rounded-[22px] p-8 text-sm text-slate-400">Calculando qualidade da base…</div>}

    {data&&<>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label,value,description])=><div key={String(label)} className="cv-surface rounded-[22px] p-5"><div className="text-xs font-semibold uppercase tracking-[.08em] text-slate-400">{label}</div><div className="mt-3 text-3xl font-semibold tracking-[-.04em] text-slate-950">{value}</div><div className="mt-2 text-xs leading-5 text-slate-400">{description}</div></div>)}</div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_.8fr]">
        <div className="cv-surface rounded-[22px] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-sm font-semibold text-slate-900">Benchmark de produção</div><p className="mt-1 text-xs leading-5 text-slate-400">Precisão é medida somente nos casos cujo código esperado realmente existe na base. Cobertura do catálogo é mostrada separadamente.</p></div>{benchmark&&<div className="text-xs text-slate-400">{fmtDate(benchmark.createdAt)}</div>}</div>
          {metrics?<>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Top-1" value={`${metrics.top1Percent}%`}/><Metric label="Recall@5" value={`${metrics.recallAt5Percent}%`}/><Metric label="MRR" value={metrics.mrr.toFixed(3)}/><Metric label="Hard negative venceu" value={`${metrics.hardNegativeWinPercent}%`} danger={metrics.hardNegativeWinRate>0}/></div>
            <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-xs leading-6 text-slate-600"><b>Cobertura do Golden Set:</b> {metrics.goldenApplicable}/{metrics.goldenTotal} ({metrics.catalogCoveragePercent}%). <b>Gaps de extração:</b> {metrics.extractionGaps}. <b>Catálogos ainda ausentes:</b> {metrics.missingCatalogs}. <b>Casos aprendidos com feedback:</b> {metrics.feedbackCases}.</div>
          </>:<div className="mt-6 rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">Nenhum benchmark foi executado neste tenant ainda.</div>}
        </div>

        <div className="cv-surface rounded-[22px] p-5"><div className="text-sm font-semibold text-slate-900">Integridade da indexação</div><div className="mt-4 grid gap-3"><InfoRow label="Sem embedding" value={data.summary.partsWithoutEmbedding}/><InfoRow label="Sem página" value={data.summary.partsWithoutPage}/><InfoRow label="Sem seção" value={data.summary.partsWithoutSection}/><InfoRow label="Arquivados" value={data.hygiene.archivedRecords}/><InfoRow label="Histórico removido" value={data.hygiene.removedHistoricalRecords}/></div><p className="mt-4 text-[11px] leading-5 text-slate-400">{data.hygiene.note}</p></div>
      </div>

      <div className="cv-surface mt-5 overflow-hidden rounded-[22px]">
        <div className="border-b border-slate-200 p-5"><div className="text-sm font-semibold text-slate-900">Fila de revisão</div><p className="mt-1 text-xs text-slate-400">Um catálogo nesta fila não é apagado. Corrija o metadado e ele será reprocessado, ou confirme a revisão quando não houver problema estrutural.</p></div>
        {!data.reviewQueue.length?<div className="p-8 text-center text-sm text-emerald-700">Nenhum catálogo exige revisão no momento.</div>:<div className="divide-y divide-slate-100">{data.reviewQueue.map(catalog=><div key={catalog.id} className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><b className="truncate text-sm text-slate-800">{catalog.filename}</b><span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${healthTone(catalog.healthScore)}`}>{catalog.healthScore}/100</span><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{reviewLabel(catalog.reviewStatus)}</span></div><div className="mt-1 text-xs text-slate-400">{catalog.model||'Modelo não confirmado'} · PNC {catalog.pnc||'não confirmado'} · {catalog.category?.name||'Sem seção'}</div>{catalog.reviewReasons.length>0&&<div className="mt-3 grid gap-1">{catalog.reviewReasons.slice(0,5).map(reason=><div key={reason} className="text-xs leading-5 text-amber-800">• {reason}</div>)}</div>}</div><div className="flex gap-2"><button type="button" onClick={()=>openEdit(catalog)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">Corrigir metadados</button><button type="button" disabled={busyId===catalog.id} onClick={()=>void confirmReview(catalog)} className="rounded-xl border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 disabled:opacity-40">Confirmar revisão</button></div></div>
          {editing===catalog.id&&<div className="mt-4 grid gap-2 rounded-2xl bg-slate-50 p-4 md:grid-cols-[1fr_1fr_1fr_auto_auto]"><input className="cv-field text-xs" value={draft.manufacturer} onChange={event=>setDraft({...draft,manufacturer:event.target.value})} placeholder="Fabricante"/><input className="cv-field text-xs" value={draft.model} onChange={event=>setDraft({...draft,model:event.target.value})} placeholder="Modelo"/><input className="cv-field text-xs" value={draft.pnc} onChange={event=>setDraft({...draft,pnc:event.target.value})} placeholder="PNC"/><button type="button" disabled={busyId===catalog.id} onClick={()=>void saveMetadata(catalog)} className="cv-primary px-3 py-2 text-xs font-semibold disabled:opacity-40">Salvar e reprocessar</button><button type="button" onClick={()=>setEditing(null)} className="px-3 py-2 text-xs font-semibold text-slate-500">Cancelar</button></div>}
        </div>)}</div>}
      </div>

      <div className="cv-surface cv-scrollbar mt-5 overflow-x-auto rounded-[22px]"><table className="w-full min-w-[980px] text-sm"><thead className="bg-slate-50/80 text-left text-[11px] uppercase tracking-[.08em] text-slate-400"><tr><th className="p-4">Catálogo</th><th>Família</th><th>Saúde</th><th>Extração</th><th>Peças</th><th>Memória</th><th className="p-4">Revisão</th></tr></thead><tbody>{data.catalogs.map(catalog=><tr key={catalog.id} className="border-t border-slate-100"><td className="p-4"><b className="text-slate-800">{catalog.filename}</b><div className="mt-1 text-xs text-slate-400">{catalog.model||'—'} · PNC {catalog.pnc||'—'}</div></td><td className="pr-4 text-slate-600">{catalog.category?.name||'—'}</td><td className="pr-4"><span className={`rounded-full border px-2 py-1 text-xs font-semibold ${healthTone(catalog.healthScore)}`}>{catalog.healthScore}/100</span></td><td className="pr-4 text-xs text-slate-500">{catalog.extractionMethod||'—'}</td><td className="pr-4 text-slate-600">{catalog._count.parts}</td><td className="pr-4 text-slate-600">{catalog._count.chunks}</td><td className="p-4 text-xs text-slate-600">{reviewLabel(catalog.reviewStatus)}</td></tr>)}</tbody></table></div>
    </>}
  </section>;
}

function Metric({label,value,danger=false}:{label:string;value:string;danger?:boolean}){return <div className={`rounded-2xl border p-4 ${danger?'border-rose-200 bg-rose-50':'border-slate-200 bg-white'}`}><div className="text-[10px] font-semibold uppercase tracking-[.08em] text-slate-400">{label}</div><div className={`mt-2 text-2xl font-semibold ${danger?'text-rose-700':'text-slate-900'}`}>{value}</div></div>}
function InfoRow({label,value}:{label:string;value:number}){return <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5"><span className="text-xs text-slate-500">{label}</span><b className="text-sm text-slate-800">{value}</b></div>}
