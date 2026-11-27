import { BellRing } from 'lucide-react';
import { usePushNotifications } from '../context/PushNotificationsContext.jsx';

const permissionLabels = { granted: 'Allowed', denied: 'Blocked', prompt: 'Not requested', 'prompt-with-rationale': 'Not requested', unavailable: 'Unavailable', unknown: 'Checking' };

export default function PushNotificationSettings() {
  const settings = usePushNotifications();
  if (!settings?.available) return null;
  const { accountReady, firebaseConfigured, permission, enabled, registered, registrationConflict, busy, message, enable, disable } = settings;
  const permissionLabel = permissionLabels[permission] || 'Unknown';
  return <section className="card mt-5 p-5 sm:p-6" aria-labelledby="push-settings-title">
    <div className="flex items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700"><BellRing size={19} /></span>
      <div className="min-w-0 flex-1">
        <h2 id="push-settings-title" className="text-lg font-bold text-navy-900">Android push notifications</h2>
        <p className="mt-1 text-sm text-slate-600">Permission: {permissionLabel}. In-app notifications continue to work when push is off.</p>
        <label className="mt-4 flex min-h-11 items-center gap-3 text-sm font-semibold text-slate-800">
          <input type="checkbox" checked={enabled} disabled={busy || !accountReady || firebaseConfigured !== true || permission === 'unknown' || registrationConflict}
            onChange={(event) => event.target.checked ? enable() : disable()} className="h-5 w-5 accent-teal-600" />
          Enable Push Notifications
        </label>
        <p className="mt-2 text-xs text-slate-500">
          {firebaseConfigured === false ? 'Firebase Android app configuration is missing. Add the matching google-services.json to enable device registration.'
            : firebaseConfigured === null ? 'Checking Android Firebase configuration…'
              : registrationConflict ? 'A device registration from another account is pending removal. Sign in to that account to remove it before enabling push here.'
              : registered ? 'This device is registered. Delivery also requires Firebase Admin credentials on the server.'
                : enabled ? 'Push is enabled for this account; device registration is being checked.' : 'Push is off for this account.'}
        </p>
        {!accountReady && <p className="mt-2 text-xs text-slate-500">Complete the required password change before enabling push notifications.</p>}
        {firebaseConfigured !== true && !registrationConflict && (enabled || registered) && <button type="button" className="btn-secondary mt-3" disabled={busy} onClick={disable}>Disable and remove this device</button>}
        {message && <p className="mt-2 text-sm text-slate-600" role="status">{message}</p>}
      </div>
      {busy && <span className="text-xs text-slate-500" role="status">Updating…</span>}
    </div>
  </section>;
}
