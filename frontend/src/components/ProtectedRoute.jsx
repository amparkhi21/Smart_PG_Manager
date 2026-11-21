import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import ErrorState from './ui/ErrorState.jsx';
import RoleSelection from '../pages/RoleSelection.jsx';
import { sessionHome, ownerReturnPath } from '../utils/authRouting.js';

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
export function ProtectedRoute({ role = 'owner' }) {
  const { owner, resident, loading, sessionError } = useAuth();
  const location = useLocation();
  if (loading) return <FullScreenLoader />;
  if (sessionError && !owner && !resident) return <SessionError />;
  if (!owner && !resident) {
    if (location.pathname === '/') return <RoleSelection />;
    return <Navigate to={role === 'resident' ? '/resident/login' : '/owner/login'} replace state={{ from: location }} />;
  }
  if ((role === 'owner' && !owner) || (role === 'resident' && !resident)) return <Navigate to={sessionHome({ owner, resident })} replace />;
  if (resident?.passwordChangeRequired && location.pathname !== '/resident/change-password') return <Navigate to="/resident/change-password" replace />;
  return <Outlet />;
}

// Login and register are skipped when already logged in
export function PublicRoute() {
  const { owner, resident, loading, sessionError } = useAuth();
  const location = useLocation();
  if (loading) return <FullScreenLoader />;
  if (sessionError && !owner && !resident) return <SessionError />;
  if (owner || resident) return <Navigate to={owner ? ownerReturnPath(location.state?.from?.pathname) : sessionHome({ owner, resident })} replace />;
  return <Outlet />;
}
