import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, apiJson, fmtDate, json } from '../lib';
import { toast } from 'sonner';
import type { DocumentItem, FavoriteItem } from '../types';
import BatchCatalogUploader from './BatchCatalogUploader';

type CatalogData = { documents: DocumentItem[]; favorites: FavoriteItem[]; categories: string[] };
type StatusFilter = 'ALL' | 'FAILED' | 'REVIEW' | 'READY';

type FailureGuidance = {
  title: string;
  description: string;
  tone: string;
  retryLabel: string;
};

async function fetchCatalogData(admin: boolean, archived: boolean): Promise<CatalogData> {
  const [documentsData, favoritesData] = await Promise.all([
    apiJson<{documents:DocumentItem[];categories:string[]}>(`/api/documents${admin&&archived?'?includeArchived=true':''}`),
    apiJson<{favorites:FavoriteItem[]}>('/api/favorites'),
  ]);
  return {
    documents: documentsData.documents,
    favorites: favoritesData.favorites,
    categories: documentsData.categories || [],
  };
}

function qualityLabel(document:DocumentItem):string {
  if(document.modelNeedsReview)return 'Modelo precisa de conferência';
  if(document.reviewStatus==='REVIEWED')return `Revisado · ${document.healthScore||0}/100`;
  if(document.reviewStatus==='READY')return `Qualidade OK · ${document.healthScore||0}/100`;
  if(document.reviewStatus==='NEEDS_REVIEW')return `Revisar · ${document.healthScore||0}/100`;
  return 'Qualidade pendente';
}

function qualityTone(document:DocumentItem):string {
  if(document.modelNeedsReview)return 'text-rose-700';
  if(document.reviewStatus==='REVIEWED'||document.reviewStatus==='READY')return 'text-emerald-700';
  if(document.reviewStatus==='NEEDS_REVIEW')return 'text-rose-700';
  return 'text-amber-700';
}

function extractionLabel(method?:string|null):string {
  if(!method)return '';
  if(method==='HUSQVARNA_IPL_TEXT')return 'Parser local · sem IA';
  if(method.startsWith('GEMINI:'))return `IA · ${method.replace('GEMINI:','')}`;
  return method;
}

function catalogPncs(document:DocumentItem):string[] {
  return [...new Set([...(document.pncs||[]),document.pnc||''].map(value=>value.trim()).filter(Boolean))];
}

function failureGuidance(document:DocumentItem):FailureGuidance|null {
  if(document.status!=='FAILED')return null;
  const error=(document.processingError||'').toLowerCase();

  if(/cota|quota/.test(error)&&/(ia|gemini)/.test(error)){
    return {
      title:'Cota da IA atingida',
      description:'Este PDF precisa de leitura visual. Aguarde a renovação da cota antes de tentar novamente; se existir um IPL oficial com texto pesquisável, prefira esse arquivo.',
      tone:'border-amber-200 bg-amber-50 text-amber-900',
      retryLabel:'Tentar após renovar cota',
    };
  }
  if(/leitura visual|tabela textual|texto pesquisável|texto pesquisavel/.test(error)){
    return {
      title:'PDF exige leitura visual',
      description:'O parser local não encontrou uma tabela confiável. Tente novamente com IA disponível ou substitua por um IPL oficial com texto pesquisável.',
      tone:'border-amber-200 bg-amber-50 text-amber-900',
      retryLabel:'Tentar leitura novamente',
    };
  }
  if(/fila|rabbit/.test(error)){
    return {
      title:'Fila temporariamente indisponível',
      description:'O arquivo foi preservado. Tente novamente quando o processamento assíncrono estiver disponível.',
      tone:'border-blue-200 dark:border-blue-600 bg-blue-50 dark:bg-[#123867] text-blue-900',
      retryLabel:'Tentar novamente',
    };
  }
  if(/storage|armazen|supabase/.test(error)){
    return {
      title:'Falha de armazenamento',
      description:'Confira o acesso ao storage antes de reprocessar. O sistema não deve substituir nem inventar conteúdo quando o PDF original não está acessível.',
      tone:'border-rose-200 bg-rose-50 text-rose-900',
      retryLabel:'Tentar novamente',
    };
  }
  return {
    title:'Falha de processamento',
    description:'O PDF continua preservado. Consulte o detalhe abaixo e tente novamente somente depois de corrigir a causa indicada.',
    tone:'border-rose-200 bg-rose-50 text-rose-900',
    retryLabel:'Tentar novamente',
  };
}

