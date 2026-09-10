import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent, MouseEvent, ReactNode } from 'react';
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

type NavItem = readonly [Section, string];

type NavButtonProps = {
  item: NavItem;
  active: boolean;
  onSelect: (section: Section) => void;
  mobile?: boolean;
};

const operationNav: NavItem[] = [
  ['home', 'Início'],
  ['parts', 'Peças'],
  ['catalogs', 'Catálogos'],
  ['quotes', 'Orçamentos'],
  ['history', 'Histórico'],
  ['favorites', 'Favoritos'],
];

const adminNav: NavItem[] = [
  ['overview', 'Visão geral'],
  ['users', 'Usuários'],
  ['feedback', 'Feedback'],
  ['quality', 'Confiabilidade'],
  ['audit', 'Auditoria'],
];

function BellIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m5 7 5 5 5-5" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

function NavButton({ item: [id, label], active, onSelect, mobile = false }: NavButtonProps) {
  if (mobile) {
    return (
      <button
        type="button"
        onClick={() => onSelect(id)}
        aria-current={active ? 'page' : undefined}
        className={`flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${active
            ? 'bg-blue-50 text-[#1d4f91] dark:bg-blue-950/40 dark:text-blue-300'
            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
      >
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-current={active ? 'page' : undefined}
      className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors ${active
          ? 'bg-white text-[#1d4f91] shadow-sm dark:bg-slate-700 dark:text-blue-300'
          : 'text-slate-500 hover:bg-white/70 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200'
        }`}
    >
      {label}
    </button>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const toggle = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  return (
    <button type="button" onClick={toggle} aria-label="Alternar tema" title="Alternar tema" className="cv-icon-button">
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
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
      aria-label={enabled ? 'Silenciar feedback sonoro' : 'Ativar feedback sonoro'}
      title={enabled ? 'Sons ativados — clique para silenciar' : 'Sons desativados — clique para ativar'}
      className={`cv-icon-button transition ${enabled ? 'text-amber-500 dark:text-amber-400' : 'text-slate-400 opacity-60 dark:text-slate-500'}`}
    >
      <span className="text-sm" aria-hidden="true">{enabled ? '🔔' : '🔕'}</span>
    </button>
  );
}

function fetchNotifications() {
  return apiJson<{ notifications: NotificationItem[] }>('/api/notifications');
}

export default function Shell({ user, section, onSection, onLogout, onSearch, children }: Props) {
  const [search, setSearch] = useState('');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const quoteCart = useQuoteCart();

  const currentAdminItem = adminNav.find(([id]) => id === section);
  const adminButtonLabel = currentAdminItem?.[1] ?? 'Administração';
  const isAdminSection = Boolean(currentAdminItem);

  const closeMenus = () => {
    setNotificationsOpen(false);
    setMobileMenuOpen(false);
    setAdminMenuOpen(false);
  };

  const refreshNotifications = () => {
    void fetchNotifications()
      .then(data => setNotifications(data.notifications ?? []))
      .catch(() => setNotifications([]));
  };

  useEffect(() => {
    let active = true;

    const refresh = () => {
      void fetchNotifications()
        .then(data => {
          if (active) setNotifications(data.notifications ?? []);
        })
        .catch(() => {
          if (active) setNotifications([]);
        });
    };

    refresh();
    const timer = window.setInterval(refresh, 30_000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useHotkeys('ctrl+k, meta+k', event => {
    event.preventDefault();
    const fields = [
      document.getElementById('cv-global-search'),
      document.getElementById('cv-global-search-mobile'),
    ];
    const searchField = fields.find(
      field => field instanceof HTMLInputElement && field.offsetParent !== null,
    ) as HTMLInputElement | undefined;
    searchField?.focus();
    searchField?.select();
  }, { enableOnFormTags: true });

  useHotkeys('ctrl+b, meta+b, alt+o', event => {
    event.preventDefault();
    quoteCart.setIsOpen(!quoteCart.isOpen);
  }, { enableOnFormTags: true });

  useHotkeys('shift+?, ?', event => {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    event.preventDefault();
    setShortcutsOpen(previous => !previous);
  });

  useHotkeys('escape', () => {
    setNotificationsOpen(false);
    setShortcutsOpen(false);
    setMobileMenuOpen(false);
    setAdminMenuOpen(false);
  }, { enableOnFormTags: true });

  const select = (next: Section) => {
    onSection(next);
    closeMenus();
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = search.trim();
    if (query.length < 2) return;
    onSearch(query);
    setSearch('');
    closeMenus();
  };

  const toggleNotifications = () => {
    setAdminMenuOpen(false);
    setMobileMenuOpen(false);
    setNotificationsOpen(value => !value);
    refreshNotifications();
  };

  const toggleAdminMenu = () => {
    setNotificationsOpen(false);
    setAdminMenuOpen(value => !value);
  };

  const toggleMobileMenu = () => {
    setNotificationsOpen(false);
    setAdminMenuOpen(false);
    setMobileMenuOpen(value => !value);
  };

  return (
    <div className="cv-app-shell min-h-screen flex flex-col bg-[#f4f7fb] dark:bg-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/95">
        <div className="flex min-h-[70px] items-center gap-3 px-4 sm:px-6 md:px-8">
          <button
            type="button"
            onClick={() => {
              setSearch('');
              select('home');
            }}
            className="flex shrink-0 items-center gap-3 transition-opacity hover:opacity-80"
            aria-label="Ir para o início"
          >
            <img src="/favicon.png" alt="" className="h-8 w-8 rounded-lg object-cover shadow-sm" />
            <div className="hidden text-left sm:block">
              <div className="text-sm font-bold leading-tight tracking-tight text-slate-900 dark:text-white">CogniVault</div>
              <div className="text-[9px] font-bold uppercase tracking-[.15em] text-[#1d4f91] dark:text-blue-400">Husqvarna B2B</div>
            </div>
          </button>

          {section !== 'home' && (
            <form role="search" onSubmit={submit} className="hidden min-w-0 flex-1 sm:block">
              <div className="relative mx-auto w-full max-w-3xl">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-4-4" />
                </svg>
                <input
                  id="cv-global-search"
                  value={search}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)}
                  placeholder="Buscar código, peça ou PNC…"
                  minLength={2}
                  className="mx-auto block w-full max-w-3xl rounded-[14px] border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-20 text-sm font-medium outline-none shadow-inner transition focus:border-[#1d4f91] focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-800 dark:focus:bg-slate-900"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    aria-label="Limpar busca"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"
                  >
                    Limpar
                  </button>
                )}
              </div>
            </form>
          )}

          <div className={`${section === 'home' ? 'ml-auto' : 'ml-auto sm:ml-0'} flex shrink-0 items-center gap-2`}>
            <button
              type="button"
              onClick={() => quoteCart.setIsOpen(true)}
              aria-label="Abrir cesta de orçamento"
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold shadow-sm transition active:scale-95 ${quoteCart.totalItems > 0
                  ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 shadow-amber-500/20 hover:from-amber-300 hover:to-amber-400'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
            >
              <span className="text-sm" aria-hidden="true">🛒</span>
              <span className="hidden lg:inline">Orçamento</span>
              {quoteCart.totalItems > 0 && (
                <span className="rounded-full bg-slate-950 px-1.5 py-0.5 text-[10px] font-black leading-none text-amber-400">
                  {quoteCart.totalItems}
                </span>
              )}
            </button>

            <div className="hidden md:block"><SoundToggle /></div>
            <div className="hidden md:block"><ThemeToggle /></div>

            <div className="relative">
              <button
                type="button"
                onClick={toggleNotifications}
                aria-label="Abrir notificações"
                aria-expanded={notificationsOpen}
                className="cv-icon-button relative"
              >
                <BellIcon />
                {notifications.length > 0 && (
                  <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-[#1d4f91] px-1 text-[9px] font-bold leading-4 text-white shadow-sm dark:bg-blue-500">
                    {Math.min(notifications.length, 9)}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <>
                  <button type="button" className="fixed inset-0 z-40 cursor-default" onClick={() => setNotificationsOpen(false)} aria-label="Fechar notificações" />
                  <div className="absolute right-0 top-12 z-50 w-[360px] max-w-[88vw] overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-800">
                    <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-700">
                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">Notificações</div>
                    </div>
                    <div className="cv-scrollbar max-h-[420px] overflow-auto">
                      {notifications.map(item => (
                        <div key={item.id} className="border-b border-slate-100 p-4 last:border-0 dark:border-slate-700">
                          <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">{item.title}</div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.description}</div>
                        </div>
                      ))}
                      {!notifications.length && (
                        <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">Nenhuma notificação.</div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={onLogout}
              className="hidden rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 md:block dark:hover:bg-slate-800 dark:hover:text-slate-200"
              title="Sair"
              aria-label="Sair"
            >
              <LogoutIcon />
            </button>

            <button
              type="button"
              onClick={toggleMobileMenu}
              className="cv-icon-button md:hidden"
              aria-label="Abrir menu"
              aria-expanded={mobileMenuOpen}
            >
              <MenuIcon />
            </button>
          </div>
        </div>

        {section !== 'home' && (
          <form role="search" onSubmit={submit} className="relative border-t border-slate-100 px-4 pb-3 pt-3 sm:hidden dark:border-slate-800">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="pointer-events-none absolute left-7 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-4-4" />
            </svg>
            <input
              id="cv-global-search-mobile"
              value={search}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)}
              placeholder="Buscar código, peça ou PNC…"
              minLength={2}
              className="w-full rounded-[14px] border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm font-medium outline-none shadow-inner transition focus:border-[#1d4f91] focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-800 dark:focus:bg-slate-900"
            />
          </form>
        )}

        <div className="hidden border-t border-slate-100 bg-slate-50/80 px-4 py-2 md:block dark:border-slate-800 dark:bg-slate-900/80">
          <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3">
            <nav aria-label="Navegação principal" className="flex min-w-0 items-center gap-1 overflow-x-auto">
              {operationNav.map(item => (
                <NavButton key={item[0]} item={item} active={section === item[0]} onSelect={select} />
              ))}
            </nav>

            {user.role === 'ADMIN' && (
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={toggleAdminMenu}
                  aria-haspopup="menu"
                  aria-expanded={adminMenuOpen}
                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-bold transition ${isAdminSection
                      ? 'border-blue-200 bg-blue-50 text-[#1d4f91] dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                    }`}
                >
                  {adminButtonLabel}
                  <ChevronIcon open={adminMenuOpen} />
                </button>

                {adminMenuOpen && (
                  <>
                    <button type="button" className="fixed inset-0 z-40 cursor-default" onClick={() => setAdminMenuOpen(false)} aria-label="Fechar menu administrativo" />
                    <div role="menu" className="absolute right-0 top-11 z-50 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl dark:border-slate-700 dark:bg-slate-800">
                      <div className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">Administração</div>
                      {adminNav.map(item => (
                        <NavButton key={item[0]} item={item} active={section === item[0]} onSelect={select} mobile />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-slate-200 bg-white px-4 pb-4 pt-3 shadow-xl md:hidden dark:border-slate-800 dark:bg-slate-900">
            <nav aria-label="Navegação principal" className="space-y-1">
              {operationNav.map(item => (
                <NavButton key={item[0]} item={item} active={section === item[0]} onSelect={select} mobile />
              ))}
            </nav>

            {user.role === 'ADMIN' && (
              <>
                <div className="my-3 h-px bg-slate-200 dark:bg-slate-700" />
                <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">Administração</div>
                <nav aria-label="Administração" className="space-y-1">
                  {adminNav.map(item => (
                    <NavButton key={item[0]} item={item} active={section === item[0]} onSelect={select} mobile />
                  ))}
                </nav>
              </>
            )}

            <div className="my-3 h-px bg-slate-200 dark:bg-slate-700" />
            <div className="flex items-center gap-2">
              <SoundToggle />
              <ThemeToggle />
              <button
                type="button"
                onClick={onLogout}
                className="ml-auto rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Sair
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="flex min-w-0 flex-1 flex-col">{children}</main>

      {shortcutsOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={() => setShortcutsOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900"
            onClick={(event: MouseEvent<HTMLDivElement>) => event.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Atalhos</h3>
            <div className="mt-5 space-y-3 text-sm text-slate-600 dark:text-slate-300">
              <div className="flex items-center justify-between gap-4">
                <span>Busca global</span>
                <kbd className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold dark:border-slate-700 dark:bg-slate-800">Ctrl + K</kbd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>Abrir orçamento</span>
                <kbd className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold dark:border-slate-700 dark:bg-slate-800">Ctrl + B</kbd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>Mostrar atalhos</span>
                <kbd className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold dark:border-slate-700 dark:bg-slate-800">?</kbd>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setShortcutsOpen(false)}
                className="rounded-xl bg-[#1d4f91] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#163e73]"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}