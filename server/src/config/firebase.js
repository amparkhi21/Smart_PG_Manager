import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

const name = 'smart-pg-fcm';
let warned = false;
const variables = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'FCM_TOKEN_ENCRYPTION_KEY'];
export function firebaseStatus(env = process.env) {
  const missing = variables.filter((key) => !env[key]?.trim() || (key === 'FCM_TOKEN_ENCRYPTION_KEY' && !/^[a-f\d]{64}$/i.test(env[key])));
  return { enabled: env.FCM_ENABLED === 'true', configured: env.FCM_ENABLED === 'true' && missing.length === 0, missing };
}

// No application-default credentials, credential files or network initialization on import.
// Tests replace this provider; production initializes only when explicitly configured.
export const firebaseProvider = {
  get() {
    if (!firebaseStatus().configured) return null;
    try {
      const app = getApps().find((item) => item.name === name) || initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID,
        credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') }) }, name);
      return getMessaging(app);
    } catch {
      // Never print SDK initialization errors, which may include credential material.
      if (!warned) {
        warned = true;
        console.warn('FCM initialization unavailable. Check FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY. In-app notifications remain enabled.');
      }
      return null;
    }
  },
};
