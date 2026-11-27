import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/client.js';
import { useAuth } from './AuthContext.jsx';
import { isAndroid, Native } from '../native/platform.js';
import { beginPushSessionTransition, endPushSessionTransition, hasOtherAccountPushRegistration, hasPushRegistration, pushEnabled, registerPushToken, setPushEnabled, unregisterPushDevice } from '../native/pushDevice.js';
import { belongsToNotificationAccount, fetchNotificationRecord, notificationIdentity, notificationTarget } from '../utils/notifications.js';
import { validPushNotification } from '../utils/pushNotifications.js';

const PushNotificationsContext = createContext(null);
let pluginPromise;
// Keep the module wrapper: a Capacitor plugin proxy exposes a `then` method,
// so returning the proxy from a promise would stall promise resolution.
const loadPushPlugin = () => pluginPromise ||= import('@capacitor/push-notifications');
const refreshNotifications = () => window.dispatchEvent(new Event('notifications:refresh'));

export function PushNotificationsProvider({ children }) {
  const { owner, resident } = useAuth();
  const identity = notificationIdentity(owner, resident);
  const navigate = useNavigate();
  const identityRef = useRef(identity), navigateRef = useRef(navigate), enabledRef = useRef(false);
  identityRef.current = identity; navigateRef.current = navigate;
  const pluginRef = useRef(null), listenersRef = useRef([]), pendingRef = useRef(null), actionLock = useRef(false), pendingAction = useRef(null);
  const [pluginReady, setPluginReady] = useState(false), [firebaseConfigured, setFirebaseConfigured] = useState(null);
  const [permission, setPermission] = useState('unknown'), [enabled, setEnabled] = useState(false), [registered, setRegistered] = useState(false);
  const [registrationConflict, setRegistrationConflict] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');

  const finishPending = useCallback((identityKey, error) => {
    const pending = pendingRef.current;
    if (!pending || pending.identityKey !== identityKey) return;
    clearTimeout(pending.timer); pendingRef.current = null;
    if (error) pending.reject(error); else pending.resolve();
  }, []);

  const handleToken = useCallback(async (token) => {
    const current = identityRef.current;
    if (!enabledRef.current || !current.enabled || !current.key) return;
    try {
      const result = await registerPushToken(current, token);
      if (!result) return;
      setRegistered(true);
      setMessage('This device is registered. Delivery also requires Firebase Admin setup on the server.');
      finishPending(current.key);
    } catch {
      setRegistered(false);
      setMessage('This device could not be registered. Check the Android Firebase app file and server Firebase setup. In-app notifications remain available.');
      finishPending(current.key, new Error('Push registration is unavailable. Check Firebase configuration and try again.'));
    }
  }, [finishPending]);

  const handleAction = useCallback(async (data) => {
    const current = identityRef.current;
    if (!current.enabled) { pendingAction.current = data; return; }
    if (actionLock.current) return;
    actionLock.current = true;
    try {
      const approved = validPushNotification(data, current);
      if (!approved) throw new Error('This notification is unavailable for the signed-in account.');
      const item = (await api.patch(`/notifications/${approved.id}/read`, {})).data.data;
      if (!belongsToNotificationAccount(item, current) || item.id !== approved.id
        || item.type !== data.type || item.path !== data.path || item.relatedEntityId !== data.relatedEntityId) {
        throw new Error('This notification is unavailable for the signed-in account.');
      }
      const target = notificationTarget(item, current.role);
      if (!target || target.path !== approved.target.path) throw new Error('This notification has no valid destination.');
      await fetchNotificationRecord(api, item, current.role);
      if (identityRef.current.key !== current.key) return;
      navigateRef.current(target.path);
    } catch (error) {
      if (identityRef.current.key === current.key) toast.error(error.response?.status === 403 || error.response?.status === 404
        ? 'This notification is no longer available to this account.' : error.message || 'Could not open this notification.');
    } finally {
      actionLock.current = false;
      refreshNotifications();
    }
  }, []);

  useEffect(() => {
    if (!isAndroid) return undefined;
    let disposed = false;
    (async () => {
      try {
        const config = await Native.getPushConfiguration();
        if (!disposed) setFirebaseConfigured(Boolean(config.firebaseConfigured));
        const { PushNotifications: plugin } = await loadPushPlugin();
        if (disposed) return;
        pluginRef.current = plugin;
        const handles = await Promise.all([
          plugin.addListener('registration', ({ value }) => handleToken(value)),
          plugin.addListener('registrationError', () => finishPending(identityRef.current.key, new Error('Android push registration failed.'))),
          plugin.addListener('pushNotificationReceived', ({ data }) => {
            if (validPushNotification(data, identityRef.current)) refreshNotifications();
          }),
          plugin.addListener('pushNotificationActionPerformed', ({ notification }) => handleAction(notification?.data)),
        ]);
        if (disposed) { await Promise.all(handles.map((handle) => handle.remove())); return; }
        listenersRef.current = handles;
        const status = await plugin.checkPermissions();
        if (!disposed) { setPermission(status.receive); setPluginReady(true); }
      } catch {
        if (!disposed) { setFirebaseConfigured(false); setPermission('unavailable'); setMessage('Android push notifications are unavailable in this build. In-app notifications remain available.'); setPluginReady(true); }
      }
    })();
    return () => {
      disposed = true;
      listenersRef.current.forEach((handle) => handle.remove());
      listenersRef.current = [];
      if (pendingRef.current) { clearTimeout(pendingRef.current.timer); pendingRef.current.reject(new Error('Push setup stopped.')); pendingRef.current = null; }
    };
  }, [finishPending, handleAction, handleToken]);

  const reconcile = useCallback(async () => {
    if (!isAndroid) return;
    const current = identityRef.current;
    const desired = Boolean(current.key && pushEnabled(current.key));
    enabledRef.current = desired;
    const hasCurrentRegistration = hasPushRegistration(current.key);
    setEnabled(desired); setRegistered(hasCurrentRegistration); setRegistrationConflict(hasOtherAccountPushRegistration(current.key));
    if (!pluginReady || !current.key) return;
    if (!current.enabled) {
      if (hasPushRegistration(current.key)) {
        beginPushSessionTransition();
        try { await unregisterPushDevice(); setPushEnabled(current.key, false); setRegistered(false); }
        catch { setMessage('Complete your required password change before push registration can be removed.'); }
        finally { endPushSessionTransition(); }
      }
      enabledRef.current = false; setEnabled(false);
      return;
    }
    if (firebaseConfigured !== true) {
      if (desired || hasPushRegistration(current.key)) {
        beginPushSessionTransition();
        try {
          await unregisterPushDevice(); setPushEnabled(current.key, false); setRegistered(false);
        } catch {
          setMessage('Firebase Android app configuration is missing. This device could not remove its previous registration; retry Disable when online.');
          return;
        } finally { endPushSessionTransition(); }
        enabledRef.current = false; setEnabled(false); setRegistered(false);
      }
      setMessage('Firebase Android app configuration is missing. Push is unavailable; in-app notifications remain available.');
      return;
    }
    if (!desired && hasCurrentRegistration) {
      beginPushSessionTransition();
      try { await unregisterPushDevice(); setRegistered(false); }
      catch { setMessage('Push is off, but the device registration could not be removed. Retry when online.'); }
      finally { endPushSessionTransition(); }
    }
    const plugin = pluginRef.current;
    if (!plugin) return;
    const status = await plugin.checkPermissions();
    setPermission(status.receive);
    if (desired && status.receive === 'granted') {
      plugin.register().catch(() => setMessage('Android could not start push registration. Check Firebase configuration.'));
    } else if (desired && status.receive !== 'granted') {
      let removed = false;
      beginPushSessionTransition();
      try {
        await unregisterPushDevice(); setPushEnabled(current.key, false); enabledRef.current = false; setEnabled(false); setRegistered(false); removed = true;
      } catch { /* Keep the registration state visible until the account can remove it. */ }
      finally { endPushSessionTransition(); }
      setMessage(removed ? 'Notification permission is not allowed. Enable it in Android settings, then try again.'
        : 'Push permission is unavailable and the previous registration could not be removed. Retry Disable when online.');
    } else if (!desired) {
      setMessage('Push notifications are off. In-app notifications remain available.');
    }
  }, [firebaseConfigured, pluginReady]);

  useEffect(() => { reconcile(); }, [identity.key, identity.enabled, reconcile]);
  useEffect(() => {
    const refresh = () => reconcile();
    const sessionChanged = () => reconcile();
    window.addEventListener('app:resume', refresh);
    window.addEventListener('auth:session', sessionChanged);
    return () => { window.removeEventListener('app:resume', refresh); window.removeEventListener('auth:session', sessionChanged); };
  }, [reconcile]);

  useEffect(() => {
    if (identity.enabled && pendingAction.current) {
      const data = pendingAction.current; pendingAction.current = null; handleAction(data);
    }
  }, [identity.enabled, identity.key, handleAction]);

  const enable = useCallback(async () => {
    const current = identityRef.current, plugin = pluginRef.current;
    if (!isAndroid || !plugin || !current.enabled || firebaseConfigured !== true) return;
    setBusy(true); setMessage('');
    try {
      let status = await plugin.checkPermissions();
      if (status.receive !== 'granted') status = await plugin.requestPermissions();
      setPermission(status.receive);
      if (status.receive !== 'granted') { setMessage('Notification permission was not granted. Push registration remains off.'); return; }
      setPushEnabled(current.key, true); enabledRef.current = true; setEnabled(true);
      await new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => { if (pendingRef.current?.identityKey === current.key) pendingRef.current = null; reject(new Error('Push registration timed out.')); }, 15000);
        pendingRef.current = { identityKey: current.key, resolve, reject, timer };
        plugin.register().catch((error) => finishPending(current.key, error));
      });
    } catch {
      if (identityRef.current.key === current.key) {
        setPushEnabled(current.key, false); enabledRef.current = false; setEnabled(false); setRegistered(false);
        setMessage('This device could not be registered. Check the Android Firebase app file and server Firebase setup. In-app notifications remain available.');
      }
    } finally { setBusy(false); }
  }, [firebaseConfigured, finishPending]);

  const disable = useCallback(async () => {
    const current = identityRef.current, plugin = pluginRef.current;
    if (!current.key || busy) return;
    setBusy(true); setMessage('');
    beginPushSessionTransition();
    try {
      await unregisterPushDevice();
      setPushEnabled(current.key, false); enabledRef.current = false; setEnabled(false); setRegistered(false);
      try { await plugin?.unregister(); } catch { /* Server registration is already removed. */ }
      setMessage('Push notifications are off. In-app notifications remain available.');
    } catch {
      setMessage('This device could not be unregistered. Stay signed in and retry when you are online.');
    } finally { endPushSessionTransition(); setBusy(false); }
  }, [busy]);

  const value = { available: isAndroid, accountReady: identity.enabled, firebaseConfigured, permission, enabled, registered, registrationConflict, busy, message, enable, disable };
  return <PushNotificationsContext.Provider value={value}>{children}</PushNotificationsContext.Provider>;
}

export const usePushNotifications = () => useContext(PushNotificationsContext);
