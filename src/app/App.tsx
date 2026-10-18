import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { api, UNAUTHORIZED_EVENT } from './lib/api';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { LinkDetailPage } from './pages/LinkDetailPage';
import { LinksPage } from './pages/LinksPage';
import { LoginPage } from './pages/LoginPage';
import { NewLinkPage } from './pages/NewLinkPage';

type AuthState = 'checking' | 'in' | 'out';

export function App() {
  const [auth, setAuth] = useState<AuthState>('checking');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    api.get('/auth/me').then(
      () => setAuth('in'),
      () => setAuth('out'),
    );
  }, []);

  useEffect(() => {
    const onUnauthorized = () => {
      setAuth('out');
      navigate('/login', { replace: true, state: { from: location.pathname } });
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [navigate, location.pathname]);

  if (auth === 'checking') return <Spinner />;

  if (location.pathname === '/login') {
    return <LoginPage onLogin={() => setAuth('in')} />;
  }
  if (auth === 'out') return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<LinksPage />} />
        <Route path="/links/new" element={<NewLinkPage />} />
        <Route path="/links/:id" element={<LinkDetailPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
