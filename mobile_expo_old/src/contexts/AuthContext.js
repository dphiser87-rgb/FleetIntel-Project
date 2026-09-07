import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { api, setAuthTokens, clearAuthTokens, hydrateAuthTokens, onAuthExpired } from "../lib/api";
import { setTokens, clearTokens } from "../lib/tokenStore";
import { loadPresets } from "../lib/access";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Held only in memory during the 2FA step -- the backend re-validates the password on the second
  // call (server.py's /auth/login has no partial-session concept), never persisted to disk.
  const pendingPassword = useRef(null);

  useEffect(() => {
    onAuthExpired(() => setUser(null));
    (async () => {
      const { token } = await hydrateAuthTokens();
      if (!token) { setLoading(false); return; }
      try {
        const { data } = await api.get("/auth/me");
        setUser(data);
        await loadPresets();
      } catch {
        clearAuthTokens();
        await clearTokens();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Returns { requires2fa: true } on step 1 if TOTP is enabled, otherwise logs in directly.
  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    if (data.requires_2fa) {
      pendingPassword.current = password;
      return { requires2fa: true, email };
    }
    return finishLogin(data, email);
  };

  const submit2FA = async (email, code) => {
    const password = pendingPassword.current;
    const { data } = await api.post("/auth/login", { email, password, code });
    return finishLogin(data, email);
  };

  const finishLogin = async (data, email) => {
    pendingPassword.current = null;
    await setTokens({ token: data.token, refreshToken: data.refresh_token });
    setAuthTokens({ token: data.token, refreshToken: data.refresh_token });
    setUser(data.user);
    await loadPresets();
    return { requires2fa: false, user: data.user };
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    clearAuthTokens();
    await clearTokens();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, submit2FA, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
