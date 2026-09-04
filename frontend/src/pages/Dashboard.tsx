import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Shell from '../components/Shell';
import HomePanel from '../components/HomePanel';
import PartSearchPanel from '../components/PartSearchPanel';
import CatalogsPanel from '../components/CatalogsPanel';
import { apiJson, clearSession, getToken, SESSION_EXPIRED_EVENT } from '../lib';
import type { Section, SessionUser } from '../types';

// Code-splitting para painéis administrativos e de auditoria / salvos
const OverviewPanel = lazy(() => import('../components/AdminPanels').then(m => ({ default: m.OverviewPanel })));
const UsersPanel = lazy(() => import('../components/AdminPanels').then(m => ({ default: m.UsersPanel })));
const AuditPanel = lazy(() => import('../components/AdminPanels').then(m => ({ default: m.AuditPanel })));
const AdminFeedbackPanel = lazy(() => import('../components/AdminFeedbackPanel'));
const QualityPanel = lazy(() => import('../components/QualityPanel'));
const HistoryPanel = lazy(() => import('../components/SavedItemsPanels').then(m => ({ default: m.HistoryPanel })));
const FavoritesPanel = lazy(() => import('../components/SavedItemsPanels').then(m => ({ default: m.FavoritesPanel })));

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
  const [user, setUser] = useState<SessionUser | null>(null);
  const [section, setSection] = useState<Section>('home');
  const [globalQuery, setGlobalQuery] = useState('');
  const [searchVersion, setSearchVersion] = useState(0);
  const [catalogFilter, setCatalogFilter] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (!getToken()) { navigate('/login', { replace: true }); return; }
    void apiJson<{ user: SessionUser }>('/api/me')
      .then(data => { if (active) { setUser(data.user); setSection('home'); } })
      .catch(e => { if (active) { setError(e instanceof Error ? e.message : 'Sessão inválida'); clearSession(); navigate('/login', { replace: true }); } });
    return () => { active = false; };
  }, [navigate]);

  useEffect(() => {
    const expired = () => navigate('/login', { replace: true });
    window.addEventListener(SESSION_EXPIRED_EVENT, expired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expired);
  }, [navigate]);

  const logout = () => { clearSession(); navigate('/login'); };
  const search = (query: string) => {
    setGlobalQuery(query);
    setSearchVersion(version => version + 1);
    setSection('parts');
  };

  const openCatalogs = (filter?: string) => {
    setCatalogFilter(filter || '');
    setSection('catalogs');
  };

  const handleSectionChange = (next: Section) => {
    if (next !== 'catalogs') setCatalogFilter('');
    setSection(next === 'assistant' ? 'parts' : next);
  };

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f4f7fb] dark:bg-slate-900 p-6">
        <div role="alert" className="max-w-md rounded-[22px] border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-800 p-6 text-center shadow-xl shadow-slate-900/5">
          <div className="text-sm font-semibold text-rose-700 dark:text-rose-300">Não foi possível abrir o CogniVault</div>
          <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{error}</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f4f7fb] dark:bg-slate-900 p-6">
        <div className="text-center">
          <img src="/vardao-logo-transparent.png" alt="Vardão Máquinas" className="mx-auto w-40" />
          <div className="mx-auto mt-6 h-1 w-28 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-[#1d4f91] dark:bg-[#1d4f91]/80" />
          </div>
          <p className="mt-3 text-xs font-medium text-slate-400">Preparando sua área de trabalho…</p>
        </div>
      </main>
    );
  }

  return (
    <Shell user={user} section={section} onSection={handleSectionChange} onLogout={logout} onSearch={search}>
      {section === 'home' && <HomePanel onSearch={search} onCatalogs={openCatalogs} />}
      {(section === 'parts' || section === 'assistant') && (
        <PartSearchPanel
          key={`${searchVersion}:${globalQuery || 'empty-search'}`}
          initialQuery={globalQuery}
          onQueryChange={setGlobalQuery}
          admin={user.role === 'ADMIN'}
          storageScope={user.id}
        />
      )}
      {section === 'catalogs' && (
        <CatalogsPanel
          key={catalogFilter || 'all-catalogs'}
          initialSearch={catalogFilter}
          admin={user.role === 'ADMIN'}
          onQuality={user.role === 'ADMIN' ? () => setSection('quality') : undefined}
          onSearch={search}
        />
      )}
      <Suspense fallback={<PanelLoading />}>
        {section === 'history' && <HistoryPanel onSearch={search} />}
        {section === 'favorites' && <FavoritesPanel onSearch={search} />}
        {section === 'overview' && user.role === 'ADMIN' && <OverviewPanel />}
        {section === 'users' && user.role === 'ADMIN' && <UsersPanel />}
        {section === 'feedback' && user.role === 'ADMIN' && <AdminFeedbackPanel />}
        {section === 'quality' && user.role === 'ADMIN' && <QualityPanel onSearch={search} />}
        {section === 'audit' && user.role === 'ADMIN' && <AuditPanel />}
      </Suspense>
    </Shell>
  );
}
