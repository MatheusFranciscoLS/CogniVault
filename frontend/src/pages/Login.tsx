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
    event.preventDefault(); setError(''); setLoading(true);
    const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3333').replace(/\/$/, '');
    try {
      const response = await fetch(`${apiUrl}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível entrar.');
      localStorage.setItem('cognivault_token', data.token);
      localStorage.setItem('cognivault_tenant', data.user.tenantId);
      localStorage.setItem('cognivault_role', data.user.role);
      localStorage.setItem('cognivault_email', data.user.email);
      navigate('/dashboard');
    } catch (err) { setError(err instanceof Error ? err.message : 'Erro inesperado.'); }
    finally { setLoading(false); }
  };

  return <div className="min-h-screen grid lg:grid-cols-[1.05fr_.95fr] bg-white">
    <section className="hidden lg:flex relative overflow-hidden bg-[#0d1321] text-white p-12 xl:p-16 flex-col justify-between">
      <div className="absolute -top-40 -right-32 w-[520px] h-[520px] rounded-full bg-indigo-500/10"/><div className="absolute -bottom-56 -left-36 w-[620px] h-[620px] rounded-full bg-violet-500/10"/>
      <div className="relative z-10 flex items-center gap-3"><div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center font-bold">C</div><div><div className="text-xl font-bold">CogniVault</div><div className="text-[11px] uppercase tracking-[.2em] text-slate-500">Parts Intelligence</div></div></div>
      <div className="relative z-10 max-w-xl"><div className="inline-flex rounded-full border border-indigo-400/20 bg-indigo-500/10 text-indigo-300 px-3 py-1.5 text-xs font-semibold mb-6">Base técnica inteligente para peças</div><h1 className="text-4xl xl:text-5xl font-bold tracking-tight leading-[1.08]">Catálogos, códigos e IA em um único lugar.</h1><p className="mt-6 text-slate-400 leading-7 max-w-lg">Consulte vistas explodidas, filtre por PNC e encontre Part Numbers com uma camada de validação pensada para o balcão da loja.</p><div className="mt-9 grid grid-cols-3 gap-3 max-w-lg">{['PDFs centralizados','Validação por PNC','Feedback da equipe'].map(item=><div key={item} className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs text-slate-300 leading-5">{item}</div>)}</div></div>
      <div className="relative z-10 text-xs text-slate-600">Acesso restrito à equipe autorizada.</div>
    </section>
    <section className="flex items-center justify-center p-6 sm:p-10 bg-[#f8f9fc]"><div className="w-full max-w-[430px]"><div className="lg:hidden flex items-center gap-3 mb-10"><div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold">C</div><div className="font-bold text-xl">CogniVault</div></div><div className="mb-8"><p className="text-sm font-semibold text-indigo-600 mb-2">Bem-vindo</p><h2 className="text-3xl font-bold tracking-tight text-slate-900">Acesse sua conta</h2><p className="text-sm text-slate-500 mt-2">Use as credenciais fornecidas pelo administrador da loja.</p></div>{error&&<div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}<form onSubmit={handleLogin} className="space-y-4"><div><label className="block text-sm font-medium text-slate-700 mb-2">E-mail</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required placeholder="nome@empresa.com" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"/></div><div><label className="block text-sm font-medium text-slate-700 mb-2">Senha</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required placeholder="••••••••" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"/></div><button disabled={loading} className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-3 mt-2">{loading?'Entrando...':'Entrar no sistema'}</button></form><p className="mt-6 text-center text-xs text-slate-400">Não possui acesso? Solicite ao administrador da empresa.</p></div></section>
  </div>;
}
