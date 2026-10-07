import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { apiJson } from '../lib';
import type { NotificationItem, Section, SessionUser } from '../types';
import { useQuoteCart } from '../context/QuoteCartContext';
import { useTheme } from './ThemeProvider';
import { isSoundEnabled, toggleSound } from '../lib/sound';
import { Icon, type IconName } from './icons/Icon';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
  // "Máquinas" saiu daqui: a busca do Atendimento oferece peça e máquina na
  // mesma consulta, e a vista explodida abre em painel lateral. Eram duas abas
  // para a mesma pergunta do balcão — *"nem eu entendi o que muda da aba
  // atendimento e da aba máquinas"*.
  { id: 'parts', label: 'Atendimento', icon: 'search' },
  { id: 'catalogs', label: 'Catálogos', icon: 'catalog' },
  { id: 'quotes', label: 'Orçamentos', icon: 'quote' },
];

const secondaryNav: NavItem[] = [
  { id: 'favorites', label: 'Favoritos', icon: 'favorite' },
  { id: 'history', label: 'Histórico', icon: 'history' },
];

const adminNav: NavItem[] = [
  { id: 'business', label: 'Negócio', icon: 'money' },
  { id: 'overview', label: 'Visão geral', icon: 'dashboard' },
  { id: 'users', label: 'Usuários', icon: 'users' },
  { id: 'feedback', label: 'Feedback', icon: 'feedback' },
  { id: 'quality', label: 'Qualidade', icon: 'quality' },
  { id: 'audit', label: 'Auditoria', icon: 'audit' },
];

// Aba da barra superior. Texto de apoio em hex fixo (não opacidade): contraste
// medido sobre o azul da marca, nos dois temas.
const tabBase = 'relative flex h-full items-center gap-1.5 border-b-[3px] px-4 text-base font-medium outline-none transition-colors focus-visible:bg-white/10';
const tabIdle = 'border-transparent text-[#c9d2e6] hover:text-white';
const tabActive = 'border-white font-semibold text-white';

function Tab({ item, active, onSelect }: { item: NavItem; active: boolean; onSelect: (section: Section) => void }) {
  return (
    <button type="button" onClick={() => onSelect(item.id)} aria-current={active ? 'page' : undefined} className={`${tabBase} ${active ? tabActive : tabIdle}`}>
      {item.label}
    </button>
  );
}

