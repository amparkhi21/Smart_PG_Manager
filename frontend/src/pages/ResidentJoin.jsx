import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client.js';
import AuthLayout from '../layouts/AuthLayout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { Field, Input, PasswordInput, Select } from '../components/ui/FormControls.jsx';
import { getErrorMessage } from '../utils/format.js';

export default function ResidentJoin() {
  const { activateResident } = useAuth();
  const navigate = useNavigate();
  const [details, setDetails] = useState({ pgName: '', pgJoiningPassword: '', roomNumber: '', bedNumber: '', pgCode: '' });
  const [pgCodes, setPgCodes] = useState([]);
  const [challenge, setChallenge] = useState('');
  const [activation, setActivation] = useState({ activationCode: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const updateDetails = (event) => setDetails((value) => ({ ...value, [event.target.name]: event.target.value }));
  const updateActivation = (event) => setActivation((value) => ({ ...value, [event.target.name]: event.target.value }));

  const verify = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload = {
        pgName: details.pgName.trim(),
        pgJoiningPassword: details.pgJoiningPassword,
        roomNumber: details.roomNumber.trim(),
        bedNumber: details.bedNumber.trim(),
        ...(details.pgCode && { pgCode: details.pgCode }),
      };
      const { data } = await api.post('/auth/resident/join/verify', payload);
      setChallenge(data.data.challenge);
      setPgCodes([]);
    } catch (err) {
      const duplicateSelection = err.response?.data?.data;
      if (duplicateSelection?.requiresPgCode) {
        setPgCodes(duplicateSelection.pgCodes || []);
        setError('More than one matching PG uses this name and password. Choose the PG code, then verify again.');
      } else setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const join = async (event) => {
    event.preventDefault();
    setError('');
    if (activation.password !== activation.confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    if (activation.password.length < 8 || new TextEncoder().encode(activation.password).length > 72) {
      setError('Use at least 8 characters and at most 72 UTF-8 bytes.');
      return;
    }
    setBusy(true);
    try {
      const resident = await activateResident({
        challenge, activationCode: activation.activationCode.trim(), password: activation.password,
      });
      toast.success(`Welcome to ${resident.pgName}`);
      navigate('/resident/dashboard', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return <AuthLayout resident title="Join your PG" subtitle={challenge ? 'Verify the owner invitation and set your personal password.' : 'Enter the PG, room and bed details given by your owner.'}>
    {error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {!challenge ? <form onSubmit={verify} className="space-y-4">
      <Field label="Hostel / PG Name" htmlFor="pgName" required>
        <Input id="pgName" name="pgName" value={details.pgName} onChange={updateDetails} maxLength={100} required autoComplete="organization" />
      </Field>
      <Field label="PG Joining Password" htmlFor="pgJoiningPassword" required>
        <PasswordInput id="pgJoiningPassword" name="pgJoiningPassword" value={details.pgJoiningPassword} onChange={updateDetails} autoComplete="off" required />
      </Field>
      <Field label="Room Number" htmlFor="roomNumber" required>
        <Input id="roomNumber" name="roomNumber" value={details.roomNumber} onChange={updateDetails} maxLength={100} required autoComplete="off" />
      </Field>
      <Field label="Bed Number" htmlFor="bedNumber" required>
        <Input id="bedNumber" name="bedNumber" value={details.bedNumber} onChange={updateDetails} maxLength={20} required autoComplete="off" />
      </Field>
      {pgCodes.length > 0 && <Field label="PG code" htmlFor="pgCode" required hint="Only PGs matching your name and joining password are shown.">
        <Select id="pgCode" name="pgCode" value={details.pgCode} onChange={updateDetails} required>
          <option value="">Select a PG code</option>
          {pgCodes.map((code) => <option key={code} value={code}>{code}</option>)}
        </Select>
      </Field>}
      <button className="btn-primary w-full" disabled={busy} type="submit">
        {busy && <Loader2 size={18} className="animate-spin" />}{busy ? 'Verifying...' : 'Verify PG and bed'}
      </button>
    </form> : <form onSubmit={join} className="space-y-4">
      <div className="flex items-start gap-2 rounded-xl border border-teal-100 bg-teal-50 p-3 text-sm text-teal-900">
        <ShieldCheck size={18} className="mt-0.5 shrink-0" />
        <p>PG, room and bed verified. Enter the individual activation code your owner gave you. This step does not display your resident record.</p>
      </div>
      <Field label="Activation code" htmlFor="activationCode" required>
        <Input id="activationCode" name="activationCode" value={activation.activationCode} onChange={updateActivation} maxLength={100} required autoComplete="one-time-code" />
      </Field>
      <Field label="Create personal password" htmlFor="password" required hint="At least 8 characters; your owner will not know this password.">
        <PasswordInput id="password" name="password" value={activation.password} onChange={updateActivation} autoComplete="new-password" required />
      </Field>
      <Field label="Confirm personal password" htmlFor="confirmPassword" required>
        <PasswordInput id="confirmPassword" name="confirmPassword" value={activation.confirmPassword} onChange={updateActivation} autoComplete="new-password" required />
      </Field>
      <button className="btn-primary w-full" disabled={busy} type="submit">
        {busy && <Loader2 size={18} className="animate-spin" />}{busy ? 'Activating...' : 'Set password and join'}
      </button>
      <button type="button" className="btn-secondary w-full" disabled={busy} onClick={() => { setChallenge(''); setActivation({ activationCode: '', password: '', confirmPassword: '' }); setError(''); }}>
        <ArrowLeft size={16} /> Start again
      </button>
    </form>}
    <p className="mt-6 text-center text-sm text-slate-600">Already joined? <Link className="font-semibold text-teal-700 hover:text-teal-800" to="/resident/login">Sign in</Link></p>
  </AuthLayout>;
}
