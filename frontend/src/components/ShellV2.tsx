import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { apiJson } from '../lib';
import type { NotificationItem, Section, SessionUser } from '../types';
import { useQuoteCart } from '../context/QuoteCartContext';
import { useTheme } from './ThemeProvider';
import { isSoundEnabled, toggleSound } from '../lib/sound';

type Props = {
  user: SessionUser;
  section: Section;
  onSection: (section: Section) => void;
  onLogout: () => void;
  onSearch: (query: string) => void;
  children: ReactNode;
};

type NavItem = {
  id: Section;
  label: string;
  icon: IconName;
};

type IconName =
  | 'home'
  | 'search'
  | 'catalog'
  | 'quote'
  | 'history'
  | 'favorite'
  | 'dashboard'
  | 'users'
  | 'feedback'
  | 'quality'
  | 'audit'
  | 'bell'
  | 'sun'
  | 'moon'
  | 'sound'
  | 'mute'
  | 'logout'
  | 'menu'
  | 'close';

const operationNav: NavItem[] = [
  { id: 'home', label: 'Início', icon: 'home' },
  { id: 'parts', label: 'Buscar peças', icon: 'search' },
  { id: 'catalogs', label: 'Catálogos', icon: 'catalog' },
  { id: 'quotes', label: 'Orçamentos', icon: 'quote' },
  { id: 'history', label: 'Histórico', icon: 'history' },
  { id: 'favorites', label: 'Favoritos', icon: 'favorite' },
];

const adminNav: NavItem[] = [
  { id: 'overview', label: 'Visão geral', icon: 'dashboard' },
  { id: 'users', label: 'Usuários', icon: 'users' },
  { id: 'feedback', label: 'Feedback', icon: 'feedback' },
  { id: 'quality', label: 'Qualidade', icon: 'quality' },
  { id: 'audit', label: 'Auditoria', icon: 'audit' },
];

const sectionTitle = new Map<Section, string>([
  ...operationNav.map(item => [item.id, item.label] as const),
  ...adminNav.map(item => [item.id, item.label] as const),
]);

function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  };

  switch (name) {
    case 'home':
      return <svg {...common}><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9" /><path d="M9 20v-6h6v6" /></svg>;
    case 'search':
      return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
    case 'catalog':
      return <svg {...common}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z" /><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z" /></svg>;
    case 'quote':
      return <svg {...common}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>;
    case 'history':
      return <svg {...common}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></svg>;
    case 'favorite':
      return <svg {...common}><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z" /></svg>;
    case 'dashboard':
      return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>;
    case 'users':
      return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3 20c.5-4 2.5-6 6-6s5.5 2 6 6" /><path d="M16 5.5a3 3 0 0 1 0 5.5M17 14c2.3.6 3.7 2.6 4 6" /></svg>;
    case 'feedback':
      return <svg {...common}><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9h8M8 12h5" /></svg>;
    case 'quality':
      return <svg {...common}><path d="m12 3 2.3 4.7 5.2.8-3.8 3.7.9 5.2-4.6-2.5-4.6 2.5.9-5.2-3.8-3.7 5.2-.8z" /></svg>;
    case 'audit':
      return <svg {...common}><path d="M6 3h12v18H6z" /><path d="M9 8h6M9 12h6M9 16h4" /></svg>;
    case 'bell':
      return <svg {...common}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg>;
    case 'sun':
      return <svg {...common}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
    case 'moon':
      return <svg {...common}><path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" /></svg>;
    case 'sound':
      return <svg {...common}><path d="M5 9v6h4l5 4V5L9 9z" /><path d="M17 9.5a4 4 0 0 1 0 5M19.5 7a7 7 0 0 1 0 10" /></svg>;
    case 'mute':
      return <svg {...common}><path d="M5 9v6h4l5 4V5L9 9z" /><path d="m17 9 4 4M21 9l-4 4" /></svg>;
    case 'logout':
      return <svg {...common}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></svg>;
    case 'menu':
      return <svg {...common}><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
    case 'close':
      return <svg {...common}><path d="m6 6 12 12M18 6 6 18" /></svg>;
  }
}

