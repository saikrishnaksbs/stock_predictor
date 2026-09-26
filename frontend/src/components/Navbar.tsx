"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, type User } from "@/lib/api";
import { clearSession, setSession } from "@/lib/auth";

const TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "UTC",
];

export default function Navbar({ user }: { user: User }) {
  const router = useRouter();
  const [showTimezoneMenu, setShowTimezoneMenu] = useState(false);
  const [saving, setSaving] = useState(false);

  function handleLogout() {
    clearSession();
    router.push("/login");
  }

  async function handleTimezoneChange(tz: string) {
    setSaving(true);
    try {
      const token = localStorage.getItem("stock_predictor_token") || "";
      const updated = await api.updateTimezone(tz);
      setSession(token, updated);
      setShowTimezoneMenu(false);
      // Reload user data to reflect timezone change
      window.location.reload();
    } catch (err) {
      console.error("Timezone update failed:", err);
      alert("Failed to update timezone");
    } finally {
      setSaving(false);
    }
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
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
            {user.timezone}
          </div>
        </div>

        <Link
          href="/dashboard/compare"
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: "6px 12px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--page-plane)",
            color: "var(--text-secondary)",
            textDecoration: "none",
          }}
        >
          Compare
        </Link>

        <div style={{ position: "relative" }}>
          <button
            onClick={() => setShowTimezoneMenu(!showTimezoneMenu)}
            disabled={saving}
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: "6px 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--page-plane)",
              color: "var(--text-secondary)",
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Saving…" : "Timezone"}
          </button>

          {showTimezoneMenu && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                right: 0,
                marginTop: 4,
                background: "var(--surface-1)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                zIndex: 1000,
                minWidth: 180,
              }}
            >
              {TIMEZONES.map((tz) => (
                <button
                  key={tz}
                  onClick={() => handleTimezoneChange(tz)}
                  disabled={saving}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: 12,
                    textAlign: "left",
                    border: "none",
                    background: tz === user.timezone ? "var(--series-1)" : "transparent",
                    color: tz === user.timezone ? "#fff" : "var(--text-primary)",
                    cursor: saving ? "not-allowed" : "pointer",
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  {tz}
                </button>
              ))}
            </div>
          )}
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
