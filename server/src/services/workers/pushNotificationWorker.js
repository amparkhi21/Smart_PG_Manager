import { firebaseStatus } from '../../config/firebase.js';
import { dispatchPushNotifications, waitForPushDeliveries } from '../pushNotificationService.js';

let running = null;
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
