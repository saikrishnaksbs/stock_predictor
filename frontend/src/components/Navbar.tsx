"use client";

import { useRouter } from "next/navigation";
import type { User } from "@/lib/api";
import { clearSession } from "@/lib/auth";

export default function Navbar({ user }: { user: User }) {
  const router = useRouter();

  function handleLogout() {
    clearSession();
    router.push("/login");
  }

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px 24px",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface-1)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
          Stock Portfolio
        </span>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          Live-scraped, time-series-backed
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            {user.username}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{user.email}</div>
        </div>
        <button
          onClick={handleLogout}
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: "6px 12px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--page-plane)",
            color: "var(--text-secondary)",
            cursor: "pointer",
          }}
        >
          Log out
        </button>
      </div>
    </header>
  );
}
