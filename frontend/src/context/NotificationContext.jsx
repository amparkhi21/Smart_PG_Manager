import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from './AuthContext.jsx';
import { belongsToNotificationAccount, fetchNotificationRecord, notificationIdentity } from '../utils/notifications.js';
import { getErrorMessage } from '../utils/format.js';
import NotificationDetails from '../components/notifications/NotificationDetails.jsx';

const NotificationContext = createContext(null);
function NotificationSession({ identity, children }) {
  const [unreadCount, setUnreadCount] = useState(null), [countError, setCountError] = useState(''), [countLoading, setCountLoading] = useState(false);
  const [revision, setRevision] = useState(0), [busy, setBusy] = useState(''), [related, setRelated] = useState(null);
  const alive = useRef(false), countRequest = useRef(null), countController = useRef(null), actionController = useRef(null), lock = useRef(false), lastCount = useRef(null);
  const refreshCount = useCallback(() => {
    if (!identity.enabled || !alive.current) return Promise.resolve();
    if (countRequest.current) return countRequest.current;
    const controller = new AbortController(); countController.current = controller;
    setCountLoading(true);
    const work = (async () => {
      try {
        const count = (await api.get('/notifications/unread-count', { signal: controller.signal })).data.data.unreadCount;
        if (!Number.isSafeInteger(count) || count < 0) throw new Error('Unable to refresh the unread count.');
        if (alive.current && !controller.signal.aborted) {
          if (lastCount.current !== null && lastCount.current !== count) setRevision((value) => value + 1);
          lastCount.current = count; setUnreadCount(count); setCountError('');
        }
      } catch (err) {
        if (alive.current && !controller.signal.aborted) setCountError(err.response || err.code ? getErrorMessage(err) : err.message);
      } finally {
        if (countController.current === controller) { countRequest.current = null; if (alive.current) setCountLoading(false); }
      }
    })();
    countRequest.current = work; return work;
  }, [identity.enabled]);
  useEffect(() => {
    alive.current = true; refreshCount();
    const refresh = () => { if (document.visibilityState === 'visible' && navigator.onLine) refreshCount(); };
    const notificationChanged = () => {
      if (!alive.current) return;
      setRevision((value) => value + 1); lastCount.current = null; refreshCount();
    };
    const timer = window.setInterval(refresh, 60000);
    document.addEventListener('visibilitychange', refresh);
    for (const event of ['focus', 'online', 'app:resume']) window.addEventListener(event, refresh);
    window.addEventListener('notifications:refresh', notificationChanged);
    return () => {
      alive.current = false; window.clearInterval(timer); countController.current?.abort(); countRequest.current = null; actionController.current?.abort();
      document.removeEventListener('visibilitychange', refresh);
      for (const event of ['focus', 'online', 'app:resume']) window.removeEventListener(event, refresh);
      window.removeEventListener('notifications:refresh', notificationChanged);
    };
  }, [refreshCount]);
  const changed = () => {
    if (!alive.current) return;
    setRevision((value) => value + 1); lastCount.current = null;
    countController.current?.abort(); countRequest.current = null; refreshCount();
  };
  const markReadRequest = async (item, signal) => {
    if (!belongsToNotificationAccount(item, identity)) throw new Error('This notification is not available for this account.');
    if (item.read) return;
    const result = (await api.patch(`/notifications/${item.id}/read`, {}, { signal })).data.data;
    if (!belongsToNotificationAccount(result, identity)) throw new Error('This notification is not available for this account.');
    changed();
  };
  const markRead = async (item) => {
    if (lock.current) return; lock.current = true; setBusy(item.id);
    const controller = new AbortController(); actionController.current = controller;
    try { await markReadRequest(item, controller.signal); }
    finally { lock.current = false; if (alive.current) setBusy(''); }
  };
  const markAllRead = async () => {
    if (lock.current) return; lock.current = true; setBusy('all');
    const controller = new AbortController(); actionController.current = controller;
    try { await api.patch('/notifications/read-all', {}, { signal: controller.signal }); changed(); }
    finally { lock.current = false; if (alive.current) setBusy(''); }
  };
  const openNotification = async (item) => {
    if (lock.current || !belongsToNotificationAccount(item, identity)) return;
    lock.current = true; setBusy(item.id); setRelated({ item, loading: true });
    const controller = new AbortController(); actionController.current = controller;
    try {
      await markReadRequest(item, controller.signal);
      const result = await fetchNotificationRecord(api, item, identity.role, controller.signal);
      if (alive.current && !controller.signal.aborted) setRelated({ item, ...result, loading: false });
    } catch (err) {
      if (alive.current && !controller.signal.aborted) setRelated({ item, loading: false, error: [403, 404].includes(err.response?.status)
        ? 'This related item is no longer available, or your account cannot access it.' : err.response || err.code ? getErrorMessage(err) : err.message });
    } finally { lock.current = false; if (alive.current) setBusy(''); }
  };
  const closeRelated = () => { actionController.current?.abort(); setRelated(null); };
  return <NotificationContext.Provider value={{ identity, unreadCount, countError, countLoading, refreshCount, revision, busy, markRead, markAllRead, openNotification }}>
    {children}
    {related && <NotificationDetails related={related} ownerView={identity.role === 'owner'} onClose={closeRelated} onRetry={() => openNotification(related.item)} onUpdated={changed} />}
  </NotificationContext.Provider>;
}
export function NotificationProvider({ children }) {
  const { owner, resident } = useAuth(), identity = notificationIdentity(owner, resident);
  return <NotificationSession key={`${identity.key}:${identity.enabled}`} identity={identity}>{children}</NotificationSession>;
}
export const useNotifications = () => useContext(NotificationContext);
