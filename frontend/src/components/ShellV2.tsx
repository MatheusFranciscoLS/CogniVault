import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { apiJson } from '../lib';
import type { NotificationItem, Section, SessionUser } from '../types';
import { useQuoteCart } from '../context/QuoteCartContext';
import { useCounterSession } from '../context/CounterSessionContext';
import { useTheme } from './ThemeProvider';
import { isSoundEnabled, toggleSound } from '../lib/sound';
import { Icon, type IconName } from './icons/Icon';

type Props = {
  user: SessionUser;
  section: Section;
  onSection: (section: Section) => void;
  onLogout: () => void;
  onSearch: (query: string) => void;
  children: ReactNode;
};

type NavItem = { id: Section; label: string; icon: IconName };

const primaryNav: NavItem[] = [
  { id: 'parts', label: 'Atendimento', icon: 'search' },
  { id: 'machines', label: 'Máquinas', icon: 'machine' },
  { id: 'catalogs', label: 'Catálogos', icon: 'catalog' },
  { id: 'quotes', label: 'Orçamentos', icon: 'quote' },
];

const secondaryNav: NavItem[] = [
  { id: 'favorites', label: 'Favoritos', icon: 'favorite' },
  { id: 'history', label: 'Histórico', icon: 'history' },
];

const adminNav: NavItem[] = [
  { id: 'overview', label: 'Visão geral', icon: 'dashboard' },
  { id: 'users', label: 'Usuários', icon: 'users' },
  { id: 'feedback', label: 'Feedback', icon: 'feedback' },
  { id: 'quality', label: 'Qualidade', icon: 'quality' },
  { id: 'audit', label: 'Auditoria', icon: 'audit' },
];

const sectionTitle = new Map<Section, string>([
  ...primaryNav.map(item => [item.id, item.label] as const),
  ...secondaryNav.map(item => [item.id, item.label] as const),
  ...adminNav.map(item => [item.id, item.label] as const),
  ['home', 'Atendimento'],
  ['assistant', 'Atendimento'],
]);

