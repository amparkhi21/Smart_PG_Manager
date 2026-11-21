import { useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/client.js';
import Modal from '../ui/Modal.jsx';
import ConfirmDialog from '../ui/ConfirmDialog.jsx';
import { Field, Input, Textarea } from '../ui/FormControls.jsx';
import { formatDate, getErrorMessage } from '../../utils/format.js';
import { MEALS, menuDraft, prepareMenu } from '../../utils/messMenus.js';

export default function MessMenuEditor({ date, menu, onClose, onSaved }) {
  const [draft, setDraft] = useState(() => menuDraft(menu));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null);
  const [saving, setSaving] = useState(false);
  const change = (key, field, value) => {
    setDraft((current) => ({ ...current, [key]: { ...current[key], [field]: value } }));
    setErrors((current) => ({ ...current, [`${key}.${field}`]: undefined }));
  };
  const submit = (event) => {
    event.preventDefault(); setError('');
    const result = prepareMenu(draft); setErrors(result.errors);
    if (Object.keys(result.errors).length) return setError('Check the highlighted meal details before saving.');
    setPending(result.meals);
  };
  const save = async () => {
    if (saving) return;
    setSaving(true); setError('');
    try {
      const result = menu ? await api.put(`/mess-menus/${date}`, { meals: pending }) : await api.post('/mess-menus', { date, meals: pending });
      toast.success(result.data.message || 'Mess menu saved'); onSaved();
    } catch (err) { setPending(null); setError(getErrorMessage(err)); } finally { setSaving(false); }
  };
  return <>
    <Modal title={`${menu ? 'Edit' : 'Add'} menu · ${formatDate(date)}`} onClose={onClose} size="lg" dismissable={!saving && !pending}>
      <form onSubmit={submit} noValidate className="space-y-5">
        <p className="text-sm text-slate-500">Serving times use Indian Standard Time (IST). Leave meals empty if they have not been planned.</p>
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          {MEALS.map(({ key, label }) => <fieldset key={key} disabled={saving || Boolean(pending)} className="min-w-0 space-y-4 rounded-2xl border border-slate-200 p-4">
            <legend className="px-2 font-bold text-navy-900">{label}</legend>
            <Field htmlFor={`${key}-items`} label="Food items" error={errors[`${key}.items`]} hint="One item per line. Remove a line to delete an item.">
              <Textarea id={`${key}-items`} value={draft[key].items} onChange={(event) => change(key, 'items', event.target.value)} invalid={Boolean(errors[`${key}.items`])} aria-invalid={Boolean(errors[`${key}.items`])} aria-describedby={errors[`${key}.items`] ? `${key}-items-error` : undefined} />
            </Field>
            <Field htmlFor={`${key}-servingTime`} label="Serving time (IST)" error={errors[`${key}.servingTime`]} hint="24-hour time or range, e.g. 08:00-09:00.">
              <Input id={`${key}-servingTime`} value={draft[key].servingTime} onChange={(event) => change(key, 'servingTime', event.target.value)} placeholder="HH:mm or HH:mm-HH:mm" maxLength={11} invalid={Boolean(errors[`${key}.servingTime`])} />
            </Field>
            <Field htmlFor={`${key}-notes`} label="Notes (optional)" error={errors[`${key}.notes`]}>
              <Textarea id={`${key}-notes`} value={draft[key].notes} onChange={(event) => change(key, 'notes', event.target.value)} maxLength={500} invalid={Boolean(errors[`${key}.notes`])} aria-invalid={Boolean(errors[`${key}.notes`])} aria-describedby={errors[`${key}.notes`] ? `${key}-notes-error` : undefined} rows={2} />
            </Field>
          </fieldset>)}
        </div>
        <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-4">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving || Boolean(pending)}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving || Boolean(pending)}>{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}Save menu</button>
        </div>
      </form>
    </Modal>
    {pending && <ConfirmDialog title={menu ? 'Save menu changes?' : 'Publish menu?'} message={`Save the menu for ${formatDate(date)}? Residents in your PG will be able to view it.`} tone="primary" confirmText="Save menu" loading={saving} onConfirm={save} onCancel={() => setPending(null)} />}
  </>;
}
