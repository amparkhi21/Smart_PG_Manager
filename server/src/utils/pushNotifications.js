import Notification, { NOTIFICATION_TARGETS } from '../models/Notification.js';
import PushDevice from '../models/PushDevice.js';
import PushDelivery from '../models/PushDelivery.js';
import Resident from '../models/Resident.js';
import Owner from '../models/Owner.js';
import { firebaseProvider, firebaseStatus } from '../config/firebase.js';
import { decryptPushToken } from './pushTokens.js';

const DAY_MS = 86400000;
const invalidTokens = new Set(['messaging/invalid-registration-token', 'messaging/registration-token-not-registered']);
const scopeFor = (notification) => ({ owner: notification.owner, recipientRole: notification.recipientRole, recipient: notification.recipient });
async function validAccount(device) {
  if (device.recipientRole === 'owner') return String(device.recipient) === String(device.owner) && Boolean(await Owner.exists({ _id: device.owner }));
  return Boolean(await Resident.exists({ _id: device.recipient, owner: device.owner, status: 'Active', loginEnabled: true,
    accountStatus: 'active', passwordChangeRequired: false, sessionVersion: device.sessionVersion }));
}
async function sendDevice(messaging, notification, candidate, timeoutMs) {
  const scope = scopeFor(notification);
  let delivery;
  try {
    delivery = await PushDelivery.create({ ...scope, notification: notification._id, device: candidate._id, status: 'attempted', attemptedAt: new Date() });
  } catch (error) { if (error.code === 11000) return; throw error; }
  const finish = (status, errorCode) => PushDelivery.updateOne({ _id: delivery._id }, { $set: { status, finishedAt: new Date(), ...(errorCode && { errorCode }) } });
  // Re-check registration and resident session immediately before sending.
  const device = await PushDevice.findOne({ _id: candidate._id, ...scope, revision: candidate.revision })
    .select('+tokenHash +tokenCiphertext +tokenIv +tokenTag +sessionVersion +revision');
  if (!device || !(await validAccount(device))) {
    if (device) await PushDevice.deleteOne({ _id: device._id, ...scope, revision: device.revision });
    return finish('skipped', 'push/account-or-device-unavailable');
  }
  let timer;
  try {
    const token = decryptPushToken(device);
    // Keep complaint text, UTRs and amounts off the lock screen. The app resolves the private record after login.
    const payload = { token, notification: { title: 'Smart PG Manager', body: 'You have a new update in your PG account.' },
      data: { notificationId: String(notification._id), type: notification.type, relatedEntityId: String(notification.relatedEntityId),
        path: notification.path, pgId: String(notification.owner), recipientId: String(notification.recipient), recipientRole: notification.recipientRole },
      android: { priority: 'high', ttl: 3600000, notification: { tag: `notification-${notification._id}` } } };
    await Promise.race([messaging.send(payload), new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error('Push timeout'), { code: 'push/timeout' })), timeoutMs);
    })]);
    await finish('sent');
  } catch (error) {
    const code = typeof error.code === 'string' && /^(?:messaging|push)\/[a-z-]{1,65}$/.test(error.code) ? error.code : 'push/delivery-failed';
    if (invalidTokens.has(code)) await PushDevice.deleteOne({ _id: device._id, ...scope, revision: device.revision });
    await finish('failed', code);
  } finally { clearTimeout(timer); }
}

// One durable claim per event/device before calling FCM. Ambiguous failures are terminal:
// replaying a request that Firebase may have accepted would risk duplicate pushes.
export async function dispatchPushNotifications({ owner, recipientScope, timeoutMs = 15000 } = {}) {
  const messaging = firebaseProvider.get();
  if (!messaging) return;
  const now = new Date();
  const filter = { pushEligible: true, pushHandled: false, availableAt: { $lte: now }, ...(owner && { owner }), ...(recipientScope && { recipientRole: recipientScope.recipientRole, recipient: recipientScope.recipient }) };
  const notifications = await Notification.find(filter).sort({ createdAt: 1, _id: 1 }).limit(50).lean();
  for (const notification of notifications) {
    const target = NOTIFICATION_TARGETS[notification.type];
    if (!notification.readAt && notification.createdAt >= new Date(now - DAY_MS) && target?.[0] === notification.recipientRole && target[1] === notification.path) {
      const devices = await PushDevice.find({ ...scopeFor(notification), createdAt: { $lte: notification.createdAt } }).select('+revision').lean();
      await Promise.all(devices.map((device) => sendDevice(messaging, notification, device, timeoutMs)));
    }
    await Notification.updateOne({ _id: notification._id, ...scopeFor(notification) }, { $set: { pushHandled: true } });
  }
}

let running = null;
const inFlight = new Set();
export function schedulePushDelivery(owner, recipientScope) {
  // Detached from all API and financial transaction responses; durable rows survive process restarts.
  const work = new Promise((resolve) => setImmediate(resolve).unref()).then(() => dispatchPushNotifications({ owner, recipientScope }))
    .catch(() => console.warn('Push delivery deferred; in-app notifications remain available'));
  inFlight.add(work); work.finally(() => inFlight.delete(work));
  return work;
}
export async function waitForPushDeliveries() {
  await Promise.all([...inFlight]);
}
export function startPushWorker() {
  const status = firebaseStatus();
  if (!status.configured) {
    console.log(status.enabled ? `FCM unavailable; missing or invalid: ${status.missing.join(', ')}. In-app notifications remain enabled.` : 'FCM disabled; in-app notifications remain enabled.');
    return waitForPushDeliveries;
  }
  const drain = () => {
    if (!running) running = dispatchPushNotifications().catch(() => console.warn('Push delivery deferred; in-app notifications remain available')).finally(() => { running = null; });
  };
  drain(); const timer = setInterval(drain, 30000); timer.unref();
  return async () => { clearInterval(timer); await running; await waitForPushDeliveries(); };
}
