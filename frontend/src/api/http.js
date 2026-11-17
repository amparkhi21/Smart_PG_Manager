import axios from 'axios';

export const TOKEN_KEY = 'pg_token';

export function createApiClient({ baseURL, storage, onUnauthorized }) {
  const api = axios.create({ baseURL, timeout: 90000 });
  api.interceptors.request.use((config) => {
    const token = storage.getItem(TOKEN_KEY);
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });
  api.interceptors.response.use((response) => response, (error) => {
    const url = error.config?.url || '';
    const authForm = ['/auth/login', '/auth/register'].some((path) => url === path);
    if (error.response?.status === 401 && !authForm) {
      storage.removeItem(TOKEN_KEY);
      onUnauthorized();
    }
    return Promise.reject(error);
  });
  return api;
}
