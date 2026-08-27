import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface Document {
    id: string;
    filename: string;
    status: string;
}

interface ChatMessage {
    role: 'user' | 'ai';
    text: string;
}

export default function Dashboard() {
    const navigate = useNavigate();

    const tenantId = localStorage.getItem('cognivault_tenant') || '';
    // 🚀 AQUI ESTÁ O CRACHÁ: Pegando o token salvo no login
    const token = localStorage.getItem('cognivault_token') || '';

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3333';
    const cleanUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;

    const [document, setDocument] = useState<Document | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [question, setQuestion] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isAsking, setIsAsking] = useState(false);

    useEffect(() => {
        if (!tenantId || !token) {
            navigate('/login');
        }
    }, [tenantId, token, navigate]);

    const handleLogout = () => {
        localStorage.removeItem('cognivault_token');
        localStorage.removeItem('cognivault_tenant');
        navigate('/login');
    };

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedFile || !tenantId) return;

        setIsUploading(true);

        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('tenantId', tenantId);

        try {
            const response = await fetch(`${cleanUrl}/api/upload`, {
                method: 'POST',
                // 🛡️ ENVIANDO O CRACHÁ PARA O SERVIDOR NÃO DAR 401
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            const data = await response.json();

            if (!response.ok) throw new Error(data.error || 'Erro no upload');

            setDocument(data.document);
            alert('Catálogo processado com sucesso!');
        } catch (error: any) {
            console.error("Erro no upload:", error);
            alert(`Falha ao processar: ${error.message}`);
        } finally {
            setIsUploading(false);
            setSelectedFile(null);
        }
    };

    const handleAsk = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!question.trim() || !tenantId) return;

        const userQuestion = question;
        setMessages(prev => [...prev, { role: 'user', text: userQuestion }]);
        setQuestion('');
        setIsAsking(true);

        try {
            const response = await fetch(`${cleanUrl}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` // 🛡️ ENVIANDO O CRACHÁ NO CHAT TAMBÉM
                },
                body: JSON.stringify({ tenantId, question: userQuestion })
            });

            const data = await response.json();

            if (!response.ok) throw new Error(data.error);

            setMessages(prev => [...prev, {
                role: 'ai',
                text: data.answer || "Desculpe, não consegui encontrar."
            }]);
        } catch (error) {
            console.error("Erro no chat:", error);
            setMessages(prev => [...prev, { role: 'ai', text: '❌ Erro de conexão com o servidor.' }]);
        } finally {
            setIsAsking(false);
        }
    };

    if (!tenantId) return null;

    // ... (O HTML do RETURN continua exatamente igual ao de antes, renderizando a tela lindamente)
    return (
        <div className="min-h-screen bg-slate-50 p-8 font-sans text-slate-800">
            <div className="max-w-4xl mx-auto flex justify-end mb-4">
                <button onClick={handleLogout} className="text-sm font-semibold text-slate-500 hover:text-red-600 transition-colors">
                    Sair do Sistema
                </button>
            </div>
            <header className="max-w-4xl mx-auto mb-10 text-center">
                <h1 className="text-4xl font-extrabold text-indigo-600 mb-2">CogniVault Industrial</h1>
                <p className="text-slate-500">Gestão de Catálogos e Diagnóstico por IA</p>
            </header>
            <main className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">

                {/* LADO ESQUERDO: UPLOAD */}
                <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><span>📄</span> Adicionar Catálogo (PDF)</h2>
                    <form onSubmit={handleUpload} className="space-y-4">
                        <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-indigo-500 transition-colors">
                            <input type="file" accept="application/pdf" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
                        </div>
                        <button type="submit" disabled={isUploading || !selectedFile} className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50">
                            {isUploading ? 'Processando...' : 'Fazer Upload'}
                        </button>
                    </form>
                    {document && (
                        <div className="mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800">
                            <p className="font-semibold flex items-center gap-2"><span>✅</span> Processado com sucesso!</p>
                        </div>
                    )}
                </section>

                {/* LADO DIREITO: CHAT */}
                <section className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col h-[500px]">
                    <div className="p-4 border-b border-slate-100 bg-slate-50 rounded-t-2xl">
                        <h2 className="text-lg font-bold flex items-center gap-2"><span>💬</span> Chat com IA</h2>
                    </div>
                    <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50">
                        {messages.length === 0 ? (
                            <div className="text-center text-slate-400 mt-20 px-4">Pergunte sobre qualquer peça!</div>
                        ) : (
                            messages.map((msg, index) => (
                                <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none shadow-sm'}`}>
                                        {msg.text}
                                    </div>
                                </div>
                            ))
                        )}
                        {isAsking && <div className="flex justify-start"><div className="bg-white border text-slate-500 rounded-2xl rounded-bl-none px-4 py-2 shadow-sm animate-pulse">Pesquisando vetores...</div></div>}
                    </div>
                    <form onSubmit={handleAsk} className="p-4 bg-white border-t border-slate-100 rounded-b-2xl">
                        <div className="flex gap-2">
                            <input type="text" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Qual o código da peça..." className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" disabled={isAsking} />
                            <button type="submit" disabled={isAsking || !question.trim()} className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-semibold">Enviar</button>
                        </div>
                    </form>
                </section>
            </main>
        </div>
    );
}