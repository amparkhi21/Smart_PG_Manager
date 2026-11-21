import { useEffect, useRef, useState } from 'react';
import { ClipboardList, Plus, RefreshCw } from 'lucide-react';
import api from '../api/client.js';
import useFetch from '../hooks/useFetch.js';
import useDebounce from '../hooks/useDebounce.js';
import { useAuth } from '../context/AuthContext.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import SearchInput from '../components/ui/SearchInput.jsx';
import { Select } from '../components/ui/FormControls.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import PriorityBadge from '../components/complaints/PriorityBadge.jsx';
import ComplaintForm from '../components/complaints/ComplaintForm.jsx';
import ComplaintDetails from '../components/complaints/ComplaintDetails.jsx';
import ComplaintPagination from '../components/complaints/ComplaintPagination.jsx';
import { COMPLAINT_CATEGORIES, COMPLAINT_PRIORITIES, COMPLAINT_STATUSES, COMPLAINT_PAGE_SIZE, complaintPage, searchComplaints, fetchComplaintSearch } from '../utils/complaints.js';
import { formatDateTime } from '../utils/format.js';

function Summary({ revision, onStatus }) {
  const { data, loading, error, reload } = useFetch(async () => Object.fromEntries(await Promise.all(COMPLAINT_STATUSES.map(async (status) => [status, (await api.get('/complaints', { params: { status, page: 1, limit: 1 } })).data.data.pagination.total]))), [revision]);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <div aria-label="Loading complaint summary" role="status" className="grid gap-3 sm:grid-cols-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>;
  return <section aria-label="Complaint summary" className="grid gap-3 sm:grid-cols-3" aria-busy={loading}>{COMPLAINT_STATUSES.map((status) => <button type="button" key={status} onClick={() => onStatus(status)} className={`card p-5 text-left ${status !== 'Resolved' ? 'border-orange-200' : ''}`}><span className="block text-sm font-semibold text-slate-500">{status}</span><strong className="mt-2 block text-3xl text-navy-900">{data[status]}</strong></button>)}</section>;
}
function ComplaintPage({ ownerView }) {
  const base = ownerView ? '/complaints' : '/resident/complaints';
  const [search, setSearch] = useState(''), [status, setStatus] = useState(''), [category, setCategory] = useState(''), [priority, setPriority] = useState('');
  const [page, setPage] = useState(1), [revision, setRevision] = useState(0), [creating, setCreating] = useState(false), [selected, setSelected] = useState(null);
  const q = useDebounce(search), searching = Boolean(q.trim()), requestPage = searching ? 1 : page;
  const controller = useRef(null);
  const filters = { ...(status && { status }), ...(category && { category }), ...(priority && { priority }) };
  const key = JSON.stringify([base, status, category, priority, searching, requestPage, revision]);
  const list = useFetch(async () => {
    controller.current?.abort(); const current = new AbortController(); controller.current = current;
    if (searching) return { key, all: await fetchComplaintSearch(api, base, filters, current.signal) };
    return { key, ...(await api.get(base, { params: { ...filters, page: requestPage, limit: COMPLAINT_PAGE_SIZE }, signal: current.signal })).data.data };
  }, [base, status, category, priority, searching, requestPage, revision]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { const resume = () => { if (document.visibilityState === 'visible' && navigator.onLine) setRevision((value) => value + 1); }; window.addEventListener('focus', resume); window.addEventListener('app:resume', resume); return () => { window.removeEventListener('focus', resume); window.removeEventListener('app:resume', resume); }; }, []);
  const data = list.data?.key === key ? searching ? complaintPage(searchComplaints(list.data.all, q), page) : list.data : null;
  const refresh = () => setRevision((value) => value + 1);
  const filter = (setter) => (event) => { setter(event.target.value); setPage(1); };
  const clear = () => { setSearch(''); setStatus(''); setCategory(''); setPriority(''); setPage(1); };
  return <div className="space-y-5"><PageHeader title={ownerView ? 'Complaint Management' : 'My Complaints'} subtitle={ownerView ? 'Private resident issues, responses and resolution tracking for your PG.' : 'Privately report an issue and follow your owner’s responses.'}>
    {!ownerView && <button type="button" className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} />Create complaint</button>}<button type="button" className="btn-secondary" disabled={list.loading} onClick={refresh}><RefreshCw size={16} className={list.loading ? 'animate-spin' : ''} />Refresh complaints</button>
  </PageHeader>
    {ownerView && <Summary revision={revision} onStatus={(value) => { setStatus(value); setPage(1); }} />}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search complaints" /><Select aria-label="Filter complaints by status" value={status} onChange={filter(setStatus)}><option value="">All statuses</option>{COMPLAINT_STATUSES.map((value) => <option key={value}>{value}</option>)}</Select><Select aria-label="Filter complaints by category" value={category} onChange={filter(setCategory)}><option value="">All categories</option>{COMPLAINT_CATEGORIES.map((value) => <option key={value}>{value}</option>)}</Select><Select aria-label="Filter complaints by priority" value={priority} onChange={filter(setPriority)}><option value="">All priorities</option>{COMPLAINT_PRIORITIES.map((value) => <option key={value}>{value}</option>)}</Select></div>
    {(search || status || category || priority) && <button type="button" className="btn-secondary" onClick={clear}>Clear filters</button>}
    {list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : list.loading || !data ? <div role="status" aria-label="Loading complaints"><Skeleton className="h-64" /></div>
      : !data.complaints.length ? <div className="card"><EmptyState icon={ClipboardList} title={search || status || category || priority ? 'No complaints match' : 'No complaints yet'} text={ownerView ? 'Resident complaints matching your selection will appear here.' : 'Use Create complaint to privately report an issue to your owner.'} /></div>
        : <section aria-label="Complaint list" className="space-y-4">{data.complaints.map((complaint) => <article key={complaint.id} aria-label={complaint.title} className={`card min-w-0 space-y-4 border p-5 ${complaint.status !== 'Resolved' ? 'border-l-4 border-l-orange-400' : 'border-slate-100'}`}>
          <div className="flex flex-wrap items-start justify-between gap-3"><h2 className="min-w-0 break-words text-lg font-bold text-navy-900">{complaint.title}</h2><StatusBadge status={complaint.status} /></div>
          <div className="flex flex-wrap items-center gap-2"><PriorityBadge priority={complaint.priority} /><span className="text-sm font-medium text-slate-500">{complaint.category}</span></div>
          {ownerView && <p className="break-words text-sm font-semibold text-slate-700">{complaint.resident.fullName} · Resident room {complaint.resident.roomNumberAtCreation}</p>}
          <p className="line-clamp-2 whitespace-pre-wrap break-words text-slate-600 [overflow-wrap:anywhere]">{complaint.description}</p><p className="text-sm text-slate-500">{complaint.room ? `Issue in Room ${complaint.room.roomNumber}` : 'General PG issue'} · Submitted {formatDateTime(complaint.createdAt)}</p>
          <button type="button" className="btn-secondary" onClick={() => setSelected(complaint.id)}>View complaint</button>
        </article>)}<ComplaintPagination label="Complaint list pages" pagination={data.pagination} loading={list.loading} onPage={setPage} /></section>}
    {creating && <ComplaintForm onClose={() => setCreating(false)} onSaved={(complaint) => { setCreating(false); setSelected(complaint.id); refresh(); }} />}
    {selected && <ComplaintDetails key={selected} id={selected} ownerView={ownerView} revision={revision} onUpdated={refresh} onClose={() => setSelected(null)} />}
  </div>;
}
export default function Complaints({ ownerView = false }) {
  const { owner, resident } = useAuth(), user = owner || resident;
  return <ComplaintPage key={`${ownerView}:${user.id || user._id}`} ownerView={ownerView} />;
}
