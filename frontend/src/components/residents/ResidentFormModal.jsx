import { useState } from 'react';
import toast from 'react-hot-toast';
import { AlertCircle, Loader2 } from 'lucide-react';
import api from '../../api/client.js';
import useFetch from '../../hooks/useFetch.js';
import Modal from '../ui/Modal.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import { Field, Input, Select } from '../ui/FormControls.jsx';
import { formatCurrency, getErrorMessage, toDateInput, todayInput } from '../../utils/format.js';

const PHONE_RE = /^\+?[0-9]{10,13}$/;
const cleanPhone = (v) => v.replace(/[\s-]/g, '');

// resident = existing resident (edit) or null (add)
export default function ResidentFormModal({ resident, onClose, onSaved }) {
  const editing = Boolean(resident);
  const currentRoomId = resident?.room?._id || resident?.room || '';

  const { data: rooms, loading: roomsLoading, error: roomsError } = useFetch(
    async () => (await api.get('/rooms')).data.data,
    []
  );

  const [f, setF] = useState({
    room: currentRoomId,
    fullName: resident?.fullName || '',
    phone: resident?.phone || '',
    email: resident?.email || '',
    joiningDate: resident ? toDateInput(resident.joiningDate) : todayInput(),
    monthlyRent: resident ? String(resident.monthlyRent) : '',
    emergencyName: resident?.emergencyContact?.name || '',
    emergencyPhone: resident?.emergencyContact?.phone || '',
  });
  const [rentTouched, setRentTouched] = useState(editing);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (e) => setF((s) => ({ ...s, [e.target.name]: e.target.value }));

  // Picking a room fills in that room's rent, unless the owner already typed a rent
  const pickRoom = (e) => {
    const id = e.target.value;
    const room = (rooms || []).find((r) => r._id === id);
    setF((s) => ({ ...s, room: id, monthlyRent: !rentTouched && room ? String(room.monthlyRent) : s.monthlyRent }));
  };

  const validate = () => {
    const e = {};
    if (!f.room) e.room = 'Choose a room';
    if (!f.fullName.trim()) e.fullName = 'Full name is required';
    if (!PHONE_RE.test(cleanPhone(f.phone))) e.phone = 'Enter a valid phone number (10 to 13 digits)';
    if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = 'Enter a valid email';
    if (!f.joiningDate) e.joiningDate = 'Joining date is required';
    if (f.monthlyRent === '' || Number.isNaN(Number(f.monthlyRent)) || Number(f.monthlyRent) < 0) {
      e.monthlyRent = 'Enter the monthly rent (0 or more)';
    }
    if (f.emergencyPhone.trim() && !PHONE_RE.test(cleanPhone(f.emergencyPhone))) {
      e.emergencyPhone = 'Enter a valid phone number';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    setFormError('');
    if (!validate()) return;

    const emergencyName = f.emergencyName.trim();
    const emergencyPhone = cleanPhone(f.emergencyPhone);
    const payload = {
      room: f.room,
      fullName: f.fullName.trim(),
      phone: cleanPhone(f.phone),
      joiningDate: f.joiningDate,
      monthlyRent: Number(f.monthlyRent),
    };
    if (editing) {
      payload.email = f.email.trim();
      payload.emergencyContact = { name: emergencyName, phone: emergencyPhone };
    } else {
      if (f.email.trim()) payload.email = f.email.trim();
      if (emergencyName || emergencyPhone) payload.emergencyContact = { name: emergencyName, phone: emergencyPhone };
    }

    setSaving(true);
    try {
      const res = editing ? await api.put(`/residents/${resident._id}`, payload) : await api.post('/residents', payload);
      toast.success(res.data.message || 'Resident saved');
      onSaved();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={editing ? `Edit ${resident.fullName}` : 'Add a resident'} onClose={onClose} dismissable={!saving} size="lg">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {(formError || roomsError) && (
          <div className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700" role="alert">
            <AlertCircle size={18} className="mt-0.5 shrink-0" /> <span>{formError || roomsError}</span>
          </div>
        )}

        <Field label="Room" htmlFor="room" error={errors.room} required hint="Rooms that are full cannot be selected.">
          {roomsLoading && !rooms ? (
            <Skeleton className="h-11" />
          ) : (
            <Select id="room" name="room" value={f.room} onChange={pickRoom} invalid={!!errors.room}>
              <option value="">Select a room</option>
              {(rooms || []).map((r) => {
                const full = r.currentResidents >= r.capacity && r._id !== currentRoomId;
                return (
                  <option key={r._id} value={r._id} disabled={full}>
                    Room {r.roomNumber} · {r.currentResidents}/{r.capacity} beds · {formatCurrency(r.monthlyRent)}
                    {full ? ' (full)' : ''}
                  </option>
                );
              })}
            </Select>
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="fullName" error={errors.fullName} required>
            <Input id="fullName" name="fullName" value={f.fullName} onChange={set} invalid={!!errors.fullName} autoComplete="off" />
          </Field>
          <Field label="Phone number" htmlFor="phone" error={errors.phone} required>
            <Input id="phone" name="phone" type="tel" inputMode="tel" value={f.phone} onChange={set} invalid={!!errors.phone} placeholder="9876543210" />
          </Field>
          <Field label="Email" htmlFor="email" error={errors.email} hint="Optional">
            <Input id="email" name="email" type="email" value={f.email} onChange={set} invalid={!!errors.email} />
          </Field>
          <Field label="Joining date" htmlFor="joiningDate" error={errors.joiningDate} required>
            <Input id="joiningDate" name="joiningDate" type="date" value={f.joiningDate} onChange={set} invalid={!!errors.joiningDate} />
          </Field>
          <Field
            label="Monthly rent (₹)"
            htmlFor="monthlyRent"
            error={errors.monthlyRent}
            hint={editing ? 'Changes apply to rent generated from now on.' : "Filled from the room's rent. You can change it."}
            required
          >
            <Input
              id="monthlyRent"
              name="monthlyRent"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={f.monthlyRent}
              onChange={(e) => { setRentTouched(true); set(e); }}
              invalid={!!errors.monthlyRent}
            />
          </Field>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">Emergency contact <span className="font-normal text-slate-400">(optional)</span></p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor="emergencyName">
              <Input id="emergencyName" name="emergencyName" value={f.emergencyName} onChange={set} placeholder="Name" aria-label="Emergency contact name" />
            </Field>
            <Field htmlFor="emergencyPhone" error={errors.emergencyPhone}>
              <Input id="emergencyPhone" name="emergencyPhone" type="tel" inputMode="tel" value={f.emergencyPhone} onChange={set} invalid={!!errors.emergencyPhone} placeholder="Phone" aria-label="Emergency contact phone" />
            </Field>
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={saving || roomsLoading} className="btn-primary flex-1">
            {saving && <Loader2 size={16} className="animate-spin" />}
            {saving ? 'Saving...' : editing ? 'Save changes' : 'Add resident'}
          </button>
        </div>
      </form>
    </Modal>
  );
}