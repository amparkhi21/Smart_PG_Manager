import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import api from '../api/client.js';
import useFetch from '../hooks/useFetch.js';
import { useAuth } from '../context/AuthContext.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { Field, Input } from '../components/ui/FormControls.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import ResidentPayModal from '../components/payments/ResidentPayModal.jsx';
import { currentMonth, formatCurrency, formatDate, formatDateTime, formatMonth } from '../utils/format.js';

function BillFigures({ bill }) {
  return <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">{[['Billed', bill.amountDue], ['Amount paid', bill.amountPaid], ['Outstanding', bill.balance]].map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className="mt-1 font-bold text-navy-900">{formatCurrency(value)}</dd></div>)}<div><dt className="text-slate-500">Due date</dt><dd className="mt-1 font-semibold">{formatDate(bill.dueDate)}</dd></div></dl>;
}
function MonthlyHistory({ month, version }) {
  const { data, loading, error, reload } = useFetch(async () => (await api.get('/resident/payments/history', { params: { month } })).data.data, [month, version]);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data) return <div role="status" aria-label="Loading monthly payment history"><Skeleton className="h-40" /></div>;
  if (!data.length) return <div className="card"><EmptyState title="No bills for this month" text="Your issued bills and recorded payments will appear here." /></div>;
  return <div className="space-y-4">{data.map((bill) => <article key={`${bill.billType}:${bill.id}`} className="card min-w-0 space-y-4 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-navy-900">{bill.billType === 'Rent' ? 'Personal rent' : 'Shared room electricity'}</h3><StatusBadge status={bill.status} /></div><BillFigures bill={bill} />
    {bill.billType === 'Electricity' ? <p className="text-sm text-slate-500">Room totals, including payments against the shared bill. No individual share or another resident's payment details are shown.</p> : bill.payments?.length ? <ul className="space-y-2 border-t border-slate-100 pt-3">{bill.payments.map((payment) => <li key={payment.id} className="flex flex-wrap justify-between gap-2 text-sm"><span>{formatDateTime(payment.paidOn)} · {payment.method}</span><strong>{formatCurrency(payment.amount)}</strong></li>)}</ul> : <p className="text-sm text-slate-500">No payment recorded yet.</p>}
  </article>)}</div>;
}
export default function ResidentPayments() {
  const { resident } = useAuth();
  const [selected, setSelected] = useState(null), [month, setMonth] = useState(currentMonth), [version, setVersion] = useState(0);
  const { data, loading, error, reload } = useFetch(async () => {
    const [bills, claims, details] = await Promise.all([api.get('/resident/payments/bills'), api.get('/resident/payments/claims'), api.get('/resident/payments/details')]);
    return { bills: bills.data.data, claims: claims.data.data, details: details.data.data };
  }, []);
  const refresh = () => { reload(); setVersion((value) => value + 1); };
  useEffect(() => {
    const resume = () => { if (document.visibilityState === 'visible' && navigator.onLine) { reload(); setVersion((value) => value + 1); } };
    window.addEventListener('app:resume', resume); window.addEventListener('focus', resume);
    return () => { window.removeEventListener('app:resume', resume); window.removeEventListener('focus', resume); };
  }, [reload]);
  const claims = data?.claims.filter((claim) => claim.month === month) || [];
  return <div className="space-y-6"><PageHeader title="My Bills & Payments" subtitle="Your rent, shared room electricity and payment verification history."><button type="button" className="btn-secondary" onClick={refresh} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh payments</button></PageHeader>
    {error ? <ErrorState message={error} onRetry={refresh} /> : !data ? <div role="status" aria-label="Loading bills"><Skeleton className="h-64" /></div> : <>
      {!data.details.upiId && <p className="rounded-xl bg-orange-50 p-4 text-sm text-orange-900">Your owner has not configured a UPI ID yet. Contact your owner for payment details.</p>}
      <section aria-label="Outstanding bills" className="space-y-4"><h2 className="text-lg font-bold text-navy-900">Outstanding bills</h2>{!data.bills.length ? <div className="card"><EmptyState title="No outstanding bills" text="Your issued rent and room electricity bills have no pending balance." /></div> : data.bills.map((bill) => <article key={`${bill.billType}:${bill.id}`} aria-label={`${bill.billType} ${bill.month}`} className="card min-w-0 space-y-4 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-navy-900">{bill.billType === 'Rent' ? 'Your rent' : `Room ${resident.room?.roomNumber || ''} electricity (shared)`} · {formatMonth(bill.month)}</h3><StatusBadge status={bill.status} /></div><BillFigures bill={bill} />
        {bill.billType === 'Electricity' && <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">These are the shared room's total charges and balance. No individual share has been calculated.</p>}
        {bill.pendingClaimAmount > 0 && <p className="text-sm text-amber-700">{formatCurrency(bill.pendingClaimAmount)} awaiting verification against this bill. Available for another claim: {formatCurrency(bill.claimableAmount)}.</p>}
        <button type="button" className="btn-primary" disabled={loading || bill.claimableAmount <= 0} onClick={() => setSelected(bill)}>{bill.claimableAmount > 0 ? 'Pay Now' : 'Awaiting verification'}</button>
      </article>)}</section>
      <section aria-label="Monthly payment history" className="space-y-4"><h2 className="text-lg font-bold text-navy-900">Monthly payment history</h2><div className="max-w-xs"><Field htmlFor="payment-history-month" label="Billing month"><Input id="payment-history-month" type="month" value={month} onChange={(event) => { if (event.target.value) setMonth(event.target.value); }} /></Field></div><MonthlyHistory month={month} version={version} /></section>
      <section aria-label="Payment claims" className="space-y-4"><h2 className="text-lg font-bold text-navy-900">Your payment claims · {formatMonth(month)}</h2><p className="text-sm text-slate-500">Claims stay pending until your owner verifies the actual receipt. Showing matching entries from your latest 100 claims.</p>{!claims.length ? <div className="card"><EmptyState title="No payment claims this month" text="Submit your actual UPI reference after making a payment." /></div> : claims.map((claim) => <article key={claim.id} className="card min-w-0 space-y-3 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-navy-900">{claim.billType === 'Rent' ? 'Rent' : 'Room electricity'} · {formatCurrency(claim.amount)}</h3><StatusBadge status={claim.status} /></div><p className="break-all text-sm">UTR: {claim.utr}</p><p className="text-sm text-slate-500">Payment date: {formatDate(claim.paymentDate)}</p>{claim.reviewNote && <p className="whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-sm">Owner response: {claim.reviewNote}</p>}</article>)}</section>
    </>}
    {selected && <ResidentPayModal bill={selected} details={data.details} onClose={() => setSelected(null)} onSaved={() => { setSelected(null); refresh(); }} />}
  </div>;
}
