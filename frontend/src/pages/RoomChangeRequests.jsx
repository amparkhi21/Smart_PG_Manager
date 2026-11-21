import { useEffect, useState } from 'react';
import { Loader2, Plus, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client.js';
import useFetch from '../hooks/useFetch.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import { Field, Select, Textarea } from '../components/ui/FormControls.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import Modal from '../components/ui/Modal.jsx';
import RoomChangeRequestModal from '../components/rooms/RoomChangeRequestModal.jsx';
import { formatDateTime, getErrorMessage } from '../utils/format.js';

export default function RoomChangeRequests({ ownerView = false }) {
  const [status, setStatus] = useState(ownerView ? 'Pending' : '');
  const [creating, setCreating] = useState(false);
  const [decision, setDecision] = useState(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { data, loading, error: loadError, reload } = useFetch(async () => (await api.get(
    ownerView ? '/room-change-requests' : '/resident/room-change-requests', { params: status ? { status } : {} }
  )).data.data, [ownerView, status]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible' && navigator.onLine) reload(); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh); window.addEventListener('app:resume', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('app:resume', refresh); };
  }, [reload]);
  const decide = async (event) => {
    event.preventDefault(); setError(''); setSaving(true);
    try {
      const result = await api.patch(`/room-change-requests/${decision.request.id}/decision`, { decision: decision.status, decisionNote: note.trim() });
      toast.success(result.data.message); setDecision(null); reload();
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };
  const pending = data?.requests.some((request) => request.status === 'Pending');
  return <div>
    <PageHeader title="Room Change Requests" subtitle={ownerView ? 'Review requests from your residents.' : 'Track your requests and your owner’s decisions.'}>
      {!ownerView && <button type="button" className="btn-primary" onClick={() => setCreating(true)} disabled={pending}><Plus size={16} />Request Room Change</button>}
      <button type="button" className="btn-secondary" disabled={loading} onClick={reload}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh requests</button>
    </PageHeader>
    <div className="mb-4 max-w-sm"><Select aria-label="Filter room change requests" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All requests</option>{['Pending', 'Approved', 'Rejected'].map((value) => <option key={value} value={value}>{value}</option>)}</Select></div>
    {pending && !ownerView && <p className="mb-4 text-sm text-slate-500">You have a pending request. Decisions refresh automatically while this page is open.</p>}
    {loadError ? <ErrorState message={loadError} onRetry={reload} /> : !data ? <div role="status" aria-label="Loading requests"><Skeleton className="h-64" /></div>
      : data.requests.length === 0 ? <div className="card"><EmptyState title="No room change requests" text={ownerView ? 'Requests matching this filter will appear here.' : 'Use Request Room Change to choose another available room.'} /></div>
        : <div className="space-y-4" aria-busy={loading}>{data.requests.map((request) => <article key={request.id} className="card min-w-0 space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words text-lg font-bold text-navy-900">{ownerView ? request.resident.fullName : `Room ${request.toRoom.roomNumber}`}</h2><p className="text-sm text-slate-500">Requested {formatDateTime(request.createdAt)}</p></div><StatusBadge status={request.status} /></div>
          <p className="break-words text-sm font-semibold text-slate-700">Room {request.fromRoom.roomNumber} to Room {request.toRoom.roomNumber}</p>
          <div><p className="text-sm font-semibold text-slate-500">Reason</p><p className="whitespace-pre-wrap break-words text-slate-800">{request.reason}</p></div>
          {request.decidedAt && <p className="text-sm text-slate-500">{request.status} {formatDateTime(request.decidedAt)}</p>}
          {request.decisionNote && <p className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Owner response: {request.decisionNote}</p>}
          {ownerView && request.status === 'Pending' && <div className="flex flex-wrap gap-3">{[['Approved', 'Approve'], ['Rejected', 'Reject']].map(([value, label]) => <button type="button" key={value} className={value === 'Approved' ? 'btn-primary' : 'btn-secondary'} disabled={loading} onClick={() => { setDecision({ request, status: value }); setNote(''); setError(''); }}>{label}</button>)}</div>}
        </article>)}</div>}
    {creating && <RoomChangeRequestModal onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}
    {decision && <Modal title={decision.status === 'Approved' ? 'Approve room change' : 'Reject room change'} onClose={() => setDecision(null)} dismissable={!saving}><form onSubmit={decide} className="space-y-4">
      <p className="text-sm text-slate-600">{decision.status === 'Approved' ? `Move ${decision.request.resident.fullName} to Room ${decision.request.toRoom.roomNumber}? Availability is checked again on approval. Existing rent and bills stay unchanged.` : 'Explain why this request is being rejected.'}</p>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <Field htmlFor="decisionNote" label="Owner response" required={decision.status === 'Rejected'}><Textarea id="decisionNote" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} required={decision.status === 'Rejected'} disabled={saving} /></Field>
      <div className="flex gap-3"><button type="button" className="btn-secondary flex-1" disabled={saving} onClick={() => setDecision(null)}>Cancel</button><button type="submit" className="btn-primary flex-1" disabled={saving}>{saving && <Loader2 size={16} className="animate-spin" />}{decision.status === 'Approved' ? 'Confirm approval' : 'Confirm rejection'}</button></div>
    </form></Modal>}
  </div>;
}
