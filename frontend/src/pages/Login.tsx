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

const CAPABILITIES = [
  {
    title: 'Peça certa na primeira consulta',
    detail: 'Código, descrição, modelo ou pergunta técnica — com a evidência da fonte que confirmou.',
  },
  {
    title: 'Fonte oficial Husqvarna',
    detail: 'Catálogo do Portal, vista explodida, documentos e substituição de código conferida.',
  },
  {
    title: 'Orçamento de balcão',
    detail: 'Monta a cesta, manda no WhatsApp ou em PDF e fica salvo para retomar depois.',
  },
];

/** Selo dourado da revenda, no ouro real do site da loja (#ffc800). */
function GoldSeal() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-500 px-2.5 py-1 text-seal uppercase text-ink-900">
      Revenda Autorizada Ouro
    </span>
  );
}

/**
 * Bloco de autorização com o lockup oficial da Husqvarna (coroa + palavra),
 * baixado de vardaomaquinas.com.br/brand — o mesmo arquivo que o site da loja
 * usa. Antes era um tile quadrado com fundo azul-marinho próprio, que obrigava
 * a apoiar a marca sobre um retângulo branco; o lockup oficial é transparente e
 * existe nas duas cores, então cada fundo recebe a versão certa em vez de um
 * filtro CSS por cima da marca de terceiro.
 */
