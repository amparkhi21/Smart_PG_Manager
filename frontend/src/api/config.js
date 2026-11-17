export const PRODUCTION_API_BASE_URL = 'https://smart-pg-manager-backend.onrender.com/api';

export function resolveApiBaseUrl(value, production = false) {
  if (!value?.trim()) {
    return production ? PRODUCTION_API_BASE_URL : '/api';
  }
  try {
    const url = new URL(value.trim());
    const local = /^(localhost|127\..*|\[::1\]|0\.0\.0\.0)$|\.localhost$/i.test(url.hostname);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash ||
        url.pathname.replace(/\/+$/, '') !== '/api') throw new Error();
    // A local .env or stale Vercel setting must never target the visitor's machine.
    if (production && local) return PRODUCTION_API_BASE_URL;
    if (production && url.protocol !== 'https:') throw new Error();
    return url.href.replace(/\/+$/, '');
  } catch {
    throw new Error('VITE_API_BASE_URL must be an absolute API URL ending in /api (public HTTPS in production)');
  }
}
