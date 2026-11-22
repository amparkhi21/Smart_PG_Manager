import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import AuthLayout from '../layouts/AuthLayout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../api/client.js';
import { Field, Input, PasswordInput, Select } from '../components/ui/FormControls.jsx';
import { getErrorMessage } from '../utils/format.js';

export default function ResidentLogin() {
  const { loginResident } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ pgName: '', ownerId: '', roomNumber: '', bedNumber: '', password: '' });
  const [hostels, setHostels] = useState([]);
  const [hostelError, setHostelError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);

  const findHostel = async () => {
    const name = form.pgName.trim();
    if (name.length < 2) return;
    setSearching(true);
    setHostelError('');
    setHostels([]);
    try {
      const { data } = await api.get('/auth/resident/hostels', { params: { name } });
      const matches = data.data.hostels || [];
      setHostels(matches);
      if (matches.length === 1) setForm((value) => ({ ...value, pgName: matches[0].pgName, ownerId: matches[0].id }));
      else if (!matches.length) setHostelError('No matching hostel found. Check the name or ask your owner.');
      else if (matches.some((hostel) => !hostel.address)) setHostelError('Ask your owner to add the hostel location in Settings so you can choose the correct one.');
    } catch (err) {
      setHostelError(getErrorMessage(err));
    } finally {
      setSearching(false);
    }
  };

  const update = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value, ...(name === 'pgName' ? { ownerId: '' } : {}) }));
    if (name === 'pgName') { setHostels([]); setHostelError(''); }
  };

  const submit = async (event) => {
    event.preventDefault(); setError('');
    if (!form.ownerId) {
      setError('Select the matching hostel name and address before signing in.');
      if (!hostels.length) await findHostel();
      return;
    }
    setBusy(true);
    try {
      const resident = await loginResident({ ...form, pgName: form.pgName.trim(), roomNumber: form.roomNumber.trim(), bedNumber: form.bedNumber.trim() });
      toast.success('Welcome back');
      navigate(resident.passwordChangeRequired ? '/resident/change-password' : '/resident/dashboard', { replace: true });
    } catch (err) { setError(getErrorMessage(err)); } finally { setBusy(false); }
  };

  return <AuthLayout resident title="Student sign in" subtitle="Sign in with your hostel, assigned room and bed, and personal resident password.">
    <form onSubmit={submit} className="space-y-4">
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <Field label="Hostel / PG Name" htmlFor="pgName" required hint="For duplicate names, choose the address that matches your hostel.">
        <Input id="pgName" name="pgName" value={form.pgName} onChange={update} onBlur={findHostel} maxLength={100} required autoComplete="organization" aria-describedby="hostel-help" />
        {hostelError && <span id="hostel-help" className="mt-1 block text-xs text-rose-700">{hostelError}</span>}
        {hostels.length > 1 && <Select className="mt-2" aria-label="Choose hostel location" value={form.ownerId} onChange={(event) => {
          const selected = hostels.find((hostel) => hostel.id === event.target.value);
          setForm((value) => ({ ...value, ownerId: selected?.id || '' }));
        }} required>
          <option value="">Choose hostel name and address</option>
          {hostels.map((hostel) => <option key={hostel.id} value={hostel.id}>{hostel.pgName} — {hostel.address || 'Address not provided'}</option>)}
        </Select>}
        {searching && <span className="mt-1 block text-xs text-slate-500">Finding hostel…</span>}
      </Field>
      <Field label="Room Number" htmlFor="roomNumber" required><Input id="roomNumber" name="roomNumber" value={form.roomNumber} onChange={update} maxLength={100} required autoComplete="off" /></Field>
      <Field label="Bed Number" htmlFor="bedNumber" required><Input id="bedNumber" name="bedNumber" value={form.bedNumber} onChange={update} maxLength={20} required autoComplete="off" /></Field>
      <Field label="Resident Password" htmlFor="password" required><PasswordInput id="password" name="password" value={form.password} onChange={update} autoComplete="current-password" required /></Field>
      <button className="btn-primary w-full" disabled={busy || searching} type="submit">{(busy || searching) && <Loader2 size={18} className="animate-spin" />}{busy ? 'Logging in...' : 'Log in'}</button>
    </form>
    <p className="mt-6 text-center text-sm text-slate-600">Your owner creates your account and gives you a temporary password. Contact your owner if you do not have one.</p>
  </AuthLayout>;
}
