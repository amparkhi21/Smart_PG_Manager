import { useRef, useState } from 'react';
import { Pencil, Plus, RefreshCw, Sparkles, Trash2, Utensils } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client.js';
import useFetch from '../hooks/useFetch.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import { Field, Input } from '../components/ui/FormControls.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import MenuCards from '../components/mess/MenuCards.jsx';
import MessMenuEditor from '../components/mess/MessMenuEditor.jsx';
import AIMenuPlanner from '../components/mess/AIMenuPlanner.jsx';
import { formatDate, getErrorMessage, todayInput } from '../utils/format.js';
import { hasMenuItems } from '../utils/messMenus.js';

export default function MessManagement() {
  const [date, setDate] = useState(todayInput);
  const [editor, setEditor] = useState(null);
  const [planner, setPlanner] = useState(false), [reviewQueue, setReviewQueue] = useState([]), [applying, setApplying] = useState(false);
  const reviewLock = useRef(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { data, loading, error: loadError, reload } = useFetch(async () => {
    try { return { date, menu: (await api.get(`/mess-menus/${date}`)).data.data }; }
    catch (err) { if (err.response?.status === 404) return { date, menu: null }; throw err; }
  }, [date]);
  const current = data?.date === date ? data : null;
  const reviewAI = async (days) => {
    if (reviewLock.current) return;
    reviewLock.current = true;
    setApplying(true);
    try {
      const reviewed = await Promise.all(days.map(async (day) => {
        let menu = null;
        try { menu = (await api.get(`/mess-menus/${day.date}`)).data.data; }
        catch (err) { if (err.response?.status !== 404) throw err; }
        return { date: day.date, menu, suggestedMeals: day.meals };
      }));
      // Use recent configured times for new days. Existing-date times always win.
      const firstDate = reviewed[0].date;
      const from = new Date(Date.parse(`${firstDate}T12:00:00Z`) - 14 * 86400000).toISOString().slice(0, 10);
      const recent = (await api.get('/mess-menus', { params: { from, to: firstDate } })).data.data;
      for (const day of reviewed) if (!day.menu) {
        day.menu = null;
        day.suggestedMeals = Object.fromEntries(Object.entries(day.suggestedMeals).map(([key, meal]) => [key, { ...meal,
          servingTime: [...recent].reverse().find((menu) => menu.meals?.[key]?.servingTime)?.meals[key].servingTime || '',
        }]));
      }
      setPlanner(false); setDate(reviewed[0].date); setEditor(reviewed[0]); setReviewQueue(reviewed.slice(1));
    } finally { reviewLock.current = false; setApplying(false); }
  };
  const saved = () => {
    if (reviewQueue.length) { setDate(reviewQueue[0].date); setEditor(reviewQueue[0]); setReviewQueue((current) => current.slice(1)); }
    else setEditor(null);
    reload();
  };
  const remove = async () => {
    if (saving) return;
    setSaving(true); setError('');
    try {
      const result = await api.delete(`/mess-menus/${date}`);
      toast.success(result.data.message || 'Mess menu deleted'); setDeleting(false); reload();
    } catch (err) { setDeleting(false); setError(getErrorMessage(err)); } finally { setSaving(false); }
  };
  return <div>
    <PageHeader title="Mess Management" subtitle="Plan daily meals for your PG and keep residents informed.">
      <button type="button" className="btn-primary" onClick={() => setPlanner(true)} disabled={saving || Boolean(editor)}><Sparkles size={16} />AI Menu Ideas</button>
      <button type="button" className="btn-secondary" onClick={reload} disabled={loading || saving}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh menu</button>
    </PageHeader>
    <div className="card mb-5 flex flex-wrap items-end justify-between gap-4 p-4">
      <Field htmlFor="menu-date" label="Menu date" hint="Dates and serving times follow Indian Standard Time.">
        <Input id="menu-date" type="date" value={date} min={todayInput()} max="9999-12-31" disabled={saving || Boolean(editor)} onChange={(event) => { if (event.target.value && event.target.value >= todayInput()) { setDate(event.target.value); setError(''); } }} />
      </Field>
      <button type="button" className="btn-secondary" disabled={loading || saving || Boolean(editor) || date === todayInput()} onClick={() => { setDate(todayInput()); setError(''); }}>Today</button>
    </div>
    {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {loadError ? <ErrorState message={loadError} onRetry={reload} /> : loading || !current ? <div role="status" aria-label="Loading mess menu" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-64" />)}</div>
      : <section aria-label="Selected daily menu" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-lg font-bold text-navy-900">{date === todayInput() ? "Today's menu" : 'Scheduled menu'}</h2><p className="text-sm text-slate-500">{formatDate(date)} · IST</p></div>
          <div className="flex flex-wrap gap-2"><button type="button" className="btn-primary" onClick={() => setEditor({ date, menu: current.menu })}>{current.menu ? <Pencil size={16} /> : <Plus size={16} />}{current.menu ? 'Edit menu' : 'Add menu'}</button>
            {current.menu && <button type="button" className="btn-secondary text-rose-600" onClick={() => setDeleting(true)}><Trash2 size={16} />Delete menu</button>}</div>
        </div>
        {!current.menu ? <div className="card"><EmptyState icon={Utensils} title="No menu planned yet" text="Add meals for this date. Once saved, residents in your PG can view them." /></div>
          : <>{!hasMenuItems(current.menu) && <p className="rounded-xl bg-orange-50 p-4 text-sm text-orange-800">This menu is saved with no food items. Edit it when your meals are ready.</p>}<MenuCards menu={current.menu} /></>}
      </section>}
    {planner && <AIMenuPlanner initialDate={date} onClose={() => setPlanner(false)} onApply={reviewAI} applying={applying} />}
    {editor && <MessMenuEditor key={editor.date} date={editor.date} menu={editor.menu} suggestedMeals={editor.suggestedMeals} onClose={() => { setEditor(null); setReviewQueue([]); }} onSaved={saved} />}
    {deleting && <ConfirmDialog title="Delete this menu?" message={`Delete all four meals for ${formatDate(date)}? Residents will no longer see this menu.`} confirmText="Delete menu" loading={saving} onConfirm={remove} onCancel={() => setDeleting(false)} />}
  </div>;
}
