import type { ReactNode } from 'react';
import type { Role, Section, SessionUser } from '../types';

type Props = {
  user: SessionUser;
  section: Section;
  onSection: (section: Section) => void;
  onLogout: () => void;
  children: ReactNode;
};

const nav = (role: Role) => [
  ...(role === 'ADMIN' ? [['overview', 'Visão geral'] as const] : []),
  ['assistant', 'Assistente IA'] as const,
  ['catalogs', 'Catálogos'] as const,
  ...(role === 'ADMIN'
    ? [['users', 'Usuários'] as const, ['audit', 'Auditoria'] as const]
    : []),
];

export default function Shell({ user, section, onSection, onLogout, children }: Props) {
  return (
    <div className="min-h-screen bg-[#f3f6fb] lg:grid lg:grid-cols-[280px_1fr]">
      <aside className="bg-[#0d2348] text-white p-5 lg:min-h-screen lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
        <div className="flex items-center gap-3">
          <img src="/favicon.png" alt="CogniVault" className="w-11 h-11 rounded-xl object-cover ring-1 ring-white/10" />
          <div>
            <b className="text-lg">CogniVault</b>
            <div className="text-[10px] tracking-[.18em] text-slate-400">PARTS INTELLIGENCE</div>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.05] p-4">
          <div className="flex items-center justify-between gap-3">
            <img src="/vardao-logo.webp" alt="Vardão Máquinas" className="h-9 w-auto rounded bg-white p-1" />
            <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-[.14em] text-amber-200">Revenda Ouro</span>
          </div>
          <img src="/husqvarna-logo.webp" alt="Husqvarna" className="mt-3 h-10 w-auto rounded" />
          <p className="mt-3 text-xs leading-5 text-slate-300">Base técnica interna da Vardão Máquinas para consulta de peças, PNCs e catálogos.</p>
        </div>

        <nav className="grid gap-1 mt-7">
          {nav(user.role).map(([id, label]) => (
            <button
              key={id}
              onClick={() => onSection(id)}
              className={`text-left rounded-xl px-3 py-2.5 text-sm transition ${section === id ? 'bg-white text-[#0d2348] font-semibold shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="mt-8 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-transparent p-4 text-xs leading-5 text-slate-300">
          <div className="font-semibold text-white">Consulta segura</div>
          <div className="mt-2">A IA identifica a peça; o código final vem da base técnica indexada.</div>
        </div>

        <div className="mt-8 border-t border-white/10 pt-5 text-xs text-slate-400">
          <div className="truncate text-slate-200">{user.email}</div>
          <div className="mt-1">{user.role === 'ADMIN' ? 'Administrador' : 'Usuário da loja'}</div>
          <button onClick={onLogout} className="mt-4 text-rose-300 hover:text-rose-200">Sair</button>
        </div>
      </aside>

      <main className="min-w-0">
        <header className="min-h-16 bg-white border-b border-slate-200 px-5 md:px-8 py-3 flex items-center justify-between gap-4 sticky top-0 z-20">
          <div>
            <span className="font-semibold text-slate-900">{user.tenant.name}</span>
            <span className="ml-2 text-xs text-slate-400">Vardão Máquinas · Catálogos · IA · PNC</span>
          </div>
          <div className="flex items-center gap-3">
            <img src="/vardao-logo.webp" alt="Vardão" className="hidden sm:block h-8 w-auto" />
            <span className="rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-xs font-semibold">Online</span>
          </div>
        </header>
        <div className="p-5 md:p-8 max-w-[1500px] mx-auto">{children}</div>
      </main>
    </div>
  );
}
