import { useEffect, useState } from 'react';
import { Bell, Check, CheckCheck, Loader2, RefreshCw } from 'lucide-react';
import api from '../../api/client.js';
import useFetch from '../../hooks/useFetch.js';
import { useNotifications } from '../../context/NotificationContext.jsx';
import { notificationPage, notificationTypeLabel } from '../../utils/notifications.js';
import { formatDateTime, getErrorMessage } from '../../utils/format.js';
import EmptyState from '../ui/EmptyState.jsx';
import ErrorState from '../ui/ErrorState.jsx';
import Skeleton from '../ui/Skeleton.jsx';

export default function NotificationFeed({ compact = false, onOpen }) {
  const { identity, unreadCount, revision, busy, markRead, markAllRead, openNotification, refreshCount } = useNotifications();
  const [filter, setFilter] = useState('all'), [page, setPage] = useState(1), [error, setError] = useState('');
  const limit = compact ? 5 : 20, key = `${identity.key}:${filter}:${page}:${revision}`;
  const list = useFetch(async () => {
    const response = await api.get('/notifications', { params: { page, limit, ...(filter === 'unread' && { unread: 'true' }) } });
    return { ...response.data.data, key };
  }, [identity.key, filter, page, revision]);
  let data = null, loadError = list.error;
  if (list.data?.key === key) {
    try { data = notificationPage(list.data, identity); }
    catch (err) { loadError = err.message; }
  }
  useEffect(() => { if (data && page > Math.max(1, data.pagination.totalPages)) setPage(Math.max(1, data.pagination.totalPages)); }, [data, page]);
  const act = async (work) => { setError(''); try { await work(); } catch (err) { setError(err.response || err.code ? getErrorMessage(err) : err.message); } };
  const open = (item) => { onOpen?.(); openNotification(item); };
  return <section aria-label={compact ? 'Recent notifications' : 'Notification list'} className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex rounded-xl bg-slate-100 p-1" aria-label="Notification filters">{[['all', 'All'], ['unread', 'Unread']].map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => { setFilter(value); setPage(1); setError(''); }} className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${filter === value ? 'bg-white text-navy-900 shadow-sm' : 'text-slate-500'}`}>{label}</button>)}</div>
      <div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" disabled={Boolean(busy) || unreadCount === 0 || !data?.notifications.length} onClick={() => act(markAllRead)}><CheckCheck size={16} />Mark All as Read</button><button type="button" className="btn-secondary" aria-label="Refresh notifications" disabled={list.loading || Boolean(busy)} onClick={() => { list.reload(); refreshCount(); }}><RefreshCw size={16} /></button></div>
    </div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {loadError ? <ErrorState message={loadError} onRetry={list.reload} /> : !data || list.loading ? <div role="status" aria-label="Loading notifications" className="space-y-3"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
      : !data.notifications.length ? <div className="card"><EmptyState icon={Bell} title={filter === 'unread' ? 'You’re all caught up' : 'No notifications yet'} text={filter === 'unread' ? 'You have no unread notifications.' : 'Updates about your PG will appear here.'} /></div>
        : <div className="space-y-3">{data.notifications.map((item) => <article key={item.id} aria-label={item.title} className={`min-w-0 rounded-2xl border p-4 ${item.read ? 'border-slate-100 bg-white' : 'border-orange-200 bg-orange-50/40'}`}>
          <div className="mb-2 flex flex-wrap items-center gap-2"><span className="rounded-full bg-navy-50 px-2.5 py-1 text-xs font-semibold text-navy-800">{notificationTypeLabel(item.type)}</span><span className={`text-xs font-semibold ${item.read ? 'text-slate-400' : 'text-orange-700'}`}>{item.read ? 'Read' : 'Unread'}</span></div>
          <button type="button" className="min-h-11 w-full break-words text-left font-bold text-navy-900 [overflow-wrap:anywhere] hover:underline disabled:opacity-60" disabled={Boolean(busy)} onClick={() => open(item)}>{item.title}</button>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-600 [overflow-wrap:anywhere]">{item.message}</p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><time dateTime={item.createdAt} className="text-xs text-slate-500">{formatDateTime(item.createdAt)}</time>{!item.read && <button type="button" className="btn-secondary" disabled={Boolean(busy)} onClick={() => act(() => markRead(item))} aria-label={`Mark ${item.title} as read`}>{busy === item.id ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}Mark as read</button>}</div>
        </article>)}</div>}
    {!compact && data && data.pagination.totalPages > 1 && <nav aria-label="Notification pages" className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-500">Page {data.pagination.page} of {data.pagination.totalPages}</p><div className="flex gap-2"><button type="button" className="btn-secondary" disabled={page <= 1 || list.loading} onClick={() => setPage((value) => value - 1)}>Newer notifications</button><button type="button" className="btn-secondary" disabled={!data.pagination.hasMore || list.loading} onClick={() => setPage((value) => value + 1)}>Older notifications</button></div></nav>}
  </section>;
}
