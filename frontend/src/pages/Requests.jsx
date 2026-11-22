import { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client.js';
import useFetch from '../hooks/useFetch.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import { Field, Input, Select, Textarea } from '../components/ui/FormControls.jsx';
import Modal from '../components/ui/Modal.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import RequestCard from '../components/requests/RequestCard.jsx';
import RequestDetailsModal from '../components/requests/RequestDetailsModal.jsx';
import RoomChangeRequestModal from '../components/rooms/RoomChangeRequestModal.jsx';
import LeaveRequestForm from '../components/leave/LeaveRequestForm.jsx';
import ResidentPayModal from '../components/payments/ResidentPayModal.jsx';
import { formatCurrency, formatMonth, getErrorMessage } from '../utils/format.js';

const CATEGORIES = ['Payment Verification', 'Room / Bed Change', 'Leave Request', 'Maintenance', 'Private Issue', 'Other / General'];
const STATUSES = ['Pending Verification', 'Pending', 'Open', 'In Progress', 'Approved', 'Rejected', 'Resolved', 'Cancelled'];
const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];

function Pager({ pagination, onPage }) {
  if (!pagination || pagination.totalPages <= 1) return null;
  return <nav className="flex items-center justify-between gap-3" aria-label="Request pages">
    <button type="button" className="btn-secondary" onClick={() => onPage(pagination.page - 1)} disabled={pagination.page <= 1}><ChevronLeft size={16} />Previous</button>
    <span className="text-sm text-slate-600">Page {pagination.page} of {pagination.totalPages}</span>
    <button type="button" className="btn-secondary" onClick={() => onPage(pagination.page + 1)} disabled={!pagination.hasMore}><ChevronRight size={16} />Next</button>
  </nav>;
}

function GeneralRequestForm({ category, onClose, onSaved }) {
  const [form, setForm] = useState({ title: '', description: '', priority: 'Normal' });
  const [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setError(''); setSaving(true);
    try {
      const result = await api.post('/resident/requests', { category, title: form.title.trim(), description: form.description.trim(), priority: form.priority });
      toast.success(result.data.message); onSaved();
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };
  return <Modal title="Create a request" onClose={onClose} dismissable={!saving}><form onSubmit={submit} className="space-y-4">
    <p className="text-sm font-semibold text-teal-800">{category}</p>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <Field htmlFor="general-request-title" label="Title" required><Input id="general-request-title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} minLength={3} maxLength={120} required disabled={saving} /></Field>
    <Field htmlFor="general-request-description" label="Description" required><Textarea id="general-request-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} minLength={5} maxLength={3000} rows={5} required disabled={saving} /></Field>
    <Field htmlFor="general-request-priority" label="Priority"><Select id="general-request-priority" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} disabled={saving}>{PRIORITIES.map((value) => <option key={value}>{value}</option>)}</Select></Field>
    <div className="flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" className="btn-primary" disabled={saving}>Submit request</button></div>
  </form></Modal>;
}

function PaymentRequestStart({ onClose, onSaved }) {
  const { data, loading, error, reload } = useFetch(async () => {
    const [bills, details] = await Promise.all([api.get('/resident/payments/bills'), api.get('/resident/payments/details')]);
    return { bills: bills.data.data, details: details.data.data };
  }, []);
  const [bill, setBill] = useState(null);
  if (bill) return <ResidentPayModal bill={bill} details={data?.details} onClose={onClose} onSaved={onSaved} />;
  return <Modal title="Payment verification request" onClose={onClose}>
    {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <div role="status" aria-label="Loading outstanding bills"><Skeleton className="h-40" /></div> : <div className="space-y-4">
      <p className="text-sm text-slate-600">Choose an outstanding bill to submit a payment claim. Your owner will verify receipt before recording payment.</p>
      {!data.bills.length ? <EmptyState title="No outstanding bills" text="There is no bill available for a payment claim." /> : <div className="space-y-3">{data.bills.map((item) => <button key={`${item.billType}:${item.id}`} type="button" className="card flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left hover:border-teal-400" onClick={() => setBill(item)}><span><strong>{item.billType === 'Rent' ? 'Rent' : 'Room electricity'} · {formatMonth(item.month)}</strong><span className="mt-1 block text-sm text-slate-500">Available to claim: {formatCurrency(item.claimableAmount)}</span></span><span className="btn-primary">Continue</span></button>)}</div>}
      <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
    </div>}
  </Modal>;
}

