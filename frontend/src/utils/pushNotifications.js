import { notificationTarget } from './notifications.js';

const ID = /^[a-f\d]{24}$/i;

export function validPushNotification(data, identity) {
  if (!identity?.enabled || !ID.test(data?.notificationId || '')
    || data.recipientRole !== identity.role
    || String(data.recipientId || '').toLowerCase() !== identity.id
    || String(data.pgId || '').toLowerCase() !== identity.pgId) return null;
  const target = notificationTarget({ type: data.type, path: data.path, relatedEntityId: data.relatedEntityId }, identity.role);
  return target ? { id: data.notificationId, target } : null;
}

export function pushPreferenceKey(identityKey) {
  return `smartpg.push.enabled.v1:${identityKey}`;
}
