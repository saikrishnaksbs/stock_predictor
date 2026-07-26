"use client";

import { useEffect, useState } from "react";
import { api, type User } from "@/lib/api";

export default function UserPanel({
  activeUser,
  onSelect,
}: {
  activeUser: User | null;
  onSelect: (u: User) => void;
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const list = await api.listUsers();
    setUsers(list);
    return list;
  }

  useEffect(() => {
    refresh().catch(() => setError("Could not reach the API. Is the backend running on :8123?"));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const user = await api.createUser(username, email);
      setUsername("");
      setEmail("");
      await refresh();
      onSelect(user);
    } catch {
      setError("Could not create user — username/email may already be taken.");
    }
  }

  return (
    <section style={panelStyle}>
      <h2 style={headingStyle}>User</h2>

      {users.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Existing users</label>
          <select
            style={inputStyle}
            value={activeUser?.id ?? ""}
            onChange={(e) => {
              const u = users.find((u) => u.id === e.target.value);
              if (u) onSelect(u);
            }}
          >
            <option value="" disabled>
              Select a user…
            </option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username} ({u.email})
              </option>
            ))}
          </select>
        </div>
      )}

      <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={labelStyle}>Create new user</label>
        <input
          style={inputStyle}
          placeholder="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          minLength={3}
        />
        <input
          style={inputStyle}
          placeholder="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button type="submit" style={buttonStyle}>
          Create user
        </button>
      </form>

      {error && <p style={{ color: "var(--critical)", fontSize: 13, marginTop: 8 }}>{error}</p>}
    </section>
  );
}

export const panelStyle: React.CSSProperties = {
  background: "var(--surface-1)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 20,
};

export const headingStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  marginBottom: 12,
  color: "var(--text-primary)",
};

export const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--text-secondary)",
};

export const inputStyle: React.CSSProperties = {
  fontSize: 14,
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--page-plane)",
  color: "var(--text-primary)",
  outline: "none",
};

export const buttonStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  padding: "8px 14px",
  borderRadius: 8,
  border: "none",
  background: "var(--series-1)",
  color: "#ffffff",
  cursor: "pointer",
};
