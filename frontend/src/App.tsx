import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import ReloadPrompt from './components/ReloadPrompt';
import QuickQuoteCart from './components/QuickQuoteCart';
import QuoteCartOverlayLifecycle from './components/QuoteCartOverlayLifecycle';
import { ErrorBoundary } from './components/ErrorBoundary';
import { QuoteCartProvider } from './context/QuoteCartContext';
import { CounterSessionProvider } from './context/CounterSessionProvider';
import { activateQuoteStorageScope, quoteStorageScopeFromSession } from './lib/quote-storage-scope';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));

function RouteLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 text-sm text-ink-500 dark:bg-ink-950 dark:text-ink-400">
      <div className="flex items-center gap-3">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-ink-300 border-t-brand-600 dark:border-ink-700 dark:border-t-brand-400" />
        Carregando…
      </div>
    </div>
  );
}

function LegacyHusqvarnaRedirect() {
  // A consulta oficial deixou de ser uma página solta: hoje ela é a seção
  // Máquinas do balcão. Links antigos continuam funcionando com o mesmo PNC.
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const next = new URLSearchParams({ tab: 'machines' });
  const pnc = (params.get('pnc') || '').replace(/\D/g, '');
  const query = (params.get('search') || '').trim();
  if (pnc) next.set('pnc', pnc);
  if (query) next.set('search', query);
  return <Navigate to={`/dashboard?${next.toString()}`} replace />;
}

function RouteScopedQuoteExperience() {
  const { pathname } = useLocation();
  if (pathname === '/' || pathname === '/login') return null;
  return (
    <>
      <QuoteCartOverlayLifecycle />
      <QuickQuoteCart />
    </>
  );
}

function SessionScopedApplication() {
  useLocation();
  const storageScope = quoteStorageScopeFromSession();
  activateQuoteStorageScope(storageScope);

  return (
    <QuoteCartProvider key={`quote:${storageScope}`}>
      <CounterSessionProvider key={`counter:${storageScope}`}>
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/husqvarna" element={<LegacyHusqvarnaRedirect />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
        <RouteScopedQuoteExperience />
        <ReloadPrompt />
      </CounterSessionProvider>
    </QuoteCartProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <SessionScopedApplication />
      </BrowserRouter>
    </ErrorBoundary>
  );
}
