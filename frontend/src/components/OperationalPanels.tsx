import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { api, fmtDate, json } from '../lib';
import type { FavoriteItem, HomeData, PartDetail, SearchHistoryItem, SearchPart } from '../types';

function Empty({title,description}:{title:string;description:string}){
  return <div className="rounded-[22px] border border-dashed border-slate-300 bg-white/70 p-8 text-center"><div className="text-sm font-semibold text-slate-700">{title}</div><div className="mt-1 text-xs text-slate-400">{description}</div></div>;
}

export function HomePanel({onSearch}:{onSearch:(query:string)=>void}){
  const [data,setData]=useState<HomeData|null>(null);
  const [query,setQuery]=useState('');
  useEffect(()=>{void (async()=>{try{setData((await json<{home:HomeData}>(await api('/api/home'))).home)}catch{setData(null)}})()},[]);
  const submit=(e:FormEvent)=>{e.preventDefault();if(query.trim())onSearch(query.trim())};

  return <section>
    <div className="relative overflow-hidden rounded-[30px] bg-[#0b1d3a] px-6 py-8 text-white shadow-[0_18px_60px_rgba(15,35,72,.16)] md:px-9 md:py-10">
      <div className="absolute -right-28 top-1/2 w-[520px] -translate-y-1/2 opacity-[.04]"><img src="/husqvarna-logo.webp" alt="" className="w-full grayscale brightness-0 invert"/></div>
      <div className="relative z-10 max-w-3xl">
        <p className="text-[10px] font-bold uppercase tracking-[.18em] text-amber-200">Operação de balcão</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-.04em] md:text-[2.55rem]">Qual peça você precisa encontrar?</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Pesquise por código, nome da peça, modelo ou PNC. O CogniVault cruza a consulta com os catálogos processados.</p>
        <form onSubmit={submit} className="mt-6 flex gap-2 rounded-2xl bg-white p-2 shadow-2xl shadow-black/10">
          <input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ex.: carburador 143RS, 537 04 19-01, PNC 967..." className="min-w-0 flex-1 rounded-xl border-0 px-4 py-3 text-sm text-slate-900 outline-none"/>
          <button className="cv-primary px-5 text-sm font-semibold">Pesquisar</button>
        </form>
      </div>
    </div>

    <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="cv-surface rounded-[22px] p-5"><div className="text-xs uppercase tracking-[.1em] text-slate-400">Peças indexadas</div><div className="mt-2 text-3xl font-semibold tracking-[-.04em]">{data?.counts.parts ?? '—'}</div></div>
      <div className="cv-surface rounded-[22px] p-5"><div className="text-xs uppercase tracking-[.1em] text-slate-400">Catálogos ativos</div><div className="mt-2 text-3xl font-semibold tracking-[-.04em]">{data?.counts.documents ?? '—'}</div></div>
      <div className="cv-surface rounded-[22px] p-5 sm:col-span-2"><div className="text-xs uppercase tracking-[.1em] text-slate-400">Atalho</div><button onClick={()=>onSearch('carburador')} className="mt-2 text-left text-sm font-semibold text-[#1d4f91] hover:underline">Pesquisar peças por descrição →</button><div className="mt-1 text-xs text-slate-400">Também funciona com códigos sem espaços e hífens.</div></div>
    </div>

    <div className="mt-5 grid gap-5 xl:grid-cols-2">
      <div className="cv-surface rounded-[22px] p-5"><div className="flex items-center justify-between"><div><div className="font-semibold">Pesquisas recentes</div><div className="mt-1 text-xs text-slate-400">Continue de onde o balcão parou.</div></div></div><div className="mt-4 grid gap-2">{data?.recentSearches.length?data.recentSearches.map(item=><button key={item.id} onClick={()=>onSearch(item.resultCode||item.query)} className="rounded-xl border border-slate-200 p-3 text-left transition hover:bg-slate-50"><div className="text-sm font-semibold text-slate-800">{item.query}</div><div className="mt-1 text-xs text-slate-400">{item.resultCode?`${item.resultCode} · ${item.resultModel||''}`:item.status.replaceAll('_',' ')}</div></button>):<Empty title="Sem pesquisas ainda" description="As consultas feitas pela equipe aparecerão aqui."/>}</div></div>
      <div className="cv-surface rounded-[22px] p-5"><div><div className="font-semibold">Favoritos</div><div className="mt-1 text-xs text-slate-400">Peças e catálogos usados com frequência.</div></div><div className="mt-4 grid gap-2">{data?.favorites.length?data.favorites.map(item=><button key={item.id} onClick={()=>item.reference&&onSearch(item.reference)} className="rounded-xl border border-slate-200 p-3 text-left transition hover:bg-slate-50"><div className="text-sm font-semibold text-slate-800">★ {item.label}</div><div className="mt-1 text-xs text-slate-400">{item.reference||item.model||'Catálogo salvo'}</div></button>):<Empty title="Nenhum favorito" description="Salve peças frequentes para ganhar tempo no atendimento."/>}</div></div>
    </div>

    <div className="cv-surface mt-5 rounded-[22px] p-5"><div className="font-semibold">Catálogos recentes</div><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data?.recentDocuments.map(doc=><div key={doc.id} className="rounded-2xl border border-slate-200 p-4"><div className="text-sm font-semibold text-slate-800">{doc.filename}</div><div className="mt-2 text-xs leading-5 text-slate-400">{doc.manufacturer||'Fabricante não informado'} · {doc.model||'Modelo não informado'}<br/>PNC {doc.pnc||'—'} · {doc.partCount} peças</div></div>)}</div></div>
  </section>;
}

