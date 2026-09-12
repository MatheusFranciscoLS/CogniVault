import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import HusqvarnaOfficialPage from './pages/HusqvarnaOfficialPage';
import ReloadPrompt from './components/ReloadPrompt';

import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/husqvarna" element={<HusqvarnaOfficialPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        <ReloadPrompt />
      </BrowserRouter>
    </ErrorBoundary>
  );
}
