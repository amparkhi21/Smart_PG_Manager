import { useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/client.js';
import useFetch from '../../hooks/useFetch.js';
import PageHeader from '../ui/PageHeader.jsx';
import Modal from '../ui/Modal.jsx';
import ConfirmDialog from '../ui/ConfirmDialog.jsx';
import ErrorState from '../ui/ErrorState.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import StatusBadge from '../ui/StatusBadge.jsx';
import { Field, Select, Textarea, Input } from '../ui/FormControls.jsx';
import PrivatePhoto from './PrivatePhoto.jsx';
import { photoError } from '../../utils/communityMedia.js';
import { communityError } from '../../utils/community.js';
import { formatDateTime } from '../../utils/format.js';

const CATEGORIES = ['General Discussion', 'Water Problem', 'Electricity Problem', 'Wi-Fi Problem', 'Cleaning / Maintenance', 'Food / Mess', 'Other Hostel Issue'];
const STATUSES = ['Open', 'In Progress', 'Resolved'];

function CreatePost({ onClose, onSaved }) {
  const [form, setForm] = useState({ category: 'General Discussion', title: '', description: '' });
  const [photo, setPhoto] = useState(null), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setError('');
    const invalidPhoto = photo ? photoError(photo) : ''; if (invalidPhoto) return setError(invalidPhoto);
    setSaving(true);
    try {
      const result = await api.post('/community/issues', { ...form, title: form.title.trim(), description: form.description.trim() });
      if (photo) {
        try { await api.post(`/community/images?issueId=${result.data.data.id}`, photo, { headers: { 'Content-Type': photo.type } }); }
        catch { toast.error('Post created, but the photo could not be attached.'); }
      }
      toast.success('Community post created'); onSaved();
    } catch (err) { setError(communityError(err)); }
    finally { setSaving(false); }
  };
  return <Modal title="Create a community post" onClose={onClose} dismissable={!saving}>
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-slate-500">Posts are visible to authorized members of your PG. For sensitive matters, use My Requests → Private Issue.</p>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <Field htmlFor="community-issue-category" label="Category" required><Select id="community-issue-category" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} disabled={saving}>{CATEGORIES.map((value) => <option key={value}>{value}</option>)}</Select></Field>
      <Field htmlFor="community-issue-title" label="Title" required><Input id="community-issue-title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} minLength={3} maxLength={120} required disabled={saving} /></Field>
      <Field htmlFor="community-issue-description" label="Description" required><Textarea id="community-issue-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} minLength={5} maxLength={2000} rows={5} required disabled={saving} /></Field>
      <Field htmlFor="community-issue-photo" label="Photo (optional)" hint="JPG, PNG or WebP, up to 5 MB. PG members only."><Input id="community-issue-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={saving} className="py-2" onChange={(event) => { const file = event.target.files?.[0] || null; setPhoto(file); setError(photoError(file) || ''); }} /></Field>
      <div className="flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" className="btn-primary" disabled={saving}>{saving && <Loader2 size={16} className="animate-spin" />}Post</button></div>
    </form>
  </Modal>;
}

