import type { ReactNode } from 'react';
import type { Role, Section, SessionUser } from '../types';

type Props={ user:SessionUser; section:Section; onSection:(s:Section)=>void; onLogout:()=>void; children:ReactNode };
const nav=(role:Role)=>[
  ...(role==='ADMIN'?[['overview','Visão geral'] as const]:[]),
  ['assistant','Assistente IA'] as const,
  ['catalogs','Catálogos'] as const,
  ...(role==='ADMIN'?[['users','Usuários'] as const,['audit','Auditoria'] as const]:[]),
];
export default function Shell({user,section,onSection,onLogout,children}:Props){
  return <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[250px_1fr]">
    <aside className="bg-slate-950 text-white p-5 lg:min-h-screen"><div className="flex items-center gap-3 mb-8"><div className="w-10 h-10 rounded-xl bg-indigo-600 grid place-items-center font-bold">C</div><div><b>CogniVault</b><div className="text-[10px] tracking-[.18em] text-slate-500">PARTS INTELLIGENCE</div></div></div><nav className="grid gap-1">{nav(user.role).map(([id,label])=><button key={id} onClick={()=>onSection(id)} className={`text-left rounded-xl px-3 py-2.5 text-sm transition ${section===id?'bg-white/10 text-white':'text-slate-400 hover:bg-white/5 hover:text-white'}`}>{label}</button>)}</nav><div className="mt-8 border-t border-white/10 pt-5 text-xs text-slate-500"><div className="truncate text-slate-300">{user.email}</div><div className="mt-1">{user.role==='ADMIN'?'Administrador':'Usuário da loja'}</div><button onClick={onLogout} className="mt-4 text-rose-300 hover:text-rose-200">Sair</button></div></aside>
    <main className="min-w-0"><header className="h-16 bg-white border-b border-slate-200 px-5 md:px-8 flex items-center justify-between"><div><span className="font-semibold text-slate-900">{user.tenant.name}</span><span className="ml-2 text-xs text-slate-400">Sistema interno de peças</span></div><span className="rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-xs font-semibold">Online</span></header><div className="p-5 md:p-8 max-w-[1500px] mx-auto">{children}</div></main>
  </div>;
}
