import { useRef, useState } from 'react';
import { Loader2, Pencil, Pin, Plus, RefreshCw, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import useFetch from '../hooks/useFetch.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import Modal from '../components/ui/Modal.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import { Field, Input, Textarea } from '../components/ui/FormControls.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { formatDateTime, getErrorMessage, toDateInput } from '../utils/format.js';
import { noticeExpiry } from '../utils/communityMedia.js';

function NoticeEditor({ notice, onClose, onSaved }) {
  const [title, setTitle] = useState(notice?.title || ''), [body, setBody] = useState(notice?.body || '');
  const [pinned, setPinned] = useState(notice?.pinned || false), [expiry, setExpiry] = useState(toDateInput(notice?.expiresAt));
  const [error, setError] = useState(''), [saving, setSaving] = useState(false); const busy = useRef(false);
  const submit = async (event) => {
    event.preventDefault(); if (busy.current) return;
    if (!title.trim() || !body.trim()) return setError('Add a title and notice text.');
    busy.current = true; setSaving(true); setError('');
    try {
      const payload = { title: title.trim(), body: body.trim(), pinned, expiresAt: noticeExpiry(expiry) };
      const result = notice ? await api.put(`/community/notices/${notice.id}`, payload) : await api.post('/community/notices', payload);
      toast.success(result.data.message); onSaved();
    } catch (err) { setError(getErrorMessage(err)); } finally { busy.current = false; setSaving(false); }
  };
  return <Modal title={notice ? 'Edit notice' : 'Create notice'} onClose={onClose} dismissable={!saving}><form onSubmit={submit} className="space-y-4">
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <Field htmlFor="notice-title" label="Title" required><Input id="notice-title" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={120} disabled={saving} /></Field>
    <Field htmlFor="notice-body" label="Notice text" required><Textarea id="notice-body" value={body} onChange={(event) => setBody(event.target.value)} required maxLength={5000} rows={6} disabled={saving} /></Field>
    <Field htmlFor="notice-expiry" label="Expiry date (optional)" hint="Visible until the end of this day in India. Leave empty for no expiry."><Input id="notice-expiry" type="date" value={expiry} onChange={(event) => setExpiry(event.target.value)} disabled={saving} /></Field>
    <label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} disabled={saving} className="h-5 w-5 accent-orange-500" />Pin to top</label>
    <div className="flex justify-end gap-3"><button type="button" className="btn-secondary" disabled={saving} onClick={onClose}>Cancel</button><button type="submit" className="btn-primary" disabled={saving}>{saving && <Loader2 size={16} className="animate-spin" />}Save notice</button></div>
  </form></Modal>;
}
export default function NoticeBoard() {
  const { owner } = useAuth();
  const [editor, setEditor] = useState(null), [target, setTarget] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false);
  const { data, loading, error: loadError, reload } = useFetch(async () => (await api.get('/community/notices')).data.data, []);
  const act = async (task) => {
    if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try { const result = await task(); toast.success(result.data.message); setTarget(null); reload(); }
    catch (err) { setTarget(null); setError(getErrorMessage(err)); }
    finally { lock.current = false; setBusy(false); }
  };
  return <div>
    <PageHeader title="Notice Board" subtitle={owner ? 'Publish important updates for your PG.' : 'Important updates from your PG owner.'}>
      {owner ? <button type="button" className="btn-primary" onClick={() => setEditor({ notice: null })}><Plus size={16} />Create notice</button>
        : data?.notices.some((notice) => notice.isNew) && <button type="button" className="btn-primary" disabled={busy || loading} onClick={() => act(() => api.post('/community/notices/read', { through: data.readThrough }))}>Mark notices as read</button>}
      <button type="button" className="btn-secondary" disabled={loading || busy} onClick={reload}><RefreshCw size={16} />Refresh notices</button>
    </PageHeader>
    {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {loadError ? <ErrorState message={loadError} onRetry={reload} /> : !data ? <div role="status" aria-label="Loading notices"><Skeleton className="h-64" /></div>
      : !data.notices.length ? <div className="card"><EmptyState title="No notices yet" text={owner ? 'Create a notice to share an update with your PG.' : 'New updates from your owner will appear here.'} /></div>
        : <div className="space-y-4" aria-busy={loading}>{data.notices.map((notice) => <article key={notice.id} aria-label={notice.title} className={`card min-w-0 space-y-3 border p-5 ${notice.pinned ? 'border-orange-200' : 'border-slate-100'}`}>
          <div className="flex flex-wrap items-center gap-2">{notice.pinned && <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-3 py-1 text-sm font-semibold text-orange-700"><Pin size={14} />Pinned</span>}{notice.isNew && <span className="rounded-full bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-700">New</span>}{notice.isExpired && <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-500">Expired</span>}</div>
          <h2 className="break-words text-lg font-bold text-navy-900">{notice.title}</h2><p className="whitespace-pre-wrap break-words text-slate-700 [overflow-wrap:anywhere]">{notice.body}</p>
          <p className="text-sm text-slate-500">Updated {formatDateTime(notice.updatedAt)}{notice.expiresAt && ` · Expires ${formatDateTime(notice.expiresAt)}`}</p>
          {owner && <div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" disabled={busy} onClick={() => setEditor({ notice })}><Pencil size={16} />Edit notice</button><button type="button" className="btn-secondary" disabled={busy} onClick={() => act(() => api.patch(`/community/notices/${notice.id}/pin`, { pinned: !notice.pinned }))}><Pin size={16} />{notice.pinned ? 'Unpin notice' : 'Pin notice'}</button><button type="button" className="btn-secondary text-rose-600" disabled={busy} onClick={() => setTarget(notice)}><Trash2 size={16} />Delete notice</button></div>}
        </article>)}</div>}
    {editor && <NoticeEditor notice={editor.notice} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); reload(); }} />}
    {target && <ConfirmDialog title="Delete this notice?" message="This notice will be removed from your PG's Notice Board." confirmText="Delete notice" loading={busy} onConfirm={() => act(() => api.delete(`/community/notices/${target.id}`))} onCancel={() => setTarget(null)} />}
  </div>;
}
