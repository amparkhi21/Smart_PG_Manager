import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api, { TOKEN_KEY, sessionStorage } from '../api/client.js';
import { getErrorMessage } from '../utils/format.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [owner, setOwner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const sessionVersion = useRef(0);

  const restoreSession = useCallback(async (foreground = true) => {
    const version = ++sessionVersion.current;
    if (foreground) { setLoading(true); setSessionError(''); }
    try {
      const token = await sessionStorage.getItem(TOKEN_KEY);
      const nextOwner = token ? (await api.get('/auth/me')).data.data.owner : null;
      if (version === sessionVersion.current) { setOwner(nextOwner); setSessionError(''); }
    } catch (err) {
      // An outage never erases the saved token or an already displayed session.
      if (foreground && version === sessionVersion.current && err.response?.status !== 401) {
        setSessionError(err.response || err.code ? getErrorMessage(err) : err.message);
      }
    } finally {
      if (version === sessionVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    restoreSession();
    return () => { sessionVersion.current += 1; };
  }, [restoreSession]);

  useEffect(() => {
    const onLogout = () => {
      sessionVersion.current += 1;
      setOwner(null); setLoading(false); setSessionError('');
      toast.error('Your session has expired. Please log in again.');
    };
    const onResume = () => { if (owner && navigator.onLine) restoreSession(false); };
    window.addEventListener('auth:logout', onLogout);
    window.addEventListener('app:resume', onResume);
    return () => {
      window.removeEventListener('auth:logout', onLogout);
      window.removeEventListener('app:resume', onResume);
    };
  }, [owner, restoreSession]);

  const saveSession = useCallback(async ({ token, owner: nextOwner }) => {
    sessionVersion.current += 1;
    await sessionStorage.setItem(TOKEN_KEY, token);
    setOwner(nextOwner); setSessionError(''); setLoading(false);
  }, []);

  const updateOwner = useCallback((nextOwner) => {
    setOwner(nextOwner);
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    await saveSession(res.data.data);
  }, [saveSession]);

  const register = useCallback(async (payload) => {
    const res = await api.post('/auth/register', payload);
    await saveSession(res.data.data);
  }, [saveSession]);

  const logout = useCallback(async () => {
    sessionVersion.current += 1;
    try {
      await sessionStorage.removeItem(TOKEN_KEY);
      setOwner(null); setSessionError(''); setLoading(false);
    } catch {
      toast.error('Could not clear the saved session. Please try signing out again.');
    }
  }, []);

  const value = useMemo(() => ({ owner, loading, sessionError, restoreSession, login, register, logout, updateOwner }),
    [owner, loading, sessionError, restoreSession, login, register, logout, updateOwner]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
