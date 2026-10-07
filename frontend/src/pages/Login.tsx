import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL, apiJson, ensureApiReady, isApiRecentlyReady } from '../lib';
import { activateQuoteStorageScope } from '../lib/quote-storage-scope';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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

/** Selo dourado da revenda, no ouro real do site da loja (#ffc800). */
function GoldSeal() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-500 px-2.5 py-1 text-seal uppercase text-ink-900">
      Revenda Autorizada Ouro
    </span>
  );
}

/**
 * Faixa de autorização Husqvarna.
 *
 * O lockup oficial (coroa + palavra) vem de vardaomaquinas.com.br/brand — o
 * mesmo arquivo do site da loja, transparente e nas duas cores, então cada
 * fundo recebe a versão certa em vez de um filtro CSS por cima da marca de
 * terceiro.
 *
 * **Era um card com borda e virou faixa.** No painel da marca ele tinha 657px
 * de largura num painel de 754 — borda a borda — com o selo dourado solto
 * embaixo, duas caixas dizendo a mesma coisa. E, por ficar no rodapé, a borda
 * dele cortava a marca d'água de fundo no meio, que é o que o dono viu.
 *
 * A régua superior separa sem desenhar caixa, e o selo entra na mesma linha:
 * um rodapé institucional, não um componente de formulário deslocado.
 */
