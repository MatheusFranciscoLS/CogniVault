import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ShellV2 from '../components/ShellV2';
import TechnicalAssistantWorkspace from '../components/parts-v2/TechnicalAssistantWorkspace';
import { api, apiJson, clearSession, SESSION_EXPIRED_EVENT } from '../lib';
import { activateQuoteStorageScope } from '../lib/quote-storage-scope';
import type { Section, SessionUser } from '../types';
import '../assistant.css';
import '../admin-polish.css';
import '../quality-polish.css';

// Só uma dessas três telas está visível por vez, e "parts" é a tela padrão no
// login — então só ela precisa vir no primeiro pacote de JS. Catálogos e
// Máquinas entram sob demanda, no clique da aba.
const CatalogsWorkspace = lazy(() => import('../components/CatalogsWorkspace'));
const MachinesWorkspace = lazy(() => import('../components/machines/MachinesWorkspace'));
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

function PanelLoading() {
  return (
    <div className="flex min-h-[300px] items-center justify-center">
      <div className="flex items-center gap-3 text-xs text-ink-400">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-300 border-t-brand-600 dark:border-ink-600 dark:border-t-brand-400" />
        Carregando painel…
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [initialParams] = useState(() => new URLSearchParams(window.location.search));
  const initialSectionParam = initialParams.get('tab') as Section | null;
  const initialQueryParam = cleanNavigationValue(initialParams.get('code') || initialParams.get('part') || initialParams.get('q'));
  const initialCatalogParam = cleanNavigationValue(initialParams.get('catalog'));
  const initialPncParam = cleanNavigationValue(initialParams.get('pnc')).replace(/\D/g, '');
  const initialMachineSearchParam = cleanNavigationValue(initialParams.get('search'));

  const [user, setUser] = useState<SessionUser | null>(null);
  const [section, setSection] = useState<Section>(() => {
    if (initialPncParam || initialMachineSearchParam) return 'machines';
    if (initialQueryParam) return 'parts';
    if (initialCatalogParam) return 'catalogs';
    if (initialSectionParam && initialSectionParam !== 'home' && initialSectionParam !== 'assistant') return initialSectionParam;
    return 'parts';
  });
  const [globalQuery, setGlobalQuery] = useState(initialQueryParam);
  const [searchVersion, setSearchVersion] = useState(0);
  const [catalogFilter, setCatalogFilter] = useState(initialCatalogParam);
  const [error, setError] = useState('');
  // As vistas oficiais custam uma consulta externa, então o workspace de
  // máquinas continua montado depois da primeira visita: voltar do atendimento
  // não pode obrigar o balcão a carregar a mesma máquina de novo.
  const [machinesMounted, setMachinesMounted] = useState(section === 'machines');
  const [machinePnc, setMachinePnc] = useState(initialPncParam);
  const [machineSearch, setMachineSearch] = useState(initialMachineSearchParam);
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

  const writeMachineUrl = useCallback((state: { pnc: string; search: string }) => {
    try {
      const params = new URLSearchParams();
      params.set('tab', 'machines');
      if (state.pnc) params.set('pnc', state.pnc);
      if (state.search) params.set('search', state.search);
      window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
    } catch {
      // Navegador restrito ou ambiente de teste.
    }
  }, []);

  const handleMachineState = useCallback((state: { pnc: string; search: string }) => {
    // Guardar o que está aberto aqui mantém a URL correta mesmo quando o balcão
    // sai para o atendimento e volta pela navegação lateral.
    setMachinePnc(state.pnc);
    setMachineSearch(state.search);
    if (sectionRef.current !== 'machines') return;
    writeMachineUrl(state);
  }, [writeMachineUrl]);

  const handleSectionChange = (next: Section) => {
    if (next !== 'catalogs') setCatalogFilter('');
    const targetSection = next === 'assistant' || next === 'home' ? 'parts' : next;
    if (targetSection === 'machines') {
      setMachinesMounted(true);
      setSection(targetSection);
      writeMachineUrl({ pnc: machinePnc, search: machineSearch });
      return;
    }
    setSection(targetSection);
    updateUrl(targetSection);
  };

  const openMachine = (pnc: string) => {
    const clean = pnc.replace(/\D/g, '');
    if (!clean) return;
    // Primeira visita: o workspace monta já lendo este PNC. Visita seguinte: ele
    // continua montado, então o evento é o que troca a máquina aberta. O aviso
    // só sai depois do render para não chegar antes do listener existir.
    setMachinePnc(clean);
    setMachinesMounted(true);
    setSection('machines');
    try {
      window.history.replaceState(null, '', `${window.location.pathname}?tab=machines&pnc=${encodeURIComponent(clean)}`);
    } catch {
      // Navegador restrito ou ambiente de teste.
    }
    window.setTimeout(() => window.dispatchEvent(new CustomEvent<string>('cognivault:open-machine', { detail: clean })), 0);
  };

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center bg-ink-100 p-6 dark:bg-ink-950">
        <div role="alert" className="max-w-md rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-xl shadow-ink-900/5 dark:border-rose-900 dark:bg-ink-900">
          <div className="text-sm font-black text-rose-700 dark:text-rose-300">Não foi possível abrir o CogniVault</div>
          <p className="mt-2 text-xs leading-5 text-ink-500 dark:text-ink-400">{error}</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="grid min-h-screen place-items-center bg-ink-100 p-6 dark:bg-ink-950">
        <div className="text-center">
          <img src="/vardao-logo-transparent.webp" alt="Vardão Máquinas" className="mx-auto w-40" />
          <div className="mx-auto mt-6 h-1 w-28 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-700">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-brand-600" />
          </div>
          <p className="mt-3 text-xs font-medium text-ink-400">Preparando sua área de trabalho…</p>
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
        <div className="cv-assistant-workspace">
          <TechnicalAssistantWorkspace
            key={searchVersion}
            initialQuery={globalQuery}
            onQueryChange={updatePartQuery}
            storageScope={user.id}
            onOpenMachine={openMachine}
          />
        </div>
      )}

      {machinesMounted && (
        <div className={section === 'machines' ? undefined : 'hidden'}>
          <Suspense fallback={<PanelLoading />}>
            <MachinesWorkspace
              initialPnc={machinePnc}
              initialSearch={initialMachineSearchParam}
              onStateChange={handleMachineState}
              onSearchPart={search}
              storageScope={user.id}
            />
          </Suspense>
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