export function PartsPanel({initialQuery,onQueryChange}:{initialQuery:string;onQueryChange:(query:string)=>void}){
  const [query,setQuery]=useState(initialQuery);
  const [parts,setParts]=useState<SearchPart[]>([]);
  const [documents,setDocuments]=useState<Array<{id:string;filename:string;manufacturer:string|null;model:string|null;pnc:string|null;partCount:number}>>([]);
  const [loading,setLoading]=useState(false);
  const [detail,setDetail]=useState<PartDetail|null>(null);
  const [pdf,setPdf]=useState<{url:string;page:number|null;title:string}|null>(null);
  const [notice,setNotice]=useState('');

  const search=async(value:string)=>{const q=value.trim();onQueryChange(q);if(q.length<2){setParts([]);setDocuments([]);return;}setLoading(true);try{const data=await json<{parts:SearchPart[];documents:typeof documents}>(await api(`/api/search?q=${encodeURIComponent(q)}`));setParts(data.parts);setDocuments(data.documents)}finally{setLoading(false)}};
  useEffect(()=>{setQuery(initialQuery);if(initialQuery.trim().length>=2)void search(initialQuery)},[initialQuery]);
  const submit=(e:FormEvent)=>{e.preventDefault();void search(query)};
  const openPart=async(id:string)=>{setDetail((await json<{part:PartDetail}>(await api(`/api/parts/${id}`))).part)};
  const accessPdf=async(documentId:string,page:number|null,title:string)=>{const data=await json<{url:string}>(await api(`/api/documents/${documentId}/access?mode=view`));setPdf({url:data.url,page,title})};
  const favorite=async()=>{if(!detail)return;if(detail.favoriteId){await json(await api(`/api/favorites/${detail.favoriteId}`,{method:'DELETE'}));setDetail({...detail,favoriteId:null});setNotice('Favorito removido.')}else{const data=await json<{favorite:{id:string}}>(await api('/api/favorites',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({partId:detail.id})}));setDetail({...detail,favoriteId:data.favorite.id});setNotice('Peça adicionada aos favoritos.')}window.setTimeout(()=>setNotice(''),1800)};
  const copy=async(value:string)=>{await navigator.clipboard.writeText(value);setNotice('Código copiado.');window.setTimeout(()=>setNotice(''),1600)};

  return <section>
    {notice&&<div className="fixed right-5 top-20 z-[80] rounded-xl bg-slate-950 px-4 py-2.5 text-sm text-white shadow-xl">{notice}</div>}
    <p className="cv-kicker">Busca global</p><h1 className="cv-page-title">Peças e catálogos</h1><p className="mt-2 text-sm text-slate-500">Use nome, código, modelo ou PNC. Resultados vêm exclusivamente da base técnica da empresa.</p>
    <form onSubmit={submit} className="cv-surface mt-6 flex gap-2 rounded-[22px] p-2"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar peça, código, modelo ou PNC" className="min-w-0 flex-1 rounded-2xl border-0 px-4 py-3 text-sm outline-none"/><button className="cv-primary px-5 text-sm font-semibold">Buscar</button></form>
    {loading&&<div className="mt-4 text-sm text-slate-400">Pesquisando na base técnica…</div>}

    <div className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_.6fr]">
      <div className="cv-surface overflow-hidden rounded-[22px]"><div className="border-b border-slate-200 px-5 py-4"><div className="font-semibold">Peças encontradas</div><div className="text-xs text-slate-400">{parts.length} resultado(s)</div></div><div className="divide-y divide-slate-100">{parts.map(part=><button key={part.id} onClick={()=>void openPart(part.id)} className="grid w-full gap-3 p-4 text-left transition hover:bg-slate-50 sm:grid-cols-[1fr_180px_140px]"><div><div className="text-sm font-semibold text-slate-800">{part.name}</div><div className="mt-1 text-lg font-bold tracking-tight text-[#1d4f91]">{part.partNumber}</div><div className="mt-1 text-xs text-slate-400">{part.filename}</div></div><div className="text-xs text-slate-500"><span className="block uppercase tracking-[.08em] text-slate-400">Modelo</span><b className="mt-1 block text-slate-700">{part.model}</b></div><div className="text-xs text-slate-500"><span className="block uppercase tracking-[.08em] text-slate-400">PNC</span><b className="mt-1 block text-slate-700">{part.pnc||'—'}</b></div></button>)}{!loading&&!parts.length&&<div className="p-5"><Empty title="Nenhuma peça listada" description="Faça uma pesquisa acima para consultar a base indexada."/></div>}</div></div>
      <div className="cv-surface rounded-[22px] p-5"><div className="font-semibold">Catálogos relacionados</div><div className="mt-4 grid gap-2">{documents.map(doc=><div key={doc.id} className="rounded-xl border border-slate-200 p-3"><div className="text-sm font-semibold">{doc.filename}</div><div className="mt-1 text-xs text-slate-400">{doc.model||'—'} · PNC {doc.pnc||'—'} · {doc.partCount} peças</div><button onClick={()=>void accessPdf(doc.id,null,doc.filename)} className="mt-3 text-xs font-semibold text-[#1d4f91]">Abrir catálogo →</button></div>)}{!documents.length&&<div className="text-xs text-slate-400">Catálogos relacionados aparecerão aqui.</div>}</div></div>
    </div>

    {detail&&<div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm md:items-center md:p-6"><div className="max-h-[92vh] w-full max-w-5xl overflow-auto rounded-t-[28px] bg-white shadow-2xl md:rounded-[28px]"><div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur"><div><div className="text-xs font-bold uppercase tracking-[.12em] text-[#1d4f91]">Detalhe da peça</div><div className="mt-1 text-lg font-semibold">{detail.name}</div></div><button onClick={()=>setDetail(null)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">Fechar</button></div><div className="grid gap-6 p-5 lg:grid-cols-[1fr_320px]"><div><div className="rounded-[22px] bg-[#0d2348] p-6 text-white"><div className="text-xs text-slate-400">Código da peça</div><div className="mt-2 text-3xl font-semibold tracking-[-.04em]">{detail.partNumber}</div><div className="mt-5 flex flex-wrap gap-2"><button onClick={()=>void copy(detail.partNumber)} className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-[#0d2348]">Copiar código</button><button onClick={()=>void favorite()} className="rounded-xl border border-white/20 px-3 py-2 text-xs font-semibold">{detail.favoriteId?'★ Favoritada':'☆ Favoritar'}</button><button onClick={()=>void accessPdf(detail.documentId,detail.page,detail.filename)} className="rounded-xl border border-white/20 px-3 py-2 text-xs font-semibold">Abrir no catálogo</button></div></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><Info label="Modelo" value={detail.model}/><Info label="PNC" value={detail.pnc||'—'}/><Info label="Seção" value={detail.section||'—'}/><Info label="Posição / página" value={`${detail.position||'—'} · pág. ${detail.page??'—'}`}/></div><div className="mt-5"><div className="font-semibold">Compatibilidade encontrada</div><div className="mt-3 flex flex-wrap gap-2">{detail.compatibility.map((item,index)=><span key={`${item.model}-${item.pnc}-${index}`} className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800">{item.model} · PNC {item.pnc||'—'}</span>)}</div></div></div><div><div className="rounded-[22px] border border-slate-200 p-4"><div className="text-xs uppercase tracking-[.1em] text-slate-400">Fonte técnica</div><div className="mt-2 text-sm font-semibold">{detail.filename}</div><div className="mt-1 text-xs text-slate-400">{detail.document.manufacturer||'—'} · {detail.document.model||'—'}</div></div><div className="mt-4 rounded-[22px] border border-slate-200 p-4"><div className="font-semibold">Peças relacionadas</div><div className="mt-3 grid gap-2">{detail.related.map(item=><button key={item.id} onClick={()=>void openPart(item.id)} className="rounded-xl bg-slate-50 p-3 text-left"><div className="text-xs font-semibold">{item.name}</div><div className="mt-1 text-xs text-slate-400">{item.partNumber} · posição {item.position||'—'}</div></button>)}</div></div></div></div></div></div>}

    {pdf&&<div className="fixed inset-0 z-[90] bg-slate-950/90 p-3 md:p-6"><div className="mx-auto flex h-full max-w-[1500px] flex-col overflow-hidden rounded-[22px] bg-white"><div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><div><div className="text-sm font-semibold">{pdf.title}</div><div className="text-xs text-slate-400">{pdf.page?`Abrindo na página ${pdf.page}`:'Visualização do catálogo'}</div></div><button onClick={()=>setPdf(null)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">Fechar</button></div><iframe title={pdf.title} src={`${pdf.url}${pdf.page?`#page=${pdf.page}`:''}`} className="h-full w-full border-0"/></div></div>}
  </section>;
}

function Info({label,value}:{label:string;value:string}){return <div className="rounded-[18px] border border-slate-200 bg-white p-4"><div className="text-[10px] font-semibold uppercase tracking-[.1em] text-slate-400">{label}</div><div className="mt-1 text-sm font-semibold text-slate-800">{value}</div></div>}

export function HistoryPanel({onSearch}:{onSearch:(query:string)=>void}){
  const [history,setHistory]=useState<SearchHistoryItem[]>([]);
  const [filter,setFilter]=useState('');
  useEffect(()=>{void (async()=>setHistory((await json<{history:SearchHistoryItem[]}>(await api('/api/history'))).history))()},[]);
  const filtered=useMemo(()=>history.filter(item=>[item.query,item.resultCode,item.resultLabel,item.resultModel,item.resultPnc].some(v=>v?.toLowerCase().includes(filter.toLowerCase()))),[history,filter]);
  return <section><p className="cv-kicker">Continuidade do atendimento</p><h1 className="cv-page-title">Histórico de pesquisas</h1><p className="mt-2 text-sm text-slate-500">Recupere rapidamente uma consulta feita anteriormente por esta conta.</p><div className="cv-surface mt-6 rounded-[22px] p-4"><input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filtrar histórico" className="cv-field max-w-lg text-sm"/></div><div className="cv-surface mt-4 divide-y divide-slate-100 overflow-hidden rounded-[22px]">{filtered.map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-4 p-4"><div><div className="text-sm font-semibold text-slate-800">{item.query}</div><div className="mt-1 text-xs text-slate-400">{item.resultCode?`${item.resultCode} · ${item.resultLabel||''} · ${item.resultModel||''}`:item.status.replaceAll('_',' ')} · {fmtDate(item.createdAt)}</div></div><button onClick={()=>onSearch(item.resultCode||item.query)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-[#1d4f91]">Pesquisar novamente</button></div>)}{!filtered.length&&<div className="p-5"><Empty title="Histórico vazio" description="As pesquisas feitas pelo Assistente IA aparecerão aqui."/></div>}</div></section>;
}

export function FavoritesPanel({onSearch}:{onSearch:(query:string)=>void}){
  const [items,setItems]=useState<FavoriteItem[]>([]);
  const load=async()=>setItems((await json<{favorites:FavoriteItem[]}>(await api('/api/favorites'))).favorites);
  useEffect(()=>{void load()},[]);
  const remove=async(id:string)=>{await json(await api(`/api/favorites/${id}`,{method:'DELETE'}));await load()};
  return <section><p className="cv-kicker">Atalhos pessoais</p><h1 className="cv-page-title">Favoritos</h1><p className="mt-2 text-sm text-slate-500">Mantenha à mão as peças e catálogos consultados com frequência.</p><div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map(item=><div key={item.id} className="cv-surface rounded-[22px] p-5"><div className="text-[10px] font-bold uppercase tracking-[.12em] text-[#1d4f91]">{item.kind==='PART'?'Peça':'Catálogo'}</div><div className="mt-2 text-sm font-semibold text-slate-800">{item.label}</div><div className="mt-2 text-xl font-semibold text-[#1d4f91]">{item.reference||item.model||'Catálogo'}</div><div className="mt-1 text-xs text-slate-400">{item.model||'—'} · PNC {item.pnc||'—'}</div><div className="mt-4 flex gap-2">{item.reference&&<button onClick={()=>onSearch(item.reference!)} className="cv-primary px-3 py-2 text-xs font-semibold">Consultar</button>}<button onClick={()=>void remove(item.id)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500">Remover</button></div></div>)}{!items.length&&<Empty title="Nenhum favorito" description="Favorite uma peça na tela de detalhes para encontrá-la em um clique."/>}</div></section>;
}
