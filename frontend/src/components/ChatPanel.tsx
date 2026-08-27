import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { api, json } from '../lib';
import type { ChatResponse, FeedbackOption } from '../types';

type Message = { role:'user'|'ai'; text:string; response?:ChatResponse; query?:string; pnc?:string; feedback?:'correct'|'wrong'|'corrected'; showCorrections?:boolean };
type Equipment = { id:string; manufacturer:string; model:string; pnc:string; label:string };
type Recent = { id:string; query:string; pnc:string };

const EQUIPMENT_KEY='cognivault_saved_equipment';
const RECENT_KEY='cognivault_recent_searches';
const read=<T,>(key:string,fallback:T):T=>{try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw) as T:fallback}catch{return fallback}};
const save=<T,>(key:string,value:T)=>localStorage.setItem(key,JSON.stringify(value));
const id=()=>`${Date.now()}-${Math.random().toString(36).slice(2,7)}`;

export default function ChatPanel(){
  const [messages,setMessages]=useState<Message[]>([]);
  const [question,setQuestion]=useState('');
  const [manufacturer,setManufacturer]=useState('');
  const [model,setModel]=useState('');
  const [pnc,setPnc]=useState('');
  const [loading,setLoading]=useState(false);
  const [equipment,setEquipment]=useState<Equipment[]>([]);
  const [recent,setRecent]=useState<Recent[]>([]);
  const [notice,setNotice]=useState('');

  useEffect(()=>{setEquipment(read<Equipment[]>(EQUIPMENT_KEY,[]));setRecent(read<Recent[]>(RECENT_KEY,[]));},[]);
  const composed=useMemo(()=>{const base=question.trim();if(!base)return '';const machine=[manufacturer.trim(),model.trim()].filter(Boolean).join(' ');return machine?`${base} do equipamento ${machine}`:base;},[question,manufacturer,model]);
  const notify=(text:string)=>{setNotice(text);window.setTimeout(()=>setNotice(''),1800)};

  const remember=(query:string,usedPnc:string)=>{
    const next=[{id:id(),query,pnc:usedPnc},...recent.filter(x=>x.query!==query||x.pnc!==usedPnc)].slice(0,6);
    setRecent(next);save(RECENT_KEY,next);
  };

  const ask=async(query:string,forcedPnc?:string,store=true)=>{
    if(!query.trim())return;
    const usedPnc=forcedPnc||pnc||'';
    setLoading(true);setMessages(m=>[...m,{role:'user',text:query}]);
    try{
      const response=await api('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:query,pnc:usedPnc||undefined})});
      const data=await json<ChatResponse>(response);
      setMessages(m=>[...m,{role:'ai',text:data.answer,response:data,query,pnc:usedPnc}]);
      if(store)remember(query,usedPnc);
    }catch(error){setMessages(m=>[...m,{role:'ai',text:error instanceof Error?error.message:'Erro na consulta.'}]);}
    finally{setLoading(false)}
  };

  const submit=(event:FormEvent)=>{event.preventDefault();const query=composed;if(!query)return;setQuestion('');void ask(query)};

  const feedback=async(index:number,correct:boolean,corrected?:FeedbackOption)=>{
    const message=messages[index];const part=message.response?.part;if(!message.query||!part)return;
    if(!correct&&!corrected){setMessages(m=>m.map((x,i)=>i===index?{...x,feedback:'wrong',showCorrections:true}:x));return;}
    try{
      await json(await api('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:message.query,partId:part.id,correct,correctedPartId:corrected?.id,pnc:message.pnc})}));
      setMessages(m=>m.map((x,i)=>i===index?{...x,feedback:correct?'correct':'corrected',showCorrections:false}:x));
      notify(correct?'Confirmação registrada.':'Correção registrada.');
    }catch{notify('Não foi possível salvar o feedback.');}
  };

  const access=async(documentId:string,mode:'view'|'download')=>{
    try{const data=await json<{url:string}>(await api(`/api/documents/${documentId}/access?mode=${mode}`));window.open(data.url,'_blank','noopener,noreferrer');}
    catch{notify('Não foi possível abrir o catálogo.');}
  };

  const copy=async(value:string)=>{try{await navigator.clipboard.writeText(value);notify('Código copiado.')}catch{notify(`Código: ${value}`)}};

  const saveEquipment=()=>{
    if(!manufacturer.trim()&&!model.trim()&&!pnc.trim()){notify('Preencha fabricante, modelo ou PNC.');return;}
    const item:Equipment={id:id(),manufacturer:manufacturer.trim(),model:model.trim(),pnc:pnc.trim(),label:[manufacturer.trim(),model.trim(),pnc.trim()?`PNC ${pnc.trim()}`:''].filter(Boolean).join(' · ')};
    const next=[item,...equipment.filter(x=>x.label!==item.label)].slice(0,6);setEquipment(next);save(EQUIPMENT_KEY,next);notify('Equipamento salvo.');
  };

  return <section>
    {notice&&<div className="fixed right-5 top-20 z-50 rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg">{notice}</div>}
    <div className="mb-6"><p className="text-xs font-bold uppercase tracking-[.15em] text-[#1d4f91]">Assistente técnico</p><h1 className="text-2xl font-bold mt-1">Encontre o código certo mais rápido</h1><p className="text-sm text-slate-500 mt-2">Informe peça, fabricante, modelo e PNC quando disponível. O código final vem da base indexada, não da memória da IA.</p></div>

    <div className="grid xl:grid-cols-[1fr_330px] gap-6">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="grid sm:grid-cols-3 gap-3 border-b border-slate-200 bg-slate-50/70 p-4">
          <input value={manufacturer} onChange={e=>setManufacturer(e.target.value)} placeholder="Fabricante" className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/>
          <input value={model} onChange={e=>setModel(e.target.value)} placeholder="Modelo" className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/>
          <input value={pnc} onChange={e=>setPnc(e.target.value)} placeholder="PNC" className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/>
          <button type="button" onClick={saveEquipment} className="sm:col-span-3 justify-self-start rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold">☆ Salvar equipamento</button>
        </div>

        <div className="min-h-[480px] max-h-[62vh] overflow-auto p-5 space-y-4">
          {!messages.length&&<div className="h-[420px] grid place-items-center text-center"><div><div className="w-14 h-14 mx-auto rounded-2xl bg-blue-50 text-[#1d4f91] grid place-items-center text-2xl">✦</div><h2 className="font-semibold mt-4">O que você procura?</h2><p className="text-sm text-slate-400 mt-1">Ex.: carburador · Husqvarna · 143RS</p></div></div>}

          {messages.map((message,index)=><div key={index} className={message.role==='user'?'flex justify-end':'flex justify-start'}><div className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm whitespace-pre-line ${message.role==='user'?'bg-[#1d4f91] text-white':'bg-slate-100 text-slate-800'}`}>
            <div>{message.text}</div>
            {message.role==='ai'&&message.response?.part&&<div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-slate-800 shadow-sm">
              <div className="flex flex-wrap justify-between gap-3"><div><div className="text-[10px] font-bold uppercase tracking-[.15em] text-[#1d4f91]">Resultado técnico</div><div className="mt-1 font-semibold">{message.response.part.name}</div><div className="mt-2 text-2xl font-bold text-[#1d4f91]">{message.response.part.partNumber}</div></div>{typeof message.response.confidence==='number'&&<span className="h-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{Math.round(message.response.confidence*100)}% confiança</span>}</div>
              <div className="mt-4 grid sm:grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-slate-50 p-3">Modelo<b className="block mt-1">{message.response.part.model}</b></div><div className="rounded-xl bg-slate-50 p-3">PNC<b className="block mt-1">{message.response.part.pnc||'Não informado'}</b></div><div className="rounded-xl bg-slate-50 p-3">Seção<b className="block mt-1">{message.response.part.section||'—'}</b></div><div className="rounded-xl bg-slate-50 p-3">Posição / página<b className="block mt-1">{message.response.part.position||'—'} · pág. {message.response.part.page??'—'}</b></div></div>
              <div className="mt-3 rounded-xl border border-slate-200 p-3 text-xs">Catálogo<b className="block mt-1">{message.response.part.filename}</b></div>
              <div className="mt-4 flex flex-wrap gap-2"><button onClick={()=>void copy(message.response?.part?.partNumber||'')} className="rounded-xl bg-[#1d4f91] px-3 py-2 text-xs font-semibold text-white">Copiar código</button><button onClick={()=>void access(message.response?.part?.documentId||'','view')} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold">Abrir catálogo</button><button onClick={()=>void access(message.response?.part?.documentId||'','download')} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold">Baixar PDF</button></div>
            </div>}
            {message.role==='ai'&&message.response?.pncOptions?.length?<div className="mt-3 flex flex-wrap gap-2">{message.response.pncOptions.map(x=><button key={x} onClick={()=>message.query&&void ask(message.query,x)} className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs">PNC {x}</button>)}</div>:null}
            {message.role==='ai'&&message.response?.part&&!message.feedback?<div className="mt-3 pt-3 border-t border-slate-200 flex flex-wrap items-center gap-2"><span className="text-xs text-slate-500">Resultado correto?</span><button onClick={()=>void feedback(index,true)} className="bg-emerald-50 text-emerald-700 rounded-lg px-2 py-1">👍 Sim</button><button onClick={()=>void feedback(index,false)} className="bg-rose-50 text-rose-700 rounded-lg px-2 py-1">👎 Não</button></div>:null}
            {message.showCorrections&&message.response?.feedbackOptions?.length?<div className="mt-3 grid gap-2">{message.response.feedbackOptions.filter(x=>x.id!==message.response?.part?.id).map(x=><button key={x.id} onClick={()=>void feedback(index,false,x)} className="text-left bg-white border border-slate-200 rounded-lg p-2 text-xs"><b>{x.name}</b><span className="block text-slate-500">{x.model} · PNC {x.pnc||'não informado'} · posição {x.position||'—'}</span></button>)}</div>:null}
            {message.feedback?<div className="mt-2 text-xs text-slate-500">{message.feedback==='correct'?'✓ Confirmação salva':'✓ Correção salva'}</div>:null}
          </div></div>)}
          {loading&&<div className="text-sm text-slate-400">Analisando catálogos…</div>}
        </div>

        <form onSubmit={submit} className="border-t border-slate-200 p-4 flex gap-3"><input value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Digite a peça ou descrição…" className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-[#1d4f91]"/><button disabled={loading} className="rounded-xl bg-[#1d4f91] text-white font-semibold px-5 disabled:opacity-50">Pesquisar</button></form>
      </div>

      <aside className="space-y-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5"><div className="text-sm font-semibold">Equipamentos salvos</div><p className="text-xs text-slate-400 mt-1">Reaplique modelo e PNC usados com frequência.</p><div className="mt-4 grid gap-2">{!equipment.length&&<div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-400">Nenhum equipamento salvo.</div>}{equipment.map(item=><button key={item.id} onClick={()=>{setManufacturer(item.manufacturer);setModel(item.model);setPnc(item.pnc);notify('Equipamento aplicado.')}} className="rounded-xl border border-slate-200 p-3 text-left text-xs hover:bg-slate-50"><b className="block text-slate-700">{item.label}</b><span className="mt-1 block text-slate-400">Usar nesta busca</span></button>)}</div></div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5"><div className="text-sm font-semibold">Buscas recentes</div><p className="text-xs text-slate-400 mt-1">Repita consultas comuns do balcão.</p><div className="mt-4 grid gap-2">{!recent.length&&<div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-400">As novas buscas aparecerão aqui.</div>}{recent.map(item=><button key={item.id} onClick={()=>void ask(item.query,item.pnc,false)} className="rounded-xl border border-slate-200 p-3 text-left text-xs hover:bg-slate-50"><b className="block text-slate-700">{item.query}</b><span className="mt-1 block text-slate-400">{item.pnc?`PNC ${item.pnc}`:'Sem PNC informado'}</span></button>)}</div></div>
        <div className="rounded-2xl bg-[#0d2348] text-white p-5"><div className="text-xs font-bold text-amber-200">REGRA DE SEGURANÇA</div><p className="text-sm text-slate-300 mt-2 leading-6">“Qualquer PNC” só aparece quando o sistema comprova compatibilidade. Quando houver dúvida, o assistente pede o PNC.</p></div>
      </aside>
    </div>
  </section>;
}
