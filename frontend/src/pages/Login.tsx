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
    <main className="relative min-h-[100dvh] overflow-y-auto bg-ink-100 text-ink-950 sm:h-[100dvh] sm:min-h-0 sm:overflow-hidden dark:bg-ink-950 dark:text-white">
      {/* Fundo de seção do site da loja: gradiente neutro suave, sem blob
          colorido. A faixa superior é a `bg-brand-fade` da identidade. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden bg-section-soft dark:bg-none">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-brand-fade" />
      </div>

      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[1180px] flex-col px-5 sm:h-full sm:min-h-0 sm:px-8 lg:px-10">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center overflow-hidden rounded-xl border border-white/80 bg-white shadow-sm shadow-ink-900/5 dark:border-ink-700 dark:bg-ink-900">
              <img src="/favicon.png" alt="" className="h-7 w-7 object-cover" />
            </div>
            <div>
              <div className="text-sm font-black tracking-[-.02em] text-ink-950 dark:text-white">CogniVault</div>
              <div className="mt-0.5 text-[9px] font-bold uppercase tracking-[.18em] text-brand-600 dark:text-brand-300">Vardão Máquinas</div>
            </div>
          </div>

          {/* Selo "Revenda Autorizada Ouro" no ouro real do site (#ffc800). */}
          <div className="hidden items-center gap-2 sm:flex">
            <span className="rounded-full bg-gold-500 px-2.5 py-1 text-seal uppercase text-ink-900">
              Revenda Autorizada Ouro
            </span>
          </div>
        </header>

        <section className="flex min-h-0 flex-1 items-center justify-center py-4 sm:py-3 lg:py-4">
          <div className="w-full max-w-[440px]">
            <div className="mb-4 text-center sm:mb-5">
              <img
                src="/vardao-logo-transparent.webp"
                alt="Vardão Máquinas"
                className="mx-auto h-12 w-auto max-w-[190px] object-contain opacity-90 dark:brightness-0 dark:invert"
              />
              <h1 className="mt-3 text-display-sm text-brand-600 dark:text-white">
                Bem-vindo ao CogniVault
              </h1>
              <p className="mx-auto mt-1.5 max-w-[380px] text-[13px] leading-5 text-ink-500 dark:text-ink-400">
                Catálogo técnico, evidências, assistência e orçamento em um único ambiente.
              </p>
            </div>

            <div className="rounded-panel border border-ink-200 bg-white p-5 shadow-raised sm:p-6 dark:border-ink-800 dark:bg-ink-850">
              <div className="mb-4 text-center">
                <div className="cv-kicker">Acesso seguro</div>
                <h2 className="mt-1 text-lg font-black tracking-[-.03em] text-ink-950 dark:text-white">Entrar na sua conta</h2>
              </div>

              {error && (
                <div role="alert" aria-live="polite" className="mb-4 rounded-card border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs leading-5 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
                  {error}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-3.5" aria-busy={loading}>
                <div>
                  <label htmlFor="login-email" className="mb-1.5 block text-xs font-bold text-ink-600 dark:text-ink-300">E-mail</label>
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                    autoComplete="email"
                    autoFocus
                    required
                    placeholder="seuemail@empresa.com"
                    className="cv-field h-12 py-0 text-base"
                  />
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <label htmlFor="login-password" className="text-xs font-bold text-ink-600 dark:text-ink-300">Senha</label>
                    <span className="text-[9px] font-semibold uppercase tracking-[.08em] text-ink-400">Uso interno</span>
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
                      className="cv-field h-12 py-0 pr-20 text-base"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(value => !value)}
                      className="absolute inset-y-0 right-0 px-3.5 text-[11px] font-bold text-ink-400 transition hover:text-brand-600 dark:hover:text-brand-300"
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {showPassword ? 'Ocultar' : 'Mostrar'}
                    </button>
                  </div>
                </div>

                <button
                  disabled={loading}
                  className="cv-primary flex h-12 w-full items-center justify-center gap-2 text-base disabled:cursor-not-allowed"
                >
                  {loading && <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />}
                  {loading ? (preparing ? 'Preparando o CogniVault…' : 'Validando acesso…') : 'Entrar no CogniVault'}
                </button>
              </form>

              <div className="mt-4 flex items-center justify-center gap-2 text-[10px] font-semibold text-ink-400" aria-live="polite">
                <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot}`} />
                <span>{statusLabel}</span>
                <span aria-hidden="true">·</span>
                <span>Sessão segura de 8h</span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[9px] font-semibold uppercase tracking-[.07em] text-ink-400">
              <span>Catálogo técnico</span>
              <span className="h-1 w-1 rounded-full bg-ink-300 dark:bg-ink-700" />
              <span>Evidência oficial</span>
              <span className="h-1 w-1 rounded-full bg-ink-300 dark:bg-ink-700" />
              <span>Orçamentos</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
