import { useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client.js';
import useFetch from '../hooks/useFetch.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import { Field, Select, Textarea } from '../components/ui/FormControls.jsx';
import Modal from '../components/ui/Modal.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import { CLAIM_STATUSES } from '../utils/upiPayments.js';
import { formatCurrency, formatDate, formatMonth, getErrorMessage } from '../utils/format.js';

export default function PaymentRequests() {
  const [status, setStatus] = useState('Pending Verification'), [type, setType] = useState('');
  const [decision, setDecision] = useState(null), [verified, setVerified] = useState(false), [note, setNote] = useState('');
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  const busy = useRef(false), reviewed = useRef(new Set());
  const { data, loading, error: loadError, reload } = useFetch(async () => {
    const result = (await api.get('/payment-claims', { params: { limit: 100, ...(status && { status }), ...(type && { billType: type }) } })).data;
    return { claims: result.data, counts: result.counts };
  }, [status, type]);
  useEffect(() => { const resume = () => { if (document.visibilityState === 'visible' && navigator.onLine) reload(); }; window.addEventListener('app:resume', resume); window.addEventListener('focus', resume); return () => { window.removeEventListener('app:resume', resume); window.removeEventListener('focus', resume); }; }, [reload]);
  const decide = async (event) => {
    event.preventDefault(); if (busy.current || !decision || reviewed.current.has(decision.claim.id)) return;
    if (decision.approve && !verified) return setError('Confirm the money arrived in your actual bank/UPI account first.');
    busy.current = true; setSaving(true); setError('');
    try {
      const payload = decision.approve ? { verifiedReceipt: true, note: note.trim() } : { reason: note.trim() };
      const result = await api.post(`/payment-claims/${decision.claim.id}/${decision.approve ? 'approve' : 'reject'}`, payload);
      reviewed.current.add(decision.claim.id); toast.success(result.data.message); setDecision(null); reload();
    } catch (err) { setError(getErrorMessage(err)); if (err.response?.status === 409 || err.response?.status === 404) { setDecision(null); reload(); } }
    finally { busy.current = false; setSaving(false); }
  };
  return <div><PageHeader title="Payment Requests" subtitle="Verify actual receipts before recording residents' claimed payments."><button type="button" className="btn-secondary" disabled={loading || saving} onClick={reload}><RefreshCw size={16} />Refresh requests</button></PageHeader>
    {data && <div className="mb-5 grid gap-3 sm:grid-cols-3">{CLAIM_STATUSES.map((label) => <div key={label} className="card p-4"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-navy-900">{data.counts?.[label] || 0}</p></div>)}</div>}
    <div className="mb-5 grid gap-3 sm:grid-cols-2"><Select aria-label="Filter payment requests by status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{CLAIM_STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}</Select><Select aria-label="Filter payment requests by bill type" value={type} onChange={(event) => setType(event.target.value)}><option value="">All bill types</option><option value="Rent">Rent</option><option value="Electricity">Room electricity</option></Select></div>
    {error && !decision && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {loadError ? <ErrorState message={loadError} onRetry={reload} /> : !data ? <div role="status" aria-label="Loading payment requests"><Skeleton className="h-64" /></div> : !data.claims.length ? <div className="card"><EmptyState title="No payment requests" text="Requests matching these filters will appear here." /></div> : <div className="space-y-4" aria-busy={loading}><p className="text-sm text-slate-500">Showing up to 100 matching requests.</p>{data.claims.map((claim) => <article key={claim.id} aria-label={`Payment request from ${claim.resident?.name || 'resident'}`} className="card min-w-0 space-y-4 p-5"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="break-words text-lg font-bold text-navy-900">{claim.resident?.name || 'Resident no longer available'}</h2><p className="text-sm text-slate-500">Room {claim.room || 'not available'} · {claim.billType === 'Rent' ? 'Personal rent' : 'Shared room electricity'} · {formatMonth(claim.month)}</p></div><StatusBadge status={claim.status} /></div>
      <dl className="grid gap-4 text-sm sm:grid-cols-3"><div><dt className="text-slate-500">Claimed amount</dt><dd className="mt-1 font-bold">{formatCurrency(claim.amount)}</dd></div><div><dt className="text-slate-500">UTR</dt><dd className="mt-1 break-all font-semibold">{claim.utr}</dd></div><div><dt className="text-slate-500">Payment date</dt><dd className="mt-1 font-semibold">{formatDate(claim.paymentDate)}</dd></div></dl>
      {claim.bill && <p className="text-sm text-slate-500">Current bill balance: {formatCurrency(claim.bill.balance)} · Recorded payments: {formatCurrency(claim.bill.amountPaid)}</p>}
      {claim.reviewNote && <p className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-sm">Owner response: {claim.reviewNote}</p>}
      {claim.status === 'Pending Verification' && !reviewed.current.has(claim.id) && <><p className="rounded-xl bg-orange-50 p-3 text-sm text-orange-900">{claim.verificationWarning || 'A typed UTR is not proof of receipt. Check your actual bank/UPI account before approving.'}</p><div className="flex flex-wrap gap-3"><button type="button" className="btn-primary" disabled={loading || saving || !claim.bill || claim.amount > claim.bill.balance} onClick={() => { setDecision({ claim, approve: true }); setVerified(false); setNote(''); setError(''); }}>Approve</button><button type="button" className="btn-secondary" disabled={loading || saving} onClick={() => { setDecision({ claim, approve: false }); setVerified(false); setNote(''); setError(''); }}>Reject</button></div></>}
    </article>)}</div>}
    {decision && <Modal title={decision.approve ? 'Approve payment claim' : 'Reject payment claim'} onClose={() => setDecision(null)} dismissable={!saving}><form onSubmit={decide} className="space-y-4"><p className="text-sm text-slate-700">{decision.claim.resident?.name} · {formatCurrency(decision.claim.amount)} · UTR <strong className="break-all">{decision.claim.utr}</strong></p>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {decision.approve ? <label className="flex items-start gap-3 rounded-xl bg-orange-50 p-4 text-sm font-semibold text-orange-900"><input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} disabled={saving} className="mt-0.5 h-5 w-5 shrink-0 accent-orange-500" />I checked my actual bank/UPI account and received this payment.</label> : <p className="text-sm text-slate-500">Rejection keeps the existing bill balance unchanged.</p>}
      <Field htmlFor="payment-review-note" label={decision.approve ? 'Approval note (optional)' : 'Reason (optional)'}><Textarea id="payment-review-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} disabled={saving} /></Field>
      <div className="flex flex-wrap justify-end gap-3"><button type="button" className="btn-secondary" disabled={saving} onClick={() => setDecision(null)}>Cancel</button><button type="submit" className="btn-primary" disabled={saving || (decision.approve && !verified)}>{saving && <Loader2 size={16} className="animate-spin" />}{decision.approve ? 'Approve and record payment' : 'Confirm rejection'}</button></div>
    </form></Modal>}
  </div>;
}
