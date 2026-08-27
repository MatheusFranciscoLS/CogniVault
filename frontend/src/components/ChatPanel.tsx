import { useState } from 'react';
import type { FormEvent } from 'react';
import { api, json } from '../lib';
import type { ChatResponse, FeedbackOption } from '../types';

type Message={role:'user'|'ai'; text:string; response?:ChatResponse; query?:string; pnc?:string; feedback?:'correct'|'wrong'|'corrected'; showCorrections?:boolean};

export default function ChatPanel(){
  const [messages,setMessages]=useState<Message[]>([]); const [question,setQuestion]=useState(''); const [pnc,setPnc]=useState(''); const [loading,setLoading]=useState(false);
  const ask=async(q:string,forcedPnc?:string)=>{
    if(!q.trim())return; setLoading(true); setMessages(m=>[...m,{role:'user',text:q}]);
    try{ const r=await api('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:q,pnc:forcedPnc||pnc||undefined})}); const data=await json<ChatResponse>(r); setMessages(m=>[...m,{role:'ai',text:data.answer,response:data,query:q,pnc:forcedPnc||pnc}]); }
    catch(e){setMessages(m=>[...m,{role:'ai',text:e instanceof Error?e.message:'Erro na consulta.'}]);} finally{setLoading(false);}
  };
  const submit=(e:FormEvent)=>{e.preventDefault(); const q=question; setQuestion(''); void ask(q);};
  const feedback=async(index:number,correct:boolean,corrected?:FeedbackOption)=>{
    const m=messages[index]; const part=m.response?.part; if(!m.query||!part)return;
    if(!correct&&!corrected){setMessages(v=>v.map((x,i)=>i===index?{...x,feedback:'wrong',showCorrections:true}:x));return;}
    try{await json(await api('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:m.query,partId:part.id,correct,correctedPartId:corrected?.id,pnc:m.pnc})}));setMessages(v=>v.map((x,i)=>i===index?{...x,feedback:correct?'correct':'corrected',showCorrections:false}:x));}catch{/* mantém interface utilizável */}
  };
  return <section>
    <div className="mb-6"><p className="text-xs font-bold uppercase tracking-[.15em] text-indigo-600">Assistente técnico</p><h1 className="text-2xl font-bold mt-1">Encontre o código certo mais rápido</h1><p className="text-sm text-slate-500 mt-2">Pesquise por nome popular, descrição em outro idioma, modelo, posição ou código.</p></div>
    <div className="grid xl:grid-cols-[1fr_300px] gap-6">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="min-h-[480px] max-h-[62vh] overflow-auto p-5 space-y-4">
          {!messages.length&&<div className="h-[420px] grid place-items-center text-center"><div><div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-50 text-indigo-600 grid place-items-center text-2xl">✦</div><h2 className="font-semibold mt-4">O que você procura?</h2><p className="text-sm text-slate-400 mt-1">Ex.: “carburador da Husqvarna 143RS”</p></div></div>}
          {messages.map((m,i)=><div key={i} className={m.role==='user'?'flex justify-end':'flex justify-start'}><div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-line ${m.role==='user'?'bg-indigo-600 text-white':'bg-slate-100 text-slate-800'}`}><div>{m.text}</div>
            {m.role==='ai'&&m.response?.pncOptions?.length?<div className="mt-3 flex flex-wrap gap-2">{m.response.pncOptions.map(x=><button key={x} onClick={()=>m.query&&ask(m.query,x)} className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs hover:border-indigo-400">PNC {x}</button>)}</div>:null}
            {m.role==='ai'&&m.response?.part&&!m.feedback?<div className="mt-3 pt-3 border-t border-slate-200 flex items-center gap-2"><span className="text-xs text-slate-500">Resultado correto?</span><button onClick={()=>feedback(i,true)} className="bg-emerald-50 text-emerald-700 rounded-lg px-2 py-1">👍 Sim</button><button onClick={()=>feedback(i,false)} className="bg-rose-50 text-rose-700 rounded-lg px-2 py-1">👎 Não</button></div>:null}
            {m.showCorrections&&m.response?.feedbackOptions?.length?<div className="mt-3 grid gap-2">{m.response.feedbackOptions.filter(x=>x.id!==m.response?.part?.id).map(x=><button key={x.id} onClick={()=>feedback(i,false,x)} className="text-left bg-white border border-slate-200 rounded-lg p-2 text-xs"><b>{x.name}</b><span className="block text-slate-500">{x.model} · PNC {x.pnc||'não informado'} · posição {x.position||'—'}</span></button>)}</div>:null}
            {m.feedback?<div className="mt-2 text-xs text-slate-500">{m.feedback==='correct'?'✓ Confirmação salva':'✓ Correção salva'}</div>:null}
          </div></div>)}
          {loading&&<div className="text-sm text-slate-400">Analisando catálogos…</div>}
        </div>
        <form onSubmit={submit} className="border-t border-slate-200 p-4 flex gap-3"><input value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Digite a peça, modelo ou descrição…" className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500"/><button disabled={loading} className="rounded-xl bg-indigo-600 text-white font-semibold px-5 disabled:opacity-50">Pesquisar</button></form>
      </div>
      <aside className="space-y-4"><div className="bg-white border border-slate-200 rounded-2xl p-5"><label className="text-sm font-semibold">PNC do equipamento</label><input value={pnc} onChange={e=>setPnc(e.target.value)} placeholder="Opcional" className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/><p className="text-xs text-slate-400 mt-3 leading-5">Se houver mais de uma configuração da máquina, o sistema pede o PNC em vez de arriscar um código incorreto.</p></div><div className="rounded-2xl bg-slate-950 text-white p-5"><div className="text-xs font-bold text-indigo-300">REGRA DE SEGURANÇA</div><p className="text-sm text-slate-300 mt-2 leading-6">A IA identifica a peça; o Part Number final é lido do banco. “Qualquer PNC” só aparece quando o sistema comprova compatibilidade.</p></div></aside>
    </div>
  </section>;
}
