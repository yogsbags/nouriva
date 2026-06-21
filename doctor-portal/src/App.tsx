import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { fetchProviderProfile } from './lib/api';
import AuthPage from './pages/AuthPage';
import ProviderSetupPage from './pages/DoctorSetupPage';
import DashboardPage from './pages/DashboardPage';
import type { Session } from '@supabase/supabase-js';

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [hasProviderProfile, setHasProviderProfile] = useState<boolean | undefined>(undefined);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setHasProviderProfile(undefined);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setHasProviderProfile(false);
      return;
    }
    fetchProviderProfile()
      .then((p) => setHasProviderProfile(!!p))
      .catch(() => setHasProviderProfile(false));
  }, [session]);

  if (session === undefined || (session && hasProviderProfile === undefined)) {
    return (
      <div className="auth-page">
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          session ? (
            <Navigate to={hasProviderProfile ? '/' : '/setup'} replace />
          ) : (
            <AuthPage onSuccess={() => navigate(hasProviderProfile ? '/' : '/setup')} />
          )
        }
      />
      <Route
        path="/setup"
        element={
          !session ? (
            <Navigate to="/login" replace />
          ) : hasProviderProfile ? (
            <Navigate to="/" replace />
          ) : (
            <ProviderSetupPage onComplete={() => setHasProviderProfile(true)} />
          )
        }
      />
      <Route
        path="/"
        element={
          !session ? (
            <Navigate to="/login" replace />
          ) : !hasProviderProfile ? (
            <Navigate to="/setup" replace />
          ) : (
            <DashboardPage onSignOut={() => setSession(null)} />
          )
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
