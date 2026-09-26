import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, getToken, setToken, User } from "../api";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (usernameOrEmail: string, password: string) => Promise<void>;
  signup: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (token) {
          try {
            const me = await api.getMe();
            setUser(me);
          } catch {
            await setToken(null);
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (usernameOrEmail: string, password: string) => {
    const res = await api.login(usernameOrEmail, password);
    await setToken(res.access_token);
    setUser(res.user);
  }, []);

  const signup = useCallback(async (username: string, email: string, password: string) => {
    const res = await api.signup(username, email, password);
    await setToken(res.access_token);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    await setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