function matchesStatusFilter(document:DocumentItem,filter:StatusFilter):boolean {
  if(filter==='ALL')return true;
  if(filter==='FAILED')return document.status==='FAILED';
  if(filter==='REVIEW')return document.status==='COMPLETED'&&(Boolean(document.modelNeedsReview)||document.reviewStatus==='NEEDS_REVIEW'||document.reviewStatus==='PENDING');
  return document.status==='COMPLETED'&&!document.modelNeedsReview&&(document.reviewStatus==='READY'||document.reviewStatus==='REVIEWED');
}

export default function CatalogsPanel({admin,onQuality}:{admin:boolean;onQuality?:()=>void}) {
  const [categoryFilter,setCategoryFilter]=useState('ALL');
  const [statusFilter,setStatusFilter]=useState<StatusFilter>('ALL');
  const [search,setSearch]=useState('');
  const [archived,setArchived]=useState(false);
  const [busy,setBusy]=useState(false);
  const [analyzingQuality,setAnalyzingQuality]=useState(false);
  const [actionError,setActionError]=useState('');
  const [pdf,setPdf]=useState<{url:string;title:string}|null>(null);

  const { data, refetch, error: loadError } = useQuery({
    queryKey: ['catalogs', admin, archived],
    queryFn: () => fetchCatalogData(admin, archived),
    refetchInterval: (query) => {
      const currentDocs = query.state.data?.documents || [];
      const processing = currentDocs.some(document => document.processingActive || ['PENDING', 'PROCESSING'].includes(document.status));
      return processing ? 8000 : false;
    },
  });

  const docs = useMemo(() => data?.documents || [], [data?.documents]);
  const favorites = useMemo(() => data?.favorites || [], [data?.favorites]);
  const categories = useMemo(() => data?.categories || [], [data?.categories]);

  const error = actionError || (loadError instanceof Error ? loadError.message : loadError ? 'Erro ao carregar catálogos.' : '');
  const setError = setActionError;

  const load = async () => { await refetch(); };

  const activeDocs=useMemo(()=>docs.filter(document=>archived||!document.archivedAt),[docs,archived]);
  const processing = activeDocs.some(document=>document.processingActive||['PENDING','PROCESSING'].includes(document.status));
  const qualityPending=useMemo(()=>activeDocs.filter(document=>document.status==='COMPLETED'&&(!document.qualityCheckedAt||document.reviewStatus==='PENDING'||!document.healthScore)).length,[activeDocs]);
  const failedCount=useMemo(()=>activeDocs.filter(document=>document.status==='FAILED').length,[activeDocs]);
  const reviewCount=useMemo(()=>activeDocs.filter(document=>document.status==='COMPLETED'&&(document.modelNeedsReview||document.reviewStatus==='NEEDS_REVIEW'||document.reviewStatus==='PENDING')).length,[activeDocs]);
  const readyCount=useMemo(()=>activeDocs.filter(document=>document.status==='COMPLETED'&&!document.modelNeedsReview&&(document.reviewStatus==='READY'||document.reviewStatus==='REVIEWED')).length,[activeDocs]);
  const categoryCounts=useMemo(()=>{
    const counts=new Map<string,number>();
    for(const document of activeDocs)counts.set(document.category,(counts.get(document.category)||0)+1);
    return counts;
  },[activeDocs]);
  const visibleCategories=useMemo(()=>categories.filter(category=>(categoryCounts.get(category)||0)>0),[categories,categoryCounts]);
  const effectiveCategoryFilter=categoryFilter==='ALL'||categories.includes(categoryFilter)?categoryFilter:'ALL';
  const normalizedSearch=search.trim().toLowerCase();
  const filtered=useMemo(()=>activeDocs.filter(document=>{
    if(!matchesStatusFilter(document,statusFilter)||(effectiveCategoryFilter!=='ALL'&&document.category!==effectiveCategoryFilter))return false;
    if(!normalizedSearch)return true;
    const baseMatch=[document.filename,document.manufacturer,document.model,document.pnc,document.category]
      .some(value=>value?.toLowerCase().includes(normalizedSearch));
    return baseMatch||catalogPncs(document).some(value=>value.toLowerCase().includes(normalizedSearch));
  }),[activeDocs,effectiveCategoryFilter,normalizedSearch,statusFilter]);
  const favoritesByDocument=useMemo(()=>new Map(favorites.filter(item=>item.documentId).map(item=>[item.documentId!,item])),[favorites]);

  const flash=(text:string)=>{toast.success(text);};
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

  const analyzeQuality=async()=>{
    setAnalyzingQuality(true);setError('');
    try{
      const response=await apiJson<{message:string}>('/api/admin/quality/rebuild-knowledge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({limit:500})});
      await load();flash(response.message||'Qualidade dos catálogos atualizada.');
    }catch(analyzeError){setError(analyzeError instanceof Error?analyzeError.message:'Não foi possível analisar os catálogos.');}
    finally{setAnalyzingQuality(false);}
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

  const setCategory=async(document:DocumentItem,category:string)=>{
    if(category===document.category)return;
    setBusy(true);setError('');
    try {
      await apiJson(`/api/documents/${document.id}/category`,{
        method:'PATCH',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({category}),
      });
      await load();
      flash(`Catálogo movido para ${category}.`);
    } catch(categoryError) {
      setError(categoryError instanceof Error?categoryError.message:'Não foi possível alterar a seção do catálogo.');
    } finally {setBusy(false);}
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

  const statusButtons:Array<[StatusFilter,string,number]>=[
    ['ALL','Todos',activeDocs.length],
    ['FAILED','Falhas',failedCount],
    ['REVIEW','Revisar',reviewCount],
    ['READY','Prontos',readyCount],
  ];

  return <section>
    <div className="cv-page-heading">
      <div><p className="cv-kicker">Biblioteca técnica</p><h1 className="cv-page-title">Catálogos</h1><p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">Consulte os manuais por família de máquina, favorite os mais usados e acompanhe o processamento dos PDFs.</p></div>
      {admin&&<label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400"><input type="checkbox" checked={archived} onChange={event=>setArchived(event.target.checked)}/> Mostrar arquivados</label>}
    </div>
    {error&&<div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

    <div className="mb-5 grid gap-3 rounded-[22px] border border-blue-200 dark:border-blue-600/80 bg-[linear-gradient(135deg,#eff6ff,#f8fbff)] p-4 text-xs leading-5 text-slate-600 dark:text-slate-400 md:grid-cols-[auto_1fr]">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#173f76] font-bold text-white">PNC</div>
      <div><b className="text-slate-900 dark:text-slate-100">Modelo e PNC são dados diferentes.</b> O modelo identifica a família da máquina; o PNC identifica uma variante de produto. Um IPL pode não imprimir PNC, trazer um único PNC ou reunir vários. Números de série permanecem como faixa de aplicação e não são mostrados como PNC.</div>
    </div>

    {admin&&<BatchCatalogUploader onComplete={load} onNotice={flash} onError={setError}/>} 

    {admin&&failedCount>0&&!archived&&<div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
      <div><div className="text-sm font-semibold text-amber-950">{failedCount} catálogo{failedCount===1?' precisa':'s precisam'} de recuperação</div><p className="mt-1 text-xs leading-5 text-amber-800">Veja o motivo classificado e a próxima ação recomendada antes de repetir o processamento.</p></div>
      <button type="button" onClick={()=>setStatusFilter('FAILED')} className="rounded-xl border border-amber-300 bg-white dark:bg-slate-800 px-4 py-2.5 text-xs font-semibold text-amber-900">Ver falhas</button>
    </div>}

    {admin&&qualityPending>0&&!archived&&<div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 dark:border-blue-600 bg-blue-50 dark:bg-[#123867]/60 p-4">
      <div><div className="text-sm font-semibold text-blue-950">{qualityPending} catálogo{qualityPending===1?' ainda precisa':'s ainda precisam'} da análise de qualidade</div><p className="mt-1 text-xs leading-5 text-blue-800">A análise usa somente as peças já extraídas: organiza família, cria memória técnica e calcula saúde. Não reabre o PDF e não consome Gemini.</p></div>
      <button type="button" disabled={analyzingQuality||processing} onClick={()=>void analyzeQuality()} className="rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{analyzingQuality?'Atualizando…':'Atualizar diagnóstico'}</button>
    </div>}

    <div className="cv-surface mb-6 rounded-[22px] p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><div className="font-semibold text-slate-800 dark:text-slate-200">Biblioteca por seção</div><p className="mt-1 text-xs leading-5 text-slate-400">Os catálogos são classificados automaticamente. Clique em uma seção para visualizar somente aquela família.</p></div>
        <div className="text-xs font-medium text-slate-400">{activeDocs.length} catálogo{activeDocs.length===1?'':'s'}</div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <button type="button" onClick={()=>setCategoryFilter('ALL')} className={`rounded-2xl border px-4 py-3 text-left transition ${effectiveCategoryFilter==='ALL'?'border-slate-700 bg-slate-900 text-white':'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:border-slate-600'}`}>
          <div className="text-sm font-semibold">Todos</div><div className={`mt-1 text-xs ${effectiveCategoryFilter==='ALL'?'text-slate-300':'text-slate-400'}`}>{activeDocs.length} catálogo{activeDocs.length===1?'':'s'}</div>
        </button>
        {visibleCategories.map(category=>{
          const count=categoryCounts.get(category)||0;
          const selected=effectiveCategoryFilter===category;
          return <button key={category} type="button" onClick={()=>setCategoryFilter(category)} className={`rounded-2xl border px-4 py-3 text-left transition ${selected?'border-slate-700 bg-slate-900 text-white':'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:border-slate-600'}`}>
            <div className="text-sm font-semibold">{category}</div><div className={`mt-1 text-xs ${selected?'text-slate-300':'text-slate-400'}`}>{count} catálogo{count===1?'':'s'}</div>
          </button>;
        })}
      </div>
    </div>

    <div className="cv-surface overflow-hidden rounded-[22px]">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 dark:border-slate-700 p-4">
        <div className="min-w-0 flex-1"><label htmlFor="catalog-search" className="sr-only">Buscar catálogos</label><input id="catalog-search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar por arquivo, fabricante, modelo, PNC ou seção" className="cv-field w-full max-w-xl text-sm"/></div>
        <div className="flex flex-wrap gap-1.5">{statusButtons.map(([value,label,count])=><button key={value} type="button" onClick={()=>setStatusFilter(value)} className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${statusFilter===value?'border-slate-800 bg-slate-900 text-white':'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:border-slate-600'}`}>{label} · {count}</button>)}</div>
        {effectiveCategoryFilter!=='ALL'&&<button type="button" onClick={()=>setCategoryFilter('ALL')} className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400">Limpar seção</button>}
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1160px] text-sm"><thead className="bg-slate-50/80 text-left text-[11px] uppercase tracking-[.08em] text-slate-400"><tr><th className="p-4">Catálogo</th><th>Seção</th><th>Modelo / PNC</th><th>Status / qualidade</th><th>Peças</th><th className="p-4">Ações</th></tr></thead><tbody>
        {filtered.map(document=>{
          const recovery=failureGuidance(document);
          const pncs=catalogPncs(document);
          return <tr key={document.id} className="border-t border-slate-100 dark:border-slate-800 transition hover:bg-slate-50/60">
          <td className="p-4"><div className="flex items-start gap-2"><button type="button" title="Favoritar" aria-label={favoritesByDocument.has(document.id)?`Remover ${document.filename} dos favoritos`:`Favoritar ${document.filename}`} disabled={Boolean(document.archivedAt)} onClick={()=>void toggleFavorite(document)} className="text-lg leading-5 text-amber-500 disabled:opacity-30">{favoritesByDocument.has(document.id)?'★':'☆'}</button><div><b className="font-semibold text-slate-800 dark:text-slate-200">{document.filename}</b><div className="mt-1 text-xs text-slate-400">{document.manufacturer||'Fabricante não informado'} · {fmtDate(document.createdAt)}</div>{document.extractionMethod&&<div className="mt-1 text-[10px] font-medium text-slate-400">{extractionLabel(document.extractionMethod)}</div>}{document.archivedAt&&<span className="text-xs text-rose-600">Arquivado</span>}</div></div></td>
          <td className="pr-4">{admin?<select aria-label={`Seção de ${document.filename}`} disabled={busy||document.processingActive} value={document.category} onChange={event=>void setCategory(document,event.target.value)} className="max-w-[220px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 disabled:opacity-50">{categories.map(category=><option key={category} value={category}>{category}</option>)}</select>:<span className="rounded-full bg-slate-100 dark:bg-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">{document.category}</span>}</td>
          <td className="pr-4 text-slate-600 dark:text-slate-400"><div className={document.modelNeedsReview?'font-semibold text-rose-700':'font-medium text-slate-700 dark:text-slate-300'}>{document.model||'Modelo não confirmado'}</div>{document.suggestedModel&&<div className="mt-1 text-[10px] font-semibold text-blue-700">Sugestão: {document.suggestedModel}</div>}{pncs.length?<div className="mt-1.5"><div className="text-[10px] font-semibold uppercase tracking-[.06em] text-slate-400">{pncs.length===1?'PNC':'PNCs encontrados'}{pncs.length>1?` · ${pncs.length}`:''}</div><div className="mt-1 flex max-w-[280px] flex-wrap gap-1" title={pncs.join(', ')}>{pncs.slice(0,4).map(value=><span key={value} className="rounded-md bg-blue-50 dark:bg-[#123867] px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">{value}</span>)}{pncs.length>4&&<span className="rounded-md bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">+{pncs.length-4}</span>}</div></div>:<div className="mt-1 text-[10px] text-slate-400">PNC não identificado no PDF</div>}</td>
          <td className="pr-4"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${badge(document)}`}>{statusLabel(document)}</span>{document.status==='COMPLETED'&&<div className={`mt-1 text-[10px] font-semibold ${qualityTone(document)}`}>{qualityLabel(document)}</div>}{document.reviewReasons?.[0]&&document.reviewStatus==='NEEDS_REVIEW'&&<div className="mt-1 max-w-72 text-[10px] leading-4 text-rose-600">{document.reviewReasons[0]}</div>}{recovery&&<div className={`mt-2 max-w-80 rounded-xl border p-2.5 text-[10px] leading-4 ${recovery.tone}`}><b className="block text-[11px]">{recovery.title}</b><span className="mt-1 block opacity-80">{recovery.description}</span>{document.processingError&&<details className="mt-1.5 opacity-75"><summary className="cursor-pointer font-semibold">Detalhe técnico</summary><div className="mt-1">{document.processingError}</div></details>}</div>}{!recovery&&document.processingError&&<div className="mt-1 max-w-72 text-[10px] leading-4 text-slate-500 dark:text-slate-400">{document.processingError}</div>}</td>
          <td className="pr-4 text-slate-600 dark:text-slate-400">{document.partCount}</td>
          <td className="p-4"><div className="flex flex-wrap gap-2">
            {document.status==='COMPLETED'&&!document.archivedAt&&<><button type="button" onClick={()=>void access(document.id,'view',document.filename)} className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium">Visualizar</button><button type="button" onClick={()=>void access(document.id,'download',document.filename)} className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium">Baixar</button></>}
            {admin&&!document.archivedAt&&<>{document.status==='COMPLETED'&&document.modelNeedsReview&&onQuality&&<button type="button" onClick={onQuality} className="rounded-lg border border-blue-200 dark:border-blue-600 bg-blue-50 dark:bg-[#123867] px-2.5 py-1.5 text-xs font-semibold text-blue-700">Corrigir dados</button>}<button type="button" disabled={busy||document.processingActive||['PENDING','PROCESSING'].includes(document.status)} onClick={()=>void action(document.id,'reprocess')} className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40">{document.status==='COMPLETED'?'Reextrair peças':recovery?.retryLabel||'Tentar novamente'}</button><button type="button" disabled={busy||document.processingActive} onClick={()=>void action(document.id,'archive')} className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-600 disabled:opacity-40">Arquivar</button><button type="button" disabled={busy||document.processingActive} onClick={()=>void removePdf(document)} className="rounded-lg border border-rose-300 px-2.5 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-40">Excluir PDF</button></>}
            {admin&&document.archivedAt&&<button type="button" disabled={busy} onClick={()=>void action(document.id,'restore')} className="rounded-lg border border-emerald-200 px-2.5 py-1.5 text-xs font-medium text-emerald-700">Restaurar</button>}
          </div></td>
        </tr>})}
      </tbody></table>{!filtered.length&&<div className="p-10 text-center text-sm text-slate-400">Nenhum catálogo encontrado com estes filtros.</div>}</div>
    </div>

    {pdf&&<div className="fixed inset-0 z-[90] bg-slate-950/90 p-3 md:p-6"><div className="mx-auto flex h-full max-w-[1500px] flex-col overflow-hidden rounded-[22px] bg-white dark:bg-slate-800"><div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-4 py-3"><div><div className="text-sm font-semibold">{pdf.title}</div><div className="text-xs text-slate-400">Visualizador técnico</div></div><button type="button" onClick={()=>setPdf(null)} className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm">Fechar</button></div><iframe title={pdf.title} src={pdf.url} className="h-full w-full border-0"/></div></div>}
  </section>;
}
