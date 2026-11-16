import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

const FullScreenLoader = () => (
  <div className="flex min-h-dvh items-center justify-center text-navy-700">
    <Loader2 className="animate-spin" size={32} />
  </div>
);

// Only logged-in owners may enter
export function ProtectedRoute() {
  const { owner, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullScreenLoader />;
  if (!owner) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

// Login and register are skipped when already logged in
export function PublicRoute() {
  const { owner, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (owner) return <Navigate to="/" replace />;
  return <Outlet />;
}