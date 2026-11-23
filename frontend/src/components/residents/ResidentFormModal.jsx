import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertCircle, Loader2 } from 'lucide-react';
import api from '../../api/client.js';
import useResidentRooms from '../../hooks/useResidentRooms.js';
import Modal from '../ui/Modal.jsx';
import { Field, Input, Select, PasswordInput } from '../ui/FormControls.jsx';
import { formatCurrency, getErrorMessage, toDateInput, todayInput } from '../../utils/format.js';

const PHONE_RE = /^\+?[0-9]{10,15}$/;
const cleanPhone = (v) => v.replace(/[\s().-]/g, '');
const bedKey = (value) => (value || '').trim().toLowerCase();

// resident = existing resident (edit) or null (add)
export default function ResidentFormModal({ resident, onClose, onSaved }) {
  const editing = Boolean(resident);
  const currentRoomId = String(resident?.room?._id || resident?.room?.id || resident?.room || '');

  const [f, setF] = useState({
    room: currentRoomId,
    bedNumber: resident?.bedNumber || '',
    fullName: resident?.fullName || '',
    phone: resident?.phone || '',
    email: resident?.email || '',
    joiningDate: resident ? toDateInput(resident.joiningDate) : todayInput(),
    monthlyRent: resident ? String(resident.monthlyRent) : '',
    emergencyName: resident?.emergencyContact?.name || '',
    emergencyPhone: resident?.emergencyContact?.phone || '',
    loginEnabled: resident?.loginEnabled || false,
    temporaryPassword: '',
  });
  const [rentTouched, setRentTouched] = useState(editing);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [bedDraft, setBedDraft] = useState([]);
  const [editingBeds, setEditingBeds] = useState(false);
  const [creatingBeds, setCreatingBeds] = useState(false);
  const [bedError, setBedError] = useState('');
  const {
    rooms, selectedRoom, roomReady, occupants, roomsLoading, roomLoading,
    roomsError, roomError, retryRooms, retryRoom, applyRoom,
  } = useResidentRooms(f.room);
  const configuredBeds = selectedRoom?.bedNumbers || [];
  const draftSource = JSON.stringify([selectedRoom?._id, selectedRoom?.capacity, configuredBeds,
    occupants.map((person) => person.bedNumber).filter(Boolean)]);

  useEffect(() => {
    const [roomId, capacity, beds, assignedBeds] = JSON.parse(draftSource);
    const labels = [...beds];
    for (const bed of assignedBeds) if (!labels.some((label) => bedKey(label) === bedKey(bed))) labels.push(bed);
    let number = 1;
    while (labels.length < (capacity || 0)) {
      const label = `B${number++}`;
      if (!labels.some((bed) => bedKey(bed) === bedKey(label))) labels.push(label);
    }
    setBedDraft(roomId ? labels : []); setEditingBeds(false); setBedError('');
  }, [draftSource]);

  const set = (e) => setF((s) => ({ ...s, [e.target.name]: e.target.value }));

  // Picking a room fills in that room's rent, unless the owner already typed a rent
  const pickRoom = (e) => {
    const id = e.target.value;
    const room = (rooms || []).find((r) => r._id === id);
    setF((s) => ({ ...s, room: id, bedNumber: id === s.room ? s.bedNumber : '', monthlyRent: !rentTouched && room ? String(room.monthlyRent) : s.monthlyRent }));
    setErrors((current) => ({ ...current, room: '', bedNumber: '' }));
  };

  const assignmentChanged = !editing || f.room !== currentRoomId || bedKey(f.bedNumber) !== bedKey(resident?.bedNumber);
  const bedChoices = [...configuredBeds];
  if (f.room === currentRoomId && resident?.bedNumber && !bedChoices.some((bed) => bedKey(bed) === bedKey(resident.bedNumber))) bedChoices.push(resident.bedNumber);
  const selectedBed = bedChoices.find((bed) => bedKey(bed) === bedKey(f.bedNumber)) || f.bedNumber;
  const occupantOf = (bed) => occupants.find((person) => person._id !== resident?._id && bedKey(person.bedNumber) === bedKey(bed));
  const roomOptions = currentRoomId && !rooms.some((room) => room._id === currentRoomId)
    ? [...rooms, { _id: currentRoomId, roomNumber: resident.room?.roomNumber || 'Current room' }] : rooms;
  const temporaryPasswordRequired = Boolean(f.loginEnabled && (!resident?.accountStatus || resident.accountStatus === 'unconfigured'));

  const createBeds = async () => {
    const labels = bedDraft.map((label) => label.trim());
    if (labels.length !== selectedRoom.capacity || labels.some((label) => !label || label.length > 20)) {
      setBedError(`Enter ${selectedRoom.capacity} bed label(s), each between 1 and 20 characters.`); return;
    }
    if (new Set(labels.map(bedKey)).size !== labels.length) { setBedError('Bed numbers must be unique within this room.'); return; }
    setCreatingBeds(true); setBedError('');
    try {
      const { data } = await api.put(`/rooms/${selectedRoom._id}`, { bedNumbers: labels });
      if (!data.success || data.data?._id !== selectedRoom._id || !Array.isArray(data.data.bedNumbers)) { setBedError(data.message || 'The room did not return saved bed numbers.'); return; }
      applyRoom(data.data);
      setF((current) => ({ ...current, bedNumber: data.data.bedNumbers.find((bed) => bedKey(bed) === bedKey(current.bedNumber)) || '' }));
      setErrors((current) => ({ ...current, bedNumber: '' }));
      setEditingBeds(false);
      toast.success('Bed numbers saved. Select the resident’s bed.');
    } catch (error) { setBedError(getErrorMessage(error)); }
    finally { setCreatingBeds(false); }
  };

  const validate = () => {
    const e = {};
    if (!f.room) e.room = 'Choose a room';
    if (assignmentChanged && f.room) {
      if (!roomReady) e.bedNumber = 'Load the selected room before changing the assignment';
      else if (!configuredBeds.length) e.bedNumber = 'Create beds below, then select a bed';
      else if (!f.bedNumber) e.bedNumber = 'Choose a bed in this room';
      else if (!configuredBeds.some((bed) => bedKey(bed) === bedKey(f.bedNumber))) e.bedNumber = 'Choose a configured bed in this room';
      else if (occupantOf(f.bedNumber)) e.bedNumber = 'This bed is already assigned';
    }
    if (!f.fullName.trim()) e.fullName = 'Full name is required';
    if (!PHONE_RE.test(cleanPhone(f.phone))) e.phone = 'Enter a valid phone number; include +country code outside India';
    if (f.loginEnabled && (!resident?.accountStatus || resident.accountStatus === 'unconfigured') && !f.temporaryPassword) {
      e.temporaryPassword = 'Set a temporary password to enable login';
    }
    if (f.temporaryPassword && (f.temporaryPassword.length < 8 || new TextEncoder().encode(f.temporaryPassword).length > 72)) {
      e.temporaryPassword = 'Use at least 8 characters and at most 72 UTF-8 bytes';
    }
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
      ...(assignmentChanged && { room: f.room, bedNumber: selectedBed }),
      fullName: f.fullName.trim(),
      phone: cleanPhone(f.phone),
      joiningDate: f.joiningDate,
      monthlyRent: Number(f.monthlyRent),
      ...((!editing || f.loginEnabled !== Boolean(resident.loginEnabled)) && { loginEnabled: f.loginEnabled }),
      ...(f.temporaryPassword && { temporaryPassword: f.temporaryPassword }),
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
      if (!res.data.success) { setFormError(res.data.message || 'Resident could not be saved'); return; }
      toast.success(res.data.message || 'Resident saved');
      onSaved();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={editing ? `Edit ${resident.fullName}` : 'Add a resident'} onClose={onClose} dismissable={!saving && !creatingBeds} size="lg">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {formError && (
          <div className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700" role="alert">
            <AlertCircle size={18} className="mt-0.5 shrink-0" /> <span>{formError}</span>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Room Number" htmlFor="room" error={errors.room} required hint={editing ? 'Your current room remains selectable when full.' : 'Choose a room with a vacancy.'}>
            <Select id="room" name="room" value={f.room} onChange={pickRoom} invalid={!!errors.room} disabled={saving || creatingBeds || roomsLoading}>
              <option value="">Select a room</option>
              {roomOptions.map((r) => {
                const full = r.currentResidents >= r.capacity && r._id !== currentRoomId;
                return (
                  <option key={r._id} value={r._id} disabled={full}>
                    Room {r.roomNumber}{r.capacity ? ` · ${r.currentResidents}/${r.capacity} beds · ${formatCurrency(r.monthlyRent)}` : ' (current)'}
                    {full ? ' (full)' : ''}
                  </option>
                );
              })}
            </Select>
          {roomsLoading && <p className="mt-1 text-sm text-slate-600" role="status">Loading rooms…</p>}
          {roomsError && <div className="mt-2 text-sm text-rose-700" role="alert">{roomsError} <button type="button" onClick={retryRooms} className="underline">Retry rooms</button></div>}
        </Field>

          <Field label="Bed Number" htmlFor="bedNumber" error={errors.bedNumber} required={assignmentChanged} hint={editing && !resident.bedNumber && f.room === currentRoomId ? 'You can save profile details now and assign a bed separately.' : 'One active resident per bed. Availability is checked when saved.'}>
            <Select id="bedNumber" name="bedNumber" value={selectedBed} onChange={set} invalid={!!errors.bedNumber} disabled={saving || creatingBeds || !roomReady || !bedChoices.length}>
              <option value="">{!f.room ? 'Select a room first' : !bedChoices.length ? 'Create beds below' : 'Select a bed'}</option>
              {bedChoices.map((bed) => {
                const occupant = occupantOf(bed);
                const currentAssignment = f.room === currentRoomId && bedKey(resident?.bedNumber) === bedKey(bed);
                return <option key={bed} value={bed} disabled={!!occupant}>
                  {bed}{occupant ? ' · Assigned' : currentAssignment ? ' · Current assignment' : ' · Available'}
                </option>;
              })}
            </Select>
            {roomLoading && <p className="mt-1 text-sm text-slate-600" role="status">Loading beds…</p>}
            {roomError && <div className="mt-2 text-sm text-rose-700" role="alert">{roomError} <button type="button" onClick={retryRoom} className="underline">Retry beds</button></div>}
            {roomReady && configuredBeds.length > 0 && !editingBeds && <button type="button" className="mt-2 text-sm font-semibold text-teal-700" disabled={saving || creatingBeds}
              onClick={() => setEditingBeds(true)}>Edit bed labels</button>}
          </Field>
        </div>

        {roomReady && (!configuredBeds.length || editingBeds) && <fieldset className="space-y-3 rounded-xl border border-teal-200 p-4" disabled={saving || creatingBeds} aria-label={`Create beds for room ${selectedRoom.roomNumber}`}>
          <legend className="px-1 text-sm font-semibold">{configuredBeds.length ? 'Edit bed labels' : 'Create Beds'} · Room {selectedRoom.roomNumber}</legend>
          <p className="text-sm text-slate-600">Enter one label per capacity slot ({selectedRoom.capacity}). Existing assignments are preserved.</p>
          <div className="grid gap-3 sm:grid-cols-3">{bedDraft.map((label, index) => <Field key={index} label={`Bed label ${index + 1}`} htmlFor={`bed-label-${index}`} required>
            <Input id={`bed-label-${index}`} value={label} maxLength={20} onChange={(event) => setBedDraft((current) => current.map((value, i) => i === index ? event.target.value : value))} />
          </Field>)}</div>
          {bedError && <p className="text-sm text-rose-700" role="alert">{bedError}</p>}
          <div className="flex gap-3"><button type="button" onClick={createBeds} className="btn-secondary">
            {creatingBeds && <Loader2 size={16} className="animate-spin" />}
            {creatingBeds ? 'Saving beds…' : configuredBeds.length ? 'Save bed labels' : selectedRoom.capacity === 1 && bedDraft[0]?.trim() === 'B1' ? 'Create Bed B1' : 'Create Beds'}
          </button>{editingBeds && <button type="button" className="btn-secondary" onClick={() => { setEditingBeds(false); setBedError(''); }}>Cancel bed changes</button>}</div>
        </fieldset>}

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

        <fieldset className="space-y-4 rounded-xl border border-teal-100 bg-teal-50/50 p-4">
          <legend className="px-1 text-sm font-bold text-navy-900">Resident login access</legend>
          <p className="text-sm text-slate-600">Set a one-time temporary password for this resident. They must replace it after signing in.</p>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold text-slate-800">
            <input type="checkbox" checked={f.loginEnabled} onChange={(event) => setF((value) => ({ ...value, loginEnabled: event.target.checked }))} className="h-5 w-5 accent-teal-600" /> Enable resident login
          </label>
          <Field htmlFor="temporaryPassword" label={resident?.accountStatus && resident.accountStatus !== 'unconfigured' ? 'Reset temporary password' : 'Temporary login password'} error={errors.temporaryPassword} required={temporaryPasswordRequired}
            hint={resident?.accountStatus && resident.accountStatus !== 'unconfigured' ? 'Leave blank to keep the password. A reset signs out existing sessions and requires a password change.' : 'Required to activate login. The resident must change this on first login.'}>
            <PasswordInput id="temporaryPassword" name="temporaryPassword" value={f.temporaryPassword} onChange={set} autoComplete="new-password" required={temporaryPasswordRequired} invalid={!!errors.temporaryPassword} />
          </Field>
          {editing && <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">Account status</dt><dd className="font-semibold capitalize">{resident.accountStatus || 'unconfigured'}</dd></div>
            <div><dt className="text-slate-500">Password activation</dt><dd className="font-semibold">{resident.passwordChangeRequired ? 'Password change required' : resident.firstLoginAt ? 'Activated' : 'Not yet activated'}</dd></div>
            <div><dt className="text-slate-500">First login</dt><dd>{resident.firstLoginAt ? new Date(resident.firstLoginAt).toLocaleString() : 'Never'}</dd></div>
            <div><dt className="text-slate-500">Last successful login</dt><dd>{resident.lastLoginAt ? new Date(resident.lastLoginAt).toLocaleString() : 'Never'}</dd></div>
          </dl>}
        </fieldset>

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} disabled={saving || creatingBeds} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={saving || creatingBeds || (assignmentChanged && !roomReady)} className="btn-primary flex-1">
            {saving && <Loader2 size={16} className="animate-spin" />}
            {saving ? 'Saving...' : editing ? 'Save changes' : 'Add resident'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
