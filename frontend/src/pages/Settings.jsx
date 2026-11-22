import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertCircle, Save, ShieldCheck } from 'lucide-react';
import api from '../api/client.js';
import useFetch from '../hooks/useFetch.js';
import { useAuth } from '../context/AuthContext.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Panel from '../components/ui/Panel.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import { Field, Input, Select, Textarea } from '../components/ui/FormControls.jsx';
import { getErrorMessage } from '../utils/format.js';
import { DEFAULT_REMINDER_TEMPLATES } from '../utils/reminders.js';
import { validUpiId } from '../utils/upiPayments.js';
import PushNotificationSettings from '../components/PushNotificationSettings.jsx';
import PGAccessManagement from '../components/settings/PGAccessManagement.jsx';

const initialForm = {
  name: '',
  email: '',
  phone: '',
  pgName: '',
  address: '',
  upiId: '',
  rentDueDay: '5',
  defaultElectricityRate: '8',
  preferredTiming: 'Anytime',
  duplicateWarningHours: '24',
  suggestionsEnabled: true,
  templates: DEFAULT_REMINDER_TEMPLATES,
};

const TEMPLATE_LABELS = [
  ['pendingRent', 'Pending rent'],
  ['overdueRent', 'Overdue rent'],
  ['pendingElectricity', 'Pending electricity bill'],
  ['overdueElectricity', 'Overdue electricity bill'],
];

