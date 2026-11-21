import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import AuthLayout from '../layouts/AuthLayout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { Field, Input, PasswordInput } from '../components/ui/FormControls.jsx';
import { getErrorMessage } from '../utils/format.js';

export default function ResidentLogin() {
  const { loginResident } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ pgName: '', pgCode: '', roomNumber: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const update = (event) => setForm((value) => ({ ...value, [event.target.name]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const resident = await loginResident({ ...form, pgName: form.pgName.trim(), pgCode: form.pgCode.trim(), roomNumber: form.roomNumber.trim() });
      toast.success('Welcome back');
      navigate(resident.passwordChangeRequired ? '/resident/change-password' : '/resident/dashboard', { replace: true });
    } catch (err) { setError(getErrorMessage(err)); } finally { setBusy(false); }
  };
  return <AuthLayout resident title="Resident login" subtitle="Use the account provided by your PG owner.">
    <form onSubmit={submit} className="space-y-4">
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <Field label="Hostel / PG Name" htmlFor="pgName" required><Input id="pgName" name="pgName" value={form.pgName} onChange={update} maxLength={100} required autoComplete="organization" /></Field>
      <Field label="PG code" htmlFor="pgCode" hint="Ask your owner for this code if more than one hostel has the same name."><Input id="pgCode" name="pgCode" value={form.pgCode} onChange={update} maxLength={40} autoCapitalize="characters" autoComplete="off" placeholder="Optional for a unique PG name" /></Field>
      <Field label="Room Number" htmlFor="roomNumber" required><Input id="roomNumber" name="roomNumber" value={form.roomNumber} onChange={update} maxLength={100} required autoComplete="off" /></Field>
      <Field label="Phone Number" htmlFor="phone" required hint="Indian numbers: 10 digits or +91. Other countries: include +country code."><Input id="phone" name="phone" type="tel" autoComplete="tel" value={form.phone} onChange={update} maxLength={40} required /></Field>
      <Field label="Password" htmlFor="password" required><PasswordInput id="password" name="password" value={form.password} onChange={update} autoComplete="current-password" required /></Field>
      <button className="btn-primary w-full" disabled={busy} type="submit">{busy && <Loader2 size={18} className="animate-spin" />}{busy ? 'Logging in...' : 'Log in'}</button>
    </form>
    <p className="mt-6 text-sm leading-relaxed text-slate-500">To activate your account or reset your password, contact your PG owner. Resident self-registration is unavailable.</p>
  </AuthLayout>;
}
