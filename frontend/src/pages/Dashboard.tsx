import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ShellV2 from '../components/ShellV2';
import TechnicalAssistantWorkspace from '../components/parts-v2/TechnicalAssistantWorkspace';
import { api, apiJson, clearSession, SESSION_EXPIRED_EVENT } from '../lib';
import { activateQuoteStorageScope } from '../lib/quote-storage-scope';
import type { Section, SessionUser } from '../types';
import '../admin-polish.css';
import '../quality-polish.css';

// "parts" é a tela padrão no login, então só ela vem no primeiro pacote de JS.
// Catálogos e os painéis de administração entram sob demanda, no clique da aba.
// Máquinas não está mais nesta lista: virou painel lateral dentro de "parts".
const CatalogsWorkspace = lazy(() => import('../components/CatalogsWorkspace'));
const OverviewPanel = lazy(() => import('../components/AdminPanels').then(module => ({ default: module.OverviewPanel })));
const BusinessPanel = lazy(() => import('../components/BusinessPanel'));
const AssistantObservabilityPanel = lazy(() => import('../components/AssistantObservabilityPanel'));
const UsersPanel = lazy(() => import('../components/AdminPanels').then(module => ({ default: module.UsersPanel })));
const AuditPanel = lazy(() => import('../components/AdminPanels').then(module => ({ default: module.AuditPanel })));
const AdminFeedbackPanel = lazy(() => import('../components/AdminFeedbackPanel'));
const QualityPanel = lazy(() => import('../components/QualityPanel'));
const HistoryWorkspace = lazy(() => import('../components/HistoryWorkspace'));
const FavoritesWorkspace = lazy(() => import('../components/FavoritesWorkspace'));
const SavedQuotesPanel = lazy(() => import('../components/SavedQuotesPanel'));

function cleanNavigationValue(value: string | null | undefined) {
  const clean = (value ?? '').trim();
  return clean === 'null' || clean === 'undefined' ? '' : clean;
}

/**
 * Esqueleto no formato do conteúdo que vem, em vez de um spinner no meio do
 * vazio: no balcão o atendente percebe que a tela está montando, e não que
 * travou. O `aria-busy` + `sr-only` mantêm o anúncio para leitor de tela.
 */
