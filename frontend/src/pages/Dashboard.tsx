import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ShellV2 from '../components/ShellV2';
import TechnicalAssistantWorkspace from '../components/parts-v2/TechnicalAssistantWorkspace';
import CatalogsWorkspace from '../components/CatalogsWorkspace';
import { apiJson, clearSession, getToken, SESSION_EXPIRED_EVENT } from '../lib';
import type { Section, SessionUser } from '../types';
import '../assistant.css';

const OverviewPanel = lazy(() => import('../components/AdminPanels').then(module => ({ default: module.OverviewPanel })));
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
      <div className="flex items-center gap-3 text-xs text-slate-400">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-[#1d4f91] dark:border-slate-600 dark:border-t-blue-400" />
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

  const [user, setUser] = useState<SessionUser | null>(null);
  const [section, setSection] = useState<Section>(() => {
    if (initialQueryParam) return 'parts';
    if (initialCatalogParam) return 'catalogs';
    if (initialSectionParam && initialSectionParam !== 'home' && initialSectionParam !== 'assistant') return initialSectionParam;
    return 'parts';
  });
  const [globalQuery, setGlobalQuery] = useState(initialQueryParam);
  const [searchVersion, setSearchVersion] = useState(0);
  const [catalogFilter, setCatalogFilter] = useState(initialCatalogParam);
  const [error, setError] = useState('');

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
    if (!getToken()) {
      navigate('/login', { replace: true });
      return;
    }

    void apiJson<{ user: SessionUser }>('/api/me')
      .then(data => {
        if (active) setUser(data.user);
      })
      .catch(requestError => {
        if (!active) return;
        setError(requestError instanceof Error ? requestError.message : 'Sessão inválida');
        clearSession();
        navigate('/login', { replace: true });
      });

    return () => {
      active = false;
    };
  }, [navigate]);

  useEffect(() => {
    const expired = () => navigate('/login', { replace: true });
    window.addEventListener(SESSION_EXPIRED_EVENT, expired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expired);
  }, [navigate]);

  const logout = () => {
    clearSession();
    navigate('/login');
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
      <main className="grid min-h-screen place-items-center bg-[#f5f7fb] p-6 dark:bg-slate-950">
        <div role="alert" className="max-w-md rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-xl shadow-slate-900/5 dark:border-rose-900 dark:bg-slate-900">
          <div className="text-sm font-black text-rose-700 dark:text-rose-300">Não foi possível abrir o CogniVault</div>
          <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{error}</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f5f7fb] p-6 dark:bg-slate-950">
        <div className="text-center">
          <img src="/vardao-logo-transparent.png" alt="Vardão Máquinas" className="mx-auto w-40" />
          <div className="mx-auto mt-6 h-1 w-28 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-[#1d4f91]" />
          </div>
          <p className="mt-3 text-xs font-medium text-slate-400">Preparando sua área de trabalho…</p>
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
            admin={user.role === 'ADMIN'}
            storageScope={user.id}
          />
        </div>
      )}

      {section === 'catalogs' && (
        <CatalogsWorkspace
          key={catalogFilter || 'all-catalogs'}
          initialSearch={catalogFilter}
          admin={user.role === 'ADMIN'}
          onQuality={user.role === 'ADMIN' ? () => setSection('quality') : undefined}
          onSearch={search}
        />
      )}

      <Suspense fallback={<PanelLoading />}>
        {section === 'quotes' && <SavedQuotesPanel />}
        {section === 'history' && <HistoryWorkspace onSearch={search} />}
        {section === 'favorites' && <FavoritesWorkspace onSearch={search} />}
        {section === 'overview' && user.role === 'ADMIN' && <OverviewPanel />}
        {section === 'users' && user.role === 'ADMIN' && <UsersPanel />}
        {section === 'feedback' && user.role === 'ADMIN' && <AdminFeedbackPanel />}
        {section === 'quality' && user.role === 'ADMIN' && <QualityPanel onSearch={search} />}
        {section === 'audit' && user.role === 'ADMIN' && <AuditPanel />}
      </Suspense>
    </ShellV2>
  );
}
