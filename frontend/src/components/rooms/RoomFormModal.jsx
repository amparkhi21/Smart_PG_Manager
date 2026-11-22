import { useState } from 'react';
import toast from 'react-hot-toast';
import { AlertCircle, Loader2 } from 'lucide-react';
import api from '../../api/client.js';
import Modal from '../ui/Modal.jsx';
import { Field, Input, Textarea, Select } from '../ui/FormControls.jsx';
import { getErrorMessage } from '../../utils/format.js';

// room = existing room (edit) or null (add). `rooms` is the current list, used for the duplicate check.
export default function RoomFormModal({ room, rooms, onClose, onSaved, bedsOnly = false }) {
  const editing = Boolean(room);
  const [f, setF] = useState({
    roomNumber: room?.roomNumber || '',
    floor: room?.floor || '',
    roomType: room?.roomType || '',
    airConditioning: room?.airConditioning || '',
    amenities: (room?.amenities || []).join(', '),
    monthlyRent: room ? String(room.monthlyRent) : '',
    capacity: room ? String(room.capacity) : '1',
    bedNumbers: (room?.bedNumbers || (room ? [] : ['B1'])).join(', '),
    lastMeterReading: '',
    notes: room?.notes || '',
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (e) => setF((s) => ({ ...s, [e.target.name]: e.target.value }));

  const validate = () => {
    const e = {};
    const number = f.roomNumber.trim();
    if (!bedsOnly && !number) e.roomNumber = 'Room number is required';
    else if (!bedsOnly && rooms.some((r) => r._id !== room?._id && r.roomNumber.toLowerCase() === number.toLowerCase())) {
      e.roomNumber = 'A room with this number already exists';
    }
    if (!bedsOnly && (f.monthlyRent === '' || Number.isNaN(Number(f.monthlyRent)) || Number(f.monthlyRent) < 0)) {
      e.monthlyRent = 'Enter the monthly rent (0 or more)';
    }
    const cap = Number(f.capacity);
    if (!Number.isInteger(cap) || cap < 1 || cap > 20) e.capacity = 'Capacity must be a whole number from 1 to 20';
    else if (editing && cap < room.currentResidents) {
      e.capacity = `This room has ${room.currentResidents} active resident(s). Capacity can't be lower.`;
    }
    const beds = f.bedNumbers.split(',').map((value) => value.trim()).filter(Boolean);
    if (beds.length !== cap) e.bedNumbers = `Enter exactly ${cap} bed number(s) to match room capacity.`;
    else if (beds.some((value) => value.length > 20)) e.bedNumbers = 'Bed numbers can be up to 20 characters.';
    else if (new Set(beds.map((value) => value.toLocaleLowerCase())).size !== beds.length) e.bedNumbers = 'Bed numbers must be unique within this room.';
    if (!editing && f.lastMeterReading !== '' && Number(f.lastMeterReading) < 0) {
      e.lastMeterReading = 'Meter reading cannot be negative';
    }
    const amenities = f.amenities.split(',').map((value) => value.trim()).filter(Boolean);
    if (!bedsOnly && (amenities.length > 30 || amenities.some((value) => value.length > 60))) e.amenities = 'Use at most 30 amenities, each up to 60 characters';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    setFormError('');
    if (!validate()) return;

    const details = {
      roomNumber: f.roomNumber.trim(),
      floor: f.floor.trim(),
      roomType: f.roomType.trim(),
      airConditioning: f.airConditioning || null,
      amenities: [...new Set(f.amenities.split(',').map((value) => value.trim()).filter(Boolean))],
      monthlyRent: Number(f.monthlyRent),
      capacity: Number(f.capacity),
      bedNumbers: [...new Set(f.bedNumbers.split(',').map((value) => value.trim()).filter(Boolean))],
      notes: f.notes.trim(),
    };
    const payload = bedsOnly ? { capacity: details.capacity, bedNumbers: details.bedNumbers } : details;
    if (!editing && f.lastMeterReading !== '') payload.lastMeterReading = Number(f.lastMeterReading);

    setSaving(true);
    try {
      const res = editing ? await api.put(`/rooms/${room._id}`, payload) : await api.post('/rooms', payload);
      toast.success(res.data.message || 'Room saved');
      await onSaved(res.data.data);
    } catch (err) {
      const msg = getErrorMessage(err);
      setFormError(msg.includes('roomNumber') ? 'A room with this number already exists.' : msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={bedsOnly ? `Configure beds for room ${room.roomNumber}` : editing ? `Edit room ${room.roomNumber}` : 'Add a room'} onClose={onClose} dismissable={!saving}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {formError && (
          <div className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700" role="alert">
            <AlertCircle size={18} className="mt-0.5 shrink-0" /> <span>{formError}</span>
          </div>
        )}
        {bedsOnly && <p className="text-sm text-slate-600">Configure one bed number per capacity slot. Keep existing assigned labels; residents are assigned manually after saving.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          {!bedsOnly && <>
          <Field label="Room number" htmlFor="roomNumber" error={errors.roomNumber} required>
            <Input id="roomNumber" name="roomNumber" value={f.roomNumber} onChange={set} invalid={!!errors.roomNumber} placeholder="e.g. 101" autoFocus />
          </Field>
          <Field label="Floor" htmlFor="floor">
            <Input id="floor" name="floor" value={f.floor} onChange={set} placeholder="e.g. 1" />
          </Field>
          <Field label="Room type" htmlFor="roomType" hint="Optional; visible to residents">
            <Input id="roomType" name="roomType" value={f.roomType} onChange={set} maxLength={40} placeholder="e.g. Shared, Single, Studio" />
          </Field>
          <Field label="Air conditioning" htmlFor="airConditioning">
            <Select id="airConditioning" name="airConditioning" value={f.airConditioning} onChange={set}>
              <option value="">Not recorded</option><option value="AC">AC</option><option value="Non-AC">Non-AC</option>
            </Select>
          </Field>
          <Field label="Monthly rent (₹)" htmlFor="monthlyRent" error={errors.monthlyRent} required>
            <Input id="monthlyRent" name="monthlyRent" type="number" inputMode="decimal" min="0" step="any" value={f.monthlyRent} onChange={set} invalid={!!errors.monthlyRent} />
          </Field>
          </>}
          <Field label="Capacity (beds)" htmlFor="capacity" error={errors.capacity} hint="How many residents can stay" required>
            <Input id="capacity" name="capacity" type="number" inputMode="numeric" min="1" max="20" step="1" value={f.capacity} onChange={set} invalid={!!errors.capacity} />
          </Field>
          <Field label="Bed numbers" htmlFor="bedNumbers" error={errors.bedNumbers} required hint="One label per capacity slot, separated by commas. Keep labels assigned to existing residents.">
            <Input id="bedNumbers" name="bedNumbers" value={f.bedNumbers} onChange={set} invalid={!!errors.bedNumbers} placeholder="B1, B2, B3" />
            {!f.bedNumbers.trim() && <button type="button" className="mt-2 text-sm font-semibold text-teal-700" disabled={!Number.isInteger(Number(f.capacity)) || Number(f.capacity) < 1 || Number(f.capacity) > 20}
              onClick={() => setF((value) => ({ ...value, bedNumbers: Array.from({ length: Number(value.capacity) }, (_, index) => `B${index + 1}`).join(', ') }))}>
              Use B1, B2, B3 labels
            </button>}
          </Field>
        </div>
        {!editing && (
          <Field
            label="Current meter reading"
            htmlFor="lastMeterReading"
            error={errors.lastMeterReading}
            hint="Optional. Used as the starting point for this room's first electricity bill."
          >
            <Input id="lastMeterReading" name="lastMeterReading" type="number" inputMode="decimal" min="0" step="any" value={f.lastMeterReading} onChange={set} invalid={!!errors.lastMeterReading} />
          </Field>
        )}
        {!bedsOnly && <>
        <Field label="Amenities" htmlFor="amenities" error={errors.amenities} hint="Visible to residents. Separate amenities with commas, e.g. Wi-Fi, wardrobe, study table.">
          <Textarea id="amenities" name="amenities" value={f.amenities} onChange={set} invalid={!!errors.amenities} />
        </Field>
        <Field label="Notes" htmlFor="notes">
          <Textarea id="notes" name="notes" value={f.notes} onChange={set} placeholder="Attached bathroom, AC, etc." />
        </Field>
        </>}
        {editing && !bedsOnly && (
          <p className="text-xs text-slate-400">
            Changing the rent only affects residents added and rent generated from now on. Existing records are not changed.
          </p>
        )}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1">
            {saving && <Loader2 size={16} className="animate-spin" />}
            {saving ? 'Saving...' : editing ? 'Save changes' : 'Add room'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
