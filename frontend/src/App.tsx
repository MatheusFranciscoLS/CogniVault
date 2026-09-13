import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import ReloadPrompt from './components/ReloadPrompt';
import { ErrorBoundary } from './components/ErrorBoundary';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const HusqvarnaOfficialPage = lazy(() => import('./pages/HusqvarnaOfficialPage'));

function RouteLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500 dark:bg-slate-950 dark:text-slate-400">
      <div className="flex items-center gap-3">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-[#1d4f91] dark:border-slate-700 dark:border-t-blue-400" />
        Carregando…
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/husqvarna" element={<HusqvarnaOfficialPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
        <ReloadPrompt />
      </BrowserRouter>
    </ErrorBoundary>
  );
}
