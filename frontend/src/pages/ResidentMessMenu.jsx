import { useEffect, useState } from 'react';
import { RefreshCw, Utensils } from 'lucide-react';
import api from '../api/client.js';
import useFetch from '../hooks/useFetch.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import { Field, Select } from '../components/ui/FormControls.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import MenuCards from '../components/mess/MenuCards.jsx';
import { formatDate } from '../utils/format.js';
import { hasMenuItems } from '../utils/messMenus.js';

function LoadingMenu() {
  return <div role="status" aria-label="Loading mess menu" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-64" />)}</div>;
}

export default function ResidentMessMenu() {
  const [date, setDate] = useState('');
  const today = useFetch(async () => (await api.get('/resident/mess-menus/today')).data.data, []);
  const upcoming = useFetch(async () => (await api.get('/resident/mess-menus/upcoming')).data.data, []);
  const reloadToday = today.reload, reloadUpcoming = upcoming.reload;
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') { reloadToday(); reloadUpcoming(); } };
    window.addEventListener('focus', refresh); window.addEventListener('app:resume', refresh);
    return () => { window.removeEventListener('focus', refresh); window.removeEventListener('app:resume', refresh); };
  }, [reloadToday, reloadUpcoming]);
  const menus = upcoming.data?.menus || [];
  const selected = menus.find((menu) => menu.date === date) || menus[0];
  return <div className="space-y-6">
    <PageHeader title="Mess Menu" subtitle="Your PG's daily meals. All serving times are in Indian Standard Time (IST).">
      <button type="button" className="btn-secondary" disabled={today.loading || upcoming.loading} onClick={() => { reloadToday(); reloadUpcoming(); }}><RefreshCw size={16} className={today.loading || upcoming.loading ? 'animate-spin' : ''} />Refresh menus</button>
    </PageHeader>
    <section aria-label="Today's menu" className="space-y-4">
      <div><h2 className="text-lg font-bold text-navy-900">Today's menu</h2>{today.data && <p className="text-sm text-slate-500">{formatDate(today.data.date)} · IST</p>}</div>
      {today.error ? <ErrorState message={today.error} onRetry={reloadToday} /> : today.loading || !today.data ? <LoadingMenu /> : !today.data.menu
        ? <div className="card"><EmptyState icon={Utensils} title="Today's menu is on its way" text="Your owner hasn't shared today's meals yet. Check back soon!" /></div>
        : <>{!hasMenuItems(today.data.menu) && <p className="rounded-xl bg-orange-50 p-4 text-sm text-orange-800">Food items haven't been announced yet. Check back soon!</p>}<MenuCards menu={today.data.menu} /></>}
    </section>
    <section aria-label="Upcoming menus" className="space-y-4">
      <h2 className="text-lg font-bold text-navy-900">Upcoming menus</h2>
      {upcoming.error ? <ErrorState message={upcoming.error} onRetry={reloadUpcoming} /> : upcoming.loading || !upcoming.data ? <LoadingMenu /> : !selected
        ? <div className="card"><EmptyState icon={Utensils} title="More meals coming soon" text="Future menus will appear here as soon as your owner schedules them." /></div>
        : <><div className="max-w-sm"><Field htmlFor="upcoming-menu-date" label="Upcoming menu date"><Select id="upcoming-menu-date" value={selected.date} onChange={(event) => setDate(event.target.value)}>{menus.map((menu) => <option key={menu.date} value={menu.date}>{formatDate(menu.date)}</option>)}</Select></Field></div>
          {!hasMenuItems(selected) && <p className="text-sm text-slate-500">Meals for this date are still being planned.</p>}<MenuCards menu={selected} /></>}
    </section>
  </div>;
}
