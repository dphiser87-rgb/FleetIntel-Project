import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { setLoading(false); return; }
    api.get("/auth/me")
      .then((r) => setUser(r.data))
      .catch(() => { localStorage.removeItem("token"); })
      .finally(() => setLoading(false));
  }, []);

  // After any sign-in, load the full user from /auth/me: it carries the person's effective
  // permissions, which the sign-in responses don't, and the sidebar and buttons are built from them.
  const signedIn = async (data) => {
    localStorage.setItem("token", data.token);
    try {
      const me = (await api.get("/auth/me")).data;
      setUser(me);
      return me;
    } catch {
      setUser(data.user);
      return data.user;
    }
  };

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    return signedIn(data);
  };

  const register = async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    return signedIn(data);
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
  };

  const refreshUser = async () => {
    const { data } = await api.get("/auth/me");
    setUser(data);
    return data;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
