import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, fmtDate, json } from '../lib';
import type { AdminUser, AuditLog, Overview, Role } from '../types';

export function OverviewPanel(){
  const [data,setData]=useState<Overview|null>(null);
  useEffect(()=>{void (async()=>setData((await json<{overview:Overview}>(await api('/api/admin/overview'))).overview))()},[]);
  const cards=data?[
    ['Catálogos ativos',data.activeDocuments],
    ['Peças indexadas',data.parts],
    ['Usuários ativos',data.users],
    ['Acerto confirmado',data.feedbackAccuracy===null?'—':`${Math.round(data.feedbackAccuracy*100)}%`],
  ]:[];

  return <section>
    <div className="rounded-[28px] bg-gradient-to-r from-[#0d2348] to-[#1d4f91] p-6 md:p-8 text-white mb-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
        <div><p className="text-xs font-bold uppercase tracking-[.15em] text-amber-200">Administração</p><h1 className="text-3xl font-bold mt-2">Visão geral do CogniVault</h1><p className="text-sm text-slate-200 mt-3 max-w-2xl leading-6">Acompanhe catálogos, peças indexadas, qualidade da IA e acessos da equipe da Vardão Máquinas.</p></div>
        <div className="flex items-center gap-3"><img src="/vardao-logo.webp" alt="Vardão Máquinas" className="h-12 w-auto rounded bg-white p-1"/><img src="/husqvarna-logo.webp" alt="Husqvarna" className="h-12 w-auto rounded"/></div>
      </div>
    </div>
    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">{cards.map(([key,value])=><div key={String(key)} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm"><div className="text-sm text-slate-500">{key}</div><div className="text-3xl font-bold mt-2 text-slate-900">{value}</div></div>)}</div>
    {data&&<div className="grid md:grid-cols-3 gap-4 mt-4"><div className="bg-amber-50 rounded-2xl p-5"><b>{data.processingDocuments}</b><div className="text-sm text-amber-800">em processamento</div></div><div className="bg-rose-50 rounded-2xl p-5"><b>{data.failedDocuments}</b><div className="text-sm text-rose-800">com falha</div></div><div className="bg-blue-50 rounded-2xl p-5"><b>{data.feedbackTotal}</b><div className="text-sm text-blue-800">feedbacks da equipe</div></div></div>}
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

  const load=async()=>setUsers((await json<{users:AdminUser[]}>(await api('/api/admin/users'))).users);
  useEffect(()=>{void load()},[]);
  const create=async(event:FormEvent)=>{event.preventDefault();setError('');try{await json(await api('/api/admin/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,role})}));setEmail('');setPassword('');await load()}catch(err){setError(err instanceof Error?err.message:'Erro ao criar usuário')}};
  const update=async(id:string,patch:object)=>{try{await json(await api(`/api/admin/users/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)}));await load()}catch(err){setError(err instanceof Error?err.message:'Erro ao alterar usuário')}};
  const reset=async(event:FormEvent,id:string)=>{event.preventDefault();if(passwordDraft.length<6){setError('A nova senha precisa ter pelo menos 6 caracteres.');return;}await update(id,{password:passwordDraft});setPasswordDraft('');setPasswordUser(null)};

  return <section>
    <p className="text-xs font-bold uppercase tracking-[.15em] text-[#1d4f91]">Controle de acesso</p><h1 className="text-2xl font-bold mt-1">Usuários</h1><p className="text-sm text-slate-500 mt-2">Crie usuários, altere perfis, bloqueie acessos e redefina senhas diretamente pelo painel administrativo.</p>
    <form onSubmit={create} className="bg-white border rounded-2xl p-5 mt-6 shadow-sm"><div className="font-semibold mb-3">Novo acesso</div>{error&&<div className="text-sm text-rose-600 mb-3">{error}</div>}<div className="grid md:grid-cols-[1fr_1fr_180px_auto] gap-3"><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="email@empresa.com" className="border rounded-xl px-3 py-2"/><input required minLength={6} type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Senha inicial" className="border rounded-xl px-3 py-2"/><select value={role} onChange={e=>setRole(e.target.value as Role)} className="border rounded-xl px-3 py-2"><option value="MECHANIC">Usuário da loja</option><option value="ADMIN">Administrador</option></select><button className="bg-[#1d4f91] text-white rounded-xl px-4 font-semibold">Criar</button></div></form>
    <div className="bg-white border rounded-2xl overflow-x-auto mt-5 shadow-sm"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-slate-500"><tr><th className="p-4">Usuário</th><th>Perfil</th><th>Status</th><th>Feedback</th><th className="p-4">Ações</th></tr></thead><tbody>{users.map(user=><tr key={user.id} className="border-t align-top"><td className="p-4"><b>{user.email}</b><div className="text-xs text-slate-400">desde {fmtDate(user.createdAt)}</div></td><td className="pt-4">{user.role==='ADMIN'?'Administrador':'Usuário'}</td><td className="pt-4">{user.status}</td><td className="pt-4">{user.feedbackCount}</td><td className="p-4 min-w-[320px]"><div className="flex flex-wrap gap-2"><button onClick={()=>void update(user.id,{role:user.role==='ADMIN'?'MECHANIC':'ADMIN'})} className="border rounded-lg px-2 py-1">Trocar perfil</button><button onClick={()=>void update(user.id,{status:user.status==='APPROVED'?'REJECTED':'APPROVED'})} className="border rounded-lg px-2 py-1">{user.status==='APPROVED'?'Bloquear':'Ativar'}</button><button onClick={()=>{setPasswordUser(passwordUser===user.id?null:user.id);setPasswordDraft('')}} className="border rounded-lg px-2 py-1">Redefinir senha</button></div>{passwordUser===user.id&&<form onSubmit={e=>void reset(e,user.id)} className="mt-3 flex gap-2"><input minLength={6} value={passwordDraft} onChange={e=>setPasswordDraft(e.target.value)} placeholder="Nova senha" className="min-w-0 flex-1 border rounded-lg px-2 py-1.5"/><button className="rounded-lg bg-[#1d4f91] px-3 py-1.5 text-white">Salvar</button></form>}</td></tr>)}</tbody></table></div>
  </section>;
}

export function AuditPanel(){
  const [logs,setLogs]=useState<AuditLog[]>([]);
  useEffect(()=>{void (async()=>setLogs((await json<{logs:AuditLog[]}>(await api('/api/admin/audit'))).logs))()},[]);
  const label=(action:string)=>({DOCUMENT_UPLOADED:'Catálogo enviado',DOCUMENT_ARCHIVED:'Catálogo arquivado',DOCUMENT_RESTORED:'Catálogo restaurado',DOCUMENT_REPROCESSED:'Catálogo reprocessado',USER_CREATED:'Usuário criado',USER_UPDATED:'Usuário alterado'}[action]||action);
  return <section><p className="text-xs font-bold uppercase tracking-[.15em] text-[#1d4f91]">Rastreabilidade</p><h1 className="text-2xl font-bold mt-1">Auditoria</h1><div className="bg-white border rounded-2xl mt-6 divide-y shadow-sm">{logs.map(log=><div key={log.id} className="p-4 flex flex-wrap justify-between gap-3"><div><b className="text-sm">{label(log.action)}</b><div className="text-xs text-slate-400 mt-1">{log.user?.email||'Sistema'} · {log.targetType}</div></div><div className="text-xs text-slate-500">{fmtDate(log.createdAt)}</div></div>)}{!logs.length&&<div className="p-8 text-sm text-slate-400 text-center">Nenhuma ação registrada.</div>}</div></section>;
}