function AuthorizedByHusqvarna({ tone }: { tone: 'onBrand' | 'onLight' }) {
  const onBrand = tone === 'onBrand';
  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-3 border-t pt-4 ${
        onBrand ? 'border-white/15' : 'border-ink-200 dark:border-ink-800'
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
      {/* Sem repetir "Revenda Autorizada Ouro" em texto aqui: o selo ao lado já
          diz isso, e o e2e casa esse texto por substring sem diferenciar
          maiúsculas — duas ocorrências violariam o modo estrito do Playwright. */}
      <div className={`min-w-[190px] flex-1 border-l pl-4 ${onBrand ? 'border-white/15' : 'border-ink-200 dark:border-ink-800'}`}>
        <div className={`text-xs font-bold ${onBrand ? 'text-white' : 'text-ink-950 dark:text-white'}`}>
          Peças e catálogo originais
        </div>
        <div className={`mt-0.5 text-[11px] ${onBrand ? 'text-brand-200' : 'text-ink-500 dark:text-ink-400'}`}>
          Direto da fonte oficial da fábrica
        </div>
      </div>
      {/* Só no painel da marca. No celular o painel não existe e o selo já
          está no cabeçalho compacto — dois na mesma tela seriam a repetição
          que esta faixa veio resolver. */}
      {onBrand && <GoldSeal />}
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

  // Quem já tem sessão e abre /login (favorito do navegador, aba antiga) vai direto ao painel, em vez de ver o
  // formulário de novo. É um `fetch` simples, e não `apiJson`: o 401 de quem NÃO está logado aqui é o caso
  // normal, e `apiJson` trataria como "sessão expirada".
  useEffect(() => {
    // Sem lembrança de login anterior neste navegador, não há o que consultar: quem abre o login pela primeira vez
    // (ou depois de "Sair", que apaga isto) não gera um 401 vermelho no console.
    if (!localStorage.getItem('cognivault_email')) return;
    let active = true;
    void fetch(`${API_URL}/api/me`, { credentials: 'include' })
      .then(response => (response.ok ? response.json() as Promise<LoginResponse> : null))
      .then(session => {
        if (!active || !session?.user) return;
        localStorage.setItem('cognivault_tenant', session.user.tenantId);
        localStorage.setItem('cognivault_role', session.user.role);
        localStorage.setItem('cognivault_email', session.user.email);
        activateQuoteStorageScope(session.user.email.trim().toLocaleLowerCase('pt-BR'));
        navigate('/dashboard', { replace: true });
      })
      .catch(() => { /* sem sessão ou sem rede: o formulário de login é o certo */ });
    return () => { active = false; };
  }, [navigate]);

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
  return (
    <main className="min-h-dvh bg-ink-100 text-ink-950 lg:grid lg:min-h-dvh lg:grid-cols-[1.1fr_1fr] dark:bg-ink-950 dark:text-white">
      {/* Painel da marca. Fica escondido abaixo de lg: no tablet/celular do
          balcão a tela é para entrar rápido, não para ler apresentação. */}
      <aside className="relative hidden overflow-hidden border-white/10 bg-brand-600 p-10 text-white lg:flex lg:flex-col lg:justify-between lg:border-r xl:p-12">
        {/* Fundo: gradiente da marca, sem blob colorido — a identidade do site
            da loja é azul-marinho sólido com laranja só em ação.

            O gradiente para em `brand-800` (#1f2742) de propósito: `brand-900`
            é #161c2f, exatamente o mesmo valor de `ink-950`, que é o fundo da
            página no tema escuro. Terminando ali, o canto do painel ficava
            pixel a pixel igual ao fundo e o painel parecia cortado no meio. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-linear-to-br from-brand-600 via-brand-700 to-brand-800" />

        {/* Marca d'água: o símbolo oficial da Husqvarna, centralizado e inteiro.

            O que a cortava não era a posição, era o TAMANHO. Ela era medida
            pela largura (`w-[min(78%,560px)]`), e num painel de 754x900 isso
            virava 669px de altura — 74% da tela, encostando no logo em cima e
            na faixa de autorização embaixo, que entrava 32px dentro dela. É
            esse recorte que aparecia como "cortada no meio".

            Agora ela é medida pela ALTURA (`h-[min(52vh,440px)]`), que é a
            dimensão que estava sobrando. Presa a `vh`, ela ocupa sempre a
            mesma fração vertical: em 1366x768 sobram 86px até a faixa, em
            1280x650 sobram 57, em 1440x900 sobram 131 — a folga nunca fecha,
            em nenhuma altura de janela. Com largura fixa em px isso não era
            verdade: a 650px de altura elas voltavam a colidir.

            Opacidade de 7% porque atrás dela passa texto. O texto foi o outro
            lado do conserto: era `brand-100` a 70%, que já nascia em 5,31:1
            antes de qualquer marca e caía para 4,51 sobre ela. Agora é
            `brand-200` cheio — 7,23:1 limpo, 5,87:1 sobre a marca. */}
        <img
          src="/brand/husqvarna-simbolo-branco.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-[min(52vh,440px)] w-auto -translate-x-1/2 -translate-y-1/2 select-none opacity-[0.07]"
        />

        <div className="relative">
          <img
            src="/brand/vardao-horizontal-branco.png"
            alt="Vardão Máquinas"
            /* Versão branca oficial da loja, em vez de inverter o logo
               azul-marinho com filtro CSS. */
            className="h-9 w-auto max-w-[230px] object-contain"
          />
          <div className="mt-2 text-sm font-medium text-brand-200">
            Máquinas e peças · Limeira/SP
          </div>
        </div>

        <div className="relative">
          <AuthorizedByHusqvarna tone="onBrand" />
        </div>
      </aside>

      {/* Lado do formulário */}
      <section className="relative flex min-h-dvh flex-col lg:min-h-0">
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
            <h2 className="text-display-sm text-brand-600 dark:text-white">Entrar no CogniVault</h2>
            <p className="mt-2 text-base text-ink-500 dark:text-ink-400">Use o e-mail da loja.</p>

            {error && (
              <div
                role="alert"
                aria-live="polite"
                className="mt-5 rounded-lg border border-destructive bg-destructive/10 px-3.5 py-3 text-base font-medium text-destructive"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="mt-6 space-y-4" aria-busy={loading}>
              <div className="space-y-1.5">
                <label htmlFor="login-email" className="block text-base font-medium">E-mail</label>
                <Input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  autoComplete="email"
                  autoFocus
                  required
                  placeholder="seuemail@empresa.com"
                  className="h-12 text-base"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="login-password" className="block text-base font-medium">Senha</label>
                <div className="relative">
                  <Input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                    placeholder="••••••••"
                    className="h-12 pr-24 text-base"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPassword(value => !value)}
                    className="absolute inset-y-0 right-1 my-auto"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? 'Ocultar' : 'Mostrar'}
                  </Button>
                </div>
              </div>

              <Button type="submit" size="lg" disabled={loading} className="h-12 w-full">
                {loading && (
                  <span
                    aria-hidden="true"
                    className="size-4 animate-spin rounded-full border-2 border-white/35 border-t-white"
                  />
                )}
                {loading ? (preparing ? 'Preparando o CogniVault…' : 'Validando acesso…') : 'Entrar'}
              </Button>
            </form>

            {/* No celular o painel da marca não existe, então a autorização
                Husqvarna aparece aqui — é o que dá credibilidade à tela. */}
            <div className="mt-7 lg:hidden">
              <AuthorizedByHusqvarna tone="onLight" />
            </div>
          </div>
        </div>

        <footer className="px-5 pb-5 text-center text-sm text-ink-500 sm:px-8 dark:text-ink-400">
          Vardão Máquinas · CogniVault
        </footer>
      </section>
    </main>
  );
}
