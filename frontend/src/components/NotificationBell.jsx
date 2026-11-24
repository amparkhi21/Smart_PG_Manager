import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bell } from 'lucide-react';
import Modal from './ui/Modal.jsx';
import NotificationFeed from './notifications/NotificationFeed.jsx';
import { useNotifications } from '../context/NotificationContext.jsx';
import { notificationBadge } from '../utils/notifications.js';

export default function NotificationBell() {
  const { identity, unreadCount, countError, refreshCount } = useNotifications();
  const [open, setOpen] = useState(false), [history, setHistory] = useState(false);
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (identity.enabled && params.get('notifications') === 'all') {
      setOpen(true); setHistory(true); refreshCount();
      const next = new URLSearchParams(params); next.delete('notifications');
      setParams(next, { replace: true });
    }
  }, [identity.enabled, params, setParams, refreshCount]);
  if (!identity.enabled) return null;
  return <>
    <button type="button" className="relative flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-navy-900 hover:bg-slate-50" aria-label="Notifications" aria-haspopup="dialog" aria-expanded={open} onClick={() => { setHistory(false); setOpen(true); refreshCount(); }}>
      <Bell size={22} />{unreadCount > 0 && <span aria-label={`${unreadCount} unread notifications`} className="absolute -right-1 top-0 min-w-5 rounded-full bg-orange-500 px-1 text-center text-[10px] font-bold leading-5 text-white">{notificationBadge(unreadCount)}</span>}
    </button>
    {open && <Modal title="Notifications" onClose={() => setOpen(false)} size="lg">
      {countError && <p role="alert" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{countError}<button type="button" className="ml-2 min-h-11 font-semibold underline" onClick={refreshCount}>Retry unread count</button></p>}
      <NotificationFeed key={history ? 'history' : 'recent'} compact={!history} onOpen={() => setOpen(false)} />
      <button type="button" className="btn-primary mt-5 w-full" onClick={() => setHistory((value) => !value)}>{history ? 'Show recent notifications' : 'View all notifications'}</button>
    </Modal>}
  </>;
}
