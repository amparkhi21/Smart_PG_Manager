import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import ErrorState from './ui/ErrorState.jsx';

const FullScreenLoader = () => (
  <div className="flex min-h-dvh flex-col items-center justify-center gap-3 text-navy-700" role="status">
    <Loader2 className="animate-spin" size={32} />
    <p className="text-sm">Restoring your session…</p>
  </div>
);

function SessionError() {
  const { sessionError, restoreSession, logout } = useAuth();
  return <div className="session-error mx-auto max-w-md px-5 py-16">
    <ErrorState message={sessionError} onRetry={() => restoreSession()} />
    <button type="button" className="btn-secondary mt-4 w-full" onClick={logout}>Sign out of the saved session</button>
  </div>;
}

// Only logged-in owners may enter
export function ProtectedRoute() {
  const { owner, loading, sessionError } = useAuth();
  const location = useLocation();
  if (loading) return <FullScreenLoader />;
  if (sessionError && !owner) return <SessionError />;
  if (!owner) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

// Login and register are skipped when already logged in
export function PublicRoute() {
  const { owner, loading, sessionError } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (sessionError && !owner) return <SessionError />;
  if (owner) return <Navigate to="/" replace />;
  return <Outlet />;
}
