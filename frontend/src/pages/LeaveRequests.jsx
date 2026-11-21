import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Loader2, Plus, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client.js';
import useFetch from '../hooks/useFetch.js';
import useDebounce from '../hooks/useDebounce.js';
import { useAuth } from '../context/AuthContext.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { Field, Input, Select, Textarea } from '../components/ui/FormControls.jsx';
import SearchInput from '../components/ui/SearchInput.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import Modal from '../components/ui/Modal.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import LeaveRequestForm from '../components/leave/LeaveRequestForm.jsx';
import { LEAVE_STATUSES, LEAVE_PAGE_SIZE, leavePage, searchLeaveRequests, fetchLeaveSearch } from '../utils/leaveRequests.js';
import { formatDate, formatDateTime, getErrorMessage } from '../utils/format.js';

function RequestHistory({ id, base, revision, onClose }) {
  const { data, loading, error, reload } = useFetch(async () => (await api.get(`${base}/${id}`)).data.data, [base, id, revision]);
  return <Modal title="Leave request history" onClose={onClose} size="lg">
    {error ? <ErrorState message={error} onRetry={reload} /> : loading || !data ? <div role="status" aria-label="Loading leave history"><Skeleton className="h-64" /></div> : <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-bold text-navy-900">{formatDate(data.fromDate)} to {formatDate(data.toDate)}</h3><StatusBadge status={data.status} /></div>
      <p className="text-sm text-slate-500">{data.resident.fullName} · Room {data.room.roomNumber} at request · {data.durationDays} {data.durationDays === 1 ? 'day' : 'days'}</p>
      <p className="whitespace-pre-wrap break-words text-slate-700 [overflow-wrap:anywhere]">{data.reason}</p>{data.emergencyContact && <p className="break-all text-sm text-slate-600">Emergency contact: {data.emergencyContact}</p>}
      <ol className="space-y-3" aria-label="Leave request activity">{data.history.map((entry) => <li key={entry.id} className="space-y-2 rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><StatusBadge status={entry.status} /><time dateTime={entry.createdAt} className="text-sm text-slate-500">{formatDateTime(entry.createdAt)} (IST)</time></div><p className="break-words text-sm font-semibold">{entry.actor.name} · {entry.actor.role === 'owner' ? 'Owner' : 'Resident'}</p>{entry.response && <p className="whitespace-pre-wrap break-words text-slate-700">{entry.response}</p>}</li>)}</ol>
    </div>}
  </Modal>;
}
function LeaveRequestPage({ ownerView }) {
  const base = ownerView ? '/leave-requests' : '/resident/leave-requests';
  const [status, setStatus] = useState(''), [search, setSearch] = useState(''), [date, setDate] = useState(''), [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [creating, setCreating] = useState(false), [historyId, setHistoryId] = useState(null), [target, setTarget] = useState(null), [response, setResponse] = useState('');
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  const busy = useRef(false), finalized = useRef(new Set()), controller = useRef(null);
  const q = useDebounce(search), searching = Boolean(q.trim()), requestPage = searching ? 1 : page;
  const filters = { ...(status && { status }), ...(date && { date }) };
  const key = JSON.stringify([base, status, date, searching, requestPage, revision]);
  const list = useFetch(async () => {
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    if (searching) return { key, all: await fetchLeaveSearch(api, base, filters, request.signal) };
    return { key, ...(await api.get(base, { params: { ...filters, page: requestPage, limit: LEAVE_PAGE_SIZE }, signal: request.signal })).data.data };
  }, [base, status, date, searching, requestPage, revision]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { const resume = () => { if (document.visibilityState === 'visible' && navigator.onLine) setRevision((value) => value + 1); }; window.addEventListener('focus', resume); window.addEventListener('app:resume', resume); return () => { window.removeEventListener('focus', resume); window.removeEventListener('app:resume', resume); }; }, []);
  const data = list.data?.key === key ? searching ? leavePage(searchLeaveRequests(list.data.all, q), page) : list.data : null;
  const refresh = () => setRevision((value) => value + 1);
  const choose = (request, action) => { setTarget({ request, action }); setResponse(''); setError(''); };
  const decide = async (event) => {
    event?.preventDefault(); if (busy.current || !target || finalized.current.has(target.request.id)) return;
    if (response.trim().length > 1000) return setError('Keep remarks within 1000 characters.');
    busy.current = true; setSaving(true); setError('');
    try {
      const result = target.action === 'Cancel' ? await api.post(`${base}/${target.request.id}/cancel`, {})
        : await api.patch(`${base}/${target.request.id}/decision`, { decision: target.action, response: response.trim() });
      finalized.current.add(target.request.id); toast.success(result.data.message); setTarget(null); setPage(1); refresh();
    } catch (err) { setError(getErrorMessage(err)); if ([404, 409].includes(err.response?.status)) { setTarget(null); setPage(1); refresh(); } }
    finally { busy.current = false; setSaving(false); }
  };
  return <div className="space-y-5"><PageHeader title={ownerView ? 'Leave Management' : 'Leave Requests'} subtitle={ownerView ? 'Review leave dates and responses for your PG residents.' : 'Request leave and follow your owner’s decisions. Dates use the Indian calendar.'}>
    {!ownerView && <button type="button" className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} />Request leave</button>}
    <button type="button" className="btn-secondary" disabled={list.loading || saving} onClick={refresh}><RefreshCw size={16} className={list.loading ? 'animate-spin' : ''} />Refresh requests</button>
  </PageHeader>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><SearchInput value={search} placeholder="Search leave requests" onChange={(value) => { setSearch(value); setPage(1); }} /><Select aria-label="Filter leave requests by status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option>{LEAVE_STATUSES.map((value) => <option key={value}>{value}</option>)}</Select><Field htmlFor="leave-filter-date" label="Leave on date (optional)"><Input id="leave-filter-date" type="date" value={date} onChange={(event) => { setDate(event.target.value); setPage(1); }} /></Field></div>
    {(status || search || date) && <button type="button" className="btn-secondary" onClick={() => { setStatus(''); setSearch(''); setDate(''); setPage(1); }}>Clear filters</button>}
    {error && !target && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : list.loading || !data ? <div role="status" aria-label="Loading leave requests"><Skeleton className="h-64" /></div>
      : !data.requests.length ? <div className="card"><EmptyState icon={CalendarDays} title={status || search || date ? 'No leave requests match' : 'No leave requests yet'} text={ownerView ? 'Resident requests matching these filters will appear here.' : 'Use Request leave to share your planned absence with your owner.'} /></div>
        : <section aria-label="Leave request list" className="space-y-4">{data.requests.map((request) => <article key={request.id} data-request-id={request.id} aria-label={`Leave ${request.fromDate} to ${request.toDate}`} className={`card min-w-0 space-y-4 border p-5 ${request.status === 'Pending' ? 'border-l-4 border-l-orange-400' : 'border-slate-100'}`}>
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words text-lg font-bold text-navy-900">{ownerView ? request.resident.fullName : `${formatDate(request.fromDate)} to ${formatDate(request.toDate)}`}</h2><p className="mt-1 text-sm text-slate-500">Room {request.room.roomNumber} at request · {request.durationDays} {request.durationDays === 1 ? 'day' : 'days'}</p></div><StatusBadge status={request.status} /></div>
          {ownerView && <p className="font-semibold text-navy-900">{formatDate(request.fromDate)} to {formatDate(request.toDate)}</p>}
          <p className="whitespace-pre-wrap break-words text-slate-700 [overflow-wrap:anywhere]">{request.reason}</p>{request.emergencyContact && <p className="break-all text-sm text-slate-500">Emergency contact: {request.emergencyContact}</p>}
          <p className="text-sm text-slate-500">Requested {formatDateTime(request.createdAt)} (IST)</p>{request.response && <p className="whitespace-pre-wrap break-words rounded-xl bg-orange-50 p-3 text-sm text-orange-900">Owner response: {request.response}</p>}
          <div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" onClick={() => setHistoryId(request.id)}>View history</button>
            {request.status === 'Pending' && !finalized.current.has(request.id) && (ownerView ? <><button type="button" className="btn-primary" disabled={list.loading || saving} onClick={() => choose(request, 'Approved')}>Approve</button><button type="button" className="btn-secondary" disabled={list.loading || saving} onClick={() => choose(request, 'Rejected')}>Reject</button></>
              : <button type="button" className="btn-secondary text-rose-600" disabled={list.loading || saving} onClick={() => choose(request, 'Cancel')}>Cancel request</button>)}
          </div>
        </article>)}
          <nav aria-label="Leave request pages" className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-500">Page {data.pagination.page} of {data.pagination.totalPages} · {data.pagination.total} requests</p><div className="flex gap-2"><button type="button" className="btn-secondary" disabled={list.loading || data.pagination.page <= 1} onClick={() => setPage(data.pagination.page - 1)}>Previous</button><button type="button" className="btn-secondary" disabled={list.loading || !data.pagination.hasMore} onClick={() => setPage(data.pagination.page + 1)}>Next</button></div></nav>
        </section>}
    {creating && <LeaveRequestForm onClose={() => setCreating(false)} onSaved={(request) => { setCreating(false); setHistoryId(request.id); refresh(); }} />}
    {historyId && <RequestHistory id={historyId} base={base} revision={revision} onClose={() => setHistoryId(null)} />}
    {target?.action === 'Cancel' && <ConfirmDialog title="Cancel this leave request?" message={`Cancel your pending leave from ${formatDate(target.request.fromDate)} to ${formatDate(target.request.toDate)}? Its history will be preserved.`} confirmText="Cancel leave request" loading={saving} onConfirm={decide} onCancel={() => setTarget(null)} />}
    {target && target.action !== 'Cancel' && <Modal title={target.action === 'Approved' ? 'Approve leave request' : 'Reject leave request'} onClose={() => setTarget(null)} dismissable={!saving}><form onSubmit={decide} className="space-y-4"><p className="text-sm text-slate-700">{target.request.resident.fullName} · Room {target.request.room.roomNumber} · {formatDate(target.request.fromDate)} to {formatDate(target.request.toDate)} · {target.request.durationDays} day(s)</p><p className="whitespace-pre-wrap break-words text-sm text-slate-600">{target.request.reason}</p>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<Field htmlFor="leave-decision-response" label="Remarks (optional)"><Textarea id="leave-decision-response" value={response} onChange={(event) => setResponse(event.target.value)} maxLength={1000} disabled={saving} /></Field><p className="text-sm text-slate-500">This records the leave decision. Attendance and financial records stay unchanged.</p>
      <div className="flex flex-wrap justify-end gap-3"><button type="button" className="btn-secondary" disabled={saving} onClick={() => setTarget(null)}>Cancel</button><button type="submit" className="btn-primary" disabled={saving}>{saving && <Loader2 size={16} className="animate-spin" />}{target.action === 'Approved' ? 'Confirm approval' : 'Confirm rejection'}</button></div>
    </form></Modal>}
  </div>;
}
export default function LeaveRequests({ ownerView = false }) {
  const { owner, resident } = useAuth(), user = owner || resident;
  return <LeaveRequestPage key={`${ownerView}:${user.id || user._id}`} ownerView={ownerView} />;
}
