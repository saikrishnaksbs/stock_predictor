"use client";

import type { User } from "./api";

// Real session auth: a JWT issued by the backend on signup/login. The
// backend verifies this token on every user-scoped request and derives
// "who's asking" from it — nothing here is trusted client-side, this is
// just where the token/profile are cached for the UI.
const TOKEN_KEY = "stock_predictor_token";
const USER_KEY = "stock_predictor_user";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getCurrentUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: User) {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}
