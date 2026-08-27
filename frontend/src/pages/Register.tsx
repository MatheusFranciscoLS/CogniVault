import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Register() {
    const [tenantName, setTenantName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const navigate = useNavigate();

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tenantName, email, password })
            });

            const data = await response.json();

            if (!response.ok) throw new Error(data.error || 'Erro ao cadastrar');

            setSuccess('Conta criada! Redirecionando para o login...');

            // Manda pro login depois de 2 segundos
            setTimeout(() => navigate('/login'), 2000);

        } catch (err: any) {
            setError(err.message);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-slate-200 p-8">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-extrabold text-indigo-600 mb-2">CogniVault</h1>
                    <p className="text-slate-500">Cadastro de Nova Empresa</p>
                </div>

                {error && <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg text-center">{error}</div>}
                {success && <div className="mb-4 p-3 bg-emerald-50 text-emerald-700 text-sm rounded-lg text-center">{success}</div>}

                <form onSubmit={handleRegister} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Nome da Empresa / Loja</label>
                        <input
                            type="text"
                            value={tenantName}
                            onChange={(e) => setTenantName(e.target.value)}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="Ex: Husqvarna Center"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Seu E-mail (Admin)</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="admin@empresa.com"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Senha Segura</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    <button type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded-lg hover:bg-indigo-700 transition-colors mt-4">
                        Criar Minha Empresa
                    </button>
                </form>

                <div className="mt-6 text-center text-sm text-slate-500">
                    Já tem conta? <a href="/login" className="text-indigo-600 font-semibold hover:underline">Fazer Login</a>
                </div>
            </div>
        </div>
    );
}