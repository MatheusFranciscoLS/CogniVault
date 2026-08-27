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

  useEffect(()=>{void (async()=>{const data=await json<{summary:typeof summary;feedback:AdminFeedback[]}>(await api('/api/admin/feedback'));setSummary(data.summary);setItems(data.feedback)})()},[]);
  const visible=useMemo(()=>items.filter(item=>filter==='all'||(filter==='positive'?item.correct:!item.correct)),[items,filter]);
  const topReason=Object.entries(summary.reasons).sort((a,b)=>b[1]-a[1])[0];

  return <section>
    <p className="cv-kicker">Qualidade da busca</p><h1 className="cv-page-title">Feedback da IA</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Acompanhe confirmações e erros reportados pelo balcão para identificar onde o ranking precisa melhorar.</p>
    <div className="mt-6 grid gap-4 sm:grid-cols-3"><div className="cv-surface rounded-[22px] p-5"><div className="text-xs uppercase tracking-[.1em] text-slate-400">Avaliações</div><div className="mt-2 text-3xl font-semibold">{summary.total}</div></div><div className="cv-surface rounded-[22px] p-5"><div className="text-xs uppercase tracking-[.1em] text-slate-400">Taxa confirmada</div><div className="mt-2 text-3xl font-semibold">{summary.accuracy===null?'—':`${Math.round(summary.accuracy*100)}%`}</div></div><div className="cv-surface rounded-[22px] p-5"><div className="text-xs uppercase tracking-[.1em] text-slate-400">Erro mais comum</div><div className="mt-2 text-lg font-semibold">{topReason?reasonLabel[topReason[0]]||topReason[0]:'—'}</div><div className="mt-1 text-xs text-slate-400">{topReason?`${topReason[1]} ocorrência(s)`:'Sem erros classificados'}</div></div></div>
    <div className="cv-surface mt-5 rounded-[22px] p-4"><div className="flex flex-wrap gap-2">{([['all','Todos'],['positive','Corretos'],['negative','Incorretos']] as const).map(([id,label])=><button key={id} onClick={()=>setFilter(id)} className={`rounded-xl px-3 py-2 text-xs font-semibold ${filter===id?'bg-[#1d4f91] text-white':'border border-slate-200 bg-white text-slate-600'}`}>{label}</button>)}</div></div>
    <div className="cv-surface mt-4 overflow-hidden rounded-[22px]"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-[11px] uppercase tracking-[.08em] text-slate-400"><tr><th className="p-4">Consulta</th><th>Resultado</th><th>Avaliação</th><th>Usuário</th><th className="p-4">Data</th></tr></thead><tbody>{visible.map(item=><tr key={item.id} className="border-t border-slate-100 align-top"><td className="p-4"><div className="max-w-[340px] font-medium text-slate-800">{item.query}</div><div className="mt-1 text-xs text-slate-400">PNC {item.pnc||'não informado'}</div></td><td className="pt-4"><div className="font-semibold text-slate-700">{item.resultPart?.partNumber||'—'}</div><div className="mt-1 text-xs text-slate-400">{item.resultPart?.name||'Peça indisponível'}</div>{item.correctedPart&&<div className="mt-2 rounded-lg bg-blue-50 px-2 py-1 text-xs text-blue-700">Correta: {item.correctedPart.partNumber} · {item.correctedPart.name}</div>}</td><td className="pt-4">{item.correct?<span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">Correto</span>:<><span className="rounded-full bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">Incorreto</span><div className="mt-2 text-xs text-slate-500">{item.reason?reasonLabel[item.reason]||item.reason:'Sem motivo informado'}</div></>}</td><td className="pt-4 text-xs text-slate-500">{item.user?.email||'Sistema'}</td><td className="p-4 text-xs text-slate-500">{fmtDate(item.createdAt)}</td></tr>)}</tbody></table>{!visible.length&&<div className="p-10 text-center text-sm text-slate-400">Nenhum feedback neste filtro.</div>}</div></div>
  </section>;
}