function GroupTab({ label, items, section, onSelect }: { label: string; items: NavItem[]; section: Section; onSelect: (section: Section) => void }) {
  const active = items.some(item => item.id === section);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={`${tabBase} ${active ? tabActive : tabIdle}`}>
          {label}
          <Icon name="chevron" className="h-3.5 w-3.5 rotate-90" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
        {items.map(item => (
          <DropdownMenuItem key={item.id} onSelect={() => onSelect(item.id)} className="h-10 text-base">
            <Icon name={item.icon} className="h-4 w-4" />
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function ShellV2({ user, section, onSection, onLogout, onSearch, children }: Props) {
  const [query, setQuery] = useState('');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(() => isSoundEnabled());
  const { theme, setTheme } = useTheme();
  const quoteCart = useQuoteCart();
  const isCounter = section === 'parts' || section === 'home' || section === 'assistant';
  const isAdmin = user.role === 'ADMIN';

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

  const submitSearch = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const value = query.trim(); if (value.length < 2) return; onSearch(value); setQuery(''); };
  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');
  const toggleSoundPreference = () => setSoundEnabled(toggleSound());
  const activeSection: Section = section === 'home' || section === 'assistant' ? 'parts' : section;
  const allNav = [...primaryNav, ...secondaryNav, ...(isAdmin ? adminNav : [])];

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-black/20 bg-bar text-bar-foreground">
        <div className="mx-auto flex h-14 w-full max-w-[1800px] items-center gap-5 px-5">
          {/* "Balcão · Peças" e o selo ouro identificam o sistema e a revenda; o atendente
              usa este app ao lado do Vardão CRM e precisa saber em qual está. */}
          <div className="flex shrink-0 items-center gap-3">
            <img src="/favicon.png" alt="" className="size-8 rounded-md bg-white/10 object-cover" />
            <span className="text-lg font-bold tracking-tight">CogniVault</span>
            <span className="hidden rounded-full border border-[#ffc80080] px-2.5 py-0.5 text-sm font-semibold text-[#ffc800] xl:inline">Revenda ouro Husqvarna</span>
          </div>

          <nav aria-label="Principal" className="hidden h-full md:flex">
            {primaryNav.map(item => <Tab key={item.id} item={item} active={activeSection === item.id} onSelect={onSection} />)}
            <GroupTab label="Mais" items={secondaryNav} section={section} onSelect={onSection} />
            {isAdmin && <GroupTab label="Administração" items={adminNav} section={section} onSelect={onSection} />}
          </nav>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="bar" size="sm" className="md:hidden" aria-label="Abrir menu"><Icon name="menu" className="h-4 w-4" />Menu</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-52">
              {allNav.map(item => (
                <DropdownMenuItem key={item.id} onSelect={() => onSection(item.id)} className="h-10 text-base">
                  <Icon name={item.icon} className="h-4 w-4" />
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {!isCounter && (
            <form onSubmit={submitSearch} role="search" className="hidden min-w-0 max-w-md flex-1 lg:block">
              <div className="relative">
                <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5f667a]" />
                <input
                  id="cv-workspace-search"
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Buscar código, descrição, modelo ou PNC"
                  className="h-10 w-full rounded-md border border-transparent bg-white pl-9 pr-16 text-base text-[#1b2234] outline-none placeholder:text-[#5f667a] focus-visible:ring-3 focus-visible:ring-[#ff9a73]"
                />
                <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-[#c4cada] px-1.5 text-sm text-[#5f667a]">Ctrl K</kbd>
              </div>
            </form>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Button variant="bar" onClick={() => quoteCart.setIsOpen(true)}>
              <Icon name="quote" className="h-4 w-4" />
              <span className="hidden sm:inline">Orçamento</span>
              {quoteCart.totalItems > 0 && <span className="grid min-w-6 place-items-center rounded-full bg-primary px-1.5 text-sm font-bold tabular-nums text-primary-foreground">{quoteCart.totalItems}</span>}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="bar" size="icon" aria-label="Notificações" className="relative">
                  <Icon name="bell" className="h-[18px] w-[18px]" />
                  {notifications.length > 0 && <span className="absolute right-2 top-2 size-2 rounded-full bg-[#ff9a73] ring-2 ring-bar" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-96 w-80 overflow-y-auto">
                <DropdownMenuLabel className="text-base">Notificações</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notifications.length ? notifications.map(item => (
                  <div key={item.id} className="px-2 py-2">
                    <div className="text-base font-semibold">{item.title}</div>
                    <div className="text-sm text-muted-foreground">{item.description}</div>
                  </div>
                )) : <div className="px-2 py-4 text-center text-base text-muted-foreground">Nenhuma pendência.</div>}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="bar" size="icon" aria-label="Minha conta" className="rounded-full text-sm font-bold">{user.email.slice(0, 2).toUpperCase()}</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="space-y-0.5">
                  <div className="truncate text-base font-semibold">{user.email}</div>
                  <div className="text-sm font-normal text-muted-foreground">{isAdmin ? 'Administrador' : 'Balcão'}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={toggleTheme} className="h-10 text-base">
                  <Icon name={theme === 'dark' ? 'sun' : 'moon'} className="h-4 w-4" />
                  {theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={toggleSoundPreference} className="h-10 text-base">
                  <Icon name={soundEnabled ? 'sound' : 'mute'} className="h-4 w-4" />
                  {soundEnabled ? 'Desligar sons' : 'Ligar sons'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onLogout} variant="destructive" className="h-10 text-base">
                  <Icon name="logout" className="h-4 w-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className={`mx-auto flex w-full flex-1 flex-col px-5 py-5 ${isCounter ? 'max-w-[1560px]' : 'max-w-[1500px]'}`}>{children}</main>
    </div>
  );
}
