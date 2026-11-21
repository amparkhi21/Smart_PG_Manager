import api from '../api/client.js';
import { isAndroid } from './platform.js';
import { pushPreferenceKey } from '../utils/pushNotifications.js';

const REGISTRATION_KEY = 'smartpg.push.registration.v1';
const INSTALLATION_KEY = 'smartpg.push.installation.v1';
let activeIdentityKey = null;
let sessionTransitionCount = 0;
let queue = Promise.resolve();

const serialize = (work) => {
  const result = queue.then(work, work);
  queue = result.catch(() => {});
  return result;
};

export function setActivePushIdentity(identityKey) {
  activeIdentityKey = identityKey || null;
}

export function beginPushSessionTransition() {
  sessionTransitionCount += 1;
}

export function endPushSessionTransition() {
  sessionTransitionCount = Math.max(0, sessionTransitionCount - 1);
}

export function pushEnabled(identityKey) {
  return Boolean(identityKey && window.localStorage.getItem(pushPreferenceKey(identityKey)) === 'true');
}

export function setPushEnabled(identityKey, enabled) {
  if (!identityKey) return;
  const key = pushPreferenceKey(identityKey);
  if (enabled) window.localStorage.setItem(key, 'true');
  else window.localStorage.removeItem(key);
}

function registrationRecord() {
  try {
    const record = JSON.parse(window.localStorage.getItem(REGISTRATION_KEY) || 'null');
    return record && typeof record.id === 'string' && typeof record.identityKey === 'string' ? record : null;
  } catch { return null; }
}

export function hasPushRegistration(identityKey) {
  return registrationRecord()?.identityKey === identityKey;
}

export function hasOtherAccountPushRegistration(identityKey) {
  const record = registrationRecord();
  return Boolean(record && record.identityKey !== identityKey);
}

function installationId() {
  let id = window.localStorage.getItem(INSTALLATION_KEY);
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(id || '')) {
    id = globalThis.crypto?.randomUUID?.() || `spm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(INSTALLATION_KEY, id);
  }
  return id;
}

export function registerPushToken(identity, token, apiClient = api) {
  return serialize(async () => {
    if (sessionTransitionCount > 0 || !isAndroid || !identity?.enabled || identity.key !== activeIdentityKey || !pushEnabled(identity.key)) return null;
    const current = registrationRecord();
    if (current && current.identityKey !== identity.key) throw new Error('The previous account push registration must be removed before switching accounts.');
    if (typeof token !== 'string' || token.length < 20 || token.length > 4096) throw new Error('Android did not provide a valid push token.');
    const deviceId = current?.deviceId || installationId();
    const { data } = await apiClient.post('/notifications/devices', { deviceId, token, platform: 'android' });
    if (identity.key !== activeIdentityKey || !pushEnabled(identity.key)) {
      await apiClient.delete(`/notifications/devices/${data.data.id}`);
      return null;
    }
    window.localStorage.setItem(REGISTRATION_KEY, JSON.stringify({ id: data.data.id, deviceId, identityKey: identity.key }));
    return data.data;
  });
}

export function unregisterPushDevice(apiClient = api) {
  return serialize(async () => {
    const current = registrationRecord();
    if (!current) return false;
    if (current.identityKey !== activeIdentityKey) throw new Error('Sign in to the account that owns this push registration before removing it.');
    try { await apiClient.delete(`/notifications/devices/${current.id}`, { timeout: 10000 }); }
    catch (error) {
      if (error.response?.status !== 404) throw error;
    }
    window.localStorage.removeItem(REGISTRATION_KEY);
    return true;
  });
}