function NavButton({
  item,
  active,
  onSelect,
}: {
  item: NavItem;
  active: boolean;
  onSelect: (section: Section) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      aria-current={active ? 'page' : undefined}
      className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
        active
          ? 'bg-[#eaf2fb] text-[#123867] dark:bg-blue-950/50 dark:text-blue-200'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
      }`}
    >
      <span className={`grid h-8 w-8 place-items-center rounded-lg transition ${
        active
          ? 'bg-white text-[#1d4f91] shadow-sm dark:bg-slate-800 dark:text-blue-300'
          : 'text-slate-400 group-hover:text-[#1d4f91] dark:text-slate-500 dark:group-hover:text-blue-300'
      }`}>
        <Icon name={item.icon} className="h-[18px] w-[18px]" />
      </span>
      <span className="truncate">{item.label}</span>
    </button>
  );
}

function Notifications({
  items,
  open,
  onToggle,
  onClose,
}: {
  items: NotificationItem[];
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="relative grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-[#1d4f91] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
        aria-label="Notificações"
        aria-expanded={open}
      >
        <Icon name="bell" className="h-[18px] w-[18px]" />
        {items.length > 0 && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900" />
        )}
      </button>

      {open && (
        <>
          <button type="button" aria-label="Fechar notificações" className="fixed inset-0 z-40 cursor-default" onClick={onClose} />
          <div className="absolute right-0 top-12 z-50 w-[360px] max-w-[88vw] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <div>
                <div className="text-sm font-bold text-slate-900 dark:text-white">Notificações</div>
                <div className="mt-0.5 text-[11px] text-slate-400">{items.length ? `${items.length} atualizações` : 'Tudo em dia'}</div>
              </div>
            </div>

            <div className="cv-scrollbar max-h-[420px] overflow-y-auto">
              {items.length ? items.map(item => (
                <div key={item.id} className="border-b border-slate-100 px-4 py-3 last:border-0 dark:border-slate-800">
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100">{item.title}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{item.description}</div>
                </div>
              )) : (
                <div className="px-5 py-10 text-center text-sm text-slate-400">Nenhuma notificação no momento.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SidebarContent({
  user,
  section,
  onSelect,
  onLogout,
  theme,
  onToggleTheme,
  soundEnabled,
  onToggleSound,
}: {
  user: SessionUser;
  section: Section;
  onSelect: (section: Section) => void;
  onLogout: () => void;
  theme: string;
  onToggleTheme: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
}) {
  return (
    <>
      <div className="flex h-[72px] items-center gap-3 border-b border-slate-200 px-5 dark:border-slate-800">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#0b1d3a] shadow-sm">
          <img src="/favicon.png" alt="" className="h-7 w-7 rounded-md object-cover" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-black tracking-tight text-slate-950 dark:text-white">CogniVault</div>
          <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[.14em] text-[#1d4f91] dark:text-blue-300">Vardão Máquinas</div>
        </div>
      </div>

      <div className="cv-scrollbar flex-1 overflow-y-auto px-3 py-4">
        <div className="px-3 pb-2 text-[10px] font-black uppercase tracking-[.16em] text-slate-400">Operação</div>
        <nav className="space-y-1">
          {operationNav.map(item => (
            <NavButton key={item.id} item={item} active={section === item.id} onSelect={onSelect} />
          ))}
        </nav>

        {user.role === 'ADMIN' && (
          <>
            <div className="mx-3 my-4 h-px bg-slate-200 dark:bg-slate-800" />
            <div className="px-3 pb-2 text-[10px] font-black uppercase tracking-[.16em] text-slate-400">Administração</div>
            <nav className="space-y-1">
              {adminNav.map(item => (
                <NavButton key={item.id} item={item} active={section === item.id} onSelect={onSelect} />
              ))}
            </nav>
          </>
        )}
      </div>

      <div className="border-t border-slate-200 p-3 dark:border-slate-800">
        <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/60">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#123867] text-xs font-black text-white">
              {user.email.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">{user.email}</div>
              <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {user.role === 'ADMIN' ? 'Administrador' : 'Operação'}
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={onToggleTheme}
              className="grid h-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:text-[#1d4f91] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              title="Alternar tema"
              aria-label="Alternar tema"
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={onToggleSound}
              className="grid h-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:text-[#1d4f91] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              title={soundEnabled ? 'Desativar sons' : 'Ativar sons'}
              aria-label={soundEnabled ? 'Desativar sons' : 'Ativar sons'}
            >
              <Icon name={soundEnabled ? 'sound' : 'mute'} className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="grid h-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-rose-200 hover:text-rose-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              title="Sair"
              aria-label="Sair"
            >
              <Icon name="logout" className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default function ShellV2({
  user,
  section,
  onSection,
  onLogout,
  onSearch,
  children,
}: Props) {
  const [query, setQuery] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(() => isSoundEnabled());
  const { theme, setTheme } = useTheme();
  const quoteCart = useQuoteCart();

  const currentTitle = useMemo(
    () => sectionTitle.get(section) ?? 'CogniVault',
    [section],
  );

  useEffect(() => {
    let active = true;

    const load = () => {
      void apiJson<{ notifications: NotificationItem[] }>('/api/notifications')
        .then(data => {
          if (active) setNotifications(data.notifications ?? []);
        })
        .catch(() => {
          if (active) setNotifications([]);
        });
    };

    load();
    const timer = window.setInterval(load, 30_000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useHotkeys('ctrl+k, meta+k', event => {
    event.preventDefault();
    const input = document.getElementById('cv-workspace-search') as HTMLInputElement | null;
    input?.focus();
    input?.select();
  }, { enableOnFormTags: true });

  useHotkeys('ctrl+b, meta+b, alt+o', event => {
    event.preventDefault();
    quoteCart.setIsOpen(!quoteCart.isOpen);
  }, { enableOnFormTags: true });

  useHotkeys('escape', () => {
    setMobileOpen(false);
    setNotificationsOpen(false);
  }, { enableOnFormTags: true });

  const select = (next: Section) => {
    onSection(next);
    setMobileOpen(false);
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = query.trim();
    if (value.length < 2) return;
    onSearch(value);
    setQuery('');
    setMobileOpen(false);
  };

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  const toggleSoundPreference = () => {
    const next = toggleSound();
    setSoundEnabled(next);
  };

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-slate-200 bg-white md:flex dark:border-slate-800 dark:bg-slate-900">
        <SidebarContent
          user={user}
          section={section}
          onSelect={select}
          onLogout={onLogout}
          theme={theme}
          onToggleTheme={toggleTheme}
          soundEnabled={soundEnabled}
          onToggleSound={toggleSoundPreference}
        />
      </aside>

      {mobileOpen && (
        <>
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-sm md:hidden"
          />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-[286px] max-w-[88vw] flex-col bg-white shadow-2xl md:hidden dark:bg-slate-900">
            <div className="absolute right-3 top-4">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                aria-label="Fechar menu"
              >
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>
            <SidebarContent
              user={user}
              section={section}
              onSelect={select}
              onLogout={onLogout}
              theme={theme}
              onToggleTheme={toggleTheme}
              soundEnabled={soundEnabled}
              onToggleSound={toggleSoundPreference}
            />
          </aside>
        </>
      )}

      <div className="min-h-screen md:pl-[248px]">
        <header className="sticky top-0 z-30 border-b border-slate-200/90 bg-white/95 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/95">
          <div className="flex h-[72px] items-center gap-3 px-4 lg:px-6">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 md:hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              aria-label="Abrir menu"
            >
              <Icon name="menu" className="h-[18px] w-[18px]" />
            </button>

            <div className="hidden min-w-[140px] lg:block">
              <div className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">Área de trabalho</div>
              <div className="mt-0.5 text-sm font-black text-slate-900 dark:text-white">{currentTitle}</div>
            </div>

            <form onSubmit={submitSearch} role="search" className="min-w-0 flex-1">
              <div className="relative mx-auto max-w-3xl">
                <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-slate-400" />
                <input
                  id="cv-workspace-search"
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Buscar código, peça, modelo ou PNC"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-20 text-sm font-medium outline-none transition placeholder:text-slate-400 focus:border-[#1d4f91] focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:focus:bg-slate-900"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-400 xl:block dark:border-slate-700 dark:bg-slate-800">
                  Ctrl K
                </span>
              </div>
            </form>

            <button
              type="button"
              onClick={() => quoteCart.setIsOpen(true)}
              className={`flex h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition ${
                quoteCart.totalItems > 0
                  ? 'border-amber-300 bg-amber-400 text-slate-950 hover:bg-amber-300'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              <Icon name="quote" className="h-4 w-4" />
              <span className="hidden sm:inline">Orçamento</span>
              {quoteCart.totalItems > 0 && (
                <span className="rounded-full bg-slate-950 px-1.5 py-0.5 text-[10px] text-amber-300">{quoteCart.totalItems}</span>
              )}
            </button>

            <Notifications
              items={notifications}
              open={notificationsOpen}
              onToggle={() => setNotificationsOpen(value => !value)}
              onClose={() => setNotificationsOpen(false)}
            />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1600px] px-4 py-5 lg:px-6 lg:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
