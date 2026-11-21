import { useRef, useState } from 'react';
import { Copy, Loader2, Smartphone } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/client.js';
import useFetch from '../../hooks/useFetch.js';
import Modal from '../ui/Modal.jsx';
import { Field, Input } from '../ui/FormControls.jsx';
import ErrorState from '../ui/ErrorState.jsx';
import { copyText } from '../../native/external.js';
import { openUpi } from '../../native/upi.js';
import { claimErrors, paymentAmountError, upiIntent } from '../../utils/upiPayments.js';
import { formatCurrency, formatMonth, getErrorMessage, todayInput } from '../../utils/format.js';

export default function ResidentPayModal({ bill, details, onClose, onSaved }) {
  const [form, setForm] = useState({ amount: bill.billType === 'Electricity' ? '' : String(bill.claimableAmount), utr: '', paymentDate: todayInput() });
  const [errors, setErrors] = useState({}), [error, setError] = useState(''), [message, setMessage] = useState(''), [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const { data, loading, error: loadError, reload } = useFetch(async () => {
    const [bills, payee] = await Promise.all([api.get('/resident/payments/bills'), api.get('/resident/payments/details')]);
    return { bill: bills.data.data.find((value) => value.id === bill.id && value.billType === bill.billType) || null, details: payee.data.data };
  }, [bill.id]);
  const current = data?.bill, payee = data?.details || details;
  const available = current?.claimableAmount ?? 0;
  const amountError = paymentAmountError(form.amount, available);
  const intent = !loading && !loadError && current ? upiIntent({ ...payee, amount: form.amount, available, bill: current }) : null;
  const change = (event) => { setForm((value) => ({ ...value, [event.target.name]: event.target.value })); setErrors((value) => ({ ...value, [event.target.name]: undefined })); setError(''); setMessage(''); };
  const launch = async () => {
    if (!intent) return;
    try { await openUpi(intent); setMessage('Complete payment in your UPI app, then enter its actual transaction reference below. If no app opens, use the manual steps.'); }
    catch { setMessage('No UPI app could be opened. Copy the UPI ID and pay manually in your preferred UPI app.'); }
  };
  const submit = async (event) => {
    event.preventDefault(); if (busy.current || loading || !current) return;
    const invalid = claimErrors(form, available, todayInput()); setErrors(invalid); setError('');
    if (Object.keys(invalid).length) return;
    busy.current = true; setSaving(true);
    try {
      const result = await api.post('/resident/payments/claims', { billType: current.billType, billId: current.id, amount: Number(form.amount), utr: form.utr.trim().toUpperCase(), paymentDate: form.paymentDate });
      toast.success('Claim submitted — Pending Verification'); onSaved(result.data.data);
    } catch (err) { setError(getErrorMessage(err)); }
    finally { busy.current = false; setSaving(false); }
  };
  return <Modal title={`Pay ${bill.billType === 'Rent' ? 'rent' : 'room electricity'} · ${formatMonth(bill.month)}`} onClose={onClose} dismissable={!saving}>
    <form onSubmit={submit} className="space-y-4" noValidate>
      <p className="rounded-xl bg-orange-50 p-3 text-sm text-orange-900">Your bill changes only after your owner verifies receipt and approves the claim. Opening a UPI app or entering a UTR leaves it Pending Verification.</p>
      {loadError && <ErrorState message={loadError} onRetry={reload} />}
      {loading && <p role="status" className="text-sm text-slate-500">Checking the latest bill balance and payment details…</p>}
      {!loading && data && !current && <p role="alert" className="text-sm text-rose-700">This bill no longer has an outstanding balance. Close this window and refresh your bills.</p>}
      {bill.billType === 'Electricity' && <p className="text-sm font-medium text-slate-700">This is the shared room electricity bill. The figures are room totals; no individual share has been assigned. Enter only the amount you intend to pay.</p>}
      {current && <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm"><div><dt className="text-slate-500">Outstanding bill balance</dt><dd className="font-bold">{formatCurrency(current.balance)}</dd></div><div><dt className="text-slate-500">Available after pending claims</dt><dd className="font-bold">{formatCurrency(available)}</dd></div></dl>}
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <Field htmlFor="claim-amount" label="Payment amount (₹)" error={errors.amount} required hint="Partial payments are allowed within the available balance."><Input id="claim-amount" name="amount" type="number" inputMode="decimal" min="0.01" max={available} step="0.01" value={form.amount} onChange={change} disabled={saving || loading || !current} invalid={Boolean(errors.amount)} /></Field>
      {payee?.upiId ? <div className="space-y-3 rounded-xl border border-slate-200 p-4"><p className="text-sm text-slate-500">Payee: <strong className="text-slate-800">{payee.payeeName}</strong></p><p className="break-all font-semibold text-navy-900">{payee.upiId}</p>
        <div className="flex flex-wrap gap-2"><button type="button" className="btn-primary" disabled={!intent || saving} data-upi-intent={intent || undefined} onClick={launch}><Smartphone size={16} />Open UPI app</button><button type="button" className="btn-secondary" disabled={saving} onClick={async () => { try { await copyText(payee.upiId); toast.success('UPI ID copied'); } catch { setMessage(`Copy this UPI ID manually: ${payee.upiId}`); } }}><Copy size={16} />Copy UPI ID</button></div>
        {amountError && <p className="text-sm text-slate-500">Enter an eligible amount to enable the UPI link.</p>}<p className="text-sm text-slate-600">Manual payment: open your UPI app, choose Pay to UPI ID, paste the ID, verify the recipient name, enter this amount and complete the payment. Return here with the real UTR.</p>
      </div> : !loading && <p role="status" className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">Your owner has not configured a valid UPI ID. Contact your owner for payment details. You can submit a claim for a payment you have already made.</p>}
      {message && <p role="status" className="rounded-xl bg-teal-50 p-3 text-sm text-teal-800">{message}</p>}
      <h3 className="font-bold text-navy-900">Already paid? Submit for verification</h3>
      <Field htmlFor="claim-utr" label="UPI transaction reference (UTR)" error={errors.utr} required hint="Copy the actual reference from your UPI app. Do not enter an example or placeholder."><Input id="claim-utr" name="utr" value={form.utr} onChange={change} maxLength={22} autoComplete="off" autoCapitalize="characters" disabled={saving || loading || !current} invalid={Boolean(errors.utr)} /></Field>
      <Field htmlFor="claim-date" label="Payment date (IST)" error={errors.paymentDate} required><Input id="claim-date" name="paymentDate" type="date" max={todayInput()} value={form.paymentDate} onChange={change} disabled={saving || loading || !current} invalid={Boolean(errors.paymentDate)} /></Field>
      <div className="flex flex-wrap justify-end gap-3"><button type="button" className="btn-secondary" disabled={saving} onClick={onClose}>Cancel</button><button type="submit" className="btn-primary" disabled={saving || loading || !current || available <= 0}>{saving && <Loader2 size={16} className="animate-spin" />}Submit payment claim</button></div>
    </form>
  </Modal>;
}
