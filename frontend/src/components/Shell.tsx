import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { apiJson, fmtDate } from '../lib';
import type { NotificationItem, Section, SessionUser } from '../types';
import { useTheme } from './ThemeProvider';

type Props = {
  user: SessionUser;
  section: Section;
  onSection: (section: Section) => void;
  onLogout: () => void;
  onSearch: (query: string) => void;
  children: ReactNode;
};

type NavItem = readonly [Section, string];

const operationNav: NavItem[] = [
  ['home', 'Início'],
  ['parts', 'Peças e busca'],
  ['catalogs', 'Catálogos'],
  ['history', 'Histórico'],
  ['favorites', 'Favoritos'],
];

const adminNav: NavItem[] = [
  ['overview', 'Visão geral'],
  ['users', 'Usuários'],
  ['feedback', 'Feedback da busca'],
  ['quality', 'Confiabilidade'],
  ['audit', 'Auditoria'],
];

const sectionLabels = new Map<Section, string>([...operationNav, ...adminNav]);

function NavIcon({ section }: { section: Section }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const paths: Partial<Record<Section, ReactNode>> = {
    home: <><path d="M3.5 10.8 12 3.9l8.5 6.9"/><path d="M5.5 9.7v10h13v-10M9.5 19.7v-6h5v6"/></>,
    assistant: <><path d="m12 3 1.1 3.3L16.5 7.5l-3.4 1.2L12 12l-1.1-3.3-3.4-1.2 3.4-1.2L12 3Z"/><path d="m18.3 13.2.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7.7-2.1Z"/><path d="m5.5 13 .8 2.4 2.4.8-2.4.8-.8 2.4-.8-2.4-2.4-.8 2.4-.8.8-2.4Z"/></>,
    parts: <><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="m4 7v10l8 4 8-4V7M12 11v10"/></>,
    catalogs: <><path d="M4.5 4.5A3.5 3.5 0 0 1 8 3h4v16H8a3.5 3.5 0 0 0-3.5 2V4.5Z"/><path d="M19.5 4.5A3.5 3.5 0 0 0 16 3h-4v16h4a3.5 3.5 0 0 1 3.5 2V4.5Z"/></>,
    history: <><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8M5.4 5.4 3 5.6l.2-2.4"/></>,
    favorites: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>,
    overview: <><path d="M4 19V9M10 19V4M16 19v-7M22 19H2"/></>,
    users: <><path d="M15.5 20v-1.8a4.2 4.2 0 0 0-4.2-4.2H6.2A4.2 4.2 0 0 0 2 18.2V20"/><circle cx="8.8" cy="7" r="4"/><path d="M17 10a3.6 3.6 0 0 0 0-6.9M22 20v-1.8a4.2 4.2 0 0 0-3.1-4"/></>,
    feedback: <><path d="M20 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v9Z"/><path d="M8 8h8M8 12h5"/></>,
    quality: <><path d="M4 18V8M9 18V4M14 18v-6M19 18v-9"/><path d="M3 21h18"/><path d="m4 7 5-3 5 6 5-3"/></>,
    audit: <><path d="M12 3 4.5 6v5.5c0 4.7 3.2 7.9 7.5 9.5 4.3-1.6 7.5-4.8 7.5-9.5V6L12 3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" {...common}>{paths[section]}</svg>;
}

function BellIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>;
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const toggle = () => setTheme(theme === 'dark' ? 'light' : 'dark');
  return (
    <button type="button" onClick={toggle} aria-label="Alternar tema escuro" className="cv-icon-button">
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
      )}
    </button>
  );
}

function fetchNotifications() { return apiJson<{ notifications: NotificationItem[] }>('/api/notifications'); }

