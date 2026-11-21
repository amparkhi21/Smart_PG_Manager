import { useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/client.js';
import useFetch from '../../hooks/useFetch.js';
import Modal from '../ui/Modal.jsx';
import { Field, Input, Select, Textarea } from '../ui/FormControls.jsx';
import { COMPLAINT_CATEGORIES, COMPLAINT_PRIORITIES, complaintErrors } from '../../utils/complaints.js';
import { getErrorMessage } from '../../utils/format.js';

export default function ComplaintForm({ onClose, onSaved }) {
  const [form, setForm] = useState({ title: '', description: '', category: 'Maintenance', priority: 'Medium', room: '' });
  const [errors, setErrors] = useState({}), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const rooms = useFetch(async () => (await api.get('/resident/rooms')).data.data.rooms, []);
  const set = (event) => { const { name, value } = event.target; setForm((current) => ({ ...current, [name]: value })); setErrors((current) => ({ ...current, [name]: undefined })); setError(''); };
  const submit = async (event) => {
    event.preventDefault(); if (busy.current) return;
    const invalid = complaintErrors(form);
    if (form.room && !rooms.data?.some((room) => room.id === form.room)) invalid.room = 'Choose an available room reference or no specific room.';
    setErrors(invalid); setError(''); if (Object.keys(invalid).length) return;
    busy.current = true; setSaving(true);
    try {
      const result = await api.post('/resident/complaints', { title: form.title.trim(), description: form.description.trim(), category: form.category, priority: form.priority, room: form.room || null });
      toast.success(result.data.message); onSaved(result.data.data);
    } catch (err) { setError(getErrorMessage(err)); } finally { busy.current = false; setSaving(false); }
  };
  return <Modal title="Create a complaint" onClose={onClose} size="lg" dismissable={!saving}><form onSubmit={submit} noValidate className="space-y-4">
    <p className="rounded-xl bg-navy-50 p-3 text-sm text-navy-700">This complaint is private. Only you and your PG owner can view it.</p>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <Field htmlFor="complaint-title" label="Title" required error={errors.title}><Input id="complaint-title" name="title" value={form.title} onChange={set} maxLength={120} disabled={saving} invalid={Boolean(errors.title)} /></Field>
    <Field htmlFor="complaint-description" label="Description" required error={errors.description}><Textarea id="complaint-description" name="description" value={form.description} onChange={set} rows={5} maxLength={5000} disabled={saving} invalid={Boolean(errors.description)} aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? 'complaint-description-error' : undefined} /></Field>
    <div className="grid gap-4 sm:grid-cols-2"><Field htmlFor="complaint-category" label="Category" required error={errors.category}><Select id="complaint-category" name="category" value={form.category} onChange={set} disabled={saving}>{COMPLAINT_CATEGORIES.map((value) => <option key={value}>{value}</option>)}</Select></Field><Field htmlFor="complaint-priority" label="Priority" required error={errors.priority}><Select id="complaint-priority" name="priority" value={form.priority} onChange={set} disabled={saving}>{COMPLAINT_PRIORITIES.map((value) => <option key={value}>{value}</option>)}</Select></Field></div>
    <Field htmlFor="complaint-room" label="Room (optional)" error={errors.room} hint="Leave empty for a general PG issue."><Select id="complaint-room" name="room" value={form.room} onChange={set} disabled={saving || rooms.loading}><option value="">{rooms.loading ? 'Loading rooms...' : 'No specific room'}</option>{(rooms.data || []).map((room) => <option key={room.id} value={room.id}>Room {room.roomNumber}</option>)}</Select></Field>
    {rooms.error && <p className="text-sm text-slate-500">Room references could not be loaded. You can submit without a room. <button type="button" className="font-semibold text-navy-900 underline" onClick={rooms.reload}>Retry rooms</button></p>}
    <div className="flex flex-wrap justify-end gap-3"><button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" className="btn-primary" disabled={saving}>{saving && <Loader2 size={16} className="animate-spin" />}Submit complaint</button></div>
  </form></Modal>;
}
