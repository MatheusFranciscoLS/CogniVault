import { useState } from 'react';

interface Document {
  id: string;
  filename: string;
  status: string;
}

interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
}

const apiUrl = import.meta.env.VITE_API_URL || '';

function App() {
  const tenantId = 'e19cf030-b744-4910-94f0-4e25b38a71a0';

  const [document, setDocument] = useState<Document | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isAsking, setIsAsking] = useState(false);

  // 🚀 CONECTADO AO BACKEND: Rota de Upload
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pdfUrl.trim()) return;

    setIsUploading(true);
    try {
      // Correção aplicada aqui: uso de crases (backticks)
      const response = await fetch(`${apiUrl}/api/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          filename: 'documento_enviado.pdf',
          url: pdfUrl
        })
      });

      const data = await response.json();
      setDocument(data.document);

      // Limpa o chat quando um novo documento é enviado
      setMessages([{ role: 'ai', text: 'Olá! Li o seu documento. O que você gostaria de saber sobre ele?' }]);
    } catch (error) {
      console.error("Erro no upload:", error);
      alert("Falha ao se conectar com a API.");
    } finally {
      setIsUploading(false);
      setPdfUrl('');
    }
  };

  // 🚀 CONECTADO AO BACKEND: Rota de Chat
  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    // Adiciona a pergunta do usuário na tela
    const userQuestion = question;
    setMessages(prev => [...prev, { role: 'user', text: userQuestion }]);
    setQuestion('');
    setIsAsking(true);

    try {
      // Correção aplicada aqui também
      const response = await fetch(`${apiUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          question: userQuestion
        })
      });

      const data = await response.json();

      // Adiciona a resposta da IA na tela
      setMessages(prev => [...prev, {
        role: 'ai',
        text: data.answer || "Desculpe, não consegui formular uma resposta."
      }]);
    } catch (error) {
      console.error("Erro no chat:", error);
      setMessages(prev => [...prev, { role: 'ai', text: '❌ Erro de conexão com o servidor.' }]);
    } finally {
      setIsAsking(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans text-slate-800">

      <header className="max-w-4xl mx-auto mb-10 text-center">
        <h1 className="text-4xl font-extrabold text-indigo-600 mb-2">CogniVault</h1>
        <p className="text-slate-500">Converse com seus documentos PDF</p>
      </header>

      <main className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">

        {/* Painel Esquerdo: Upload */}
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <span>📄</span> Adicionar Documento
          </h2>

          <form onSubmit={handleUpload} className="space-y-4">
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-indigo-500 transition-colors">
              <p className="text-slate-500 text-sm mb-2">Coloque um link público de PDF aqui</p>
              <input
                type="url"
                value={pdfUrl}
                onChange={(e) => setPdfUrl(e.target.value)}
                placeholder="https://exemplo.com/documento.pdf"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isUploading}
              className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {isUploading ? 'Processando IA...' : 'Enviar e Vetorizar'}
            </button>
          </form>

          {document && (
            <div className="mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800">
              <p className="font-semibold flex items-center gap-2">
                <span>✅</span> Arquivo na fila de processamento!
              </p>
              <p className="text-sm mt-1 text-emerald-600">Aguarde 5 segundos para a IA ler, e pode fazer perguntas.</p>
            </div>
          )}
        </section>

        {/* Painel Direito: Chat */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col h-[500px]">

          <div className="p-4 border-b border-slate-100 bg-slate-50 rounded-t-2xl">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <span>💬</span> Chat com IA
            </h2>
          </div>

          <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50">
            {messages.length === 0 ? (
              <div className="text-center text-slate-400 mt-20">
                Envie um PDF e faça perguntas sobre ele aqui!
              </div>
            ) : (
              messages.map((msg, index) => (
                <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-none'
                    : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none shadow-sm'
                    }`}>
                    {msg.text}
                  </div>
                </div>
              ))
            )}
            {isAsking && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-200 text-slate-500 rounded-2xl rounded-bl-none px-4 py-2 shadow-sm animate-pulse">
                  Digitando...
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleAsk} className="p-4 bg-white border-t border-slate-100 rounded-b-2xl">
            <div className="flex gap-2">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Qual o assunto principal?"
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                disabled={!document || isAsking}
              />
              <button
                type="submit"
                disabled={!document || isAsking || !question.trim()}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors font-semibold"
              >
                Enviar
              </button>
            </div>
          </form>

        </section>
      </main>
    </div>
  );
}

export default App;