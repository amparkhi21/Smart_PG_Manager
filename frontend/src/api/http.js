import axios from 'axios';

export const TOKEN_KEY = 'pg_token';

export function createApiClient({ baseURL, storage, onUnauthorized, onActivity = () => {} }) {
  const api = axios.create({ baseURL, timeout: 90000 });
  api.interceptors.request.use(async (config) => {
    const token = await storage.getItem(TOKEN_KEY);
    if (token) config.headers.Authorization = `Bearer ${token}`;
    config.pgActivity = true;
    onActivity(1);
    return config;
  });
  const finish = (config) => { if (config?.pgActivity) { config.pgActivity = false; onActivity(-1); } };
  api.interceptors.response.use((response) => { finish(response.config); return response; }, async (error) => {
    finish(error.config);
    const url = error.config?.url || '';
    const authForm = ['/auth/login', '/auth/register'].some((path) => url === path);
    if (error.response?.status === 401 && !authForm) {
      try { await storage.removeItem(TOKEN_KEY); } finally { onUnauthorized(); }
    }
    return Promise.reject(error);
  });
  return api;
}
