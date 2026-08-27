import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3333').replace(/\/$/, '');

    try {
      const response = await fetch(`${apiUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível entrar.');

      localStorage.setItem('cognivault_token', data.token);
      localStorage.setItem('cognivault_tenant', data.user.tenantId);
      localStorage.setItem('cognivault_role', data.user.role);
      localStorage.setItem('cognivault_email', data.user.email);
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado.');
    } finally {
      setLoading(false);
    }
  };

  const benefits = ['Busca por PNC', 'Catálogos centralizados', 'Código validado pela base'];

  return (
    <main className="h-[100dvh] overflow-hidden bg-[#eef3f8] lg:grid lg:grid-cols-[1.06fr_.94fr]">
      <section className="relative hidden overflow-hidden bg-[#091a36] text-white lg:flex lg:flex-col lg:justify-between px-12 py-10 xl:px-16 xl:py-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(56,116,188,.22),transparent_35%),radial-gradient(circle_at_90%_86%,rgba(212,165,71,.12),transparent_28%)]" />
        <div className="absolute left-[54%] top-1/2 w-[620px] -translate-y-1/2 opacity-[.035] pointer-events-none">
          <img src="/husqvarna-logo.webp" alt="" className="w-full grayscale brightness-0 invert" />
        </div>
        <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-white/15 to-transparent" />

        <div className="relative z-10 flex items-center gap-4">
          <img src="/favicon.png" alt="CogniVault" className="h-12 w-12 rounded-2xl object-cover ring-1 ring-white/10 shadow-2xl" />
          <div>
            <div className="text-xl font-semibold tracking-tight">CogniVault</div>
            <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[.22em] text-slate-400">Parts Intelligence</div>
          </div>
        </div>

        <div className="relative z-10 max-w-[620px] -translate-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/20 bg-amber-200/[.07] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.14em] text-amber-200">
            Revenda Ouro Husqvarna
          </div>
          <h1 className="mt-6 max-w-[590px] text-[clamp(2.55rem,4vw,4.6rem)] font-semibold leading-[.98] tracking-[-.055em]">
            Peça certa. Código certo. Mais rápido.
          </h1>
          <p className="mt-6 max-w-[530px] text-[15px] leading-7 text-slate-300">
            Catálogos, PNCs e inteligência de busca para o balcão de peças da Vardão Máquinas.
          </p>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3">
            {benefits.map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm text-slate-200">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-end justify-between gap-6 border-t border-white/10 pt-5">
          <div>
            <div className="text-xs font-semibold text-slate-200">Ambiente interno</div>
            <div className="mt-1 text-[11px] text-slate-500">Acesso exclusivo à equipe autorizada.</div>
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-[.18em] text-slate-500">Vardão Máquinas</span>
        </div>
      </section>

      <section className="relative flex h-[100dvh] items-center justify-center overflow-hidden px-5 py-5 sm:px-8 lg:px-10">
        <div className="absolute -right-28 -top-24 h-72 w-72 rounded-full bg-[#1d4f91]/[.05] blur-3xl" />
        <div className="absolute -bottom-20 left-0 h-64 w-64 rounded-full bg-amber-400/[.06] blur-3xl" />

        <div className="relative z-10 w-full max-w-[430px]">
          <div className="mb-5 flex items-center justify-between gap-4 px-1 sm:mb-6">
            <img src="/vardao-logo.webp" alt="Vardão Máquinas" className="brand-logo-clean h-11 w-auto max-w-[180px] object-contain" />
            <span className="rounded-full border border-slate-200/80 bg-white/70 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.13em] text-slate-500 shadow-sm backdrop-blur">Acesso interno</span>
          </div>

          <div className="cv-surface rounded-[30px] p-6 sm:p-8 backdrop-blur-xl">
            <div className="mb-7">
              <div className="flex items-center gap-3 lg:hidden mb-6">
                <img src="/favicon.png" alt="CogniVault" className="h-10 w-10 rounded-xl object-cover" />
                <div>
                  <div className="font-semibold text-slate-900">CogniVault</div>
                  <div className="text-[9px] uppercase tracking-[.18em] text-slate-400">Parts Intelligence</div>
                </div>
              </div>
              <p className="cv-kicker">Bem-vindo</p>
              <h2 className="mt-2 text-[2rem] font-semibold tracking-[-.045em] text-slate-950">Entre na sua conta</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">Use as credenciais fornecidas pelo administrador.</p>
            </div>

            {error && <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[.08em] text-slate-600">E-mail</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  placeholder="nome@empresa.com"
                  className="cv-field text-sm"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[.08em] text-slate-600">Senha</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  className="cv-field text-sm"
                />
              </div>
              <button disabled={loading} className="cv-primary mt-2 w-full py-3.5 text-sm font-semibold">
                {loading ? 'Entrando...' : 'Entrar no CogniVault'}
              </button>
            </form>

            <div className="mt-6 flex items-center justify-center gap-2 text-center text-[11px] text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Acesso gerenciado pela Vardão Máquinas
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