function OwnerRequests() {
  const [category, setCategory] = useState(''), [status, setStatus] = useState(''), [priority, setPriority] = useState(''), [resident, setResident] = useState(''), [page, setPage] = useState(1), [selected, setSelected] = useState(null);
  const { data: residents } = useFetch(async () => (await api.get('/residents')).data.data, []);
  const { data, loading, error, reload } = useFetch(async () => (await api.get('/requests', { params: { page, limit: 20, ...(category && { category }), ...(status && { status }), ...(priority && { priority }), ...(resident && { resident }) } })).data.data, [page, category, status, priority, resident]);
  const changeFilter = (setter) => (event) => { setter(event.target.value); setPage(1); };
  return <div className="space-y-5"><PageHeader title="Requests" subtitle="Review payment, room, leave and resident service requests."><button type="button" className="btn-secondary" onClick={reload} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh</button></PageHeader>
    <section className="card grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Filter requests">
      <Select aria-label="Filter by category" value={category} onChange={changeFilter(setCategory)}><option value="">All categories</option>{CATEGORIES.map((value) => <option key={value}>{value}</option>)}</Select>
      <Select aria-label="Filter by status" value={status} onChange={changeFilter(setStatus)}><option value="">All statuses</option>{STATUSES.map((value) => <option key={value}>{value}</option>)}</Select>
      <Select aria-label="Filter by priority" value={priority} onChange={changeFilter(setPriority)}><option value="">All priorities</option>{PRIORITIES.map((value) => <option key={value}>{value}</option>)}</Select>
      <Select aria-label="Filter by resident" value={resident} onChange={changeFilter(setResident)}><option value="">All residents</option>{(residents || []).map((person) => <option key={person._id} value={person._id}>{person.fullName} · Room {person.room?.roomNumber || '—'}{person.bedNumber ? ` · Bed ${person.bedNumber}` : ''}</option>)}</Select>
    </section>
    {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <div role="status" aria-label="Loading requests" className="space-y-3"><Skeleton className="h-36" /><Skeleton className="h-36" /></div> : !data.requests.length ? <div className="card"><EmptyState title="No requests found" text="Requests matching these filters will appear here." /></div> : <div className="space-y-4" aria-busy={loading}>{data.requests.map((request) => <RequestCard key={request.id} request={request} ownerView onOpen={() => setSelected(request)} />)}</div>}
    <Pager pagination={data?.pagination} onPage={setPage} />
    {selected && <RequestDetailsModal item={selected} ownerView onClose={() => setSelected(null)} onChanged={reload} />}
  </div>;
}

function ResidentRequests() {
  const [category, setCategory] = useState(''), [status, setStatus] = useState(''), [page, setPage] = useState(1), [selected, setSelected] = useState(null), [chooser, setChooser] = useState(false), [newCategory, setNewCategory] = useState('');
  const { data, loading, error, reload } = useFetch(async () => (await api.get('/resident/requests', { params: { page, limit: 20, ...(category && { category }), ...(status && { status }) } })).data.data, [page, category, status]);
  const refresh = () => { reload(); setPage(1); };
  const begin = () => { setChooser(false); setNewCategory(''); };
  const createDone = () => { begin(); refresh(); };
  return <div className="space-y-5"><PageHeader title="My Requests" subtitle="Create requests and follow the owner's decisions and replies."><button type="button" className="btn-primary" onClick={() => setChooser(true)}><Plus size={16} />New request</button><button type="button" className="btn-secondary" onClick={reload} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh</button></PageHeader>
    <div className="grid gap-3 sm:grid-cols-2"><Select aria-label="Filter my requests by category" value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}><option value="">All categories</option>{CATEGORIES.map((value) => <option key={value}>{value}</option>)}</Select><Select aria-label="Filter my requests by status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option>{STATUSES.map((value) => <option key={value}>{value}</option>)}</Select></div>
    {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <div role="status" aria-label="Loading my requests" className="space-y-3"><Skeleton className="h-36" /><Skeleton className="h-36" /></div> : !data.requests.length ? <div className="card"><EmptyState title="No requests yet" text="Choose New request to contact your PG owner." /></div> : <div className="space-y-4" aria-busy={loading}>{data.requests.map((request) => <RequestCard key={request.id} request={request} onOpen={() => setSelected(request)} />)}</div>}
    <Pager pagination={data?.pagination} onPage={setPage} />
    {selected && <RequestDetailsModal item={selected} onClose={() => setSelected(null)} onChanged={reload} />}
    {chooser && <Modal title="Choose request type" onClose={() => setChooser(false)}><div className="space-y-4"><Field htmlFor="new-request-category" label="Request category" required><Select id="new-request-category" value={newCategory} onChange={(event) => setNewCategory(event.target.value)}><option value="">Select a category</option>{CATEGORIES.map((value) => <option key={value}>{value}</option>)}</Select></Field><div className="flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={() => setChooser(false)}>Cancel</button><button type="button" className="btn-primary" disabled={!newCategory} onClick={() => setChooser(false)}>Continue</button></div></div></Modal>}
    {newCategory === 'Payment Verification' && !chooser && <PaymentRequestStart onClose={begin} onSaved={createDone} />}
    {newCategory === 'Room / Bed Change' && !chooser && <RoomChangeRequestModal onClose={begin} onSaved={createDone} />}
    {newCategory === 'Leave Request' && !chooser && <LeaveRequestForm onClose={begin} onSaved={createDone} />}
    {['Maintenance', 'Private Issue', 'Other / General'].includes(newCategory) && !chooser && <GeneralRequestForm category={newCategory} onClose={begin} onSaved={createDone} />}
  </div>;
}

export default function Requests({ ownerView = false }) { return ownerView ? <OwnerRequests /> : <ResidentRequests />; }
