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

// record = a rent record (populated resident and room) that still has a balance
export default function RecordPaymentModal({ record, onClose, onSaved }) {
  const today = todayInput();
  const [f, setF] = useState({ amount: '', method: 'Cash', date: today, note: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (e) => setF((s) => ({ ...s, [e.target.name]: e.target.value }));
  const amount = round2(Number(f.amount));
  const balanceAfter = round2(record.balance - amount);

  const validate = () => {
    const e = {};
    if (f.amount === '' || !(Number(f.amount) > 0)) e.amount = 'Enter an amount greater than 0';
    else if (amount > record.balance) e.amount = `Cannot be more than the remaining balance (${formatCurrency(record.balance)})`;
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
    if (saving) return; // no duplicate submissions
    setSaving(true);
    try {
      const payload = { amount, method: f.method };
      // For today the server stamps the real time. Earlier dates are saved as noon India time.
      if (f.date !== today) payload.paidOn = `${f.date}T12:00:00+05:30`;
      if (f.note.trim()) payload.note = f.note.trim();
      const res = await api.post(`/rent/${record._id}/payments`, payload);
      toast.success(res.data.message || 'Payment recorded');
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
      <Modal title="Record rent payment" onClose={onClose} dismissable={!saving}>
        <form onSubmit={review} className="space-y-4" noValidate>
          {formError && (
            <div className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700" role="alert">
              <AlertCircle size={18} className="mt-0.5 shrink-0" /> <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Fact label="Resident" value={record.resident?.fullName} />
            <Fact label="Room" value={record.room?.roomNumber || '-'} />
            <Fact label="Rent month" value={formatMonth(record.month)} />
            <Fact label="Monthly rent" value={formatCurrency(record.amountDue)} />
            <Fact label="Already paid" value={formatCurrency(record.amountPaid)} />
            <Fact label="Remaining balance" value={formatCurrency(record.balance)} accent />
          </div>

          <Field label="Payment amount (₹)" htmlFor="amount" error={errors.amount} required>
            <div className="flex gap-2">
              <Input id="amount" name="amount" type="number" inputMode="decimal" min="0" step="any" value={f.amount}
                onChange={set} invalid={!!errors.amount} placeholder="0" autoFocus />
              <button type="button" className="btn-secondary shrink-0" onClick={() => setF((s) => ({ ...s, amount: String(record.balance) }))}>
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
          message={`${formatCurrency(amount)} by ${f.method} from ${record.resident?.fullName} for ${formatMonth(record.month)}. Balance after this payment: ${formatCurrency(balanceAfter)}. Recorded payments cannot be edited or deleted.`}
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