export default function Settings() {
  const { updateOwner } = useAuth();
  const { data: owner, loading, error, reload } = useFetch(async () => (await api.get('/settings')).data.data.owner, []);
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!owner) return;
    const reminder = owner.reminderSettings || {};
    const templates = reminder.templates || {};
    setForm({
      name: owner.name || '',
      email: owner.email || '',
      phone: owner.phone || '',
      pgName: owner.pgName || '',
      address: owner.address || '',
      upiId: owner.upiId || '',
      rentDueDay: String(owner.rentDueDay ?? 5),
      defaultElectricityRate: String(owner.defaultElectricityRate ?? 8),
      preferredTiming: reminder.preferredTiming || 'Anytime',
      duplicateWarningHours: String(reminder.duplicateWarningHours ?? 24),
      suggestionsEnabled: reminder.suggestionsEnabled !== false,
      templates: Object.fromEntries(
        TEMPLATE_LABELS.map(([key]) => [key, templates[key] || DEFAULT_REMINDER_TEMPLATES[key]])
      ),
    });
  }, [owner]);

  const set = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  const setTemplate = (key, value) =>
    setForm((current) => ({ ...current, templates: { ...current.templates, [key]: value } }));

  const save = async (event) => {
    event.preventDefault();
    if (saving) return;
    setFormError('');

    const dueDay = Number(form.rentDueDay);
    const electricityRate = Number(form.defaultElectricityRate);
    const intervalHours = Number(form.duplicateWarningHours);
    if (form.upiId.trim() && !validUpiId(form.upiId)) { setFormError('Enter a valid payment UPI ID, such as name@bank.'); return; }
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) {
      setFormError('Rent due day must be between 1 and 28.');
      return;
    }
    if (!Number.isFinite(electricityRate) || electricityRate < 0) {
      setFormError('Electricity rate must be zero or more.');
      return;
    }
    if (!Number.isInteger(intervalHours) || intervalHours < 1 || intervalHours > 720) {
      setFormError('Duplicate reminder warning interval must be between 1 and 720 hours.');
      return;
    }

    setSaving(true);
    try {
      const { data } = await api.patch('/settings', {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        pgName: form.pgName.trim(),
        address: form.address.trim(),
        upiId: form.upiId.trim(),
        rentDueDay: dueDay,
        defaultElectricityRate: electricityRate,
        reminderSettings: {
          preferredTiming: form.preferredTiming,
          duplicateWarningHours: intervalHours,
          suggestionsEnabled: form.suggestionsEnabled,
          templates: form.templates,
        },
      });
      updateOwner(data.data.owner);
      toast.success('Settings saved. Existing bills and payments were not changed.');
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading && !owner) {
    return <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-72" /></div>;
  }
  if (error && !owner) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div>
      <PageHeader title="PG Settings" subtitle="Property details, billing defaults and reminder preferences" />

      <form onSubmit={save} className="space-y-5">
        {formError && (
          <div className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700" role="alert">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <Panel title="Property and owner information">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="PG name" htmlFor="pgName" required>
              <Input id="pgName" name="pgName" maxLength={100} value={form.pgName} onChange={set} required />
            </Field>
            <Field label="Owner name" htmlFor="name" required>
              <Input id="name" name="name" maxLength={80} value={form.name} onChange={set} required />
            </Field>
            <Field label="Owner contact number" htmlFor="phone" hint="Used in property details; resident reminder messages are sent to the selected resident.">
              <Input id="phone" name="phone" type="tel" inputMode="tel" value={form.phone} onChange={set} />
            </Field>
            <Field label="Owner email" htmlFor="email" required>
              <Input id="email" name="email" type="email" value={form.email} onChange={set} required />
            </Field>
            <Field label="Address" htmlFor="address" className="sm:col-span-2">
              <Textarea id="address" name="address" maxLength={300} value={form.address} onChange={set} />
            </Field>
          </div>
        </Panel>

        <Panel title="Billing defaults">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Payment UPI ID" htmlFor="upiId" hint="Residents pay this ID. Verify it in your UPI app before saving; leave empty to disable payment links.">
              <Input id="upiId" name="upiId" value={form.upiId} onChange={set} maxLength={320} autoCapitalize="none" autoCorrect="off" placeholder="name@bank" />
            </Field>
            <Field label="Default rent due day" htmlFor="rentDueDay" hint="Used when future rent or electricity bills are generated. Choose a day from 1 to 28." required>
              <Input id="rentDueDay" name="rentDueDay" type="number" min="1" max="28" step="1" value={form.rentDueDay} onChange={set} required />
            </Field>
            <Field label="Default electricity rate (₹ / unit)" htmlFor="defaultElectricityRate" hint="Applies to future bills only; each bill retains its saved rate." required>
              <Input id="defaultElectricityRate" name="defaultElectricityRate" type="number" min="0" step="0.01" value={form.defaultElectricityRate} onChange={set} required />
            </Field>
            <Field label="Currency" htmlFor="currency">
              <Input id="currency" value="INR (₹)" readOnly />
            </Field>
            <Field label="Timezone" htmlFor="timezone">
              <Input id="timezone" value="India Standard Time (Asia/Kolkata)" readOnly />
            </Field>
          </div>
        </Panel>

        <Panel title="Reminder preferences">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Preferred reminder timing" htmlFor="preferredTiming" hint="A suggestion only. No reminders are sent automatically.">
              <Select id="preferredTiming" name="preferredTiming" value={form.preferredTiming} onChange={set}>
                {['Anytime', 'Morning', 'Afternoon', 'Evening'].map((time) => <option key={time}>{time}</option>)}
              </Select>
            </Field>
            <Field label="Duplicate reminder warning (hours)" htmlFor="duplicateWarningHours" hint="Warn when preparing another reminder for the same bill and recipient within this interval.">
              <Input id="duplicateWarningHours" name="duplicateWarningHours" type="number" min="1" max="720" step="1" value={form.duplicateWarningHours} onChange={set} />
            </Field>
          </div>
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 p-4">
            <input
              type="checkbox"
              checked={form.suggestionsEnabled}
              onChange={(event) => setForm((current) => ({ ...current, suggestionsEnabled: event.target.checked }))}
              className="mt-1 h-4 w-4 accent-teal-600"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-800">Show outstanding payment suggestions</span>
              <span className="block text-xs text-slate-500">This only controls the reminder dashboard suggestions. It never triggers automatic messages.</span>
            </span>
          </label>

          <div className="mt-5 space-y-4">
            <p className="text-sm text-slate-600">Templates support placeholders such as <code>{'{residentName}'}</code>, <code>{'{pgName}'}</code>, <code>{'{roomNumber}'}</code>, <code>{'{billingMonth}'}</code>, <code>{'{amountDue}'}</code>, <code>{'{amountPaid}'}</code>, <code>{'{balance}'}</code>, <code>{'{dueDate}'}</code> and <code>{'{units}'}</code>.</p>
            {TEMPLATE_LABELS.map(([key, label]) => (
              <Field key={key} label={`${label} message template`} htmlFor={`template-${key}`}>
                <Textarea
                  id={`template-${key}`}
                  value={form.templates[key]}
                  maxLength={1500}
                  onChange={(event) => setTemplate(key, event.target.value)}
                  className="min-h-36 font-mono text-xs"
                />
              </Field>
            ))}
          </div>
        </Panel>

        <div className="flex flex-col gap-3 rounded-2xl border border-teal-100 bg-teal-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 text-sm text-teal-900">
            <ShieldCheck size={18} className="mt-0.5 shrink-0" />
            <p>Changes apply to future bills and reminder preparations only. Historical bills and payments are never recalculated or edited.</p>
          </div>
          <button type="submit" className="btn-primary shrink-0" disabled={saving}>
            <Save size={17} /> {saving ? 'Saving...' : 'Save settings'}
          </button>
        </div>
      </form>
      <div className="mt-5">
        <PGAccessManagement />
      </div>
      <PushNotificationSettings />
    </div>
  );
}
