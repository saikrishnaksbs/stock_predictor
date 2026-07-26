"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { getToken, setSession } from "@/lib/auth";

const inputStyle: React.CSSProperties = {
  fontSize: 14,
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--page-plane)",
  color: "var(--text-primary)",
  outline: "none",
  width: "100%",
};

const buttonStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  padding: "10px 14px",
  borderRadius: 8,
  border: "none",
  background: "var(--series-1)",
  color: "#ffffff",
  cursor: "pointer",
  width: "100%",
};

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");

  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (getToken()) router.replace("/dashboard");
  }, [router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.login(usernameOrEmail, loginPassword);
      setSession(res.access_token, res.user);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? "Incorrect username/email or password." : "Could not log in.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.signup(username, email, signupPassword);
      setSession(res.access_token, res.user);
      router.push("/dashboard");
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? "Username or email already taken."
          : "Could not create account — password must be at least 8 characters."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: "var(--surface-1)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: 28,
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Stock Portfolio</h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 22 }}>
          {mode === "login" ? "Log in to your account." : "Create an account to get started."}
        </p>

        <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
          <button
            onClick={() => {
              setMode("login");
              setError(null);
            }}
            style={{
              flex: 1,
              padding: "8px 0",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              background: mode === "login" ? "var(--series-1)" : "var(--page-plane)",
              color: mode === "login" ? "#fff" : "var(--text-secondary)",
            }}
          >
            Log in
          </button>
          <button
            onClick={() => {
              setMode("signup");
              setError(null);
            }}
            style={{
              flex: 1,
              padding: "8px 0",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              background: mode === "signup" ? "var(--series-1)" : "var(--page-plane)",
              color: mode === "signup" ? "#fff" : "var(--text-secondary)",
            }}
          >
            Sign up
          </button>
        </div>

        {mode === "login" ? (
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input
              style={inputStyle}
              placeholder="username or email"
              value={usernameOrEmail}
              onChange={(e) => setUsernameOrEmail(e.target.value)}
              required
              autoComplete="username"
            />
            <input
              style={inputStyle}
              placeholder="password"
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <button type="submit" style={buttonStyle} disabled={busy}>
              {busy ? "Logging in…" : "Log in"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignup} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input
              style={inputStyle}
              placeholder="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              autoComplete="username"
            />
            <input
              style={inputStyle}
              placeholder="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <input
              style={inputStyle}
              placeholder="password (min 8 characters)"
              type="password"
              value={signupPassword}
              onChange={(e) => setSignupPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
            <button type="submit" style={buttonStyle} disabled={busy}>
              {busy ? "Creating…" : "Create account"}
            </button>
          </form>
        )}

        {error && <p style={{ color: "var(--critical)", fontSize: 13, marginTop: 12 }}>{error}</p>}
      </div>
    </main>
  );
}
