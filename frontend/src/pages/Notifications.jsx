import PageHeader from '../components/ui/PageHeader.jsx';
import NotificationFeed from '../components/notifications/NotificationFeed.jsx';
import { useNotifications } from '../context/NotificationContext.jsx';

export default function Notifications() {
  const { unreadCount, countError, refreshCount } = useNotifications();
  return <div><PageHeader title="Notifications" subtitle={unreadCount === null ? 'Private updates for your account.' : `${unreadCount} unread · Private updates for your account.`} />
    {countError && <p role="alert" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{countError}<button type="button" className="ml-2 min-h-11 font-semibold underline" onClick={refreshCount}>Retry unread count</button></p>}
    <NotificationFeed />
  </div>;
}
