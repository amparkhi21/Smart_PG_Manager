import { useRef, useState } from 'react';
import { Copy, Loader2, Pencil, Phone, Plus, RefreshCw, Star, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import useFetch from '../hooks/useFetch.js';
import PageHeader from '../components/ui/PageHeader.jsx';
import Modal from '../components/ui/Modal.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import { Field, Input, Select, Textarea } from '../components/ui/FormControls.jsx';
import SearchInput from '../components/ui/SearchInput.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { copyText } from '../native/external.js';
import { isAndroid, Native } from '../native/platform.js';
import { getErrorMessage } from '../utils/format.js';
import { CONTACT_CATEGORIES, contactValidation, filterContacts, normalizeContactPhone } from '../utils/emergencyContacts.js';

function ContactEditor({ contact, onClose, onSaved }) {
  const [draft, setDraft] = useState({ name: contact?.name || '', category: contact?.category || '', phone: contact?.phone || '', description: contact?.description || '', priority: contact?.priority || false });
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  const lock = useRef(false);
  const change = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const submit = async (event) => {
    event.preventDefault(); if (lock.current) return;
    const validation = contactValidation(draft); if (validation) return setError(validation);
    lock.current = true; setSaving(true); setError('');
    try {
      const payload = { ...draft, name: draft.name.trim(), phone: normalizeContactPhone(draft.phone), description: draft.description.trim() };
      const result = contact ? await api.put(`/emergency-contacts/${contact.id}`, payload) : await api.post('/emergency-contacts', payload);
      toast.success(result.data.message); onSaved();
    } catch (err) { setError(getErrorMessage(err)); }
    finally { lock.current = false; setSaving(false); }
  };
  return <Modal title={contact ? 'Edit emergency contact' : 'Add emergency contact'} onClose={onClose} dismissable={!saving}>
    <form onSubmit={submit} noValidate className="space-y-4">
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <Field htmlFor="contact-name" label="Contact Name" required><Input id="contact-name" value={draft.name} onChange={(event) => change('name', event.target.value)} maxLength={100} autoComplete="name" required disabled={saving} /></Field>
      <Field htmlFor="contact-category" label="Role / Category" required><Select id="contact-category" value={draft.category} onChange={(event) => change('category', event.target.value)} required disabled={saving}><option value="">Choose category</option>{CONTACT_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</Select></Field>
      <Field htmlFor="contact-phone" label="Phone Number" required hint="Indian mobile, +country code, or a 3–6 digit helpline."><Input id="contact-phone" type="tel" value={draft.phone} onChange={(event) => change('phone', event.target.value)} maxLength={50} autoComplete="tel" required disabled={saving} /></Field>
      <Field htmlFor="contact-description" label="Description (optional)"><Textarea id="contact-description" value={draft.description} onChange={(event) => change('description', event.target.value)} maxLength={1000} rows={3} disabled={saving} /></Field>
      <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-navy-900"><input type="checkbox" className="h-5 w-5 accent-orange-500" checked={draft.priority} onChange={(event) => change('priority', event.target.checked)} disabled={saving} />Mark as priority</label>
      <div className="flex flex-wrap justify-end gap-3"><button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" className="btn-primary" disabled={saving}>{saving && <Loader2 size={16} className="animate-spin" />}Save contact</button></div>
    </form>
  </Modal>;
}

function ContactPage({ ownerView, pgName }) {
  const [editor, setEditor] = useState(null), [target, setTarget] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [search, setSearch] = useState(''), [category, setCategory] = useState('');
  const lock = useRef(false), base = ownerView ? '/emergency-contacts' : '/resident/emergency-contacts';
  const { data, loading, error: loadError, reload } = useFetch(async () => (await api.get(base)).data.data, [base]);
  const contacts = filterContacts(data?.contacts || [], search, category);
  const remove = async () => {
    if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try { const result = await api.delete(`${base}/${target.id}`); toast.success(result.data.message); setTarget(null); reload(); }
    catch (err) { setTarget(null); setError(getErrorMessage(err)); }
    finally { lock.current = false; setBusy(false); }
  };
  const copy = async (phone) => {
    try { await copyText(phone); toast.success('Phone number copied'); }
    catch { setError('Unable to copy. Select the phone number and copy it manually.'); }
  };
  const call = async (event, phone) => {
    if (!isAndroid) return;
    event.preventDefault();
    try { await Native.openExternal({ url: `tel:${phone}` }); }
    catch { setError('No phone app is available. Copy the number and dial it on your phone.'); }
  };
  return <div>
    <PageHeader title="Emergency Contacts" subtitle={pgName ? `Useful contacts for ${pgName}.` : 'Useful contacts for your PG.'}>
      {ownerView && <button type="button" className="btn-primary" onClick={() => setEditor({ contact: null })} disabled={busy}><Plus size={16} />Add contact</button>}
      <button type="button" className="btn-secondary" onClick={reload} disabled={loading || busy}><RefreshCw size={16} />Refresh contacts</button>
    </PageHeader>
    {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <div className="mb-5 grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
      <SearchInput value={search} onChange={setSearch} placeholder="Search emergency contacts" />
      <Select aria-label="Filter contacts by category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{CONTACT_CATEGORIES.map((value) => <option key={value}>{value}</option>)}</Select>
    </div>
    {loadError ? <ErrorState message={loadError} onRetry={reload} /> : !data ? <div role="status" aria-label="Loading emergency contacts"><Skeleton className="h-64" /></div>
      : !contacts.length ? <div className="card"><EmptyState icon={Phone} title={search || category ? 'No matching contacts' : 'No emergency contacts yet'} text={search || category ? 'Try a different search or category.' : ownerView ? 'Add your PG contacts to help residents reach the right person.' : 'Your PG owner has not added emergency contacts yet.'} /></div>
        : <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy={loading}>{contacts.map((contact) => {
          const phone = normalizeContactPhone(contact.phone);
          return <article key={contact.id} aria-label={contact.name} className={`card flex min-w-0 flex-col border p-5 ${contact.priority ? 'border-orange-200 bg-orange-50/30' : 'border-slate-100'}`}>
            <div className="mb-3 flex flex-wrap items-center gap-2"><span className="rounded-full bg-navy-50 px-3 py-1 text-xs font-semibold text-navy-900">{contact.category}</span>{contact.priority && <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-700"><Star size={13} />Priority</span>}</div>
            <h2 className="break-words text-lg font-bold text-navy-900 [overflow-wrap:anywhere]">{contact.name}</h2>
            <p className="mt-2 select-all break-all text-base font-semibold text-slate-700">{contact.phone}</p>
            {contact.description && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-600 [overflow-wrap:anywhere]">{contact.description}</p>}
            <div className="mt-auto flex flex-wrap gap-2 pt-5">{phone && <a className="btn-primary" href={`tel:${phone}`} onClick={(event) => call(event, phone)} aria-label={`Call ${contact.name}`}><Phone size={16} />Call</a>}<button type="button" className="btn-secondary" onClick={() => copy(contact.phone)} aria-label={`Copy number for ${contact.name}`}><Copy size={16} />Copy</button></div>
            {ownerView && <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4"><button type="button" className="btn-secondary" onClick={() => setEditor({ contact })} disabled={busy || loading} aria-label={`Edit ${contact.name}`}><Pencil size={16} />Edit</button><button type="button" className="btn-secondary text-rose-600" onClick={() => setTarget(contact)} disabled={busy || loading} aria-label={`Delete ${contact.name}`}><Trash2 size={16} />Delete</button></div>}
          </article>;
        })}</div>}
    {editor && <ContactEditor contact={editor.contact} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); reload(); }} />}
    {target && <ConfirmDialog title="Delete emergency contact?" message={`Remove ${target.name} from your PG's emergency contacts?`} confirmText="Delete contact" loading={busy} onConfirm={remove} onCancel={() => setTarget(null)} />}
  </div>;
}
export default function EmergencyContacts({ ownerView = false }) {
  const { owner, resident } = useAuth(), user = owner || resident;
  return <ContactPage key={`${ownerView}:${user.id || user._id}`} ownerView={ownerView} pgName={user.pgName} />;
}
