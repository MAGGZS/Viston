import axios from 'axios';
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  notifySessionExpired,
  setTokens,
} from '@/app/lib/session';
import { SITE_URL } from '@/app/lib/site';

// Backend local (PORT=4000 no backend/.env, para não colidir com o Next na 3001).
const LOCAL_API_URL = 'http://localhost:4000';
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

/** Backend em produção (Render). Só vale em produção — ver abaixo. */
const PRODUCTION_API_URL = 'https://viston.onrender.com';

/**
 * É a produção de verdade?
 *
 * A Vercel expõe `NEXT_PUBLIC_VERCEL_ENV` sozinha, e ela vale `production`,
 * `preview` ou `development` — é a resposta exata, e não um palpite sobre o
 * nome do host. O domínio entra como segunda via, para o caso de o projeto ter
 * as variáveis de sistema desligadas.
 */
function isProductionHost(host) {
  if (process.env.NEXT_PUBLIC_VERCEL_ENV === 'production') return true;
  return !!host && host === new URL(SITE_URL).hostname;
}

/**
 * Onde fica a API.
 *
 * `NEXT_PUBLIC_API_URL` manda, e é o que se deve definir em cada ambiente.
 *
 * O que saiu daqui foi o palpite: "host que não é localhost, então é produção".
 * Ele fazia *toda* pré-visualização da Vercel bater na API de produção — abrir
 * o preview de um branch para conferir uma tela cadastrava prédio de verdade, e
 * nada na tela dizia isso. Agora o fallback de produção vale só no domínio de
 * produção; qualquer outro host (preview, domínio novo, túnel) precisa dizer
 * com quem fala, e falha alto em vez de escrever no lugar errado.
 *
 * O atalho para localhost fica: rodar `npm run dev` sem nenhum `.env` é o caso
 * comum, e ali o alvo nunca é a nuvem.
 */
export function resolveApiBaseUrl() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;

  const host = typeof window === 'undefined' ? null : window.location.hostname;

  if (host && LOCAL_HOSTS.includes(host)) return LOCAL_API_URL;
  if (isProductionHost(host)) return PRODUCTION_API_URL;

  throw new Error(
    `NEXT_PUBLIC_API_URL não definida para "${host ?? 'servidor'}". Defina a URL da API ` +
      'no ambiente — sem ela, este host não tem com qual backend falar (e não vai ' +
      'adivinhar o de produção).'
  );
}

/**
 * A URL é resolvida em cada requisição, e não uma vez na carga do módulo.
 *
 * `resolveApiBaseUrl` depende de `window.location` no caminho do localhost, e
 * este módulo também é avaliado no servidor durante a geração das páginas —
 * onde a resposta seria outra. Deixar a decisão para a hora da chamada também
 * evita que a falta da variável derrube o build inteiro: quem nunca chama a API
 * (as páginas estáticas) não precisa dela.
 */
const api = axios.create({
  headers: { 'Content-Type': 'application/json' },
});

// Injeta access token e a URL da API em toda requisição
api.interceptors.request.use((config) => {
  config.baseURL = config.baseURL ?? resolveApiBaseUrl();

  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;

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

/** Sessão acabada: some com os tokens e avisa quem sabe navegar. */
function endSession() {
  clearTokens();
  notifySessionExpired();
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

      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        isRefreshing = false;
        endSession();
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post(
          `${resolveApiBaseUrl()}/auth/refresh`,
          { refresh_token: refreshToken }
        );
        setTokens(data.access_token, data.refresh_token);
        api.defaults.headers.common.Authorization = `Bearer ${data.access_token}`;
        processQueue(null, data.access_token);
        return api(original);
      } catch (err) {
        processQueue(err, null);
        endSession();
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
