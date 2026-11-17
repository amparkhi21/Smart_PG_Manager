import { useState } from 'react';
import toast from 'react-hot-toast';
import { AlertCircle, Loader2 } from 'lucide-react';
import api from '../../api/client.js';
import Modal from '../ui/Modal.jsx';
import ConfirmDialog from '../ui/ConfirmDialog.jsx';
import { Field, Input, Select } from '../ui/FormControls.jsx';
import { PAYMENT_METHODS } from '../../utils/constants.js';
import { formatCurrency, formatMonth, getErrorMessage, round2, todayInput } from '../../utils/format.js';

const Fact = ({ label, value, accent }) => (
  <div className={`rounded-xl p-3 ${accent ? 'bg-orange-50' : 'bg-slate-50'}`}>
    <p className="text-xs font-medium text-slate-500">{label}</p>
    <p className={`mt-0.5 truncate font-bold ${accent ? 'text-orange-700' : 'text-slate-900'}`}>{value}</p>
  </div>
);

export default function RecordElectricityPaymentModal({ bill, onClose, onSaved }) {
  const today = todayInput();
  const [f, setF] = useState({ amount: '', method: 'Cash', date: today, note: '' });
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (e) => {
    setF((s) => ({ ...s, [e.target.name]: e.target.value }));
    setRequestId(crypto.randomUUID());
  };
  const amount = round2(Number(f.amount));
  const balanceAfter = round2(bill.balance - amount);

  const validate = () => {
    const e = {};
    if (f.amount === '' || !(Number(f.amount) > 0)) e.amount = 'Enter an amount greater than 0';
    else if (amount > bill.balance) e.amount = `Cannot be more than the remaining balance (${formatCurrency(bill.balance)})`;
    if (!f.date) e.date = 'Select the payment date';
    else if (f.date > today) e.date = 'Payment date cannot be in the future';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const review = (ev) => {
    ev.preventDefault();
    setFormError('');
    if (validate()) setConfirming(true);
  };

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const payload = { amount, method: f.method, requestId };
      if (f.date !== today) payload.paidOn = `${f.date}T12:00:00+05:30`;
      if (f.note.trim()) payload.note = f.note.trim();
      const res = await api.post(`/electricity/${bill._id}/payments`, payload);
      toast.success(res.data.message || 'Electricity payment recorded');
      onSaved();
    } catch (err) {
      setFormError(getErrorMessage(err));
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal title="Record electricity payment" onClose={onClose} dismissable={!saving}>
        <form onSubmit={review} className="space-y-4" noValidate>
          {formError && (
            <div className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700" role="alert">
              <AlertCircle size={18} className="mt-0.5 shrink-0" /> <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Fact label="Room" value={`Room ${bill.room?.roomNumber || '-'}`} />
            <Fact label="Billing month" value={formatMonth(bill.month)} />
            <Fact label="Bill amount" value={formatCurrency(bill.amount)} />
            <Fact label="Already paid" value={formatCurrency(bill.amountPaid)} />
            <Fact label="Due date" value={bill.dueDate ? new Date(bill.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '-'} />
            <Fact label="Remaining balance" value={formatCurrency(bill.balance)} accent />
          </div>

          <Field label="Payment amount (₹)" htmlFor="amount" error={errors.amount} required>
            <div className="flex gap-2">
              <Input id="amount" name="amount" type="number" inputMode="decimal" min="0" step="any" value={f.amount}
                onChange={set} invalid={!!errors.amount} placeholder="0" autoFocus />
              <button type="button" className="btn-secondary shrink-0" onClick={() => {
                setF((s) => ({ ...s, amount: String(bill.balance) }));
                setRequestId(crypto.randomUUID());
              }}>
                Full balance
              </button>
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Payment method" htmlFor="method" required>
              <Select id="method" name="method" value={f.method} onChange={set}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
            </Field>
            <Field label="Payment date" htmlFor="date" error={errors.date} hint="Today records the current time. Earlier dates are saved as 12:00 noon." required>
              <Input id="date" name="date" type="date" max={today} value={f.date} onChange={set} invalid={!!errors.date} />
            </Field>
          </div>

          <Field label="Reference / note" htmlFor="note" hint="Optional. For example a UPI transaction ID.">
            <Input id="note" name="note" maxLength={200} value={f.note} onChange={set} />
          </Field>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" className="btn-accent flex-1">Review payment</button>
          </div>
        </form>
      </Modal>

      {confirming && (
        <ConfirmDialog
          title="Record this payment?"
          message={`${formatCurrency(amount)} by ${f.method} for Room ${bill.room?.roomNumber || '-'} in ${formatMonth(bill.month)}. Balance after this payment: ${formatCurrency(balanceAfter)}. Recorded payments cannot be edited or deleted.`}
          confirmText={saving ? 'Recording...' : 'Record payment'}
          tone="warning"
          loading={saving}
          onConfirm={submit}
          onCancel={() => setConfirming(false)}
        />
      )}
      {saving && <span className="sr-only"><Loader2 /> Saving</span>}
    </>
  );
}
