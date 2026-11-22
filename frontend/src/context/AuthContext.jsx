import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api, { TOKEN_KEY, sessionStorage } from '../api/client.js';
import { getErrorMessage } from '../utils/format.js';
import { beginPushSessionTransition, endPushSessionTransition, hasPushRegistration, setActivePushIdentity, unregisterPushDevice } from '../native/pushDevice.js';
import { notificationIdentity } from '../utils/notifications.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [owner, setOwner] = useState(null);
  const [resident, setResident] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const sessionVersion = useRef(0);

  const restoreSession = useCallback(async (foreground = true) => {
    const version = ++sessionVersion.current;
    if (foreground) { setLoading(true); setSessionError(''); }
    try {
      const token = await sessionStorage.getItem(TOKEN_KEY);
      const session = token ? (await api.get('/auth/session')).data.data : {};
      if (version === sessionVersion.current) {
        const identity = notificationIdentity(session.owner, session.resident);
        setActivePushIdentity(identity.id && identity.pgId ? identity.key : null);
        setOwner(session.owner || null); setResident(session.resident || null); setSessionError('');
      }
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
      setActivePushIdentity(null);
      setOwner(null); setResident(null); setLoading(false); setSessionError('');
      toast.error('Your session has expired. Please log in again.');
    };
    const onResume = () => { if ((owner || resident) && navigator.onLine) restoreSession(false); };
    window.addEventListener('auth:logout', onLogout);
    window.addEventListener('app:resume', onResume);
    return () => {
      window.removeEventListener('auth:logout', onLogout);
      window.removeEventListener('app:resume', onResume);
    };
  }, [owner, resident, restoreSession]);

  const saveSession = useCallback(async ({ token, owner: nextOwner, resident: nextResident }) => {
    sessionVersion.current += 1;
    beginPushSessionTransition();
    try {
      let unregisterFailed = false;
      try { await unregisterPushDevice(); } catch { unregisterFailed = true; }
      await sessionStorage.setItem(TOKEN_KEY, token);
      const nextIdentity = notificationIdentity(nextOwner, nextResident);
      setActivePushIdentity(nextIdentity.key);
      if (hasPushRegistration(nextIdentity.key)) {
        try { await unregisterPushDevice(); } catch { unregisterFailed = true; }
      }
      setOwner(nextOwner || null); setResident(nextResident || null); setSessionError(''); setLoading(false);
      window.dispatchEvent(new Event('auth:session'));
      if (unregisterFailed) toast.error('Signed in. Push registration could not be cleared; push stays blocked until it can be removed.');
    } finally { endPushSessionTransition(); }
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

  const loginResident = useCallback(async (payload) => {
    const { data } = await api.post('/auth/resident/login', payload);
    await saveSession(data.data);
    return data.data.resident;
  }, [saveSession]);

  const changeResidentPassword = useCallback(async (payload) => {
    const { data } = await api.post('/auth/resident/change-password', payload);
    await saveSession(data.data);
  }, [saveSession]);

  const logout = useCallback(async () => {
    sessionVersion.current += 1;
    beginPushSessionTransition();
    try {
      let unregisterFailed = false;
      try { await unregisterPushDevice(); } catch { unregisterFailed = true; }
      await sessionStorage.removeItem(TOKEN_KEY);
      setActivePushIdentity(null);
      setOwner(null); setResident(null); setSessionError(''); setLoading(false);
      if (unregisterFailed) toast.error('Signed out, but push registration could not be removed. Sign in to that account and retry when online.');
    } catch {
      toast.error('Could not clear the saved session. Please try signing out again.');
    } finally { endPushSessionTransition(); }
  }, []);

  const value = useMemo(() => ({ owner, resident, role: owner ? 'owner' : resident ? 'resident' : null,
    loading, sessionError, restoreSession, login, register, loginResident, changeResidentPassword, logout, updateOwner }),
    [owner, resident, loading, sessionError, restoreSession, login, register, loginResident, changeResidentPassword, logout, updateOwner]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
