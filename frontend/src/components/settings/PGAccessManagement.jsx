import { useState } from 'react';
import toast from 'react-hot-toast';
import { Copy, KeyRound, Loader2, ShieldCheck, TicketX } from 'lucide-react';
import api from '../../api/client.js';
import useFetch from '../../hooks/useFetch.js';
import Panel from '../ui/Panel.jsx';
import { Field, Input, PasswordInput, Select } from '../ui/FormControls.jsx';
import { getErrorMessage } from '../../utils/format.js';

const dateTime = (value) => value ? new Date(value).toLocaleString() : '—';

export default function PGAccessManagement() {
  const { data: access, loading: accessLoading, error: accessError, reload: reloadAccess } = useFetch(async () => (await api.get('/settings/pg-access')).data.data, []);
  const { data: residents, loading: residentsLoading, error: residentsError } = useFetch(async () => (await api.get('/residents')).data.data, []);
  const { data: invitationData, error: invitationError, reload: reloadInvitations } = useFetch(async () => (await api.get('/settings/activation-invitations')).data.data, []);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [residentId, setResidentId] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('7');
  const [creating, setCreating] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [revoking, setRevoking] = useState('');

  const eligibleResidents = (residents || []).filter((resident) => resident.status === 'Active'
    && resident.accountStatus === 'unconfigured' && !resident.loginEnabled && resident.bedNumber);

  const savePassword = async (event) => {
    event.preventDefault();
    setPasswordError('');
    if (password.length < 8 || new TextEncoder().encode(password).length > 72) {
      setPasswordError('Use at least 8 characters and at most 72 UTF-8 bytes.');
      return;
    }
    setSavingPassword(true);
    try {
      await api.put('/settings/pg-access/password', { password });
      await reloadAccess();
      toast.success('PG joining password saved. Share it with students yourself.');
    } catch (error) {
      setPasswordError(getErrorMessage(error));
    } finally {
      setSavingPassword(false);
    }
  };

  const createInvitation = async (event) => {
    event.preventDefault();
    if (!residentId) return;
    setCreating(true);
    setNewCode('');
    try {
      const { data } = await api.post('/settings/activation-invitations', { residentId, expiresInDays: Number(expiresInDays) });
      setNewCode(data.data.code);
      await reloadInvitations();
      toast.success('Activation code created. It is shown here once.');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setCreating(false);
    }
  };

  const copy = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error('Clipboard access is unavailable. Select and copy the code manually.');
    }
  };

  const revoke = async (invitation) => {
    setRevoking(invitation.id);
    try {
      await api.patch('/settings/activation-invitations/revoke', {
        residentId: invitation.residentId, invitationId: invitation.id,
      });
      setNewCode('');
      await reloadInvitations();
      toast.success('Activation code revoked');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setRevoking('');
    }
  };

  return <Panel title="PG Access Management">
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 p-4">
        <div className="mb-4 flex items-start gap-3">
          <KeyRound size={19} className="mt-0.5 shrink-0 text-teal-700" />
          <div>
            <h3 className="font-semibold text-slate-900">PG joining password</h3>
            <p className="mt-1 text-sm text-slate-600">Students enter this with their room and bed. The saved password cannot be viewed later; set a new one to change or reset it.</p>
            <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <ShieldCheck size={16} className={access?.configured ? 'text-emerald-600' : 'text-amber-600'} />
              {accessLoading ? 'Checking password status…' : accessError ? 'Password status unavailable' : access?.configured ? 'Password configured' : 'No joining password configured'}
            </p>
            {accessError && <p role="alert" className="mt-1 text-xs text-rose-700">{accessError}</p>}
          </div>
        </div>
        <form onSubmit={savePassword} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label={access?.configured ? 'New joining password' : 'Joining password'} htmlFor="pgJoiningPassword" error={passwordError} required>
            <PasswordInput id="pgJoiningPassword" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
          </Field>
          <div className="flex gap-2">
            {password && <button type="button" className="btn-secondary" onClick={() => copy(password, 'Joining password')} aria-label="Copy joining password"><Copy size={16} /> Copy</button>}
            <button type="submit" className="btn-primary" disabled={savingPassword}>
              {savingPassword && <Loader2 size={16} className="animate-spin" />}{access?.configured ? 'Change password' : 'Create password'}
            </button>
          </div>
        </form>
        {access?.updatedAt && <p className="mt-2 text-xs text-slate-500">Last changed {dateTime(access.updatedAt)}</p>}
      </section>

      <section className="rounded-xl border border-slate-200 p-4">
        <h3 className="font-semibold text-slate-900">Student activation invitations</h3>
        <p className="mt-1 text-sm text-slate-600">Create a one-time code for an active resident assigned to a bed. Share the code with that student; it expires automatically.</p>
        {residentsError && <p role="alert" className="mt-3 text-sm text-rose-700">{residentsError}</p>}
        <form onSubmit={createInvitation} className="mt-4 grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
          <Field label="Assigned resident" htmlFor="activationResident" required>
            <Select id="activationResident" value={residentId} onChange={(event) => setResidentId(event.target.value)} disabled={residentsLoading} required>
              <option value="">{residentsLoading ? 'Loading residents…' : 'Select a resident'}</option>
              {eligibleResidents.map((resident) => <option key={resident._id} value={resident._id}>
                {resident.fullName} · Room {resident.room?.roomNumber || '—'} · Bed {resident.bedNumber}
              </option>)}
            </Select>
          </Field>
          <Field label="Expires after" htmlFor="invitationExpiry">
            <Select id="invitationExpiry" value={expiresInDays} onChange={(event) => setExpiresInDays(event.target.value)}>
              {[1, 3, 7, 14, 30].map((days) => <option key={days} value={days}>{days} {days === 1 ? 'day' : 'days'}</option>)}
            </Select>
          </Field>
          <button type="submit" className="btn-primary" disabled={creating || !residentId || !access?.configured}>
            {creating && <Loader2 size={16} className="animate-spin" />} Create code
          </button>
        </form>
        {!residentsLoading && !eligibleResidents.length && <p className="mt-3 text-sm text-slate-500">Assign an active, unactivated resident to a room bed to create an invitation.</p>}
        {newCode && <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 p-4">
          <p className="text-sm font-semibold text-teal-900">Share this activation code now. It will not be shown again.</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <code className="min-w-0 flex-1 select-all break-all rounded-lg bg-white px-3 py-2 text-sm text-slate-900">{newCode}</code>
            <button type="button" className="btn-secondary shrink-0" onClick={() => copy(newCode, 'Activation code')}><Copy size={16} /> Copy code</button>
          </div>
        </div>}
      </section>

      <section>
        <h3 className="mb-3 font-semibold text-slate-900">Invitation history</h3>
        {invitationError && <p role="alert" className="mb-3 text-sm text-rose-700">{invitationError}</p>}
        {invitationData?.invitations?.length ? <ul className="space-y-2">
          {invitationData.invitations.map((invitation) => <li key={invitation.id} className="flex flex-col gap-3 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{invitation.residentName} · Room {invitation.roomNumber} · Bed {invitation.bedNumber}</p>
              <p className="mt-1 text-xs text-slate-500">{invitation.status} · Expires {dateTime(invitation.expiresAt)}</p>
            </div>
            {invitation.status === 'Pending' && <button type="button" className="btn-secondary min-h-9 shrink-0" disabled={revoking === invitation.id} onClick={() => revoke(invitation)}>
              {revoking === invitation.id ? <Loader2 size={15} className="animate-spin" /> : <TicketX size={15} />} Revoke
            </button>}
          </li>)}
        </ul> : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No activation invitations yet.</p>}
      </section>
    </div>
  </Panel>;
}