function IssueDetails({ issue, owner, onClose, onChanged }) {
  const { data, error, reload } = useFetch(async () => (await api.get(`/community/issues/${issue.id}`)).data.data, [issue.id]);
  const [comment, setComment] = useState(''), [status, setStatus] = useState(issue.status), [saving, setSaving] = useState(false), [confirmDelete, setConfirmDelete] = useState(false), [actionError, setActionError] = useState('');
  const current = data || issue;
  const addComment = async (event) => {
    event.preventDefault(); if (!comment.trim()) return;
    setSaving(true); setActionError('');
    try { await api.post(`/community/issues/${issue.id}/comments`, { text: comment.trim() }); setComment(''); await reload(); onChanged(); }
    catch (err) { setActionError(communityError(err)); } finally { setSaving(false); }
  };
  const updateStatus = async (event) => {
    event.preventDefault(); setSaving(true); setActionError('');
    try { await api.patch(`/community/issues/${issue.id}/status`, { status }); toast.success('Post status updated'); onChanged(); onClose(); }
    catch (err) { setActionError(communityError(err)); } finally { setSaving(false); }
  };
  const remove = async () => {
    setSaving(true); setActionError('');
    try { await api.delete(`/community/issues/${issue.id}`); toast.success('Post removed'); onChanged(); onClose(); }
    catch (err) { setActionError(communityError(err)); } finally { setSaving(false); setConfirmDelete(false); }
  };
  return <Modal title="Community post" onClose={onClose} dismissable={!saving} size="lg">
    {error && !data ? <ErrorState message={error} onRetry={reload} /> : !data ? <div role="status" aria-label="Loading community post"><Skeleton className="h-56" /></div> : <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-teal-700">{current.category}</p><h2 className="mt-1 break-words text-xl font-bold text-navy-900">{current.title}</h2></div><StatusBadge status={current.status} /></div>
      <p className="text-sm text-slate-600">{current.author.name}{current.roomNumber && ` · Room ${current.roomNumber}`} · {formatDateTime(current.createdAt)}</p>
      <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{current.description}</p>
      {current.image && <PrivatePhoto image={current.image} sender={current.author.name} />}
      {actionError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{actionError}</p>}
      <section><h3 className="mb-3 font-semibold">Discussion</h3>{!current.comments?.length ? <p className="text-sm text-slate-500">No comments yet.</p> : <ul className="space-y-3">{current.comments.map((entry) => <li key={entry.id} className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-600">{entry.author.name} · {entry.author.role} · {formatDateTime(entry.createdAt)}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm">{entry.text}</p></li>)}</ul>}</section>
      <form onSubmit={addComment} className="space-y-3"><Field htmlFor="community-issue-comment" label="Add a comment"><Textarea id="community-issue-comment" value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} disabled={saving} /></Field><button type="submit" className="btn-primary" disabled={saving || !comment.trim()}>Comment</button></form>
      {owner && <div className="flex flex-wrap items-end justify-between gap-3 border-t border-slate-100 pt-4"><form onSubmit={updateStatus} className="flex flex-wrap items-end gap-2"><Field htmlFor="community-issue-status" label="Update status"><Select id="community-issue-status" value={status} onChange={(event) => setStatus(event.target.value)}>{STATUSES.map((value) => <option key={value}>{value}</option>)}</Select></Field><button type="submit" className="btn-primary" disabled={saving || status === current.status}>Save status</button></form><button type="button" className="btn-secondary text-rose-700" onClick={() => setConfirmDelete(true)} disabled={saving}><Trash2 size={16} />Remove post</button></div>}
    </div>}
    {confirmDelete && <ConfirmDialog title="Remove community post?" message="This post and its discussion will be removed from this PG community." confirmText="Remove post" loading={saving} onConfirm={remove} onCancel={() => setConfirmDelete(false)} />}
  </Modal>;
}

export default function CommunityIssues({ owner, pgId }) {
  const [category, setCategory] = useState(''), [status, setStatus] = useState(''), [page, setPage] = useState(1), [creating, setCreating] = useState(false), [selected, setSelected] = useState(null), [revision, setRevision] = useState(0);
  const { data, loading, error, reload } = useFetch(async () => (await api.get('/community/issues', { params: { page, limit: 10, ...(category && { category }), ...(status && { status }) } })).data.data, [page, category, status, revision, pgId]);
  const changed = () => { setRevision((value) => value + 1); };
  const refresh = () => { if (page === 1) reload(); else setPage(1); };
  return <section className="card space-y-4 p-4 sm:p-5" aria-labelledby="community-posts-heading">
    <PageHeader title="Community posts" subtitle="Discuss hostel issues with authorized members of your PG."><button type="button" className="btn-secondary" onClick={refresh} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh</button>{!owner && <button type="button" className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} />New post</button>}</PageHeader>
    <h2 id="community-posts-heading" className="sr-only">Community posts</h2>
    <div className="grid gap-3 sm:grid-cols-2"><Select aria-label="Filter community posts by category" value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}><option value="">All categories</option>{CATEGORIES.map((value) => <option key={value}>{value}</option>)}</Select><Select aria-label="Filter community posts by status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option>{STATUSES.map((value) => <option key={value}>{value}</option>)}</Select></div>
    {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <div role="status" aria-label="Loading community posts" className="space-y-3"><Skeleton className="h-32" /><Skeleton className="h-32" /></div> : !data.issues.length ? <EmptyState title="No community posts" text="Create a post to start a discussion about your PG." /> : <div className="space-y-3" aria-busy={loading}>{data.issues.map((item) => <article key={item.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-teal-700">{item.category}</p><h3 className="mt-1 break-words font-bold text-navy-900">{item.title}</h3></div><StatusBadge status={item.status} /></div><p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-sm text-slate-600">{item.description}</p><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-500">{item.author.name}{item.roomNumber && ` · Room ${item.roomNumber}`} · {formatDateTime(item.createdAt)}</p><button type="button" className="btn-secondary min-h-9" onClick={() => setSelected(item)}>Open discussion</button></div></article>)}</div>}
    {data?.pagination?.totalPages > 1 && <nav className="flex items-center justify-between" aria-label="Community post pages"><button type="button" className="btn-secondary" onClick={() => setPage(page - 1)} disabled={page <= 1}><ChevronLeft size={16} />Previous</button><span className="text-sm text-slate-500">Page {page} of {data.pagination.totalPages}</span><button type="button" className="btn-secondary" onClick={() => setPage(page + 1)} disabled={!data.pagination.hasMore}><ChevronRight size={16} />Next</button></nav>}
    {creating && <CreatePost onClose={() => setCreating(false)} onSaved={() => { setCreating(false); refresh(); changed(); }} />}
    {selected && <IssueDetails issue={selected} owner={owner} onClose={() => setSelected(null)} onChanged={changed} />}
  </section>;
}
