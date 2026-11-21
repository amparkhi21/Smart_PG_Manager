import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';
import AuthLayout from '../layouts/AuthLayout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getErrorMessage } from '../utils/format.js';
import { ownerReturnPath } from '../utils/authRouting.js';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const update = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(form.email.trim(), form.password);
      navigate(ownerReturnPath(location.state?.from?.pathname), { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Log in to manage your PG.">
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700" role="alert">
            <AlertCircle size={18} className="mt-0.5 shrink-0" /> <span>{error}</span>
          </div>
        )}
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input"
            value={form.email} onChange={update} placeholder="you@example.com" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <div className="relative">
            <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password"
              required className="input pr-12" value={form.password} onChange={update} placeholder="Your password" />
            <button type="button" onClick={() => setShowPassword((s) => !s)}
              className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-slate-400"
              aria-label={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        <button type="submit" disabled={submitting || !form.email || !form.password} className="btn-primary w-full">
          {submitting && <Loader2 size={18} className="animate-spin" />}
          {submitting ? 'Logging in...' : 'Log in'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        New PG owner?{' '}
        <Link to="/owner/register" className="font-semibold text-teal-600 hover:text-teal-700">Create an account</Link>
      </p>
    </AuthLayout>
  );
}