function PanelLoading() {
  return (
    <div aria-busy="true" className="space-y-4">
      <span className="sr-only">Carregando painel…</span>
      <div className="h-8 w-56 animate-pulse rounded-card bg-ink-200 dark:bg-ink-800" />
      <div className="grid gap-3 sm:grid-cols-2 tablet:grid-cols-4">
        {[0, 1, 2, 3].map(item => (
          <div key={item} className="h-24 animate-pulse rounded-card border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900" />
        ))}
      </div>
      <div className="overflow-hidden rounded-card border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
        {[0, 1, 2, 3, 4].map(item => (
          <div key={item} className="flex items-center gap-4 border-b border-ink-100 p-4 last:border-0 dark:border-ink-800">
            <div className="h-4 w-28 animate-pulse rounded bg-ink-200 dark:bg-ink-800" />
            <div className="h-4 flex-1 animate-pulse rounded bg-ink-100 dark:bg-ink-850" />
            <div className="h-8 w-24 animate-pulse rounded-card bg-ink-100 dark:bg-ink-850" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [initialParams] = useState(() => new URLSearchParams(window.location.search));
  const initialSectionParam = initialParams.get('tab') as Section | null;
  const initialQueryParam = cleanNavigationValue(
    initialParams.get('code')
    || initialParams.get('part')
    || initialParams.get('q')
    // `search=` era o campo de modelo da aba Máquinas. Ele entra aqui porque a
    // busca do Atendimento acha máquina pelo modelo — o link antigo continua
    // levando o balcão ao mesmo lugar, agora numa tela só.
    || initialParams.get('search'),
  );
  const initialCatalogParam = cleanNavigationValue(initialParams.get('catalog'));
  const initialPncParam = cleanNavigationValue(initialParams.get('pnc')).replace(/\D/g, '');

  const [user, setUser] = useState<SessionUser | null>(null);
  const [section, setSection] = useState<Section>(() => {
    if (initialQueryParam) return 'parts';
    if (initialCatalogParam) return 'catalogs';
    // `tab=machines` ainda chega de link antigo e de aba aberta antes do deploy.
    // Ele cai no Atendimento, que é onde a máquina abre agora — o PNC segue
    // junto em `initialPncParam`, então o painel lateral já nasce aberto.
    if (
      initialSectionParam
      && initialSectionParam !== 'home'
      && initialSectionParam !== 'assistant'
      && (initialSectionParam as string) !== 'machines'
    ) {
      return initialSectionParam;
    }
    return 'parts';
  });
  const [globalQuery, setGlobalQuery] = useState(initialQueryParam);
  const [searchVersion, setSearchVersion] = useState(0);
  const [catalogFilter, setCatalogFilter] = useState(initialCatalogParam);
  const [error, setError] = useState('');
  // O PNC da URL desce para o Atendimento, que é quem abre o painel lateral.
  // Antes havia estado de máquina aqui (montagem, PNC, busca e um evento de
  // janela para trocar a máquina aberta sem desmontar o workspace): nada disso
  // é preciso quando a máquina não é mais uma tela irmã.
  const machinePncFromUrl = initialPncParam;
  const sectionRef = useRef(section);

  useEffect(() => {
    sectionRef.current = section;
  }, [section]);

  const updateUrl = (newTab: string, queryParam?: string, catalogParam?: string) => {
    try {
      const params = new URLSearchParams();
      if (newTab !== 'parts') params.set('tab', newTab);
      if (queryParam) params.set('q', queryParam);
      if (catalogParam) params.set('catalog', catalogParam);
      const value = params.toString();
      const newUrl = value ? `${window.location.pathname}?${value}` : window.location.pathname;
      window.history.replaceState(null, '', newUrl);
    } catch {
      // Navegador restrito ou ambiente de teste.
    }
  };

  useEffect(() => {
    let active = true;
    // O JWT fica em cookie HttpOnly e não pode/deve ser lido pelo JavaScript.
    // /api/me é a fonte de verdade para restaurar ou rejeitar a sessão.
    void apiJson<{ user: SessionUser }>('/api/me')
      .then(data => {
        if (active) setUser(data.user);
      })
      .catch(requestError => {
        if (!active) return;
        activateQuoteStorageScope('anonymous');
        clearSession();
        const message = requestError instanceof Error ? requestError.message : 'Sessão inválida';
        if (!/sessão|token|autentica/i.test(message)) setError(message);
        navigate('/login', { replace: true });
      });

    return () => {
      active = false;
    };
  }, [navigate]);

  useEffect(() => {
    const expired = () => {
      activateQuoteStorageScope('anonymous');
      clearSession();
      navigate('/login', { replace: true });
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, expired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expired);
  }, [navigate]);

  const logout = () => {
    // Salva o carrinho no escopo do usuário atual e troca para o contexto
    // anônimo antes de limpar a sessão. Assim um próximo login no mesmo PC
    // nunca herda orçamento ou histórico de outra pessoa.
    void api('/api/logout', { method: 'POST', timeoutMs: 8_000 }).catch(() => undefined).finally(() => {
      activateQuoteStorageScope('anonymous');
      clearSession();
      navigate('/login', { replace: true });
    });
  };

  const search = (query: string) => {
    const clean = cleanNavigationValue(query);
    setGlobalQuery(clean);
    setSearchVersion(version => version + 1);
    setSection('parts');
    updateUrl('parts', clean || undefined);
  };

  const updatePartQuery = (query: string) => {
    const clean = cleanNavigationValue(query);
    setGlobalQuery(clean);
    updateUrl('parts', clean || undefined);
  };

  const handleSectionChange = (next: Section) => {
    if (next !== 'catalogs') setCatalogFilter('');
    const targetSection = next === 'assistant' || next === 'home' ? 'parts' : next;
    setSection(targetSection);
    updateUrl(targetSection);
  };

  if (error) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-ink-100 p-6 dark:bg-ink-950">
        <div
          role="alert"
          className="w-full max-w-[460px] rounded-panel border border-ink-200 bg-white p-6 shadow-raised dark:border-ink-800 dark:bg-ink-900"
        >
          <img
            src="/brand/vardao-horizontal-azul.png"
            alt="Vardão Máquinas"
            className="h-7 w-auto max-w-[150px] object-contain dark:brightness-0 dark:invert"
          />
          <div className="mt-5 flex items-start gap-3">
            <span aria-hidden="true" className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-card bg-rose-50 text-base font-black text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              !
            </span>
            <div className="min-w-0">
              <h1 className="text-base font-bold text-ink-950 dark:text-white">Não foi possível abrir o CogniVault</h1>
              <p className="mt-1.5 text-sm leading-6 text-ink-500 dark:text-ink-400">{error}</p>
            </div>
          </div>

          {/* A tela antiga mostrava o erro e parava aí: o atendente ficava sem
              saída, com o cliente esperando. Agora tem as duas ações que
              resolvem na prática — tentar de novo (Render free dorme e volta)
              ou entrar novamente. */}
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="cv-primary cv-touch-target flex-1 px-4 text-sm"
            >
              Tentar de novo
            </button>
            <button
              type="button"
              onClick={logout}
              className="cv-secondary cv-touch-target flex-1 px-4 text-sm"
            >
              Entrar novamente
            </button>
          </div>

          <p className="mt-4 text-[11px] leading-5 text-ink-500 dark:text-ink-400">
            Se acabou de abrir o sistema, o servidor pode estar iniciando: aguarde alguns
            segundos e toque em <strong>Tentar de novo</strong>.
          </p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-ink-100 p-6 dark:bg-ink-950">
        <div aria-busy="true" className="w-full max-w-[320px] text-center">
          <img
            src="/brand/vardao-horizontal-azul.png"
            alt="Vardão Máquinas"
            className="mx-auto h-10 w-auto max-w-[190px] object-contain dark:brightness-0 dark:invert"
          />
          <div className="mx-auto mt-6 h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800">
            {/* Barra indeterminada de verdade: a anterior era um pulso parado
                em 50%, que em rede lenta parecia progresso travado. */}
            <div className="h-full w-1/3 animate-cv-indeterminate rounded-full bg-brand-600 dark:bg-brand-400" />
          </div>
          <p className="mt-4 text-sm font-semibold text-ink-600 dark:text-ink-300">Preparando o atendimento…</p>
          <p className="mt-1 text-xs leading-5 text-ink-500 dark:text-ink-400">
            Carregando catálogo, cadastro comercial e sua cesta de orçamento.
          </p>
        </div>
      </main>
    );
  }

  return (
    <ShellV2
      user={user}
      section={section}
      onSection={handleSectionChange}
      onLogout={logout}
      onSearch={search}
    >
      {(section === 'parts' || section === 'assistant' || section === 'home') && (
        <div className="w-full">
          <TechnicalAssistantWorkspace
            key={searchVersion}
            initialQuery={globalQuery}
            onQueryChange={updatePartQuery}
            storageScope={user.id}
            initialMachinePnc={machinePncFromUrl}
          />
        </div>
      )}

      <Suspense fallback={<PanelLoading />}>
        {section === 'catalogs' && (
          <CatalogsWorkspace
            key={catalogFilter || 'all-catalogs'}
            initialSearch={catalogFilter}
            admin={user.role === 'ADMIN'}
            onQuality={user.role === 'ADMIN' ? () => setSection('quality') : undefined}
            onSearch={search}
          />
        )}
        {section === 'quotes' && <SavedQuotesPanel />}
        {section === 'history' && <HistoryWorkspace onSearch={search} />}
        {section === 'favorites' && <FavoritesWorkspace onSearch={search} />}
        {section === 'overview' && user.role === 'ADMIN' && (
          <>
            <OverviewPanel />
            <AssistantObservabilityPanel />
          </>
        )}
        {section === 'business' && user.role === 'ADMIN' && <BusinessPanel />}
        {section === 'users' && user.role === 'ADMIN' && <UsersPanel />}
        {section === 'feedback' && user.role === 'ADMIN' && <AdminFeedbackPanel />}
        {section === 'quality' && user.role === 'ADMIN' && <div className="cv-quality-workspace"><QualityPanel onSearch={search} /></div>}
        {section === 'audit' && user.role === 'ADMIN' && <AuditPanel />}
      </Suspense>
    </ShellV2>
  );
}
