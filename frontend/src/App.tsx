import { lazy, Suspense, useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import ReloadPrompt from './components/ReloadPrompt';
import QuickQuoteCart from './components/QuickQuoteCart';
import { ErrorBoundary } from './components/ErrorBoundary';
import { QuoteCartProvider } from './context/QuoteCartContext';
import { ConfirmProvider } from './context/ConfirmProvider';
import { CounterSessionProvider } from './context/CounterSessionProvider';
import { activateQuoteStorageScope, quoteStorageScopeFromSession } from './lib/quote-storage-scope';
import { SECTION_ROUTE_PATHS } from './lib/section-routes';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));

function createSessionQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5,
        refetchOnWindowFocus: false,
      },
    },
  });
}

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
  // A consulta oficial já deixou de ser uma página solta uma vez (virou a aba
  // Máquinas) e agora deixou de ser aba: ela abre em painel lateral dentro do
  // Atendimento. Os links antigos continuam valendo com o mesmo PNC — só o
  // destino mudou, e é por isso que `tab` não vai mais aqui.
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const next = new URLSearchParams();
  const pnc = (params.get('pnc') || '').replace(/\D/g, '');
  const query = (params.get('search') || '').trim();
  if (pnc) next.set('pnc', pnc);
  if (query) next.set('search', query);
  return <Navigate to={`/atendimento?${next.toString()}`} replace />;
}

// Uma navegação de verdade (um <Link>, o botão Voltar) remonta a tela com o endereço novo; a troca de aba por
// dentro só reescreve a barra de endereço e mantém o estado.
function DashboardRoute() {
  const { key } = useLocation();
  return <Dashboard key={key} />;
}

function RouteScopedQuoteExperience() {
  const { pathname } = useLocation();
  if (pathname === '/' || pathname === '/login') return null;
  return (
    <>
      <QuickQuoteCart />
    </>
  );
}

function SessionScopedApplication() {
  // A mudança de rota após login/logout força esta fronteira a reler o escopo
  // autenticado. Cada escopo ganha um QueryClient novo, então nenhum dado
  // tenant-dependent (catálogos, preço, estoque, localização etc.) sobrevive à
  // troca de conta na mesma aba.
  useLocation();
  const storageScope = quoteStorageScopeFromSession();
  activateQuoteStorageScope(storageScope);
  const queryClient = useMemo(() => createSessionQueryClient(), [storageScope]);

  return (
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
      <QuoteCartProvider key={`quote:${storageScope}`}>
        <CounterSessionProvider key={`counter:${storageScope}`}>
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="/login" element={<Login />} />
              <Route path="/dashboard" element={<DashboardRoute />} />
              {SECTION_ROUTE_PATHS.map(path => <Route key={path} path={path} element={<DashboardRoute />} />)}
              <Route path="/husqvarna" element={<LegacyHusqvarnaRedirect />} />
              <Route path="*" element={<Navigate to="/atendimento" replace />} />
            </Routes>
          </Suspense>
          <RouteScopedQuoteExperience />
          <ReloadPrompt />
        </CounterSessionProvider>
      </QuoteCartProvider>
      </ConfirmProvider>
    </QueryClientProvider>
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
