import axios from "axios";
import { getTokens, setTokens, clearTokens } from "./tokenStore";

export const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000/api";

export const api = axios.create({ baseURL: API_URL });

// In-memory mirror of the SecureStore tokens so every request doesn't need an async keychain read.
// AuthContext keeps this in sync via setAuthTokens/clearAuthTokens.
let _token = null;
let _refreshToken = null;
let _onAuthExpired = null;

export function setAuthTokens({ token, refreshToken }) {
  _token = token;
  if (refreshToken) _refreshToken = refreshToken;
}

export function clearAuthTokens() {
  _token = null;
  _refreshToken = null;
}

// Called once by AuthContext on app start, since the in-memory mirror above starts empty.
export async function hydrateAuthTokens() {
  const { token, refreshToken } = await getTokens();
  _token = token;
  _refreshToken = refreshToken;
  return { token, refreshToken };
}

// AuthContext registers this to react when a refresh attempt definitively fails (no valid refresh
// token, or the refresh token itself is expired/revoked) -- the only case that should force a
// full re-login, as opposed to a transient network failure which the offline queue already handles.
export function onAuthExpired(fn) {
  _onAuthExpired = fn;
}

api.interceptors.request.use((config) => {
  if (_token) config.headers.Authorization = `Bearer ${_token}`;
  return config;
});

let _refreshPromise = null;

async function performRefresh() {
  if (!_refreshPromise) {
    _refreshPromise = axios
      .post(`${API_URL}/auth/refresh`, { refresh_token: _refreshToken })
      .then(async (r) => {
        await setTokens({ token: r.data.token, refreshToken: r.data.refresh_token });
        setAuthTokens({ token: r.data.token, refreshToken: r.data.refresh_token });
        return r.data.token;
      })
      .finally(() => { _refreshPromise = null; });
  }
  return _refreshPromise;
}

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const status = error?.response?.status;
    const original = error.config;
    const isAuthRoute = original?.url?.includes("/auth/login") || original?.url?.includes("/auth/refresh");
    if (status === 401 && !original._retried && !isAuthRoute && _refreshToken) {
      original._retried = true;
      try {
        const newToken = await performRefresh();
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch {
        clearAuthTokens();
        await clearTokens();
        if (_onAuthExpired) _onAuthExpired();
      }
    }
    return Promise.reject(error);
  }
);
