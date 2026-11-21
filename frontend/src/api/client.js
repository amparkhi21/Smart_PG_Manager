import { resolveApiBaseUrl } from './config.js';
import { createApiClient } from './http.js';
import { isAndroid, Native } from '../native/platform.js';
import { createSessionStorage } from '../native/sessionStorage.js';
import { requestActivity } from '../native/requestActivity.js';

export { TOKEN_KEY } from './http.js';

// Prefer VITE_API_BASE_URL; production resolves missing/loopback values to Render.
// Bearer authentication works across Vercel/Render without third-party cookies.
const production = import.meta.env.PROD && import.meta.env.MODE !== 'test';
const baseURL = resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL, production);
export const sessionStorage = createSessionStorage({ native: isAndroid, bridge: Native, browserStorage: localStorage });
const api = createApiClient({
  baseURL,
  storage: sessionStorage,
  onActivity: requestActivity,
  onUnauthorized: () => window.dispatchEvent(new Event('auth:logout')),
});

export default api;
