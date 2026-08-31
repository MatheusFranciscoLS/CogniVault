import { useEffect, useMemo, useState } from 'react';
import { api, fmtDate, json } from '../lib';
import type { AdminFeedback } from '../types';

const reasonLabel: Record<string,string> = {
  WRONG_CODE: 'Código incorreto',
  WRONG_PNC: 'PNC incorreto',
  WRONG_MODEL: 'Modelo incorreto',
  WRONG_PART: 'Peça incorreta',
  OTHER: 'Outro motivo',
};

export default function AdminFeedbackPanel(){
  const [items,setItems]=useState<AdminFeedback[]>([]);
  const [summary,setSummary]=useState<{total:number;accuracy:number|null;reasons:Record<string,number>}>({total:0,accuracy:null,reasons:{}});
  const [filter,setFilter]=useState<'all'|'positive'|'negative'>('all');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  async function load(){
    setLoading(true);setError('');
    try {
      const data=await json<{summary:typeof summary;feedback:AdminFeedback[]}>(await api('/api/admin/feedback'));
      setSummary(data.summary);setItems(data.feedback);
    } catch (requestError) {
      setError(requestError instanceof Error?requestError.message:'Não foi possível carregar os feedbacks.');
    } finally { setLoading(false); }
  }

  useEffect(()=>{
    let active=true;
    void (async()=>{
      try {
        const data=await json<{summary:typeof summary;feedback:AdminFeedback[]}>(await api('/api/admin/feedback'));
        if(active){setSummary(data.summary);setItems(data.feedback)}
      } catch (requestError) {
        if(active)setError(requestError instanceof Error?requestError.message:'Não foi possível carregar os feedbacks.');
      } finally { if(active)setLoading(false); }
    })();
    return()=>{active=false};
  },[]);
  const visible=useMemo(()=>items.filter(item=>filter==='all'||(filter==='positive'?item.correct:!item.correct)),[items,filter]);
  const topReason=Object.entries(summary.reasons).sort((a,b)=>b[1]-a[1])[0];

  return <section>
    <div className="cv-page-heading"><div><p className="cv-kicker">Aprendizado com o balcão</p><h1 className="cv-page-title">Feedback da busca</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Acompanhe confirmações e correções feitas pela equipe. Elas ajudam o CogniVault a ordenar melhor resultados semelhantes.</p></div><button type="button" disabled={loading} onClick={()=>void load()} className="cv-secondary px-3 py-2 text-xs font-semibold">{loading?'Atualizando…':'Atualizar dados'}</button></div>
    <div className="rounded-[20px] border border-blue-200/80 bg-blue-50/70 p-4 text-xs leading-5 text-blue-950"><b>Como funciona:</b> “Sim” reforça o resultado para consultas parecidas; “Não” registra o erro e, quando uma correção é escolhida, favorece a peça certa. Isso ajusta o ranking interno — não treina nem altera o modelo externo do Gemini.</div>
    {error?<div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>:null}
    <div className="mt-6 grid gap-4 sm:grid-cols-3"><div className="cv-surface rounded-[22px] p-5"><div className="text-xs uppercase tracking-[.1em] text-slate-400">Avaliações</div><div className="mt-2 text-3xl font-semibold">{loading?'…':summary.total}</div></div><div className="cv-surface rounded-[22px] p-5"><div className="text-xs uppercase tracking-[.1em] text-slate-400">Taxa confirmada</div><div className="mt-2 text-3xl font-semibold">{loading?'…':summary.accuracy===null?'—':`${Math.round(summary.accuracy*100)}%`}</div></div><div className="cv-surface rounded-[22px] p-5"><div className="text-xs uppercase tracking-[.1em] text-slate-400">Erro mais comum</div><div className="mt-2 text-lg font-semibold">{loading?'Carregando…':topReason?reasonLabel[topReason[0]]||topReason[0]:'—'}</div><div className="mt-1 text-xs text-slate-400">{loading?'Buscando avaliações salvas':topReason?`${topReason[1]} ocorrência(s)`:'Sem erros classificados'}</div></div></div>
    <div className="cv-surface mt-5 rounded-[22px] p-4"><div className="flex flex-wrap gap-2">{([['all','Todos'],['positive','Corretos'],['negative','Incorretos']] as const).map(([id,label])=><button key={id} onClick={()=>setFilter(id)} className={`rounded-xl px-3 py-2 text-xs font-semibold ${filter===id?'bg-[#1d4f91] text-white':'border border-slate-200 bg-white text-slate-600'}`}>{label}</button>)}</div></div>
    <div className="cv-surface mt-4 overflow-hidden rounded-[22px]"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-[11px] uppercase tracking-[.08em] text-slate-400"><tr><th className="p-4">Consulta</th><th>Resultado</th><th>Avaliação</th><th>Usuário</th><th className="p-4">Data</th></tr></thead><tbody>{visible.map(item=><tr key={item.id} className="border-t border-slate-100 align-top"><td className="p-4"><div className="max-w-[340px] font-medium text-slate-800">{item.query}</div><div className="mt-1 text-xs text-slate-400">PNC {item.pnc||'não informado'}</div></td><td className="pt-4"><div className="font-semibold text-slate-700">{item.resultPart?.partNumber||'—'}</div><div className="mt-1 text-xs text-slate-400">{item.resultPart?.name||'Peça indisponível'}</div>{item.correctedPart&&<div className="mt-2 rounded-lg bg-blue-50 px-2 py-1 text-xs text-blue-700">Correta: {item.correctedPart.partNumber} · {item.correctedPart.name}</div>}</td><td className="pt-4">{item.correct?<span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">Correto</span>:<><span className="rounded-full bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">Incorreto</span><div className="mt-2 text-xs text-slate-500">{item.reason?reasonLabel[item.reason]||item.reason:'Sem motivo informado'}</div></>}</td><td className="pt-4 text-xs text-slate-500">{item.user?.email||'Sistema'}</td><td className="p-4 text-xs text-slate-500">{fmtDate(item.createdAt)}</td></tr>)}</tbody></table>{loading?<div className="p-10 text-center text-sm text-slate-400">Carregando feedbacks salvos…</div>:!visible.length?<div className="p-10 text-center text-sm text-slate-400">Nenhum feedback neste filtro.</div>:null}</div></div>
  </section>;
}
