import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { apiJson } from '../lib';
import type { NotificationItem, Section, SessionUser } from '../types';
import { useTheme } from './ThemeProvider';
import { useQuoteCart } from '../context/QuoteCartContext';
import { isSoundEnabled, toggleSound, playCartSound } from '../lib/sound';

type Props = {
  user: SessionUser;
  section: Section;
  onSection: (section: Section) => void;
  onLogout: () => void;
  onSearch: (query: string) => void;
  children: ReactNode;
};




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

function SoundToggle() {
  const [enabled, setEnabled] = useState(() => isSoundEnabled());
  const toggle = () => {
    const next = toggleSound();
    setEnabled(next);
    if (next) playCartSound();
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={enabled ? 'Silenciar feedback sonoro do balcão' : 'Ativar feedback sonoro de balcão'}
      title={enabled ? 'Sons do balcão ativados (Clique para silenciar)' : 'Sons do balcão desativados (Clique para ativar)'}
      className={`cv-icon-button transition ${enabled ? 'text-amber-500 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500 opacity-60 hover:opacity-100'}`}
    >
      <span className="text-sm" aria-hidden="true">{enabled ? '🔔' : '🔕'}</span>
    </button>
  );
}

function fetchNotifications() { return apiJson<{ notifications: NotificationItem[] }>('/api/notifications'); }

export default function Shell({ user, section, onSection, onLogout, onSearch, children }: Props) {

  const [search, setSearch] = useState('');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const quoteCart = useQuoteCart();

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

  useHotkeys('ctrl+b, meta+b, alt+o', (event) => {
    event.preventDefault();
    quoteCart.setIsOpen(!quoteCart.isOpen);
  }, { enableOnFormTags: true });

  useHotkeys('shift+?, ?', (event) => {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    event.preventDefault();
    setShortcutsOpen(prev => !prev);
  });

  useHotkeys('escape', () => {
    setNotificationsOpen(false);
    setShortcutsOpen(false);
  }, { enableOnFormTags: true });

  const select = (next: Section) => { onSection(next); };
  const submit = (event: FormEvent) => { event.preventDefault(); if (search.trim().length < 2) return; onSearch(search.trim()); setSearch(''); };


  return (
    <div className="cv-app-shell min-h-screen flex flex-col bg-[#f4f7fb] dark:bg-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl shadow-sm">
        <div className="flex min-h-[70px] items-center gap-4 px-4 sm:px-6 md:px-8">
          {/* Logo / Home Button */}
          <button 
            type="button" 
            onClick={() => { setSearch(''); onSection('home'); }}
            className="flex items-center gap-3 transition-opacity hover:opacity-80"
          >
            <img src="/favicon.png" alt="" className="h-8 w-8 rounded-lg object-cover shadow-sm" />
            <div className="hidden sm:block text-left">
              <div className="text-sm font-bold tracking-tight text-slate-900 dark:text-white leading-tight">CogniVault</div>
              <div className="text-[9px] font-bold uppercase tracking-[.15em] text-[#1d4f91] dark:text-blue-400">Husqvarna B2B</div>
            </div>
          </button>

          {/* Search Bar (Visible only when not on home screen) */}
          <div className={`flex-1 transition-all duration-300 ${section === 'home' ? 'opacity-0 invisible w-0' : 'opacity-100 visible max-w-3xl ml-4'}`}>
            <form role="search" onSubmit={submit} className="relative w-full">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-4-4" />
              </svg>
              <input
                id="cv-global-search"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Buscar código, peça ou PNC…"
                minLength={2}
                className="w-full rounded-[14px] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-2.5 pl-10 pr-20 text-sm font-medium outline-none transition focus:border-[#1d4f91] focus:bg-white dark:bg-slate-900 focus:ring-4 focus:ring-blue-500/10 shadow-inner"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} aria-label="Limpar busca" className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 transition hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-700 dark:text-slate-200">
                  Limpar
                </button>
              )}
            </form>
          </div>

          <div className={`${section === 'home' ? 'ml-auto' : ''} flex items-center gap-2`}>
            {user.role === 'ADMIN' && (
              <div className="hidden lg:flex items-center gap-1 mr-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                 {adminNav.map(([id, label]) => (
                   <button
                     key={id}
                     onClick={() => select(id)}
                     className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-colors ${section === id ? 'bg-white dark:bg-slate-700 text-[#1d4f91] dark:text-blue-300 shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                   >
                     {label}
                   </button>
                 ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => quoteCart.setIsOpen(true)}
              aria-label="Abrir Cesta de Orçamento"
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition shadow-sm active:scale-95 ${
                quoteCart.totalItems > 0
                  ? 'bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 shadow-amber-500/20'
                  : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <span className="text-sm" aria-hidden="true">🛒</span>
              <span className="hidden sm:inline">Orçamento</span>
              {quoteCart.totalItems > 0 && (
                <span className="rounded-full bg-slate-950 px-1.5 py-0.5 text-[10px] font-black text-amber-400 leading-none">
                  {quoteCart.totalItems}
                </span>
              )}
            </button>

            <SoundToggle />
            <ThemeToggle />

            <div className="relative">
              <button
                type="button"
                onClick={() => { setNotificationsOpen(value => !value); refreshNotifications(); }}
                className="cv-icon-button relative"
              >
                <BellIcon />
                {notifications.length > 0 && (
                  <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-[#1d4f91] dark:bg-blue-500 px-1 text-[9px] font-bold leading-4 text-white shadow-sm">
                    {Math.min(notifications.length, 9)}
                  </span>
                )}
              </button>
              {notificationsOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setNotificationsOpen(false)} aria-hidden="true" />
                  <div className="absolute right-0 top-12 z-50 w-[360px] max-w-[88vw] overflow-hidden rounded-[20px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-2xl">
                    <div className="border-b border-slate-100 dark:border-slate-800 px-4 py-3">
                      <div className="text-sm font-semibold">Notificações</div>
                    </div>
                    <div className="cv-scrollbar max-h-[420px] overflow-auto">
                      {notifications.map(item => (
                        <div key={item.id} className="border-b border-slate-100 dark:border-slate-800 p-4 last:border-0">
                          <div className="text-xs font-semibold">{item.title}</div>
                          <div className="mt-1 text-xs text-slate-500">{item.description}</div>
                        </div>
                      ))}
                      {!notifications.length && (
                        <div className="p-8 text-center text-sm text-slate-500">Nenhuma notificação.</div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <button type="button" onClick={onLogout} className="ml-2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200" title="Sair">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 min-w-0 flex flex-col">
        {children}
      </main>

      {/* Shortcuts Modal (unchanged interior logic) */}
      {shortcutsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onClick={() => setShortcutsOpen(false)}>
           <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
             <h3 className="text-lg font-bold">Atalhos</h3>
             <button onClick={() => setShortcutsOpen(false)} className="mt-4 px-4 py-2 bg-[#1d4f91] text-white rounded-lg">Fechar</button>
           </div>
        </div>
      )}
    </div>
  );
}