function AuthorizedByHusqvarna({ tone }: { tone: 'onBrand' | 'onLight' }) {
  const onBrand = tone === 'onBrand';
  return (
    <div
      className={`flex items-center gap-4 rounded-card border p-3.5 ${
        onBrand
          ? 'border-white/15 bg-white/[0.07]'
          : 'border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900'
      }`}
    >
      <img
        src={onBrand ? '/brand/husqvarna-horizontal-branco.png' : '/brand/husqvarna-horizontal-azul.png'}
        alt="Husqvarna"
        className={`h-5 w-auto shrink-0 object-contain ${onBrand ? '' : 'dark:hidden'}`}
      />
      {!onBrand && (
        <img
          src="/brand/husqvarna-horizontal-branco.png"
          alt=""
          aria-hidden="true"
          className="hidden h-5 w-auto shrink-0 object-contain dark:block"
        />
      )}
      {/* Sem repetir "Revenda Autorizada Ouro" aqui: o selo dourado ao lado já
          diz isso, e o e2e casa esse texto por substring sem diferenciar
          maiúsculas — duas ocorrências violariam o modo estrito do Playwright. */}
      <div className={`min-w-0 border-l pl-4 ${onBrand ? 'border-white/15' : 'border-ink-200 dark:border-ink-800'}`}>
        <div className={`text-sm font-bold ${onBrand ? 'text-white' : 'text-ink-950 dark:text-white'}`}>
          Peças e catálogo originais
        </div>
        <div className={`mt-0.5 text-[11px] ${onBrand ? 'text-brand-100/70' : 'text-ink-500 dark:text-ink-400'}`}>
          Direto da fonte oficial da fábrica
        </div>
      </div>
    </div>
  );
}

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
    <main className="min-h-[100dvh] bg-ink-100 text-ink-950 lg:grid lg:min-h-[100dvh] lg:grid-cols-[1.1fr_1fr] dark:bg-ink-950 dark:text-white">
      {/* Painel da marca. Fica escondido abaixo de lg: no tablet/celular do
          balcão a tela é para entrar rápido, não para ler apresentação. */}
      <aside className="relative hidden overflow-hidden border-white/10 bg-brand-600 p-10 text-white lg:flex lg:flex-col lg:justify-between lg:border-r xl:p-12">
        {/* Fundo: gradiente da marca, sem blob colorido — a identidade do site
            da loja é azul-marinho sólido com laranja só em ação.

            O gradiente para em `brand-800` (#1f2742) de propósito: `brand-900`
            é #161c2f, exatamente o mesmo valor de `ink-950`, que é o fundo da
            página no tema escuro. Terminando ali, o canto do painel ficava
            pixel a pixel igual ao fundo e o painel parecia cortado no meio. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-600 via-brand-700 to-brand-800" />

        {/* Marca de fundo: a coroa oficial da Husqvarna, recortada do lockup
            branco de vardaomaquinas.com.br/brand. Substitui os dois círculos
            decorativos que havia aqui — círculo não diz nada, e a autorização
            Husqvarna é justamente o que dá autoridade à tela. Sangra pela
            borda como marca d'água, atrás do conteúdo. */}
        <img
          src="/brand/husqvarna-simbolo-branco.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-16 -right-16 w-[300px] select-none opacity-[0.07] xl:w-[360px]"
        />

        <div className="relative">
          <img
            src="/brand/vardao-horizontal-branco.png"
            alt="Vardão Máquinas"
            /* Versão branca oficial da loja, em vez de inverter o logo
               azul-marinho com filtro CSS. */
            className="h-9 w-auto max-w-[230px] object-contain"
          />
          <div className="mt-2 text-[11px] font-bold uppercase tracking-[.16em] text-brand-100/70">
            Máquinas e peças · Limeira/SP
          </div>
        </div>

        <div className="relative max-w-[460px]">
          <h1 className="text-display-lg text-white">
            O balcão inteiro em uma tela.
          </h1>
          <p className="mt-3 text-sm leading-6 text-brand-100/80">
            O CogniVault reúne catálogo técnico, cadastro comercial, fonte oficial e orçamento
            no mesmo atendimento — para o cliente não esperar e a peça não voltar.
          </p>

          <ul className="mt-7 space-y-4">
            {CAPABILITIES.map(item => (
              <li key={item.title} className="flex gap-3">
                <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" />
                <div>
                  <div className="text-sm font-bold text-white">{item.title}</div>
                  <div className="mt-0.5 text-xs leading-5 text-brand-100/70">{item.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative space-y-3">
          <AuthorizedByHusqvarna tone="onBrand" />
          <GoldSeal />
        </div>
      </aside>

      {/* Lado do formulário */}
      <section className="relative flex min-h-[100dvh] flex-col lg:min-h-0">
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px] bg-brand-fade lg:hidden" />

        {/* Cabeçalho compacto só no celular/tablet, onde o painel da marca não
            aparece: o atendente ainda precisa ver de quem é o sistema. */}
        <header className="flex items-center justify-between gap-3 px-5 pb-2 pt-5 lg:hidden">
          <img
            src="/brand/vardao-horizontal-azul.png"
            alt="Vardão Máquinas"
            className="h-7 w-auto max-w-[150px] object-contain dark:brightness-0 dark:invert"
          />
          <GoldSeal />
        </header>

        <div className="flex flex-1 items-center justify-center px-5 py-6 sm:px-8 lg:py-10">
          {/* Abaixo de lg o painel da marca não existe, e o formulário solto no
              meio da tela fica vazio — principalmente no tablet 10" em retrato,
              que é o aparelho do balcão. Nessas larguras ele ganha superfície
              de card; a partir de lg o painel já dá a estrutura e o card sai. */}
          <div className="w-full max-w-[420px] rounded-panel border border-ink-200 bg-white p-6 shadow-raised dark:border-ink-800 dark:bg-ink-900 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none dark:lg:bg-transparent">
            <div className="cv-kicker">Acesso seguro</div>
            <h2 className="mt-1.5 text-display-sm text-brand-600 dark:text-white">Entrar no CogniVault</h2>
            <p className="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-400">
              Use o e-mail cadastrado pela administração da loja.
            </p>

            {error && (
              <div
                role="alert"
                aria-live="polite"
                className="mt-5 rounded-card border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs leading-5 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="mt-5 space-y-4" aria-busy={loading}>
              <div>
                <label htmlFor="login-email" className="mb-1.5 block text-xs font-bold text-ink-600 dark:text-ink-300">
                  E-mail
                </label>
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
                  <label htmlFor="login-password" className="text-xs font-bold text-ink-600 dark:text-ink-300">
                    Senha
                  </label>
                  <span className="text-[10px] font-semibold uppercase tracking-[.08em] text-ink-500 dark:text-ink-400">Uso interno</span>
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
                    className="cv-field h-12 py-0 pr-24 text-base"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(value => !value)}
                    className="cv-touch-target absolute inset-y-0 right-1 my-auto rounded-card px-3 text-[11px] font-bold text-ink-500 transition hover:bg-ink-100 hover:text-brand-600 dark:hover:bg-ink-800 dark:hover:text-brand-300"
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
                {loading && (
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white"
                  />
                )}
                {loading ? (preparing ? 'Preparando o CogniVault…' : 'Validando acesso…') : 'Entrar'}
              </button>
            </form>

            <div
              className="mt-5 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1.5 text-[11px] font-semibold text-ink-500 dark:text-ink-400"
              aria-live="polite"
            >
              <span className="flex items-center gap-1.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot}`} />
                {statusLabel}
              </span>
              <span aria-hidden="true" className="text-ink-300 dark:text-ink-700">·</span>
              <span>Sessão de 8h</span>
              <span aria-hidden="true" className="text-ink-300 dark:text-ink-700">·</span>
              <span>Cookie protegido</span>
            </div>

            {/* No celular o painel da marca não existe, então a autorização
                Husqvarna aparece aqui — é o que dá credibilidade à tela. */}
            <div className="mt-7 lg:hidden">
              <AuthorizedByHusqvarna tone="onLight" />
            </div>
          </div>
        </div>

        <footer className="px-5 pb-5 text-center text-[10px] font-semibold uppercase tracking-[.1em] text-ink-500 sm:px-8 dark:text-ink-400">
          Vardão Máquinas · CogniVault
        </footer>
      </section>
    </main>
  );
}
