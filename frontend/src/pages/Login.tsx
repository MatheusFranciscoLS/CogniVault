import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiJson, ensureApiReady, isApiRecentlyReady } from '../lib';

type LoginResponse = {
  token: string;
  user: {
    tenantId: string;
    role: 'ADMIN' | 'MECHANIC';
    email: string;
  };
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

      const data = await apiJson<LoginResponse>('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        timeoutMs: 20_000,
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

  const preparing = loading && serverState !== 'ready';

  return (
    <main className="min-h-[100dvh] bg-[#eef3f8] px-4 py-6 text-slate-950 dark:bg-[#060d1c] dark:text-white sm:px-6 lg:grid lg:place-items-center lg:py-10">
      <div className="mx-auto grid min-h-[calc(100dvh-3rem)] w-full max-w-[1080px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,35,72,.12)] lg:min-h-[650px] lg:grid-cols-[.9fr_1.1fr] dark:border-slate-800 dark:bg-slate-900 dark:shadow-[0_28px_80px_rgba(0,0,0,.35)]">
        <section className="relative hidden overflow-hidden bg-[#0b1d3a] p-9 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(47,111,187,.22),transparent_34%)]" />
          <div className="relative z-10 flex items-center gap-3">
            <img src="/favicon.png" alt="" className="h-10 w-10 rounded-xl object-cover ring-1 ring-white/10" />
            <div>
              <div className="text-base font-black tracking-tight">CogniVault</div>
              <div className="mt-0.5 text-[9px] font-bold uppercase tracking-[.16em] text-blue-200">Vardão Máquinas</div>
            </div>
          </div>

          <div className="relative z-10 max-w-[420px]">
            <div className="text-[10px] font-black uppercase tracking-[.16em] text-blue-200">Assistência técnica de peças</div>
            <h1 className="mt-3 text-3xl font-black leading-tight tracking-[-.04em]">Catálogo, evidência técnica e orçamento no mesmo fluxo.</h1>
            <p className="mt-4 text-sm leading-6 text-slate-300">Uma área de trabalho interna para localizar a peça correta e manter o atendimento em andamento sem alternar entre várias ferramentas.</p>
            <div className="mt-7 space-y-3 border-t border-white/10 pt-5 text-xs text-slate-300">
              <div className="flex items-center justify-between gap-4"><span>Busca por código, peça, modelo e PNC</span><span className="text-blue-200">01</span></div>
              <div className="flex items-center justify-between gap-4"><span>Catálogo, cadastro comercial e fonte oficial</span><span className="text-blue-200">02</span></div>
              <div className="flex items-center justify-between gap-4"><span>Assistência por IA baseada em evidências</span><span className="text-blue-200">03</span></div>
            </div>
          </div>

          <div className="relative z-10 border-t border-white/10 pt-5">
            <img src="/vardao-logo-transparent.png" alt="Vardão Máquinas" className="w-40 brightness-0 invert opacity-90" />
            <div className="mt-3 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">Ambiente interno</div>
          </div>
        </section>

        <section className="flex min-h-full items-center justify-center p-6 sm:p-10 lg:p-12">
          <div className="w-full max-w-[410px]">
            <div className="mb-9 lg:hidden">
              <div className="flex items-center gap-3"><img src="/favicon.png" alt="" className="h-10 w-10 rounded-xl object-cover" /><div><div className="font-black">CogniVault</div><div className="text-[9px] font-bold uppercase tracking-[.14em] text-[#1d4f91] dark:text-blue-300">Vardão Máquinas</div></div></div>
            </div>

            <div>
              <div className="text-[10px] font-black uppercase tracking-[.15em] text-[#1d4f91] dark:text-blue-300">Acesso interno</div>
              <h2 className="mt-2 text-3xl font-black tracking-[-.04em] text-slate-950 dark:text-white">Entrar</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">Use as credenciais da equipe para abrir sua área de trabalho.</p>
            </div>

            {error && <div role="alert" aria-live="polite" className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}

            <form onSubmit={handleLogin} className="mt-7 space-y-4" aria-busy={loading}>
              <div>
                <label htmlFor="login-email" className="mb-2 block text-xs font-bold text-slate-600 dark:text-slate-300">E-mail</label>
                <input id="login-email" type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" autoFocus required placeholder="seuemail@empresa.com" className="h-12 w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 text-sm outline-none transition focus:border-[#1d4f91] focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-800 dark:focus:bg-slate-800" />
              </div>
              <div>
                <label htmlFor="login-password" className="mb-2 block text-xs font-bold text-slate-600 dark:text-slate-300">Senha</label>
                <div className="relative">
                  <input id="login-password" type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required placeholder="••••••••" className="h-12 w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 pr-20 text-sm outline-none transition focus:border-[#1d4f91] focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-800 dark:focus:bg-slate-800" />
                  <button type="button" onClick={() => setShowPassword(value => !value)} className="absolute inset-y-0 right-0 px-3.5 text-xs font-bold text-slate-400 transition hover:text-[#1d4f91] dark:hover:text-blue-300" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showPassword ? 'Ocultar' : 'Mostrar'}</button>
                </div>
              </div>
              <button disabled={loading} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#123867] text-sm font-black text-white transition hover:bg-[#0d2c52] focus:ring-4 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60">
                {loading && <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />}
                {loading ? (preparing ? 'Preparando o CogniVault…' : 'Validando acesso…') : 'Entrar no CogniVault'}
              </button>
            </form>

            <div className="mt-3 min-h-5 text-center text-[10px] font-semibold text-slate-400" aria-live="polite">
              {serverState === 'checking' ? 'Preparando o servidor em segundo plano…' : serverState === 'slow' ? 'Servidor em inicialização; o acesso aguardará ficar pronto.' : 'Servidor pronto para o atendimento.'}
            </div>

            <div className="mt-4 flex items-center justify-between gap-4 border-t border-slate-100 pt-4 text-[10px] font-semibold text-slate-400 dark:border-slate-800">
              <span className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${serverState === 'ready' ? 'bg-emerald-500' : 'bg-amber-400'}`} />Acesso protegido</span>
              <span>Administrador · Balcão</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
