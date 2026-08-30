import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiJson } from '../lib';

type LoginResponse = {
  token: string;
  user: {
    tenantId: string;
    role: 'ADMIN' | 'MECHANIC';
    email: string;
  };
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await apiJson<LoginResponse>('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        timeoutMs: 15_000,
      });

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

  const benefits = [
    { title: 'Busca precisa', description: 'Peça, modelo e PNC' },
    { title: 'Catálogo central', description: 'PDFs e aplicações' },
    { title: 'Decisão rápida', description: 'IA com base técnica' },
  ];

  return (
    <main className="min-h-[100dvh] bg-[#f7f9fc] text-slate-950 lg:grid lg:grid-cols-[minmax(0,1.12fr)_minmax(430px,.88fr)]">
      <section className="relative hidden min-h-[100dvh] overflow-hidden bg-[#081a34] px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-16 xl:py-12">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(47,111,187,.28),transparent_34%),radial-gradient(circle_at_88%_92%,rgba(226,174,71,.13),transparent_26%)]" />
        <div className="pointer-events-none absolute inset-0 opacity-[.05] [background-image:linear-gradient(rgba(255,255,255,.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.18)_1px,transparent_1px)] [background-size:64px_64px]" />
        <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-white/15 to-transparent" />

        <div className="relative z-10 flex items-center gap-4">
          <img src="/favicon.png" alt="" className="h-11 w-11 rounded-[15px] object-cover shadow-2xl ring-1 ring-white/10" />
          <div>
            <div className="text-xl font-semibold tracking-tight">CogniVault</div>
            <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[.22em] text-slate-400">Inteligência de peças</div>
          </div>
        </div>

        <div className="relative z-10 max-w-[680px] -translate-y-2">
          <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[.16em] text-amber-200">
            <span className="h-px w-8 bg-amber-300/70" />
            Operação de peças
          </div>
          <h1 className="mt-7 max-w-[640px] text-[clamp(3rem,4.4vw,5.2rem)] font-semibold leading-[.94] tracking-[-.06em]">
            Peça certa. Código certo. Mais rápido.
          </h1>
          <p className="mt-7 max-w-[560px] text-[15px] leading-7 text-slate-300">
            Catálogos, PNCs e inteligência de busca reunidos para a rotina do balcão da Vardão Máquinas.
          </p>
          <div className="mt-10 grid max-w-[620px] grid-cols-3 gap-5">
            {benefits.map((item) => (
              <div key={item.title} className="border-t border-white/15 pt-4">
                <div className="text-sm font-semibold text-white">{item.title}</div>
                <div className="mt-1 text-xs text-slate-400">{item.description}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-end justify-between gap-8 border-t border-white/10 pt-5">
          <div className="flex items-center gap-3">
            <img src="/husqvarna-logo.webp" alt="Husqvarna" className="h-11 w-11 rounded-[13px] object-cover ring-1 ring-white/10" />
            <div>
              <div className="text-xs font-semibold text-slate-100">Representante Husqvarna</div>
              <div className="mt-1 text-[11px] text-slate-500">Tecnologia e suporte para o campo.</div>
            </div>
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-[.18em] text-slate-500">Ambiente interno</span>
        </div>
      </section>

      <section className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-6 py-10 sm:px-10 lg:px-12">
        <div className="pointer-events-none absolute -right-28 -top-24 h-80 w-80 rounded-full bg-[#1d4f91]/[.07] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-20 h-72 w-72 rounded-full bg-amber-400/[.07] blur-3xl" />

        <div className="relative z-10 w-full max-w-[440px]">
          <div className="mb-14 flex items-center justify-between gap-5 sm:mb-16">
            <img src="/vardao-logo-transparent.png" alt="Vardão Máquinas" className="h-auto w-[190px] object-contain sm:w-[215px]" />
            <div className="lg:hidden">
              <img src="/husqvarna-logo.webp" alt="Husqvarna" className="h-10 w-10 rounded-xl object-cover shadow-sm" />
            </div>
          </div>

          <div>
            <div className="mb-9">
              <div className="mb-8 flex items-center gap-3 lg:hidden">
                <img src="/favicon.png" alt="" className="h-10 w-10 rounded-xl object-cover" />
                <div>
                  <div className="font-semibold text-slate-900">CogniVault</div>
                  <div className="text-[9px] uppercase tracking-[.18em] text-slate-400">Inteligência de peças</div>
                </div>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[.15em] text-[#1d4f91]">
                <span className="h-px w-7 bg-[#1d4f91]/50" />
                Acesso interno
              </div>
              <h2 className="mt-5 text-[2.45rem] font-semibold leading-[1.03] tracking-[-.055em] text-slate-950">Entre no CogniVault</h2>
              <p className="mt-4 max-w-sm text-sm leading-6 text-slate-500">Consulte peças, aplicações e catálogos com as credenciais da sua equipe.</p>
            </div>

            {error && <div role="alert" aria-live="polite" className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

            <form onSubmit={handleLogin} className="space-y-5" aria-busy={loading}>
              <div>
                <label htmlFor="login-email" className="mb-2 block text-xs font-semibold text-slate-700">E-mail</label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                  required
                  placeholder="seuemail@vardao.com.br"
                  className="cv-field h-12 text-sm"
                />
              </div>
              <div>
                <label htmlFor="login-password" className="mb-2 block text-xs font-semibold text-slate-700">Senha</label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    placeholder="••••••••"
                    className="cv-field h-12 pr-20 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(value => !value)}
                    className="absolute inset-y-0 right-0 px-4 text-xs font-semibold text-slate-500 transition hover:text-[#1d4f91]"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
              </div>
              <button disabled={loading} className="cv-primary mt-3 flex w-full items-center justify-center gap-2 py-3.5 text-sm font-semibold">
                {loading && <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />}
                {loading ? 'Validando acesso...' : 'Entrar no CogniVault'}
              </button>
            </form>

            <div className="mt-8 flex items-center justify-between gap-4 border-t border-slate-200/80 pt-5 text-[11px] text-slate-400">
              <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Acesso protegido</span>
              <span>Administrador e Balcão</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
