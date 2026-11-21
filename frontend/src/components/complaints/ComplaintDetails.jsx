import { useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/client.js';
import useFetch from '../../hooks/useFetch.js';
import Modal from '../ui/Modal.jsx';
import ConfirmDialog from '../ui/ConfirmDialog.jsx';
import { Field, Select, Textarea } from '../ui/FormControls.jsx';
import StatusBadge from '../ui/StatusBadge.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import ErrorState from '../ui/ErrorState.jsx';
import PriorityBadge from './PriorityBadge.jsx';
import ComplaintPagination from './ComplaintPagination.jsx';
import { COMPLAINT_STATUSES, COMPLAINT_PAGE_SIZE } from '../../utils/complaints.js';
import { formatDateTime, getErrorMessage } from '../../utils/format.js';

export default function ComplaintDetails({ id, ownerView, revision, onUpdated, onClose }) {
  const base = ownerView ? '/complaints' : '/resident/complaints';
  const [page, setPage] = useState(1), [text, setText] = useState(''), [status, setStatus] = useState(''), [note, setNote] = useState('');
  const [error, setError] = useState(''), [action, setAction] = useState(''), [confirmReopen, setConfirmReopen] = useState(false);
  const busy = useRef(false);
  const detail = useFetch(async () => (await api.get(`${base}/${id}`)).data.data, [base, id, revision]);
  const history = useFetch(async () => (await api.get(`${base}/${id}/history`, { params: { page, limit: COMPLAINT_PAGE_SIZE } })).data.data, [base, id, page, revision]);
  const complaint = detail.data;
  useEffect(() => { if (complaint) setStatus((current) => current === complaint.status ? '' : current); }, [complaint?.status]);
  const mutate = async (kind, work) => {
    if (busy.current) return; busy.current = true; setAction(kind); setError('');
    try {
      const result = await work(); toast.success(result.data.message);
      setText(''); setStatus(''); setNote(''); setConfirmReopen(false);
      const total = history.data?.pagination.total || 0;
      setPage(Math.max(1, Math.ceil((total + 1) / COMPLAINT_PAGE_SIZE))); onUpdated();
    } catch (err) { setError(getErrorMessage(err)); if ([404, 409].includes(err.response?.status)) { setConfirmReopen(false); onUpdated(); } }
    finally { busy.current = false; setAction(''); }
  };
  const comment = (event) => {
    event.preventDefault(); if (busy.current) return;
    if (!text.trim() || text.trim().length > 2000) return setError('Enter a comment of 1 to 2000 characters.');
    mutate('comment', () => api.post(`${base}/${id}/comments`, { text: text.trim() }));
  };
  const updateStatus = (event) => {
    event.preventDefault(); if (busy.current) return;
    if (!COMPLAINT_STATUSES.includes(status) || status === complaint.status) return setError('Choose a different complaint status.');
    if (note.trim().length > 2000) return setError('Keep the resolution note within 2000 characters.');
    mutate('status', () => api.patch(`${base}/${id}/status`, { status, ...(status === 'Resolved' && { resolutionNote: note.trim() }) }));
  };
  const refresh = () => { detail.reload(); history.reload(); };
  return <><Modal title="Complaint details" size="lg" onClose={onClose} dismissable={!action && !confirmReopen}>
    {detail.error ? <ErrorState message={detail.error} onRetry={detail.reload} /> : !complaint ? <div role="status" aria-label="Loading complaint details"><Skeleton className="h-64" /></div> : <div className="space-y-6">
      <section className="space-y-4" aria-label="Complaint information"><div className="flex flex-wrap items-start justify-between gap-3"><h3 className="min-w-0 break-words text-xl font-bold text-navy-900">{complaint.title}</h3><StatusBadge status={complaint.status} /></div>
        <div className="flex flex-wrap items-center gap-2"><PriorityBadge priority={complaint.priority} /><span className="text-sm font-medium text-slate-500">{complaint.category}</span></div>
        <p className="text-sm text-slate-500">Submitted {formatDateTime(complaint.createdAt)} (IST)</p>
        {ownerView && <p className="text-sm text-slate-700"><strong>{complaint.resident.fullName}</strong> · Resident room at submission: {complaint.resident.roomNumberAtCreation}</p>}
        <p className="text-sm text-slate-500">Issue location: {complaint.room ? `Room ${complaint.room.roomNumber}` : 'General PG issue'}</p>
        <p className="whitespace-pre-wrap break-words text-slate-800 [overflow-wrap:anywhere]">{complaint.description}</p>
        {complaint.resolutionNote && <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900"><p className="mb-1 font-bold">Resolution note</p><p className="whitespace-pre-wrap break-words">{complaint.resolutionNote}</p>{complaint.resolvedAt && <p className="mt-2">Resolved {formatDateTime(complaint.resolvedAt)}</p>}</div>}
      </section>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <section aria-label="Complaint activity" className="space-y-4 border-t border-slate-100 pt-5"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-bold text-navy-900">Activity & status history</h3><button type="button" className="btn-secondary" onClick={refresh} disabled={Boolean(action) || history.loading || detail.loading}><RefreshCw size={16} />Refresh activity</button></div>
        {history.error ? <ErrorState message={history.error} onRetry={history.reload} /> : history.loading || !history.data ? <div role="status" aria-label="Loading complaint activity"><Skeleton className="h-40" /></div> : <>
          <ol className="space-y-3">{history.data.events.map((event) => <li key={event.id} className={`rounded-xl border p-4 ${event.actor.role === 'owner' ? 'border-orange-100 bg-orange-50/40' : 'border-slate-200 bg-slate-50'}`}><p className="break-words text-sm font-semibold text-navy-900">{event.type === 'Comment' ? event.actor.role === 'owner' ? 'Owner response' : 'Resident follow-up' : event.type === 'Created' ? 'Complaint submitted' : event.type === 'Reopened' ? 'Complaint reopened' : `${event.fromStatus} to ${event.toStatus}`}</p><p className="mt-1 text-sm text-slate-500">{event.actor.name} · {event.actor.role === 'owner' ? 'Owner' : 'Resident'} · {formatDateTime(event.createdAt)}</p>{event.text && <p className="mt-2 whitespace-pre-wrap break-words text-slate-700 [overflow-wrap:anywhere]">{event.text}</p>}</li>)}</ol>
          <ComplaintPagination label="Complaint history pages" pagination={history.data.pagination} loading={history.loading || Boolean(action)} onPage={setPage} />
          {history.data.pagination.hasMore && <button type="button" className="btn-secondary" disabled={Boolean(action)} onClick={() => setPage(history.data.pagination.totalPages)}>Latest activity</button>}
        </>}
      </section>
      <form onSubmit={comment} className="space-y-3 border-t border-slate-100 pt-5"><Field htmlFor="complaint-comment" label={ownerView ? 'Owner response' : 'Follow-up comment'} required><Textarea id="complaint-comment" value={text} onChange={(event) => { setText(event.target.value); setError(''); }} maxLength={2000} disabled={Boolean(action) || detail.loading} /></Field><button type="submit" className="btn-primary" disabled={Boolean(action) || detail.loading || !text.trim()}>{action === 'comment' && <Loader2 size={16} className="animate-spin" />}{ownerView ? 'Send response' : 'Add comment'}</button></form>
      {ownerView ? <form onSubmit={updateStatus} className="space-y-4 border-t border-slate-100 pt-5"><Field htmlFor="complaint-new-status" label="New status" required><Select id="complaint-new-status" value={status} onChange={(event) => { setStatus(event.target.value); setError(''); }} disabled={Boolean(action) || detail.loading}><option value="">Choose a different status</option>{COMPLAINT_STATUSES.filter((value) => value !== complaint.status).map((value) => <option key={value}>{value}</option>)}</Select></Field>{status === 'Resolved' && <Field htmlFor="complaint-resolution" label="Resolution note (optional)"><Textarea id="complaint-resolution" value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} disabled={Boolean(action)} /></Field>}<button type="submit" className="btn-primary" disabled={Boolean(action) || detail.loading || !status || status === complaint.status}>{action === 'status' && <Loader2 size={16} className="animate-spin" />}Update status</button></form>
        : complaint.status === 'Resolved' && <div className="rounded-xl bg-orange-50 p-4"><p className="mb-3 text-sm text-orange-900">Is the issue still unresolved? You can reopen this complaint for your owner.</p><button type="button" className="btn-secondary" disabled={Boolean(action) || detail.loading} onClick={() => { setConfirmReopen(true); setError(''); }}>Reopen complaint</button></div>}
    </div>}
  </Modal>{confirmReopen && <ConfirmDialog title="Reopen this complaint?" message="The complaint will return to Open. Its previous responses and resolution history will remain available." confirmText="Reopen complaint" tone="primary" loading={Boolean(action)} onCancel={() => setConfirmReopen(false)} onConfirm={() => mutate('reopen', () => api.post(`${base}/${id}/reopen`, {}))} />}</>;
}
