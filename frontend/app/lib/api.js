import axios from 'axios';

// Backend em produção (Render). Trocar aqui se o serviço mudar de URL.
const PRODUCTION_API_URL = 'https://viston.onrender.com';
// Backend local (PORT=4000 no backend/.env, para não colidir com o Next na 3001).
const LOCAL_API_URL = 'http://localhost:4000';
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

/**
 * Resolve a URL da API sem precisar trocar configuração ao alternar
 * entre desenvolvimento e nuvem:
 *   1. NEXT_PUBLIC_API_URL, se definida (permite sobrescrever quando necessário,
 *      ex: frontend local apontando para a API de produção)
 *   2. localhost quando a página está sendo servida de localhost
 *   3. produção nos demais casos (Vercel, e também no render do servidor)
 */
export function resolveApiBaseUrl() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;

  if (typeof window !== 'undefined' && LOCAL_HOSTS.includes(window.location.hostname)) {
    return LOCAL_API_URL;
  }

  return PRODUCTION_API_URL;
}

const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  headers: { 'Content-Type': 'application/json' },
});

// Injeta access token em toda requisição
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Refresh automático quando access token expira
let isRefreshing = false;
let failedQueue = [];

function processQueue(error, token = null) {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            original.headers.Authorization = `Bearer ${token}`;
            return api(original);
          })
          .catch((err) => Promise.reject(err));
      }

      original._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        isRefreshing = false;
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post(
          `${resolveApiBaseUrl()}/auth/refresh`,
          { refresh_token: refreshToken }
        );
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);
        api.defaults.headers.common.Authorization = `Bearer ${data.access_token}`;
        processQueue(null, data.access_token);
        return api(original);
      } catch (err) {
        processQueue(err, null);
        localStorage.clear();
        window.location.href = '/login';
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
