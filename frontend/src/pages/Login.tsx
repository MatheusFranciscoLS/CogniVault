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

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.08fr_.92fr] bg-white">
      <section className="hidden lg:flex relative overflow-hidden bg-[#0d2348] text-white p-12 xl:p-16 flex-col justify-between">
        <div className="absolute -top-40 -right-32 w-[520px] h-[520px] rounded-full bg-blue-400/10" />
        <div className="absolute -bottom-56 -left-36 w-[620px] h-[620px] rounded-full bg-amber-400/10" />

        <div className="relative z-10">
          <div className="flex flex-wrap items-center gap-3">
            <img src="/vardao-logo.webp" alt="Vardão Máquinas" className="h-14 w-auto rounded-md bg-white p-1.5" />
            <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[.15em] text-amber-200">Revenda Ouro Husqvarna</span>
          </div>

          <div className="mt-9 flex items-center gap-4">
            <img src="/favicon.png" alt="CogniVault" className="w-16 h-16 rounded-2xl object-cover ring-1 ring-white/10" />
            <div>
              <div className="text-3xl font-bold">CogniVault</div>
              <div className="text-xs uppercase tracking-[.22em] text-slate-400">Parts Intelligence</div>
            </div>
          </div>
        </div>

        <div className="relative z-10 max-w-xl">
          <div className="inline-flex rounded-full border border-blue-300/20 bg-blue-300/10 text-blue-200 px-3 py-1.5 text-xs font-semibold mb-6">Base técnica inteligente para peças</div>
          <h1 className="text-4xl xl:text-5xl font-bold tracking-tight leading-[1.08]">Catálogos, códigos e IA em um único ambiente profissional.</h1>
          <p className="mt-6 text-slate-300 leading-7 max-w-lg">Consulte vistas explodidas, filtre por PNC e encontre Part Numbers com a base técnica da Vardão Máquinas.</p>
          <div className="mt-9 grid grid-cols-3 gap-3 max-w-lg">
            {['PDFs centralizados', 'Validação por PNC', 'Feedback da equipe'].map((item) => (
              <div key={item} className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs text-slate-200 leading-5">{item}</div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div>
            <div className="text-sm font-semibold">Acesso restrito à equipe autorizada</div>
            <div className="mt-1 text-xs text-slate-400">Ambiente interno da Vardão Máquinas.</div>
          </div>
          <img src="/husqvarna-logo.webp" alt="Husqvarna" className="h-12 w-auto rounded" />
        </div>
      </section>

      <section className="flex items-center justify-center p-6 sm:p-10 bg-[#f5f7fb]">
        <div className="w-full max-w-[450px]">
          <div className="lg:hidden mb-8">
            <div className="flex items-center gap-3">
              <img src="/favicon.png" alt="CogniVault" className="w-12 h-12 rounded-xl object-cover" />
              <div><div className="font-bold text-xl">CogniVault</div><div className="text-[10px] tracking-[.18em] text-slate-400">VARDÃO MÁQUINAS</div></div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-[28px] p-7 sm:p-9 shadow-[0_18px_60px_rgba(15,23,42,.08)]">
            <div className="mb-8">
              <p className="text-sm font-semibold text-[#1d4f91] mb-2">Bem-vindo</p>
              <h2 className="text-3xl font-bold tracking-tight text-slate-900">Acesse sua conta</h2>
              <p className="text-sm text-slate-500 mt-2 leading-6">Use as credenciais fornecidas pelo administrador da loja.</p>
            </div>

            {error && <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">E-mail</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required placeholder="nome@empresa.com" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-[#1d4f91] focus:ring-4 focus:ring-blue-500/10" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Senha</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required placeholder="••••••••" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-[#1d4f91] focus:ring-4 focus:ring-blue-500/10" />
              </div>
              <button disabled={loading} className="w-full rounded-xl bg-[#1d4f91] hover:bg-[#153d73] disabled:opacity-50 text-white font-semibold py-3 mt-2">{loading ? 'Entrando...' : 'Entrar no sistema'}</button>
            </form>

            <p className="mt-6 text-center text-xs text-slate-400">Não possui acesso? Solicite ao administrador da empresa.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
