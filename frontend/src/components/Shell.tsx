import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { api, fmtDate, json } from '../lib';
import type { NotificationItem, Role, Section, SessionUser } from '../types';

type Props = {
  user: SessionUser;
  section: Section;
  onSection: (section: Section) => void;
  onLogout: () => void;
  onSearch: (query: string) => void;
  children: ReactNode;
};

const nav = (role: Role) => [
  ['home', 'Início'] as const,
  ['assistant', 'Assistente IA'] as const,
  ['parts', 'Peças'] as const,
  ['catalogs', 'Catálogos'] as const,
  ['history', 'Histórico'] as const,
  ['favorites', 'Favoritos'] as const,
  ...(role === 'ADMIN'
    ? [['overview', 'Administração'] as const, ['users', 'Usuários'] as const, ['feedback', 'Feedback IA'] as const, ['audit', 'Auditoria'] as const]
    : []),
];

export default function Shell({ user, section, onSection, onLogout, onSearch, children }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const loadNotifications = async () => {
    try { setNotifications((await json<{notifications:NotificationItem[]}>(await api('/api/notifications'))).notifications); } catch { setNotifications([]); }
  };

  useEffect(()=>{void loadNotifications();const timer=window.setInterval(()=>void loadNotifications(),30000);return()=>window.clearInterval(timer)},[]);
  useEffect(()=>{const handler=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();document.getElementById('cv-global-search')?.focus()}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler)},[]);

  const select = (next: Section) => { onSection(next); setMenuOpen(false); };
  const submit=(event:FormEvent)=>{event.preventDefault();if(!search.trim())return;onSearch(search.trim());setSearch('')};

  const sidebar = (
    <aside className="relative flex h-full flex-col overflow-hidden bg-[#081a35] text-white">
      <div className="pointer-events-none absolute -bottom-12 -right-32 w-[460px] opacity-[.025]"><img src="/husqvarna-logo.webp" alt="" className="w-full grayscale brightness-0 invert" /></div>
      <div className="relative z-10 flex items-center gap-3 px-5 pb-5 pt-6">
        <img src="/favicon.png" alt="CogniVault" className="h-10 w-10 rounded-xl object-cover ring-1 ring-white/10" />
        <div className="min-w-0"><div className="font-semibold tracking-tight">CogniVault</div><div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[.2em] text-slate-500">Parts Intelligence</div></div>
      </div>
      <div className="relative z-10 px-4"><div className="rounded-2xl border border-white/[.07] bg-white/[.035] px-3.5 py-3"><div className="text-[10px] font-bold uppercase tracking-[.14em] text-amber-200">Vardão Máquinas</div><div className="mt-1 text-xs leading-5 text-slate-400">Base técnica interna para peças, catálogos e PNC.</div></div></div>
      <nav className="relative z-10 mt-6 grid gap-1 px-3">
        {nav(user.role).map(([id, label]) => {
          const active = section === id;
          return <button key={id} onClick={() => select(id)} className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${active ? 'bg-white/[.1] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]' : 'text-slate-400 hover:bg-white/[.055] hover:text-slate-100'}`}><span className={`h-1.5 w-1.5 rounded-full transition ${active ? 'bg-amber-300' : 'bg-slate-600 group-hover:bg-slate-400'}`} /><span className={active ? 'font-semibold' : 'font-medium'}>{label}</span></button>;
        })}
      </nav>
      <div className="relative z-10 mt-auto px-4 pb-5 pt-6"><div className="rounded-2xl border border-white/[.07] bg-black/[.08] p-3.5"><div className="truncate text-xs font-semibold text-slate-200">{user.email}</div><div className="mt-1 text-[10px] uppercase tracking-[.12em] text-slate-500">{user.role === 'ADMIN' ? 'Administrador' : 'Balcão'}</div><button onClick={onLogout} className="mt-3 text-xs font-semibold text-rose-300 transition hover:text-rose-200">Sair da conta</button></div></div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-[#f4f7fb] lg:grid lg:grid-cols-[252px_1fr]">
      <div className="hidden h-screen lg:sticky lg:top-0 lg:block">{sidebar}</div>
      {menuOpen && <div className="fixed inset-0 z-50 lg:hidden"><button aria-label="Fechar menu" onClick={() => setMenuOpen(false)} className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]" /><div className="relative h-full w-[282px] max-w-[84vw] shadow-2xl">{sidebar}</div></div>}

      <main className="min-w-0">
        <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/92 backdrop-blur-xl">
          <div className="flex min-h-16 items-center gap-3 px-4 sm:px-6 md:px-8">
            <button onClick={() => setMenuOpen(true)} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-lg text-slate-600 shadow-sm lg:hidden">☰</button>
            <form onSubmit={submit} className="relative min-w-0 flex-1 md:max-w-2xl"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">⌕</span><input id="cv-global-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar peça, código, modelo ou PNC…" className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2.5 pl-9 pr-16 text-sm outline-none transition focus:border-[#1d4f91] focus:bg-white focus:ring-4 focus:ring-blue-500/10"/><span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-400 sm:block">Ctrl K</span></form>
            <div className="ml-auto flex items-center gap-2">
              <img src="/vardao-logo.webp" alt="Vardão Máquinas" className="brand-logo-clean hidden h-8 w-auto max-w-[135px] object-contain xl:block" />
              <div className="relative"><button onClick={()=>{setNotificationsOpen(v=>!v);void loadNotifications()}} aria-label="Notificações" className="relative grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50">♢{notifications.length>0&&<span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-[#1d4f91] px-1 text-[9px] font-bold leading-4 text-white">{Math.min(notifications.length,9)}</span>}</button>{notificationsOpen&&<div className="absolute right-0 top-12 z-50 w-[340px] max-w-[88vw] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"><div className="border-b border-slate-100 px-4 py-3"><div className="text-sm font-semibold">Notificações</div><div className="text-xs text-slate-400">Atualizações operacionais do CogniVault</div></div><div className="max-h-[420px] overflow-auto">{notifications.map(item=><div key={item.id} className="border-b border-slate-100 p-4 last:border-0"><div className={`text-xs font-semibold ${item.type==='error'?'text-rose-700':item.type==='processing'?'text-amber-700':'text-slate-700'}`}>{item.title}</div><div className="mt-1 text-xs text-slate-500">{item.description}</div><div className="mt-1 text-[10px] text-slate-400">{fmtDate(item.createdAt)}</div></div>)}{!notifications.length&&<div className="p-6 text-center text-xs text-slate-400">Nenhuma atualização importante agora.</div>}</div></div>}</div>
              <div className="hidden rounded-xl border border-slate-200 bg-white px-3 py-2 sm:block"><div className="max-w-[170px] truncate text-xs font-semibold text-slate-800">{user.tenant.name}</div><div className="text-[10px] text-slate-400">{user.role==='ADMIN'?'Administrador':'Balcão'}</div></div>
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-[1500px] p-4 sm:p-6 md:p-8 lg:p-9">{children}</div>
      </main>
    </div>
  );
}
