import { useState } from 'react';
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
  const [menuOpen, setMenuOpen] = useState(false);

  const select = (next: Section) => {
    onSection(next);
    setMenuOpen(false);
  };

  const sidebar = (
    <aside className="relative flex h-full flex-col overflow-hidden bg-[#091a36] text-white">
      <div className="pointer-events-none absolute -bottom-6 -right-28 w-[420px] opacity-[.025]">
        <img src="/husqvarna-logo.webp" alt="" className="w-full grayscale brightness-0 invert" />
      </div>

      <div className="relative z-10 flex items-center gap-3 px-5 pb-5 pt-6">
        <img src="/favicon.png" alt="CogniVault" className="h-10 w-10 rounded-xl object-cover ring-1 ring-white/10" />
        <div className="min-w-0">
          <div className="font-semibold tracking-tight">CogniVault</div>
          <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[.2em] text-slate-500">Parts Intelligence</div>
        </div>
      </div>

      <div className="relative z-10 px-4">
        <div className="rounded-2xl border border-white/[.07] bg-white/[.035] px-3.5 py-3">
          <div className="text-[10px] font-bold uppercase tracking-[.14em] text-amber-200">Vardão Máquinas</div>
          <div className="mt-1 text-xs leading-5 text-slate-400">Base técnica interna para peças, catálogos e PNC.</div>
        </div>
      </div>

      <nav className="relative z-10 mt-6 grid gap-1 px-3">
        {nav(user.role).map(([id, label]) => {
          const active = section === id;
          return (
            <button
              key={id}
              onClick={() => select(id)}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${active ? 'bg-white/[.1] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]' : 'text-slate-400 hover:bg-white/[.055] hover:text-slate-100'}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full transition ${active ? 'bg-amber-300' : 'bg-slate-600 group-hover:bg-slate-400'}`} />
              <span className={active ? 'font-semibold' : 'font-medium'}>{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="relative z-10 mt-auto px-4 pb-5 pt-6">
        <div className="rounded-2xl border border-white/[.07] bg-black/[.08] p-3.5">
          <div className="truncate text-xs font-semibold text-slate-200">{user.email}</div>
          <div className="mt-1 text-[10px] uppercase tracking-[.12em] text-slate-500">{user.role === 'ADMIN' ? 'Administrador' : 'Usuário da loja'}</div>
          <button onClick={onLogout} className="mt-3 text-xs font-semibold text-rose-300 transition hover:text-rose-200">Sair da conta</button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-[#f4f7fb] lg:grid lg:grid-cols-[252px_1fr]">
      <div className="hidden h-screen lg:sticky lg:top-0 lg:block">{sidebar}</div>

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button aria-label="Fechar menu" onClick={() => setMenuOpen(false)} className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]" />
          <div className="relative h-full w-[282px] max-w-[84vw] shadow-2xl">{sidebar}</div>
        </div>
      )}

      <main className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
          <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6 md:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button onClick={() => setMenuOpen(true)} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-lg text-slate-600 shadow-sm lg:hidden">☰</button>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-950">{user.tenant.name}</div>
                <div className="hidden text-[11px] text-slate-400 sm:block">CogniVault · operação técnica</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <img src="/vardao-logo.webp" alt="Vardão Máquinas" className="brand-logo-clean hidden h-8 w-auto max-w-[145px] object-contain sm:block" />
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200/70 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.1em] text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Online
              </span>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1500px] p-4 sm:p-6 md:p-8 lg:p-9">{children}</div>
      </main>
    </div>
  );
}
