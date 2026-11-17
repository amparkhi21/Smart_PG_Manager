import { resolveApiBaseUrl } from './config.js';
import { createApiClient } from './http.js';

export { TOKEN_KEY } from './http.js';

// Prefer VITE_API_BASE_URL; production resolves missing/loopback values to Render.
// Bearer authentication works across Vercel/Render without third-party cookies.
const baseURL = resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL, import.meta.env.PROD);
const api = createApiClient({
  baseURL,
  storage: localStorage,
  onUnauthorized: () => window.dispatchEvent(new Event('auth:logout')),
});

export default api;
