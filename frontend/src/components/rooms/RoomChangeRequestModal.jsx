import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import api from '../../api/client.js';
import useFetch from '../../hooks/useFetch.js';
import Modal from '../ui/Modal.jsx';
import { Field, Select, Textarea } from '../ui/FormControls.jsx';
import { formatCurrency, getErrorMessage } from '../../utils/format.js';

export default function RoomChangeRequestModal({ initialRoom, onClose, onSaved }) {
  const [targetRoom, setTargetRoom] = useState(initialRoom?.id || '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { data, loading, error: loadError, reload } = useFetch(async () => {
    const result = (await api.get('/resident/rooms')).data.data;
    return result.rooms.filter((room) => room.availableBeds > 0 && room.id !== result.currentRoomId);
  }, []);
  useEffect(() => { if (data && !data.some((room) => room.id === targetRoom)) setTargetRoom(''); }, [data, targetRoom]);
  const submit = async (event) => {
    event.preventDefault(); setError('');
    if (!data?.some((room) => room.id === targetRoom)) return setError('Choose an available room');
    if (reason.trim().length < 5) return setError('Enter a reason of at least 5 characters');
    setSaving(true);
    try {
      const result = await api.post('/resident/room-change-requests', { targetRoom, reason: reason.trim() });
      toast.success(result.data.message); onSaved();
    } catch (err) { setError(getErrorMessage(err)); } finally { setSaving(false); }
  };
  return <Modal title="Request Room Change" onClose={onClose} dismissable={!saving}>
    <form onSubmit={submit} className="space-y-4">
      {(error || loadError) && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error || loadError}</p>}
      {loadError && <button type="button" className="btn-secondary" onClick={reload}>Reload rooms</button>}
      <Field htmlFor="targetRoom" label="New room" required><Select id="targetRoom" value={targetRoom} onChange={(event) => setTargetRoom(event.target.value)} disabled={loading || saving} required>
        <option value="">{loading ? 'Loading available rooms...' : 'Select an available room'}</option>
        {(data || []).map((room) => <option key={room.id} value={room.id}>Room {room.roomNumber} · {room.availableBeds} bed(s) available · {formatCurrency(room.monthlyRent)}</option>)}
      </Select></Field>
      {data?.length === 0 && <p className="text-sm text-slate-500">No other rooms currently have available beds.</p>}
      <Field htmlFor="reason" label="Reason for room change" required><Textarea id="reason" value={reason} onChange={(event) => setReason(event.target.value)} minLength={5} maxLength={1000} required disabled={saving} /></Field>
      <p className="text-sm text-slate-500">Your owner must approve the request. Approval does not automatically change your agreed rent or existing bills.</p>
      <div className="flex gap-3"><button type="button" className="btn-secondary flex-1" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" className="btn-primary flex-1" disabled={saving || loading || !targetRoom || !data?.length}>{saving && <Loader2 size={16} className="animate-spin" />}Submit request</button></div>
    </form>
  </Modal>;
}