function NavButton({ item, active, onSelect }: { item: NavItem; active: boolean; onSelect: (section: Section) => void }) {
  return <button type="button" onClick={() => onSelect(item.id)} aria-current={active ? 'page' : undefined} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition ${active ? 'bg-[#eef4fb] text-[#123867] dark:bg-blue-950/40 dark:text-blue-200' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'}`}><Icon name={item.icon} className="h-[17px] w-[17px] shrink-0"/><span className="truncate">{item.label}</span></button>;
}

function CollapsibleNav({ label, items, open, onToggle, section, onSelect }: { label:string; items:NavItem[]; open:boolean; onToggle:()=>void; section:Section; onSelect:(section:Section)=>void }) {
  return <div><button type="button" onClick={onToggle} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-[.12em] text-slate-400 transition hover:bg-slate-50 dark:hover:bg-slate-800/60"><span>{label}</span><Icon name="chevron" className={`h-3.5 w-3.5 transition ${open ? 'rotate-90' : ''}`}/></button>{open && <nav className="mt-1 space-y-1">{items.map(item => <NavButton key={item.id} item={item} active={section === item.id} onSelect={onSelect}/>)}</nav>}</div>;
}

function Notifications({ items, open, onToggle, onClose }: { items:NotificationItem[]; open:boolean; onToggle:()=>void; onClose:()=>void }) {
  return <div className="relative"><button type="button" onClick={onToggle} aria-label="Notificações" aria-expanded={open} className="relative grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:text-[#1d4f91] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"><Icon name="bell" className="h-[17px] w-[17px]"/>{items.length > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900"/>}</button>{open && <><button type="button" aria-label="Fechar notificações" className="fixed inset-0 z-40 cursor-default" onClick={onClose}/><div className="absolute right-0 top-12 z-50 w-[340px] max-w-[88vw] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"><div className="border-b border-slate-100 px-4 py-3 text-sm font-bold dark:border-slate-800">Notificações</div><div className="max-h-[380px] overflow-y-auto">{items.length ? items.map(item => <div key={item.id} className="border-b border-slate-100 px-4 py-3 last:border-0 dark:border-slate-800"><div className="text-xs font-bold text-slate-800 dark:text-slate-100">{item.title}</div><div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{item.description}</div></div>) : <div className="px-5 py-8 text-center text-sm text-slate-400">Nenhuma pendência.</div>}</div></div></>}</div>;
}

function SidebarContent({ user, section, onSelect, onLogout, theme, onToggleTheme, soundEnabled, onToggleSound }: { user:SessionUser; section:Section; onSelect:(section:Section)=>void; onLogout:()=>void; theme:string; onToggleTheme:()=>void; soundEnabled:boolean; onToggleSound:()=>void }) {
  const secondaryActive = secondaryNav.some(item => item.id === section);
  const adminActive = adminNav.some(item => item.id === section);
  const [moreOpen, setMoreOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const showMore = moreOpen || secondaryActive;
  const showAdmin = adminOpen || adminActive;

  return <>
    <div className="flex h-[68px] items-center gap-3 border-b border-slate-200 px-4 dark:border-slate-800"><div className="grid h-9 w-9 place-items-center rounded-lg bg-[#0b1d3a]"><img src="/favicon.png" alt="" className="h-6 w-6 rounded object-cover"/></div><div className="min-w-0"><div className="text-sm font-black tracking-tight text-slate-950 dark:text-white">CogniVault</div><div className="mt-0.5 text-[9px] font-bold uppercase tracking-[.14em] text-[#1d4f91] dark:text-blue-300">Vardão Máquinas</div></div></div>
    <div className="flex-1 overflow-y-auto px-3 py-4"><div className="px-3 pb-2 text-[10px] font-black uppercase tracking-[.15em] text-slate-400">Operação</div><nav className="space-y-1">{primaryNav.map(item => <NavButton key={item.id} item={item} active={section === item.id || ((section === 'home' || section === 'assistant') && item.id === 'parts')} onSelect={onSelect}/>)}</nav><div className="my-3 h-px bg-slate-200 dark:bg-slate-800"/><CollapsibleNav label="Mais" items={secondaryNav} open={showMore} onToggle={() => setMoreOpen(value => !value)} section={section} onSelect={onSelect}/>{user.role === 'ADMIN' && <><div className="my-3 h-px bg-slate-200 dark:bg-slate-800"/><CollapsibleNav label="Administração" items={adminNav} open={showAdmin} onToggle={() => setAdminOpen(value => !value)} section={section} onSelect={onSelect}/></>}</div>
    <div className="border-t border-slate-200 p-3 dark:border-slate-800"><div className="flex items-center gap-2.5 px-1"><div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#123867] text-[10px] font-black text-white">{user.email.slice(0,2).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="truncate text-[11px] font-bold text-slate-800 dark:text-slate-100">{user.email}</div><div className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">{user.role === 'ADMIN' ? 'Administrador' : 'Operação'}</div></div></div><div className="mt-3 grid grid-cols-3 gap-1.5"><button type="button" onClick={onToggleTheme} className="grid h-8 place-items-center rounded-lg border border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-300" aria-label="Alternar tema"><Icon name={theme === 'dark' ? 'sun' : 'moon'} className="h-4 w-4"/></button><button type="button" onClick={onToggleSound} className="grid h-8 place-items-center rounded-lg border border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-300" aria-label={soundEnabled ? 'Desativar sons' : 'Ativar sons'}><Icon name={soundEnabled ? 'sound' : 'mute'} className="h-4 w-4"/></button><button type="button" onClick={onLogout} className="grid h-8 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:text-rose-600 dark:border-slate-700 dark:text-slate-300" aria-label="Sair"><Icon name="logout" className="h-4 w-4"/></button></div></div>
  </>;
}

export default function ShellV2({ user, section, onSection, onLogout, onSearch, children }: Props) {
  const [query, setQuery] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(() => isSoundEnabled());
  const { theme, setTheme } = useTheme();
  const quoteCart = useQuoteCart();
  const { session, hasContext } = useCounterSession();
  const currentTitle = useMemo(() => sectionTitle.get(section) ?? 'CogniVault', [section]);
  const isCounter = section === 'parts' || section === 'home' || section === 'assistant';

  useEffect(() => { let active = true; const load = () => { void apiJson<{notifications:NotificationItem[]}>('/api/notifications').then(data => { if (active) setNotifications(data.notifications ?? []); }).catch(() => { if (active) setNotifications([]); }); }; load(); const timer = window.setInterval(load, 60_000); return () => { active = false; window.clearInterval(timer); }; }, []);

  useHotkeys('ctrl+k, meta+k', event => {
    event.preventDefault();
    if (isCounter) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '/' }));
      return;
    }
    const input = document.getElementById('cv-workspace-search') as HTMLInputElement | null;
    input?.focus();
    input?.select();
  }, { enableOnFormTags:true });
  useHotkeys('ctrl+b, meta+b, alt+o', event => { event.preventDefault(); quoteCart.setIsOpen(!quoteCart.isOpen); }, { enableOnFormTags:true });
  useHotkeys('escape', () => { setMobileOpen(false); setNotificationsOpen(false); }, { enableOnFormTags:true });

  const select = (next: Section) => { onSection(next); setMobileOpen(false); };
  const submitSearch = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const value = query.trim(); if (value.length < 2) return; onSearch(value); setQuery(''); setMobileOpen(false); };
  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');
  const toggleSoundPreference = () => setSoundEnabled(toggleSound());

  return <div className="min-h-screen bg-[#f5f7fb] text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[210px] flex-col border-r border-slate-200 bg-white md:flex dark:border-slate-800 dark:bg-slate-900"><SidebarContent user={user} section={section} onSelect={select} onLogout={onLogout} theme={theme} onToggleTheme={toggleTheme} soundEnabled={soundEnabled} onToggleSound={toggleSoundPreference}/></aside>
    {mobileOpen && <><button type="button" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-sm md:hidden"/><aside className="fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[88vw] flex-col bg-white shadow-2xl md:hidden dark:bg-slate-900"><button type="button" onClick={() => setMobileOpen(false)} className="absolute right-3 top-4 grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-800" aria-label="Fechar menu"><Icon name="close" className="h-4 w-4"/></button><SidebarContent user={user} section={section} onSelect={select} onLogout={onLogout} theme={theme} onToggleTheme={toggleTheme} soundEnabled={soundEnabled} onToggleSound={toggleSoundPreference}/></aside></>}
    <div className="min-h-screen md:pl-[210px]"><header className="sticky top-0 z-30 border-b border-slate-200/90 bg-white/95 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/95"><div className="flex h-[68px] items-center gap-3 px-4 lg:px-5"><button type="button" onClick={() => setMobileOpen(true)} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 md:hidden dark:border-slate-700 dark:bg-slate-900" aria-label="Abrir menu"><Icon name="menu" className="h-[18px] w-[18px]"/></button><div className="hidden min-w-[110px] xl:block"><div className="text-[9px] font-bold uppercase tracking-[.14em] text-slate-400">Área de trabalho</div><div className="mt-0.5 text-sm font-black text-slate-900 dark:text-white">{currentTitle}</div></div>{isCounter ? <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden"><span className={`h-2 w-2 shrink-0 rounded-full ${quoteCart.totalItems > 0 || hasContext || session.customerName ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} /><span className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{session.machineModel || session.pnc || session.customerName ? [session.customerName, session.machineModel, session.pnc ? `PNC ${session.pnc}` : ''].filter(Boolean).join(' · ') : 'Atendimento pronto para iniciar'}</span><span className="hidden text-[10px] text-slate-300 lg:inline">Ctrl K busca</span></div> : <form onSubmit={submitSearch} role="search" className="min-w-0 flex-1"><div className="relative mx-auto max-w-3xl"><Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-slate-400"/><input id="cv-workspace-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar código, descrição, modelo ou PNC" className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-20 text-sm font-medium outline-none transition placeholder:text-slate-400 focus:border-[#1d4f91] focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:focus:bg-slate-900"/><span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-slate-200 bg-white px-2 py-1 text-[9px] font-bold text-slate-400 lg:block dark:border-slate-700 dark:bg-slate-800">Ctrl K</span></div></form>}<button type="button" onClick={() => quoteCart.setIsOpen(true)} className={`flex h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-xs font-bold transition ${quoteCart.totalItems > 0 ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200' : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}><Icon name="quote" className="h-4 w-4"/><span className="hidden sm:inline">Orçamento</span>{quoteCart.totalItems > 0 && <span className="rounded-full bg-[#123867] px-1.5 py-0.5 text-[9px] text-white">{quoteCart.totalItems}</span>}</button><Notifications items={notifications} open={notificationsOpen} onToggle={() => setNotificationsOpen(value => !value)} onClose={() => setNotificationsOpen(false)}/></div></header><main className={`mx-auto w-full px-4 py-5 lg:px-5 lg:py-6 ${isCounter ? 'max-w-[1800px]' : 'max-w-[1500px]'}`}>{children}</main></div>
  </div>;
}
