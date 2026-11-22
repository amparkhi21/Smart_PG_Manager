import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import api from '../../api/client.js';
import useFetch from '../../hooks/useFetch.js';
import Modal from '../ui/Modal.jsx';
import ConfirmDialog from '../ui/ConfirmDialog.jsx';
import ErrorState from '../ui/ErrorState.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import StatusBadge from '../ui/StatusBadge.jsx';
import { Field, Select, Textarea } from '../ui/FormControls.jsx';
import { formatCurrency, formatDateTime, getErrorMessage } from '../../utils/format.js';

export default function RequestDetailsModal({ item, ownerView, onClose, onChanged }) {
  const base = ownerView ? '/requests' : '/resident/requests';
  const [historyPage, setHistoryPage] = useState(1);
  const { data, loading, error, reload } = useFetch(async () => (await api.get(`${base}/${item.sourceType}/${item.sourceId}`, {
    params: item.sourceType === 'complaint' ? { historyPage, historyLimit: 20 } : undefined,
  })).data.data, [base, item.id, historyPage]);
  const [decision, setDecision] = useState('');
  const [response, setResponse] = useState('');
  const [genericStatus, setGenericStatus] = useState(item.status === 'Open' ? 'In Progress' : item.status);
  const [complaintStatus, setComplaintStatus] = useState(item.status);
  const [verifiedReceipt, setVerifiedReceipt] = useState(false);
  const [decisionStale, setDecisionStale] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const writeBusy = useRef(false);
  const request = data || item;
  const canDecide = ownerView && !decisionStale && ['payment', 'room-change', 'leave'].includes(request.sourceType) && request.status !== 'Cancelled'
    && !['Approved', 'Rejected'].includes(request.status);
  const canUpdateGeneral = ownerView && request.sourceType === 'general' && !['Resolved', 'Rejected', 'Cancelled'].includes(request.status);
  const isPrivateComplaint = request.sourceType === 'complaint';
  const canCancel = !ownerView && ((request.sourceType === 'payment' && request.status === 'Pending Verification')
    || (['room-change', 'leave'].includes(request.sourceType) && request.status === 'Pending')
    || (request.sourceType === 'general' && request.status === 'Open'));

  const submitDecision = async (event) => {
    event.preventDefault();
    if (writeBusy.current || !decision) return;
    if (request.sourceType === 'payment' && decision === 'Approved' && !verifiedReceipt) return setActionError('Confirm that you checked the actual bank/UPI receipt.');
    if ((request.sourceType === 'room-change' && decision === 'Rejected') && !response.trim()) return setActionError('Add a reason for rejecting this room change.');
    writeBusy.current = true; setSaving(true); setActionError('');
    try {
      if (request.sourceType === 'payment') {
        await api.post(`/payment-claims/${request.sourceId}/${decision === 'Approved' ? 'approve' : 'reject'}`,
          decision === 'Approved' ? { verifiedReceipt: true, note: response.trim() } : { reason: response.trim() });
      } else if (request.sourceType === 'room-change') {
        await api.patch(`/room-change-requests/${request.sourceId}/decision`, { decision, decisionNote: response.trim() });
      } else {
        await api.patch(`/leave-requests/${request.sourceId}/decision`, { decision, response: response.trim() });
      }
      toast.success(`Request ${decision.toLowerCase()}`);
      onChanged(); onClose();
    } catch (err) {
      setActionError(getErrorMessage(err));
      if ([404, 409].includes(err.response?.status)) { setDecisionStale(true); setDecision(''); reload(); onChanged(); }
    }
    finally { writeBusy.current = false; setSaving(false); }
  };

  const updateGeneral = async (event) => {
    event.preventDefault();
    if (writeBusy.current || (!response.trim() && !genericStatus)) return;
    writeBusy.current = true; setSaving(true); setActionError('');
    try {
      await api.patch(`/requests/general/${request.sourceId}`, {
        ...(response.trim() && { response: response.trim() }), ...(genericStatus !== request.status && { status: genericStatus }),
      });
      toast.success('Request updated'); onChanged(); onClose();
    } catch (err) { setActionError(getErrorMessage(err)); }
    finally { writeBusy.current = false; setSaving(false); }
  };

  const updateComplaint = async (event) => {
    event.preventDefault(); if (writeBusy.current) return;
    writeBusy.current = true; setSaving(true); setActionError('');
    try {
      if (response.trim()) await api.post(`/complaints/${request.sourceId}/comments`, { text: response.trim() });
      if (complaintStatus !== request.status) await api.patch(`/complaints/${request.sourceId}/status`, { status: complaintStatus });
      toast.success('Private issue updated'); onChanged(); onClose();
    } catch (err) { setActionError(getErrorMessage(err)); }
    finally { writeBusy.current = false; setSaving(false); }
  };

  const addPrivateComment = async (event) => {
    event.preventDefault(); if (writeBusy.current || !response.trim()) return;
    writeBusy.current = true; setSaving(true); setActionError('');
    try {
      await api.post(`/resident/complaints/${request.sourceId}/comments`, { text: response.trim() });
      toast.success('Private comment added'); onChanged(); onClose();
    } catch (err) { setActionError(getErrorMessage(err)); }
    finally { writeBusy.current = false; setSaving(false); }
  };

  const cancelRequest = async () => {
    if (writeBusy.current) return;
    writeBusy.current = true; setSaving(true); setActionError('');
    try {
      const paths = {
        payment: `/resident/payments/claims/${request.sourceId}/cancel`,
        'room-change': `/resident/room-change-requests/${request.sourceId}/cancel`,
        leave: `/resident/leave-requests/${request.sourceId}/cancel`,
        general: `/resident/requests/${request.sourceId}/cancel`,
      };
      await api.post(paths[request.sourceType]);
      toast.success('Request cancelled'); onChanged(); onClose();
    } catch (err) { setActionError(getErrorMessage(err)); if ([404, 409].includes(err.response?.status)) { reload(); onChanged(); } }
    finally { writeBusy.current = false; setSaving(false); setCancelConfirm(false); }
  };

  return <Modal title="Request details" onClose={onClose} dismissable={!saving} size="lg">
    {error && !data ? <ErrorState message={error} onRetry={reload} /> : !data ? <div role="status" aria-label="Loading request details"><Skeleton className="h-56" /></div> : <div className="space-y-5" aria-busy={loading}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-teal-700">{request.category} · {request.priority}</p><h2 className="mt-1 break-words text-xl font-bold text-navy-900">{request.title}</h2></div><StatusBadge status={request.status} /></div>
      {ownerView && <p className="rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-800">{request.resident.name} · Room {request.room.number || '—'}{request.room.bedNumber ? ` · Bed ${request.room.bedNumber}` : ''}</p>}
      <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{request.description}</p>
      <p className="text-xs text-slate-500">Submitted {formatDateTime(request.createdAt)}</p>
      {request.sourceType === 'payment' && <dl className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-500">Claimed amount</dt><dd className="font-bold">{formatCurrency(request.details.amount)}</dd></div>
        <div><dt className="text-slate-500">Payment date</dt><dd>{formatDateTime(request.details.paymentDate)}</dd></div>
        <div className="sm:col-span-2"><dt className="text-slate-500">UTR</dt><dd className="break-all font-semibold">{request.details.utr}</dd></div>
        {request.details.bill && <div className="sm:col-span-2"><dt className="text-slate-500">Current bill</dt><dd>{formatCurrency(request.details.bill.amountPaid)} paid · {formatCurrency(request.details.bill.balance)} balance</dd></div>}
      </dl>}
      {request.sourceType === 'room-change' && <p className="rounded-xl bg-slate-50 p-3 text-sm">Room {request.details.fromRoom}{request.details.fromBed ? ` · Bed ${request.details.fromBed}` : ''} → Room {request.details.toRoom}{request.details.toBed ? ` · Bed ${request.details.toBed}` : ''}</p>}
      {request.sourceType === 'leave' && <p className="rounded-xl bg-slate-50 p-3 text-sm">{request.details.durationDays} day(s){request.details.emergencyContact && ` · Emergency contact ${request.details.emergencyContact}`}</p>}
      {request.responses?.length > 0 && <section><h3 className="mb-2 font-semibold">{isPrivateComplaint ? 'Private issue history' : 'Owner replies'}</h3><ul className="space-y-2">{request.responses.map((entry, index) => <li key={`${entry.createdAt}:${index}`} className="whitespace-pre-wrap break-words rounded-xl bg-teal-50 p-3 text-sm"><p className="mb-1 text-xs font-semibold text-teal-800">{entry.ownerName}{entry.actorRole && ` · ${entry.actorRole}`} · {formatDateTime(entry.createdAt)}</p>{entry.message}</li>)}</ul></section>}
      {isPrivateComplaint && request.historyPagination?.totalPages > 1 && <nav className="flex items-center justify-between" aria-label="Private issue history pages"><button type="button" className="btn-secondary" disabled={historyPage <= 1 || loading} onClick={() => setHistoryPage((value) => value - 1)}>Previous</button><span className="text-sm text-slate-500">Page {historyPage} of {request.historyPagination.totalPages}</span><button type="button" className="btn-secondary" disabled={!request.historyPagination.hasMore || loading} onClick={() => setHistoryPage((value) => value + 1)}>Next</button></nav>}
      {request.ownerResponse && !request.responses?.length && <p className="whitespace-pre-wrap break-words rounded-xl bg-teal-50 p-3 text-sm">Owner response: {request.ownerResponse}</p>}
      {actionError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{actionError}</p>}

      {canDecide && !decision && <div className="flex flex-wrap gap-3"><button className="btn-primary" type="button" onClick={() => { setDecision('Approved'); setResponse(''); setVerifiedReceipt(false); }}>Approve</button><button className="btn-secondary" type="button" onClick={() => { setDecision('Rejected'); setResponse(''); }}>Reject</button></div>}
      {decision && <form onSubmit={submitDecision} className="space-y-3 rounded-xl border border-slate-200 p-4">
        <h3 className="font-semibold text-slate-900">{decision} {request.category.toLowerCase()}</h3>
        {request.sourceType === 'payment' && decision === 'Approved' && <label className="flex items-start gap-3 rounded-xl bg-orange-50 p-3 text-sm font-semibold text-orange-900"><input type="checkbox" className="mt-1 h-4 w-4 accent-orange-500" checked={verifiedReceipt} onChange={(event) => setVerifiedReceipt(event.target.checked)} />I verified the actual payment in my bank or UPI account.</label>}
        <Field htmlFor="request-decision-response" label={request.sourceType === 'payment' && decision === 'Approved' ? 'Owner note (optional)' : 'Reply or reason (optional)'} required={request.sourceType === 'room-change' && decision === 'Rejected'}>
          <Textarea id="request-decision-response" value={response} onChange={(event) => setResponse(event.target.value)} maxLength={1000} disabled={saving} />
        </Field>
        <div className="flex flex-wrap justify-end gap-2"><button type="button" className="btn-secondary" disabled={saving} onClick={() => setDecision('')}>Back</button><button className="btn-primary" type="submit" disabled={saving || (request.sourceType === 'payment' && decision === 'Approved' && !verifiedReceipt)}>{saving && <Loader2 size={16} className="animate-spin" />}Confirm {decision.toLowerCase()}</button></div>
      </form>}

      {canUpdateGeneral && <form onSubmit={updateGeneral} className="space-y-3 rounded-xl border border-slate-200 p-4">
        <h3 className="font-semibold text-slate-900">Reply or update status</h3>
        <Field htmlFor="general-request-status" label="Status"><Select id="general-request-status" value={genericStatus} onChange={(event) => setGenericStatus(event.target.value)}><option>Open</option><option>In Progress</option><option>Resolved</option><option>Rejected</option></Select></Field>
        <Field htmlFor="general-request-reply" label="Reply to resident"><Textarea id="general-request-reply" value={response} onChange={(event) => setResponse(event.target.value)} maxLength={2000} disabled={saving} /></Field>
        <button className="btn-primary" type="submit" disabled={saving || (!response.trim() && genericStatus === request.status)}>{saving && <Loader2 size={16} className="animate-spin" />}Save reply/status</button>
      </form>}
      {ownerView && isPrivateComplaint && <form onSubmit={updateComplaint} className="space-y-3 rounded-xl border border-slate-200 p-4">
        <h3 className="font-semibold text-slate-900">Reply or update private issue</h3>
        <Field htmlFor="private-issue-status" label="Status"><Select id="private-issue-status" value={complaintStatus} onChange={(event) => setComplaintStatus(event.target.value)}><option>Open</option><option>In Progress</option><option>Resolved</option></Select></Field>
        <Field htmlFor="private-issue-reply" label="Private reply"><Textarea id="private-issue-reply" value={response} onChange={(event) => setResponse(event.target.value)} maxLength={2000} disabled={saving} /></Field>
        <button className="btn-primary" type="submit" disabled={saving || (!response.trim() && complaintStatus === request.status)}>Save private update</button>
      </form>}
      {!ownerView && isPrivateComplaint && <form onSubmit={addPrivateComment} className="space-y-3 rounded-xl border border-slate-200 p-4">
        <h3 className="font-semibold text-slate-900">Add to private issue history</h3>
        <Field htmlFor="private-issue-comment" label="Comment"><Textarea id="private-issue-comment" value={response} onChange={(event) => setResponse(event.target.value)} maxLength={2000} disabled={saving} /></Field>
        <button className="btn-primary" type="submit" disabled={saving || !response.trim()}>Add comment</button>
      </form>}
      {canCancel && <button type="button" className="btn-secondary text-rose-700" onClick={() => setCancelConfirm(true)} disabled={saving}>Cancel pending request</button>}
    </div>}
    {cancelConfirm && <ConfirmDialog title="Cancel this request?" message="The request history will remain visible, and it cannot be reopened." confirmText="Cancel request" loading={saving} onConfirm={cancelRequest} onCancel={() => setCancelConfirm(false)} />}
  </Modal>;
}
