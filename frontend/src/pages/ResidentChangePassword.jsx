import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext.jsx';
import { Field, PasswordInput } from '../components/ui/FormControls.jsx';
import { getErrorMessage } from '../utils/format.js';
import PushNotificationSettings from '../components/PushNotificationSettings.jsx';

export default function ResidentChangePassword() {
  const { resident, changeResidentPassword } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const update = (event) => setForm((value) => ({ ...value, [event.target.name]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault(); setError('');
    if (form.newPassword !== form.confirmPassword) return setError('Passwords do not match');
    if (new TextEncoder().encode(form.newPassword).length > 72) return setError('Password must be at most 72 UTF-8 bytes');
    setBusy(true);
    try {
      await changeResidentPassword({ currentPassword: form.currentPassword, newPassword: form.newPassword });
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success('Password changed'); navigate('/resident/dashboard', { replace: true });
    } catch (err) { setError(getErrorMessage(err)); } finally { setBusy(false); }
  };
  return <div><section className="card mx-auto max-w-lg p-5 sm:p-8"><ShieldCheck className="mb-4 text-teal-700" size={32} /><h1 className="text-2xl font-extrabold text-navy-900">{resident.passwordChangeRequired ? 'Set your own password' : 'Change password'}</h1><p className="mb-6 mt-3 text-slate-600">{resident.passwordChangeRequired ? 'Change the temporary password from your owner before opening your resident dashboard.' : 'Choose a password you use only for this account.'}</p>
    <form className="space-y-4" onSubmit={submit}>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {[['currentPassword', resident.passwordChangeRequired ? 'Temporary password' : 'Current password'], ['newPassword', 'New password'], ['confirmPassword', 'Confirm new password']].map(([name, label]) => <Field key={name} htmlFor={name} label={label} required><PasswordInput id={name} name={name} value={form[name]} onChange={update} autoComplete={name === 'currentPassword' ? 'current-password' : 'new-password'} minLength={name === 'currentPassword' ? undefined : 8} required /></Field>)}
      <p className="text-sm text-slate-500">Use at least 8 characters and at most 72 UTF-8 bytes.</p><button type="submit" className="btn-primary w-full" disabled={busy}>{busy && <Loader2 size={18} className="animate-spin" />}{busy ? 'Saving...' : 'Save password'}</button>
    </form>
  </section><PushNotificationSettings /></div>;
}
