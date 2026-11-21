import { useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/client.js';
import Modal from '../ui/Modal.jsx';
import { Field, Input, Textarea } from '../ui/FormControls.jsx';
import { getErrorMessage, todayInput } from '../../utils/format.js';
import { leaveErrors, leaveDuration, normalizeEmergencyContact } from '../../utils/leaveRequests.js';

export default function LeaveRequestForm({ onClose, onSaved }) {
  const [form, setForm] = useState({ fromDate: todayInput(), toDate: todayInput(), reason: '', emergencyContact: '' });
  const [errors, setErrors] = useState({}), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const change = (event) => { const { name, value } = event.target; setForm((current) => ({ ...current, [name]: value })); setErrors((current) => ({ ...current, [name]: undefined })); setError(''); };
  const submit = async (event) => {
    event.preventDefault(); if (busy.current) return;
    const invalid = leaveErrors(form, todayInput()); setErrors(invalid); setError(''); if (Object.keys(invalid).length) return;
    busy.current = true; setSaving(true);
    try {
      const result = await api.post('/resident/leave-requests', { fromDate: form.fromDate, toDate: form.toDate, reason: form.reason.trim(), emergencyContact: normalizeEmergencyContact(form.emergencyContact) });
      toast.success(result.data.message); onSaved(result.data.data);
    } catch (err) { setError(getErrorMessage(err)); } finally { busy.current = false; setSaving(false); }
  };
  const days = leaveDuration(form.fromDate, form.toDate);
  return <Modal title="Request leave" onClose={onClose} dismissable={!saving}><form onSubmit={submit} noValidate className="space-y-4">
    <p className="text-sm text-slate-500">Choose Indian calendar dates. Both the start and end date count towards your leave.</p>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <div className="grid gap-4 sm:grid-cols-2"><Field htmlFor="leave-from" label="From Date" required error={errors.fromDate}><Input id="leave-from" name="fromDate" type="date" min={todayInput()} value={form.fromDate} onChange={change} disabled={saving} invalid={Boolean(errors.fromDate)} /></Field><Field htmlFor="leave-to" label="To Date" required error={errors.toDate}><Input id="leave-to" name="toDate" type="date" min={form.fromDate || todayInput()} value={form.toDate} onChange={change} disabled={saving} invalid={Boolean(errors.toDate)} /></Field></div>
    {days && <p className="rounded-xl bg-navy-50 p-3 text-sm font-semibold text-navy-900">Duration: {days} {days === 1 ? 'day' : 'days'}</p>}
    <Field htmlFor="leave-reason" label="Reason" required error={errors.reason}><Textarea id="leave-reason" name="reason" value={form.reason} onChange={change} maxLength={2000} rows={4} disabled={saving} invalid={Boolean(errors.reason)} aria-invalid={Boolean(errors.reason)} aria-describedby={errors.reason ? 'leave-reason-error' : undefined} /></Field>
    <Field htmlFor="leave-contact" label="Emergency Contact (optional)" error={errors.emergencyContact}><Input id="leave-contact" name="emergencyContact" type="tel" inputMode="tel" value={form.emergencyContact} onChange={change} maxLength={50} disabled={saving} invalid={Boolean(errors.emergencyContact)} /></Field>
    <p className="text-sm text-slate-500">Your request will be Pending until your owner reviews it. Attendance and bills stay as recorded.</p>
    <div className="flex flex-wrap justify-end gap-3"><button type="button" className="btn-secondary" disabled={saving} onClick={onClose}>Cancel</button><button type="submit" className="btn-primary" disabled={saving}>{saving && <Loader2 size={16} className="animate-spin" />}Submit leave request</button></div>
  </form></Modal>;
}
