import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api, apiJson, fmtDate, json } from '../lib';
import type { DocumentItem, FavoriteItem } from '../types';

type CatalogData = { documents: DocumentItem[]; favorites: FavoriteItem[] };

async function fetchCatalogData(admin: boolean, archived: boolean): Promise<CatalogData> {
  const [documentsData, favoritesData] = await Promise.all([
    apiJson<{documents:DocumentItem[]}>(`/api/documents${admin&&archived?'?includeArchived=true':''}`),
    apiJson<{favorites:FavoriteItem[]}>('/api/favorites'),
  ]);
  return { documents: documentsData.documents, favorites: favoritesData.favorites };
}

export default function CatalogsPanel({admin}:{admin:boolean}) {
  const [docs,setDocs]=useState<DocumentItem[]>([]);
  const [favorites,setFavorites]=useState<FavoriteItem[]>([]);
  const [search,setSearch]=useState('');
  const [archived,setArchived]=useState(false);
  const [file,setFile]=useState<File|null>(null);
  const [manufacturer,setManufacturer]=useState('');
  const [model,setModel]=useState('');
  const [pnc,setPnc]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [pdf,setPdf]=useState<{url:string;title:string}|null>(null);
  const fileInputRef=useRef<HTMLInputElement|null>(null);

  const applyData=(data:CatalogData)=>{
    setDocs(data.documents);
    setFavorites(data.favorites);
    setError('');
  };
  const load=async()=>applyData(await fetchCatalogData(admin,archived));

  useEffect(()=>{
    let active=true;
    void fetchCatalogData(admin,archived)
      .then(data=>{if(active)applyData(data)})
      .catch(loadError=>{if(active)setError(loadError instanceof Error?loadError.message:'Erro ao carregar catálogos.')});
    return()=>{active=false};
  },[admin,archived]);

  const processing=docs.some(document=>document.processingActive||['PENDING','PROCESSING'].includes(document.status));
  useEffect(()=>{
    if(!processing)return;
    let active=true;
    const refresh=()=>{void fetchCatalogData(admin,archived).then(data=>{if(active)applyData(data)}).catch(()=>{/* A próxima atualização tentará novamente. */})};
    const timer=window.setInterval(refresh,8_000);
    return()=>{active=false;window.clearInterval(timer)};
  },[admin,archived,processing]);

  const normalizedSearch=search.trim().toLowerCase();
  const filtered=useMemo(()=>docs.filter(document=>(archived||!document.archivedAt)&&[
    document.filename,document.manufacturer,document.model,document.pnc,
  ].some(value=>value?.toLowerCase().includes(normalizedSearch))),[docs,normalizedSearch,archived]);
  const favoritesByDocument=useMemo(()=>new Map(favorites.filter(item=>item.documentId).map(item=>[item.documentId!,item])),[favorites]);

  const flash=(text:string)=>{setNotice(text);window.setTimeout(()=>setNotice(''),1800)};
  const access=async(id:string,mode:'view'|'download',title='Catálogo')=>{
    try {
      const data=await apiJson<{url:string}>(`/api/documents/${id}/access?mode=${mode}`);
      if(mode==='view')setPdf({url:data.url,title});
      else {
        const link=document.createElement('a');
        link.href=data.url;link.target='_blank';link.rel='noopener noreferrer';link.click();
      }
    } catch(accessError) {
      setError(accessError instanceof Error?accessError.message:'Não foi possível abrir o catálogo.');
    }
  };

  const toggleFavorite=async(document:DocumentItem)=>{
    try {
      const current=favoritesByDocument.get(document.id);
      if(current){
        await json(await api(`/api/favorites/${current.id}`,{method:'DELETE'}));
        flash('Catálogo removido dos favoritos.');
      } else {
        await apiJson('/api/favorites',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({documentId:document.id})});
        flash('Catálogo adicionado aos favoritos.');
      }
      await load();
    } catch(favoriteError) {
      setError(favoriteError instanceof Error?favoriteError.message:'Não foi possível atualizar o favorito.');
    }
  };

  const action=async(id:string,actionName:'archive'|'restore'|'reprocess')=>{
    if(actionName==='archive'&&!window.confirm('Arquivar este catálogo? Ele deixará de aparecer nas buscas, mas poderá ser restaurado.'))return;
    setBusy(true);setError('');
    try {
      await json(await api(`/api/documents/${id}/${actionName}`,{method:'POST'}));
      await load();
      flash(actionName==='reprocess'?'Reprocessamento iniciado.':actionName==='archive'?'Catálogo arquivado.':'Catálogo restaurado.');
    } catch(actionError) {
      setError(actionError instanceof Error?actionError.message:'Não foi possível concluir a ação.');
    } finally { setBusy(false); }
  };

  const removePdf=async(document:DocumentItem)=>{
    if(!window.confirm(`Excluir definitivamente o PDF "${document.filename}"? O arquivo não poderá ser restaurado, mas o registro de auditoria será mantido.`))return;
    setBusy(true);setError('');
    try {
      await json(await api(`/api/documents/${document.id}`,{method:'DELETE'}));
      await load();
      flash('PDF excluído com segurança.');
    } catch(removeError) {
      setError(removeError instanceof Error?removeError.message:'Não foi possível excluir o PDF.');
    } finally { setBusy(false); }
  };

  const upload=async(event:FormEvent)=>{
    event.preventDefault();
    if(!file)return;
    if(file.size>50*1024*1024){setError('O PDF deve ter no máximo 50 MB.');return;}
    if(!file.name.toLowerCase().endsWith('.pdf')){setError('Selecione um arquivo com extensão .pdf.');return;}

    setBusy(true);setError('');
    const form=new FormData();
    form.append('file',file);
    if(manufacturer.trim())form.append('manufacturer',manufacturer.trim());
    if(model.trim())form.append('model',model.trim());
    if(pnc.trim())form.append('pnc',pnc.trim());

    try {
      await apiJson('/api/upload',{method:'POST',body:form,timeoutMs:120_000});
      setFile(null);setManufacturer('');setModel('');setPnc('');
      if(fileInputRef.current)fileInputRef.current.value='';
      await load();
      flash('Catálogo enviado para processamento.');
    } catch(uploadError) {
      setError(uploadError instanceof Error?uploadError.message:'Erro no upload.');
    } finally { setBusy(false); }
  };

  const badge=(document:DocumentItem)=>document.processingActive?'bg-amber-50 text-amber-700':document.status==='COMPLETED'?'bg-emerald-50 text-emerald-700':document.status==='FAILED'?'bg-rose-50 text-rose-700':'bg-amber-50 text-amber-700';
  const statusLabel=(document:DocumentItem)=>{
    if(document.processingActive){
      if(document.processingStage==='QUEUED_REEXTRACT')return 'Na fila para reextração';
      if(document.processingStage==='DOWNLOADING')return 'Preparando PDF';
      if(document.processingStage==='EXTRACTING')return 'Extraindo peças';
      if(document.processingStage==='AI_EXTRACTION')return 'Lendo páginas com IA';
      if(document.processingStage==='INDEXING')return `Indexando ${document.processingCurrent||0}/${document.processingTotal||0}`;
      if(document.processingStage==='RETRYING')return 'Nova tentativa agendada';
      return document.status==='PENDING'?'Na fila':'Processando';
    }
    if(document.status==='COMPLETED'&&document.processingStage==='READY_WITHOUT_EMBEDDINGS')return 'Pronto · índice pendente';
    return document.status==='COMPLETED'?'Pronto':document.status==='PROCESSING'?'Processando':document.status==='PENDING'?'Na fila':'Falhou';
  };

  return <section>
    {notice&&<div role="status" className="fixed right-5 top-20 z-50 rounded-xl bg-slate-950 px-4 py-2.5 text-sm text-white shadow-xl">{notice}</div>}
    <div className="mb-6 flex flex-wrap justify-between gap-4">
      <div><p className="cv-kicker">Biblioteca técnica</p><h1 className="cv-page-title">Catálogos</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">Consulte os manuais dentro do CogniVault, favorite os mais usados e acompanhe o processamento dos PDFs.</p></div>
      {admin&&<label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={archived} onChange={event=>setArchived(event.target.checked)}/> Mostrar arquivados</label>}
    </div>
    {error&&<div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

    {admin&&<form onSubmit={upload} className="cv-surface mb-6 rounded-[22px] p-5">
      <div className="mb-1 font-semibold">Adicionar catálogo</div><p className="mb-4 text-xs text-slate-400">O CogniVault extrai primeiro as peças e libera a busca textual. A IA visual só é usada quando o PDF não possui tabela pesquisável. Limite: 50 MB.</p>
      <div className="grid gap-3 md:grid-cols-4">
        <input ref={fileInputRef} aria-label="Arquivo PDF" type="file" accept="application/pdf,.pdf" onChange={event=>setFile(event.target.files?.[0]||null)} required className="cv-field text-sm"/>
        <input aria-label="Fabricante" value={manufacturer} onChange={event=>setManufacturer(event.target.value)} placeholder="Fabricante" className="cv-field text-sm"/>
        <input aria-label="Modelo" value={model} onChange={event=>setModel(event.target.value)} placeholder="Modelo" className="cv-field text-sm"/>
        <input aria-label="PNC" value={pnc} onChange={event=>setPnc(event.target.value)} placeholder="PNC (se souber)" className="cv-field text-sm"/>
      </div>
      <button disabled={busy} className="cv-primary mt-4 px-4 py-2.5 text-sm font-semibold disabled:opacity-50">{busy?'Enviando…':'Enviar PDF'}</button>
    </form>}

    <div className="cv-surface overflow-hidden rounded-[22px]">
      <div className="border-b border-slate-200 p-4"><label htmlFor="catalog-search" className="sr-only">Buscar catálogos</label><input id="catalog-search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar por arquivo, fabricante, modelo ou PNC" className="cv-field max-w-xl text-sm"/></div>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50/80 text-left text-[11px] uppercase tracking-[.08em] text-slate-400"><tr><th className="p-4">Catálogo</th><th>Modelo / PNC</th><th>Status</th><th>Peças</th><th className="p-4">Ações</th></tr></thead><tbody>
        {filtered.map(document=><tr key={document.id} className="border-t border-slate-100 transition hover:bg-slate-50/60">
          <td className="p-4"><div className="flex items-start gap-2"><button type="button" title="Favoritar" aria-label={favoritesByDocument.has(document.id)?`Remover ${document.filename} dos favoritos`:`Favoritar ${document.filename}`} disabled={Boolean(document.archivedAt)} onClick={()=>void toggleFavorite(document)} className="text-lg leading-5 text-amber-500 disabled:opacity-30">{favoritesByDocument.has(document.id)?'★':'☆'}</button><div><b className="font-semibold text-slate-800">{document.filename}</b><div className="mt-1 text-xs text-slate-400">{document.manufacturer||'Fabricante não informado'} · {fmtDate(document.createdAt)}</div>{document.archivedAt&&<span className="text-xs text-rose-600">Arquivado</span>}</div></div></td>
          <td className="text-slate-600">{document.model||'—'}<div className="text-xs text-slate-400">PNC {document.pnc||'—'}</div></td>
          <td><span className={`rounded-full px-2 py-1 text-xs font-semibold ${badge(document)}`}>{statusLabel(document)}</span>{document.processingError&&<div className="mt-1 max-w-72 text-[10px] leading-4 text-slate-500">{document.processingError}</div>}</td>
          <td className="text-slate-600">{document.partCount}</td>
          <td className="p-4"><div className="flex flex-wrap gap-2">
            {document.status==='COMPLETED'&&!document.archivedAt&&<><button type="button" onClick={()=>void access(document.id,'view',document.filename)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium">Visualizar</button><button type="button" onClick={()=>void access(document.id,'download',document.filename)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium">Baixar</button></>}
            {admin&&!document.archivedAt&&<><button type="button" disabled={busy||document.processingActive||['PENDING','PROCESSING'].includes(document.status)} onClick={()=>void action(document.id,'reprocess')} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40">{document.status==='COMPLETED'?'Reextrair peças':'Tentar novamente'}</button><button type="button" disabled={busy||document.processingActive} onClick={()=>void action(document.id,'archive')} className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-600 disabled:opacity-40">Arquivar</button><button type="button" disabled={busy||document.processingActive} onClick={()=>void removePdf(document)} className="rounded-lg border border-rose-300 px-2.5 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-40">Excluir PDF</button></>}
            {admin&&document.archivedAt&&<button type="button" disabled={busy} onClick={()=>void action(document.id,'restore')} className="rounded-lg border border-emerald-200 px-2.5 py-1.5 text-xs font-medium text-emerald-700">Restaurar</button>}
          </div></td>
        </tr>)}
      </tbody></table>{!filtered.length&&<div className="p-10 text-center text-sm text-slate-400">Nenhum catálogo encontrado.</div>}</div>
    </div>

    {pdf&&<div className="fixed inset-0 z-[90] bg-slate-950/90 p-3 md:p-6"><div className="mx-auto flex h-full max-w-[1500px] flex-col overflow-hidden rounded-[22px] bg-white"><div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><div><div className="text-sm font-semibold">{pdf.title}</div><div className="text-xs text-slate-400">Visualizador técnico</div></div><button type="button" onClick={()=>setPdf(null)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">Fechar</button></div><iframe title={pdf.title} src={pdf.url} className="h-full w-full border-0"/></div></div>}
  </section>;
}
