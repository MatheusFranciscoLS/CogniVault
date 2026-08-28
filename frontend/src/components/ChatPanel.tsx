import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api, json } from '../lib';
import type { ChatResponse, FeedbackOption } from '../types';

type FeedbackReason='WRONG_CODE'|'WRONG_PNC'|'WRONG_MODEL'|'WRONG_PART'|'OTHER';
type Message = { id:string; role:'user'|'ai'; text:string; response?:ChatResponse; query?:string; pnc?:string; feedback?:'correct'|'wrong'|'corrected'; showReasons?:boolean; showCorrections?:boolean; reason?:FeedbackReason };
type Equipment = { id:string; manufacturer:string; model:string; pnc:string; label:string };
type Recent = { id:string; query:string; pnc:string };

const EQUIPMENT_KEY='cognivault_saved_equipment';
const RECENT_KEY='cognivault_recent_searches';
const read=<T,>(key:string,fallback:T):T=>{try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw) as T:fallback}catch{return fallback}};
const save=<T,>(key:string,value:T)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{/* Preferências locais não devem bloquear a consulta. */}};
const id=()=>`${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
const reasons:Array<[FeedbackReason,string]>=[['WRONG_CODE','Código incorreto'],['WRONG_PNC','PNC incorreto'],['WRONG_MODEL','Modelo incorreto'],['WRONG_PART','Peça incorreta'],['OTHER','Outro motivo']];

export default function ChatPanel({storageScope}:{storageScope:string}){
  const equipmentKey=`${EQUIPMENT_KEY}:${storageScope}`;
  const recentKey=`${RECENT_KEY}:${storageScope}`;
  const [messages,setMessages]=useState<Message[]>([]);
  const [question,setQuestion]=useState('');
  const [manufacturer,setManufacturer]=useState('');
  const [model,setModel]=useState('');
  const [pnc,setPnc]=useState('');
  const [loading,setLoading]=useState(false);
  const [equipment,setEquipment]=useState<Equipment[]>(()=>read<Equipment[]>(equipmentKey,[]));
  const [recent,setRecent]=useState<Recent[]>(()=>read<Recent[]>(recentKey,[]));
  const [notice,setNotice]=useState('');
  const [pdf,setPdf]=useState<{url:string;page:number|null;title:string}|null>(null);
  const messagesEndRef=useRef<HTMLDivElement|null>(null);

  useEffect(()=>{messagesEndRef.current?.scrollIntoView({behavior:'smooth',block:'end'})},[messages.length,loading]);
  const composed=useMemo(()=>{const base=question.trim();if(!base)return '';const machine=[manufacturer.trim(),model.trim()].filter(Boolean).join(' ');return machine?`${base} do equipamento ${machine}`:base;},[question,manufacturer,model]);
  const notify=(text:string)=>{setNotice(text);window.setTimeout(()=>setNotice(''),1800)};

  const remember=(query:string,usedPnc:string)=>{
    const next=[{id:id(),query,pnc:usedPnc},...recent.filter(x=>x.query!==query||x.pnc!==usedPnc)].slice(0,6);
    setRecent(next);save(recentKey,next);
  };

  const ask=async(query:string,forcedPnc?:string,store=true)=>{
    if(!query.trim()||loading)return;
    const usedPnc=forcedPnc||pnc||'';
    setLoading(true);setMessages(m=>[...m,{id:id(),role:'user',text:query}]);
    try{
      const response=await api('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:query,pnc:usedPnc||undefined}),timeoutMs:60_000});
      const data=await json<ChatResponse>(response);
      setMessages(m=>[...m,{id:id(),role:'ai',text:data.answer,response:data,query,pnc:usedPnc}]);
      if(store)remember(query,usedPnc);
    }catch(error){setMessages(m=>[...m,{id:id(),role:'ai',text:error instanceof Error?error.message:'Erro na consulta.'}]);}
    finally{setLoading(false)}
  };

  const submit=(event:FormEvent)=>{event.preventDefault();const query=composed;if(!query)return;setQuestion('');void ask(query)};

  const positiveFeedback=async(index:number)=>{
    const message=messages[index];const part=message.response?.part;if(!message.query||!part)return;
    try{
      await json(await api('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:message.query,partId:part.id,correct:true,pnc:message.pnc})}));
      setMessages(m=>m.map((x,i)=>i===index?{...x,feedback:'correct',showReasons:false,showCorrections:false}:x));
      notify('Confirmação registrada.');
    }catch{notify('Não foi possível salvar o feedback.');}
  };

  const startNegative=(index:number)=>setMessages(m=>m.map((x,i)=>i===index?{...x,feedback:'wrong',showReasons:true,showCorrections:false}:x));
  const chooseReason=(index:number,reason:FeedbackReason)=>setMessages(m=>m.map((x,i)=>i===index?{...x,reason,showReasons:false,showCorrections:true}:x));

  const negativeFeedback=async(index:number,corrected?:FeedbackOption)=>{
    const message=messages[index];const part=message.response?.part;if(!message.query||!part||!message.reason)return;
    try{
      await json(await api('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:message.query,partId:part.id,correct:false,correctedPartId:corrected?.id,pnc:message.pnc,reason:message.reason})}));
      setMessages(m=>m.map((x,i)=>i===index?{...x,feedback:corrected?'corrected':'wrong',showReasons:false,showCorrections:false}:x));
      notify(corrected?'Correção registrada.':'Feedback registrado.');
    }catch{notify('Não foi possível salvar o feedback.');}
  };

  const access=async(documentId:string,mode:'view'|'download',page:number|null=null,title='Catálogo')=>{
    try{const data=await json<{url:string}>(await api(`/api/documents/${documentId}/access?mode=${mode}`));if(mode==='view')setPdf({url:data.url,page,title});else window.open(data.url,'_blank','noopener,noreferrer');}
    catch{notify('Não foi possível abrir o catálogo.');}
  };

  const copy=async(value:string)=>{try{await navigator.clipboard.writeText(value);notify('Código copiado.')}catch{notify(`Código: ${value}`)}};

  const saveEquipment=()=>{
    if(!manufacturer.trim()&&!model.trim()&&!pnc.trim()){notify('Preencha fabricante, modelo ou PNC.');return;}
    const item:Equipment={id:id(),manufacturer:manufacturer.trim(),model:model.trim(),pnc:pnc.trim(),label:[manufacturer.trim(),model.trim(),pnc.trim()?`PNC ${pnc.trim()}`:''].filter(Boolean).join(' · ')};
    const next=[item,...equipment.filter(x=>x.label!==item.label)].slice(0,6);setEquipment(next);save(equipmentKey,next);notify('Equipamento salvo.');
  };

  const removeEquipment=(equipmentId:string)=>{
    const next=equipment.filter(item=>item.id!==equipmentId);
    setEquipment(next);save(equipmentKey,next);notify('Equipamento removido.');
  };

  const chooseModel=(message:Message,nextModel:string)=>{
    if(!message.query)return;
    setModel(nextModel);
    void ask(`${message.query} do equipamento ${nextModel}`,message.pnc);
  };

  const chooseAmbiguousOption=(message:Message,option:FeedbackOption)=>{
    const query=[option.name,`modelo ${option.model}`,option.section?`seção ${option.section}`:'',option.position?`posição ${option.position}`:''].filter(Boolean).join(' · ');
    setModel(option.model);
    if(option.pnc)setPnc(option.pnc);
    void ask(query,option.pnc||message.pnc);
  };

  return <section>
    {notice&&<div className="fixed right-5 top-20 z-50 rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg">{notice}</div>}
    <div className="mb-6"><p className="cv-kicker">Assistente técnico</p><h1 className="cv-page-title">Encontre o código certo mais rápido</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Informe a peça, o modelo e o PNC quando disponível. O código final sempre vem da base técnica indexada, não da memória da IA.</p></div>

    <div className="grid gap-6 xl:grid-cols-[1fr_330px]">
      <div className="cv-surface overflow-hidden rounded-[24px]">
        <div className="grid gap-3 border-b border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-3">
          <input value={manufacturer} onChange={e=>setManufacturer(e.target.value)} placeholder="Fabricante" className="cv-field text-sm"/>
          <input value={model} onChange={e=>setModel(e.target.value)} placeholder="Modelo" className="cv-field text-sm"/>
          <input value={pnc} onChange={e=>setPnc(e.target.value)} placeholder="PNC" className="cv-field text-sm"/>
          <button type="button" onClick={saveEquipment} className="justify-self-start rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold sm:col-span-3">☆ Salvar equipamento</button>
        </div>

        <div className="cv-scrollbar min-h-[480px] max-h-[62vh] space-y-4 overflow-auto p-5">
          {!messages.length&&<div className="grid h-[420px] place-items-center text-center"><div><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-2xl text-[#1d4f91]">✦</div><h2 className="mt-4 font-semibold">O que você procura?</h2><p className="mt-1 text-sm text-slate-400">Ex.: carburador · Husqvarna · 143RS</p></div></div>}

          {messages.map((message,index)=><div key={message.id} className={message.role==='user'?'flex justify-end':'flex justify-start'}><div className={`max-w-[92%] whitespace-pre-line rounded-2xl px-4 py-3 text-sm ${message.role==='user'?'bg-[#1d4f91] text-white':'bg-slate-100 text-slate-800'}`}>
            <div>{message.text}</div>
            {message.role==='ai'&&message.response?.part&&<div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-slate-800 shadow-sm">
              <div className="flex flex-wrap justify-between gap-3"><div><div className="text-[10px] font-bold uppercase tracking-[.15em] text-[#1d4f91]">Resultado técnico</div><div className="mt-1 font-semibold">{message.response.part.name}</div><div className="mt-2 text-2xl font-bold text-[#1d4f91]">{message.response.part.partNumber}</div></div>{typeof message.response.confidence==='number'&&<span className="h-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{Math.round(message.response.confidence*100)}% confiança</span>}</div>
              <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2"><div className="rounded-xl bg-slate-50 p-3">Modelo<b className="mt-1 block">{message.response.part.model}</b></div><div className="rounded-xl bg-slate-50 p-3">PNC<b className="mt-1 block">{message.response.part.pnc||'Não informado'}</b></div><div className="rounded-xl bg-slate-50 p-3">Seção<b className="mt-1 block">{message.response.part.section||'—'}</b></div><div className="rounded-xl bg-slate-50 p-3">Posição / página<b className="mt-1 block">{message.response.part.position||'—'} · pág. {message.response.part.page??'—'}</b></div></div>
              <div className="mt-3 rounded-xl border border-slate-200 p-3 text-xs">Catálogo<b className="mt-1 block">{message.response.part.filename}</b></div>
              <div className="mt-4 flex flex-wrap gap-2"><button onClick={()=>void copy(message.response?.part?.partNumber||'')} className="rounded-xl bg-[#1d4f91] px-3 py-2 text-xs font-semibold text-white">Copiar código</button><button onClick={()=>void access(message.response?.part?.documentId||'','view',message.response?.part?.page??null,message.response?.part?.filename||'Catálogo')} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold">Abrir na página</button><button onClick={()=>void access(message.response?.part?.documentId||'','download')} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold">Baixar PDF</button></div>
            </div>}
            {message.role==='ai'&&message.response?.pncOptions?.length?<div className="mt-3 flex flex-wrap gap-2">{message.response.pncOptions.map(x=><button key={x} onClick={()=>message.query&&void ask(message.query,x)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs">PNC {x}</button>)}</div>:null}
            {message.role==='ai'&&message.response?.modelOptions?.length?<div className="mt-3"><div className="mb-2 text-xs font-semibold text-slate-600">Confirmar modelo</div><div className="flex flex-wrap gap-2">{message.response.modelOptions.map(x=><button key={x} onClick={()=>chooseModel(message,x)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs">{x}</button>)}</div></div>:null}
            {message.role==='ai'&&message.response?.status==='AMBIGUOUS'&&message.response.options?.length?<div className="mt-3 rounded-xl border border-slate-200 bg-white p-3"><div className="text-xs font-semibold text-slate-700">Qual descrição corresponde à peça?</div><div className="mt-2 grid gap-2">{message.response.options.map(option=><button key={option.id} onClick={()=>chooseAmbiguousOption(message,option)} className="rounded-lg border border-slate-200 p-2 text-left text-xs hover:bg-slate-50"><b>{option.name}</b><span className="block text-slate-500">{option.model} · PNC {option.pnc||'não informado'} · posição {option.position||'—'}</span></button>)}</div></div>:null}
            {message.role==='ai'&&message.response?.part&&!message.feedback?<div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3"><span className="text-xs text-slate-500">Resultado correto?</span><button onClick={()=>void positiveFeedback(index)} className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-700">👍 Sim</button><button onClick={()=>startNegative(index)} className="rounded-lg bg-rose-50 px-2 py-1 text-rose-700">👎 Não</button></div>:null}
            {message.showReasons&&<div className="mt-3 rounded-xl border border-slate-200 bg-white p-3"><div className="text-xs font-semibold text-slate-700">O que estava errado?</div><div className="mt-2 flex flex-wrap gap-2">{reasons.map(([reason,label])=><button key={reason} onClick={()=>chooseReason(index,reason)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50">{label}</button>)}</div></div>}
            {message.showCorrections&&<div className="mt-3 rounded-xl border border-slate-200 bg-white p-3"><div className="text-xs font-semibold text-slate-700">Selecione a peça correta, se ela aparecer abaixo.</div><div className="mt-2 grid gap-2">{message.response?.feedbackOptions?.filter(x=>x.id!==message.response?.part?.id).map(x=><button key={x.id} onClick={()=>void negativeFeedback(index,x)} className="rounded-lg border border-slate-200 p-2 text-left text-xs"><b>{x.name}</b><span className="block text-slate-500">{x.model} · PNC {x.pnc||'não informado'} · posição {x.position||'—'}</span></button>)}</div><button onClick={()=>void negativeFeedback(index)} className="mt-2 text-xs font-semibold text-slate-500 underline">Nenhuma dessas / apenas registrar o erro</button></div>}
            {message.feedback&&!message.showReasons&&!message.showCorrections?<div className="mt-2 text-xs text-slate-500">{message.feedback==='correct'?'✓ Confirmação salva':message.feedback==='corrected'?'✓ Correção salva':'✓ Feedback salvo'}</div>:null}
          </div></div>)}
          {loading&&<div className="text-sm text-slate-400">Analisando catálogos…</div>}
          <div ref={messagesEndRef}/>
        </div>

        <form onSubmit={submit} className="flex gap-3 border-t border-slate-200 p-4"><input value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Digite a peça ou descrição…" className="cv-field flex-1 text-sm"/><button disabled={loading} className="cv-primary px-5 font-semibold disabled:opacity-50">Pesquisar</button></form>
      </div>

      <aside className="space-y-4">
        <div className="cv-surface rounded-[22px] p-5"><div className="text-sm font-semibold">Equipamentos salvos</div><p className="mt-1 text-xs text-slate-400">Reaplique modelo e PNC usados com frequência.</p><div className="mt-4 grid gap-2">{!equipment.length&&<div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-400">Nenhum equipamento salvo.</div>}{equipment.map(item=><div key={item.id} className="flex items-center gap-2 rounded-xl border border-slate-200 p-2"><button onClick={()=>{setManufacturer(item.manufacturer);setModel(item.model);setPnc(item.pnc);notify('Equipamento aplicado.')}} className="min-w-0 flex-1 p-1 text-left text-xs hover:bg-slate-50"><b className="block truncate text-slate-700">{item.label}</b><span className="mt-1 block text-slate-400">Usar nesta busca</span></button><button onClick={()=>removeEquipment(item.id)} aria-label={`Remover ${item.label}`} title="Remover equipamento" className="rounded-lg px-2 py-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600">×</button></div>)}</div></div>
        <div className="cv-surface rounded-[22px] p-5"><div className="text-sm font-semibold">Buscas rápidas</div><p className="mt-1 text-xs text-slate-400">Atalhos locais desta estação; o histórico completo fica salvo no sistema.</p><div className="mt-4 grid gap-2">{!recent.length&&<div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-400">As novas buscas aparecerão aqui.</div>}{recent.map(item=><button key={item.id} onClick={()=>void ask(item.query,item.pnc,false)} className="rounded-xl border border-slate-200 p-3 text-left text-xs hover:bg-slate-50"><b className="block text-slate-700">{item.query}</b><span className="mt-1 block text-slate-400">{item.pnc?`PNC ${item.pnc}`:'Sem PNC informado'}</span></button>)}</div></div>
        <div className="rounded-[22px] bg-[#0d2348] p-5 text-white"><div className="text-xs font-bold text-amber-200">REGRA DE SEGURANÇA</div><p className="mt-2 text-sm leading-6 text-slate-300">“Qualquer PNC” só aparece quando o sistema comprova compatibilidade. Quando houver dúvida, o assistente pede o PNC.</p></div>
      </aside>
    </div>

    {pdf&&<div className="fixed inset-0 z-[90] bg-slate-950/90 p-3 md:p-6"><div className="mx-auto flex h-full max-w-[1500px] flex-col overflow-hidden rounded-[22px] bg-white"><div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><div><div className="text-sm font-semibold">{pdf.title}</div><div className="text-xs text-slate-400">{pdf.page?`Página ${pdf.page}`:'Visualização do catálogo'}</div></div><button onClick={()=>setPdf(null)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">Fechar</button></div><iframe title={pdf.title} src={`${pdf.url}${pdf.page?`#page=${pdf.page}`:''}`} className="h-full w-full border-0"/></div></div>}
  </section>;
}
