import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, apiJson, fmtDate, json } from '../lib';
import type { AdminUser, AuditLog, Overview, Role } from '../types';

function fetchUsers() {
  return apiJson<{users:AdminUser[]}>('/api/admin/users');
}

export function OverviewPanel(){
  const [data,setData]=useState<Overview|null>(null);
  useEffect(()=>{void (async()=>setData((await json<{overview:Overview}>(await api('/api/admin/overview'))).overview))()},[]);
  const cards=data?[
    ['Catálogos ativos',data.activeDocuments,'Base disponível para a equipe'],
    ['Peças indexadas',data.parts,'Itens prontos para consulta'],
    ['Usuários ativos',data.users,'Acessos habilitados'],
    ['Acerto confirmado',data.feedbackAccuracy===null?'—':`${Math.round(data.feedbackAccuracy*100)}%`,'Precisão validada pelo balcão'],
  ]:[];

  return <section>
    <div className="relative mb-6 overflow-hidden rounded-[30px] bg-[#0b1d3a] p-6 text-white shadow-[0_18px_60px_rgba(15,35,72,.16)] md:p-8">
      <div className="absolute -right-24 top-1/2 w-[460px] -translate-y-1/2 opacity-[.035]"><img src="/husqvarna-logo.webp" alt="" className="w-full grayscale brightness-0 invert"/></div>
      <div className="relative z-10 max-w-2xl">
        <p className="text-[10px] font-bold uppercase tracking-[.16em] text-amber-200">Painel administrativo</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-.04em] md:text-[2.35rem]">Visão geral do CogniVault</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">Indicadores essenciais da operação técnica da Vardão Máquinas em uma visão limpa e objetiva.</p>
      </div>
    </div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(([key,value,description])=><div key={String(key)} className="cv-surface rounded-[22px] p-5"><div className="text-xs font-semibold uppercase tracking-[.09em] text-slate-400">{key}</div><div className="mt-3 text-3xl font-semibold tracking-[-.04em] text-slate-950">{value}</div><div className="mt-2 text-xs leading-5 text-slate-400">{description}</div></div>)}
    </div>

    {data&&<div className="mt-4 grid gap-4 md:grid-cols-3"><div className="rounded-[20px] border border-amber-200 dark:border-amber-800/60 bg-amber-50/70 dark:bg-amber-900/30 p-5"><div className="text-2xl font-semibold text-amber-950">{data.processingDocuments}</div><div className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-300">Em processamento</div></div><div className="rounded-[20px] border border-rose-200 dark:border-rose-800/60 bg-rose-50/70 dark:bg-rose-900/30 p-5"><div className="text-2xl font-semibold text-rose-950">{data.failedDocuments}</div><div className="mt-1 text-xs font-medium text-rose-800 dark:text-rose-300">Com falha</div></div><div className="rounded-[20px] border border-blue-200 dark:border-blue-600/60 bg-blue-50 dark:bg-[#123867]/70 p-5"><div className="text-2xl font-semibold text-blue-950">{data.feedbackTotal}</div><div className="mt-1 text-xs font-medium text-blue-800 dark:text-blue-300">Feedbacks registrados</div></div></div>}
  </section>;
}

export function UsersPanel(){
  const [users,setUsers]=useState<AdminUser[]>([]);
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [role,setRole]=useState<Role>('MECHANIC');
  const [error,setError]=useState('');
  const [passwordUser,setPasswordUser]=useState<string|null>(null);
  const [passwordDraft,setPasswordDraft]=useState('');

  const load=async()=>setUsers((await fetchUsers()).users);
  useEffect(()=>{
    let active=true;
    void fetchUsers().then(data=>{if(active)setUsers(data.users)}).catch(loadError=>{if(active)setError(loadError instanceof Error?loadError.message:'Erro ao carregar usuários.')});
    return()=>{active=false};
  },[]);
  const create=async(event:FormEvent)=>{event.preventDefault();setError('');try{await json(await api('/api/admin/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,role})}));setEmail('');setPassword('');setRole('MECHANIC');await load()}catch(err){setError(err instanceof Error?err.message:'Erro ao criar usuário')}};
  const update=async(id:string,patch:object)=>{try{await json(await api(`/api/admin/users/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)}));await load()}catch(err){setError(err instanceof Error?err.message:'Erro ao alterar usuário')}};
  const reset=async(event:FormEvent,id:string)=>{event.preventDefault();if(passwordDraft.length<6){setError('A nova senha precisa ter pelo menos 6 caracteres.');return;}await update(id,{password:passwordDraft});setPasswordDraft('');setPasswordUser(null)};

  return <section>
    <p className="cv-kicker">Controle de acesso</p><h1 className="cv-page-title">Usuários</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">A empresa trabalha com dois perfis simples: Administrador e Balcão. Crie acessos, bloqueie contas e redefina senhas por aqui.</p>
    <form onSubmit={create} className="cv-surface mt-6 rounded-[22px] p-5"><div className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Novo acesso</div>{error&&<div className="mb-4 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/30 px-3 py-2.5 text-sm text-rose-700 dark:text-rose-300">{error}</div>}<div className="grid gap-3 md:grid-cols-[1fr_1fr_180px_auto]"><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="email@empresa.com" className="cv-field text-sm"/><input required minLength={6} type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Senha inicial" className="cv-field text-sm"/><select value={role} onChange={e=>setRole(e.target.value as Role)} className="cv-field text-sm"><option value="MECHANIC">Balcão</option><option value="ADMIN">Administrador</option></select><button className="cv-primary px-5 py-2.5 text-sm font-semibold">Criar</button></div></form>
    <div className="cv-surface cv-scrollbar mt-5 overflow-x-auto rounded-[22px]"><table className="w-full text-sm"><thead className="border-b border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800 text-left text-[11px] font-semibold uppercase tracking-[.08em] text-slate-400"><tr><th className="p-4">Usuário</th><th>Perfil</th><th>Status</th><th>Feedback</th><th className="p-4">Ações</th></tr></thead><tbody>{users.map(user=><tr key={user.id} className="border-t border-slate-100 dark:border-slate-800 align-top transition hover:bg-slate-50/60 dark:bg-slate-800"><td className="p-4"><b className="font-semibold text-slate-800 dark:text-slate-200">{user.email}</b><div className="mt-1 text-xs text-slate-400">desde {fmtDate(user.createdAt)}</div></td><td className="pt-4 text-slate-600 dark:text-slate-400">{user.role==='ADMIN'?'Administrador':'Balcão'}</td><td className="pt-4 text-slate-600 dark:text-slate-400">{user.status==='APPROVED'?'Ativo':user.status==='REJECTED'?'Bloqueado':'Pendente'}</td><td className="pt-4 text-slate-600 dark:text-slate-400">{user.feedbackCount}</td><td className="min-w-[320px] p-4"><div className="flex flex-wrap gap-2"><button onClick={()=>void update(user.id,{role:user.role==='ADMIN'?'MECHANIC':'ADMIN'})} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-800/50">{user.role==='ADMIN'?'Tornar Balcão':'Tornar Admin'}</button><button onClick={()=>void update(user.id,{status:user.status==='APPROVED'?'REJECTED':'APPROVED'})} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-800/50">{user.status==='APPROVED'?'Bloquear':'Ativar'}</button><button onClick={()=>{setPasswordUser(passwordUser===user.id?null:user.id);setPasswordDraft('')}} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-800/50">Redefinir senha</button></div>{passwordUser===user.id&&<form onSubmit={e=>void reset(e,user.id)} className="mt-3 flex gap-2"><input minLength={6} value={passwordDraft} onChange={e=>setPasswordDraft(e.target.value)} placeholder="Nova senha" className="cv-field min-w-0 flex-1 py-2 text-xs"/><button className="cv-primary px-3 py-2 text-xs font-semibold">Salvar</button></form>}</td></tr>)}</tbody></table></div>
  </section>;
}

export function AuditPanel(){
  const [logs,setLogs]=useState<AuditLog[]>([]);
  useEffect(()=>{void (async()=>setLogs((await json<{logs:AuditLog[]}>(await api('/api/admin/audit'))).logs))()},[]);
  const label=(action:string)=>({DOCUMENT_UPLOADED:'Catálogo enviado',DOCUMENT_ARCHIVED:'Catálogo arquivado',DOCUMENT_RESTORED:'Catálogo restaurado',DOCUMENT_REPROCESSED:'Catálogo reprocessado',USER_CREATED:'Usuário criado',USER_UPDATED:'Usuário alterado'}[action]||action);
  return <section><p className="cv-kicker">Rastreabilidade</p><h1 className="cv-page-title">Auditoria</h1><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Histórico das principais ações administrativas do ambiente.</p><div className="cv-surface mt-6 divide-y divide-slate-100 overflow-hidden rounded-[22px]">{logs.map(log=><div key={log.id} className="flex flex-wrap justify-between gap-3 p-4 transition hover:bg-slate-50/50 dark:bg-slate-800"><div><b className="text-sm font-semibold text-slate-800 dark:text-slate-200">{label(log.action)}</b><div className="mt-1 text-xs text-slate-400">{log.user?.email||'Sistema'} · {log.targetType}</div></div><div className="text-xs text-slate-500 dark:text-slate-400">{fmtDate(log.createdAt)}</div></div>)}{!logs.length&&<div className="p-10 text-center text-sm text-slate-400">Nenhuma ação registrada.</div>}</div></section>;
}
