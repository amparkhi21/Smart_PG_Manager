import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AlertCircle, Loader2 } from 'lucide-react';
import AuthLayout from '../layouts/AuthLayout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getErrorMessage } from '../utils/format.js';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', pgName: '', email: '', phone: '', password: '', confirm: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const update = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) return setError('Password must be at least 8 characters');
    if (form.password !== form.confirm) return setError('Passwords do not match');

    setSubmitting(true);
    try {
      await register({
        name: form.name.trim(),
        pgName: form.pgName.trim(),
        email: form.email.trim(),
        password: form.password,
        ...(form.phone.trim() && { phone: form.phone.trim() }),
      });
      toast.success('Account created. Welcome!');
      navigate('/', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout title="Create your account" subtitle="Set up your PG in a minute.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && (
          <div className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700" role="alert">
            <AlertCircle size={18} className="mt-0.5 shrink-0" /> <span>{error}</span>
          </div>
        )}
        <div>
          <label className="label" htmlFor="name">Your name</label>
          <input id="name" name="name" required className="input" value={form.name} onChange={update} autoComplete="name" />
        </div>
        <div>
          <label className="label" htmlFor="pgName">PG name</label>
          <input id="pgName" name="pgName" required className="input" value={form.pgName} onChange={update} placeholder="e.g. Sharma PG" />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required className="input" value={form.email} onChange={update} autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="phone">Phone <span className="font-normal text-slate-400">(optional)</span></label>
          <input id="phone" name="phone" type="tel" inputMode="tel" className="input" value={form.phone} onChange={update} autoComplete="tel" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required minLength={8} className="input"
              value={form.password} onChange={update} autoComplete="new-password" placeholder="Min 8 characters" />
          </div>
          <div>
            <label className="label" htmlFor="confirm">Confirm password</label>
            <input id="confirm" name="confirm" type="password" required className="input"
              value={form.confirm} onChange={update} autoComplete="new-password" />
          </div>
        </div>
        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting && <Loader2 size={18} className="animate-spin" />}
          {submitting ? 'Creating account...' : 'Create account'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-teal-600 hover:text-teal-700">Log in</Link>
      </p>
    </AuthLayout>
  );
}