export default function Shell({ user, section, onSection, onLogout, onSearch, children }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const currentLabel = sectionLabels.get(section) || 'CogniVault';
  const initials = user.email.slice(0, 2).toUpperCase();

  const refreshNotifications = () => { void fetchNotifications().then(data => setNotifications(data.notifications)).catch(() => setNotifications([])); };
  useEffect(() => {
    let active = true;
    const refresh = () => { void fetchNotifications().then(data => { if (active) setNotifications(data.notifications); }).catch(() => { if (active) setNotifications([]); }); };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useHotkeys('ctrl+k, meta+k', (event) => {
    event.preventDefault();
    const searchField = document.getElementById('cv-global-search') as HTMLInputElement | null;
    searchField?.focus();
    searchField?.select();
  }, { enableOnFormTags: true });

  useHotkeys('escape', () => {
    setNotificationsOpen(false);
    setMenuOpen(false);
  }, { enableOnFormTags: true });

  const select = (next: Section) => { onSection(next); setMenuOpen(false); };
  const submit = (event: FormEvent) => { event.preventDefault(); if (search.trim().length < 2) return; onSearch(search.trim()); setSearch(''); };
  const renderNav = (items: NavItem[]) => items.map(([id, label]) => {
    const active = section === id;
    return <button type="button" key={id} onClick={() => select(id)} aria-current={active ? 'page' : undefined} className={`group flex w-full items-center gap-3 rounded-[13px] px-3 py-2.5 text-left text-sm transition ${active ? 'bg-white dark:bg-slate-800 font-semibold text-[#123867] dark:text-blue-200 shadow-[0_8px_24px_rgba(0,0,0,.16)]' : 'font-medium text-slate-300 hover:bg-white/10 hover:text-white'}`}><span className={`grid h-7 w-7 place-items-center rounded-lg transition ${active ? 'bg-[#eaf2fc] text-[#1d4f91] dark:text-blue-300' : 'text-slate-400 group-hover:text-white'}`}><NavIcon section={id}/></span><span>{label}</span></button>;
  });

  const sidebar = <aside className="flex h-full flex-col overflow-hidden border-r border-white/10 bg-[linear-gradient(180deg,#0b1d3a_0%,#102b52_100%)] text-white shadow-[18px_0_60px_rgba(15,35,72,.12)]">
    <div className="px-5 pb-4 pt-6"><img src="/vardao-logo-transparent.png" alt="Vardão Máquinas" className="h-auto w-[154px] brightness-0 invert"/><div className="mt-5 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.07] p-3"><img src="/favicon.png" alt="" className="h-9 w-9 rounded-xl object-cover shadow-sm"/><div className="min-w-0"><div className="text-sm font-semibold tracking-tight text-white">CogniVault</div><div className="mt-0.5 text-[9px] font-bold uppercase tracking-[.16em] text-blue-200/60">Inteligência de peças</div></div></div></div>
    <nav aria-label="Navegação principal" className="cv-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pb-4"><div className="px-3 pb-2 pt-2 text-[10px] font-bold uppercase tracking-[.14em] text-blue-200/45">Operação</div><div className="grid gap-1">{renderNav(operationNav)}</div>{user.role === 'ADMIN' && <><div className="mx-3 my-4 h-px bg-white/10"/><div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[.14em] text-blue-200/45">Administração</div><div className="grid gap-1">{renderNav(adminNav)}</div></>}</nav>
    <div className="border-t border-white/10 p-4"><div className="mb-3 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[.06] p-2.5"><img src="/husqvarna-logo.webp" alt="Husqvarna" className="h-8 w-8 rounded-lg object-cover shadow-sm"/><div><div className="text-[11px] font-semibold text-white">Representante Husqvarna</div><div className="mt-0.5 text-[9px] text-blue-100/55">Assistência e peças</div></div></div><div className="flex items-center gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white dark:bg-slate-800 text-[10px] font-bold text-[#0d2348]">{initials}</div><div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold text-slate-100">{user.email}</div><div className="mt-0.5 text-[9px] uppercase tracking-[.1em] text-blue-100/50">{user.role === 'ADMIN' ? 'Administrador' : 'Balcão'}</div></div><button type="button" onClick={onLogout} className="rounded-lg px-2 py-1.5 text-[11px] font-semibold text-slate-400 transition hover:bg-white/10 hover:text-white">Sair</button></div></div>
  </aside>;

  return <div className="cv-app-shell min-h-screen lg:grid lg:grid-cols-[276px_1fr]">
    <div className="hidden h-screen lg:sticky lg:top-0 lg:block">{sidebar}</div>
    {menuOpen && <div className="fixed inset-0 z-50 lg:hidden"><button type="button" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]"/><div className="relative h-full w-[292px] max-w-[86vw] shadow-2xl">{sidebar}</div></div>}
    <main className="min-w-0"><header className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-700/70 bg-[#f8fbff]/90 dark:bg-slate-900/90 backdrop-blur-xl"><div className="flex min-h-[70px] items-center gap-3 px-4 sm:px-6 md:px-8"><button type="button" aria-label="Abrir menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)} className="cv-icon-button lg:hidden"><span aria-hidden="true" className="text-lg leading-none">☰</span></button><div className="hidden min-w-[140px] xl:block"><div className="text-[10px] font-bold uppercase tracking-[.15em] text-[#1d4f91] dark:text-blue-300">Área atual</div><div className="mt-0.5 text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">{currentLabel}</div></div>
      <form role="search" onSubmit={submit} className="relative min-w-0 flex-1 xl:max-w-2xl"><svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><label htmlFor="cv-global-search" className="sr-only">Buscar peça, código, modelo ou PNC</label><input id="cv-global-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar peça, código, modelo ou PNC…" minLength={2} required aria-keyshortcuts="Control+K Meta+K" className="w-full rounded-[14px] border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800 py-2.5 pl-10 pr-20 text-sm outline-none transition focus:border-[#1d4f91] focus:bg-white dark:bg-slate-800 focus:ring-4 focus:ring-blue-500/10"/>{search ? <button type="button" onClick={()=>setSearch('')} aria-label="Limpar busca" className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 transition hover:bg-slate-100 dark:bg-slate-700 hover:text-slate-700 dark:text-slate-300">Limpar</button> : <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1.5 py-0.5 text-[9px] font-medium text-slate-400 sm:block">Ctrl K</span>}</form>
      <div className="ml-auto flex items-center gap-2"><ThemeToggle /><div className="relative"><button type="button" onClick={() => { setNotificationsOpen(value => !value); refreshNotifications(); }} aria-label="Notificações" aria-expanded={notificationsOpen} className="cv-icon-button relative"><BellIcon/>{notifications.length > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-[#1d4f91] dark:bg-[#1d4f91]/80 px-1 text-[9px] font-bold leading-4 text-white">{Math.min(notifications.length, 9)}</span>}</button>{notificationsOpen && <><div className="fixed inset-0 z-40" onClick={() => setNotificationsOpen(false)} aria-hidden="true" /><div className="absolute right-0 top-12 z-50 w-[360px] max-w-[88vw] overflow-hidden rounded-[20px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-2xl"><div className="border-b border-slate-100 dark:border-slate-800 px-4 py-3"><div className="text-sm font-semibold">Notificações</div><div className="mt-0.5 text-xs text-slate-400">Atualizações operacionais do CogniVault</div></div><div className="cv-scrollbar max-h-[420px] overflow-auto">{notifications.map(item => <div key={item.id} className="border-b border-slate-100 dark:border-slate-800 p-4 last:border-0"><div className={`text-xs font-semibold ${item.type === 'error' ? 'text-rose-700 dark:text-rose-300' : item.type === 'processing' ? 'text-amber-700 dark:text-amber-300' : 'text-slate-700 dark:text-slate-300'}`}>{item.title}</div><div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{item.description}</div><div className="mt-1.5 text-[10px] text-slate-400">{fmtDate(item.createdAt)}</div></div>)}{!notifications.length && <div className="p-8 text-center"><div className="text-sm font-semibold text-slate-600 dark:text-slate-400">Tudo em dia</div><div className="mt-1 text-xs text-slate-400">Nenhuma atualização importante agora.</div></div>}</div></div></>}</div><div className="hidden items-center gap-2 rounded-[14px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 sm:flex"><span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,.5)]"/><div><div className="max-w-[150px] truncate text-[11px] font-semibold text-slate-700 dark:text-slate-300">{user.tenant.name}</div><div className="text-[9px] text-slate-400">{user.role === 'ADMIN' ? 'Administrador' : 'Balcão'}</div></div></div></div>
    </div></header><div className="mx-auto max-w-[1540px] p-4 sm:p-6 md:p-8 lg:p-10">{children}</div></main>
  </div>;
}
