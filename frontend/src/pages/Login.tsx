import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiJson, ensureApiReady, isApiRecentlyReady } from '../lib';
import { activateQuoteStorageScope } from '../lib/quote-storage-scope';

type SessionUser = {
  id: string;
  tenantId: string;
  role: 'ADMIN' | 'MECHANIC';
  email: string;
};

type LoginResponse = {
  user: SessionUser;
};

type ServerState = 'checking' | 'ready' | 'slow';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [serverState, setServerState] = useState<ServerState>(isApiRecentlyReady() ? 'ready' : 'checking');
  const navigate = useNavigate();

  useEffect(() => {
    if (isApiRecentlyReady()) return;
    let active = true;
    void ensureApiReady().then(ready => {
      if (active) setServerState(ready ? 'ready' : 'slow');
    });
    return () => { active = false; };
  }, []);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!isApiRecentlyReady()) {
        setServerState('checking');
        const ready = await ensureApiReady(75_000);
        if (!ready) {
          setServerState('slow');
          setError('O servidor ainda está iniciando. Aguarde alguns instantes e tente novamente.');
          return;
        }
        setServerState('ready');
      }

      await apiJson<LoginResponse>('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        timeoutMs: 20_000,
      });

      const session = await apiJson<LoginResponse>('/api/me', { timeoutMs: 12_000 });

      localStorage.removeItem('cognivault_token');
      localStorage.setItem('cognivault_tenant', session.user.tenantId);
      localStorage.setItem('cognivault_role', session.user.role);
      localStorage.setItem('cognivault_email', session.user.email);
      activateQuoteStorageScope(session.user.email.trim().toLocaleLowerCase('pt-BR'));
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado.');
    } finally {
      setLoading(false);
    }
  };

  const preparing = loading && serverState !== 'ready';
  const statusLabel = serverState === 'ready'
    ? 'Servidor disponível'
    : serverState === 'checking'
      ? 'Preparando servidor'
      : 'Servidor em inicialização';
  const statusDot = serverState === 'ready' ? 'bg-emerald-500' : 'bg-amber-400';

  return (
    <main className="relative min-h-[100dvh] overflow-y-auto bg-[#f5f7fb] text-slate-950 sm:h-[100dvh] sm:min-h-0 sm:overflow-hidden dark:bg-[#07101f] dark:text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-28 -top-40 h-[430px] w-[430px] rounded-full bg-blue-200/35 blur-3xl dark:bg-blue-900/20" />
        <div className="absolute -bottom-44 -right-24 h-[460px] w-[460px] rounded-full bg-indigo-200/30 blur-3xl dark:bg-indigo-900/20" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/70 to-transparent dark:via-blue-700/50" />
      </div>

      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[1180px] flex-col px-5 sm:h-full sm:min-h-0 sm:px-8 lg:px-10">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center overflow-hidden rounded-xl border border-white/80 bg-white shadow-sm shadow-slate-900/5 dark:border-slate-700 dark:bg-slate-900">
              <img src="/favicon.png" alt="" className="h-7 w-7 object-cover" />
            </div>
            <div>
              <div className="text-sm font-black tracking-[-.02em] text-slate-950 dark:text-white">CogniVault</div>
              <div className="mt-0.5 text-[9px] font-bold uppercase tracking-[.18em] text-[#1d4f91] dark:text-blue-300">Vardão Máquinas</div>
            </div>
          </div>

          <div className="hidden items-center gap-2 text-[10px] font-bold text-slate-400 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-[#1d4f91]" />
            Ambiente interno
          </div>
        </header>

        <section className="flex min-h-0 flex-1 items-center justify-center py-4 sm:py-3 lg:py-4">
          <div className="w-full max-w-[440px]">
            <div className="mb-4 text-center sm:mb-5">
              <img
                src="/vardao-logo-transparent.png"
                alt="Vardão Máquinas"
                className="mx-auto h-12 w-auto max-w-[190px] object-contain opacity-90 dark:brightness-0 dark:invert"
              />
              <h1 className="mt-3 text-[28px] font-black tracking-[-.045em] text-slate-950 sm:text-[31px] dark:text-white">
                Bem-vindo ao CogniVault
              </h1>
              <p className="mx-auto mt-1.5 max-w-[380px] text-[13px] leading-5 text-slate-500 dark:text-slate-400">
                Catálogo técnico, evidências, assistência e orçamento em um único ambiente.
              </p>
            </div>

            <div className="rounded-[24px] border border-slate-200/90 bg-white/95 p-5 shadow-[0_24px_70px_rgba(15,35,72,.10)] backdrop-blur sm:p-6 dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-[0_28px_80px_rgba(0,0,0,.28)]">
              <div className="mb-4 text-center">
                <div className="text-[9px] font-black uppercase tracking-[.16em] text-[#1d4f91] dark:text-blue-300">Acesso seguro</div>
                <h2 className="mt-1 text-lg font-black tracking-[-.03em] text-slate-950 dark:text-white">Entrar na sua conta</h2>
              </div>

              {error && (
                <div role="alert" aria-live="polite" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs leading-5 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
                  {error}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-3.5" aria-busy={loading}>
                <div>
                  <label htmlFor="login-email" className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">E-mail</label>
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                    autoComplete="email"
                    autoFocus
                    required
                    placeholder="seuemail@empresa.com"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-[#1d4f91] focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-800/80 dark:text-white dark:hover:border-slate-600 dark:focus:bg-slate-800"
                  />
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <label htmlFor="login-password" className="text-xs font-bold text-slate-600 dark:text-slate-300">Senha</label>
                    <span className="text-[9px] font-semibold uppercase tracking-[.08em] text-slate-400">Uso interno</span>
                  </div>
                  <div className="relative">
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={event => setPassword(event.target.value)}
                      autoComplete="current-password"
                      required
                      placeholder="••••••••"
                      className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 pr-20 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-[#1d4f91] focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-800/80 dark:text-white dark:hover:border-slate-600 dark:focus:bg-slate-800"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(value => !value)}
                      className="absolute inset-y-0 right-0 px-3.5 text-[11px] font-bold text-slate-400 transition hover:text-[#1d4f91] dark:hover:text-blue-300"
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {showPassword ? 'Ocultar' : 'Mostrar'}
                    </button>
                  </div>
                </div>

                <button
                  disabled={loading}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#153f73] text-sm font-black text-white shadow-[0_10px_24px_rgba(21,63,115,.20)] transition hover:bg-[#0f315b] hover:shadow-[0_12px_28px_rgba(21,63,115,.26)] focus:outline-none focus:ring-4 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading && <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />}
                  {loading ? (preparing ? 'Preparando o CogniVault…' : 'Validando acesso…') : 'Entrar no CogniVault'}
                </button>
              </form>

              <div className="mt-4 flex items-center justify-center gap-2 text-[10px] font-semibold text-slate-400" aria-live="polite">
                <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot}`} />
                <span>{statusLabel}</span>
                <span aria-hidden="true">·</span>
                <span>Sessão segura de 8h</span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[9px] font-semibold uppercase tracking-[.07em] text-slate-400">
              <span>Catálogo técnico</span>
              <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-700" />
              <span>Evidência oficial</span>
              <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-700" />
              <span>Orçamentos</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
