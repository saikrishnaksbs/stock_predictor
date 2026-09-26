"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError, type PredictedPoint, type Stock, type StockTimeSeries, type User } from "@/lib/api";
import { clearSession, getCurrentUser, getToken } from "@/lib/auth";
import Navbar from "@/components/Navbar";
import CompareChart, { type CompareSeries } from "@/components/CompareChart";
import { headingStyle, panelStyle } from "@/lib/sharedStyles";

const SERIES_COLORS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
  "var(--series-8)",
];

const MAX_SELECTED = 4;

function CompareView({ user }: { user: User }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [available, setAvailable] = useState<Stock[]>([]);
  const [timeSeries, setTimeSeries] = useState<Record<string, StockTimeSeries>>({});
  const [predictions, setPredictions] = useState<Record<string, PredictedPoint[]>>({});

  const selected = useMemo(() => {
    const raw = searchParams.get("symbols");
    if (!raw) return [];
    return raw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, MAX_SELECTED);
  }, [searchParams]);

  // Stable primitive for effect deps — `selected` is a fresh array each render.
  const selectedKey = selected.join(",");

  const setSelected = useCallback(
    (next: string[]) => {
      const qs = next.length > 0 ? `?symbols=${encodeURIComponent(next.join(","))}` : "";
      router.replace(`/dashboard/compare${qs}`);
    },
    [router]
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const p = await api.getPortfolio();
        if (cancelled) return;
        const seen = new Set<string>();
        const merged = [...p.stocks, ...p.wishlist].filter((s) => {
          if (seen.has(s.symbol)) return false;
          seen.add(s.symbol);
          return true;
        });
        setAvailable(merged);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) {
          clearSession();
          router.replace("/login");
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (selected.length === 0) return;
    let cancelled = false;

    async function poll() {
      const results = await Promise.all(
        selected.map((sym) =>
          api
            .getTimeSeries(sym)
            .then((d) => [sym, d] as const)
            .catch(() => [sym, null] as const)
        )
      );
      if (cancelled) return;
      setTimeSeries((prev) => {
        const next = { ...prev };
        results.forEach(([sym, d]) => {
          if (d) next[sym] = d;
        });
        return next;
      });
    }

    poll();
    const id = setInterval(poll, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  useEffect(() => {
    if (selected.length === 0) return;
    let cancelled = false;

    async function pollSlow() {
      const results = await Promise.all(
        selected.map((sym) =>
          api
            .getPrediction(sym)
            .then((p) => [sym, p.predicted] as const)
            .catch(() => [sym, null] as const)
        )
      );
      if (cancelled) return;
      setPredictions((prev) => {
        const next = { ...prev };
        results.forEach(([sym, p]) => {
          if (p) next[sym] = p;
        });
        return next;
      });
    }

    pollSlow();
    const id = setInterval(pollSlow, 60000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  function toggle(symbol: string) {
    if (selected.includes(symbol)) {
      setSelected(selected.filter((s) => s !== symbol));
    } else if (selected.length < MAX_SELECTED) {
      setSelected([...selected, symbol]);
    }
  }

  const series: CompareSeries[] = selected.map((sym, i) => ({
    symbol: sym,
    color: SERIES_COLORS[i % SERIES_COLORS.length],
    data: timeSeries[sym]?.data ?? [],
    predicted: predictions[sym] ?? [],
  }));

  return (
    <div style={{ minHeight: "100vh" }}>
      <Navbar user={user} />

      <main
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "28px 24px 80px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <Link href="/dashboard" style={{ fontSize: 13, color: "var(--series-1)", textDecoration: "none" }}>
          ← Dashboard
        </Link>

        <section style={panelStyle}>
          <h2 style={headingStyle}>
            Compare
            <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 13 }}>
              {" "}
              — pick up to {MAX_SELECTED} symbols to overlay on one chart
            </span>
          </h2>

          {available.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              No symbols yet — add some to your portfolio from the dashboard first.
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {available.map((s) => {
                const isSelected = selected.includes(s.symbol);
                const atCap = !isSelected && selected.length >= MAX_SELECTED;
                const colorIdx = selected.indexOf(s.symbol);
                return (
                  <button
                    key={s.symbol}
                    onClick={() => toggle(s.symbol)}
                    disabled={atCap}
                    title={atCap ? `Deselect one first — max ${MAX_SELECTED}` : s.name ?? s.symbol}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      padding: "6px 12px",
                      borderRadius: 999,
                      border: `1px solid ${isSelected ? SERIES_COLORS[colorIdx % SERIES_COLORS.length] : "var(--border)"}`,
                      background: isSelected ? SERIES_COLORS[colorIdx % SERIES_COLORS.length] : "var(--page-plane)",
                      color: isSelected ? "#fff" : "var(--text-secondary)",
                      cursor: atCap ? "not-allowed" : "pointer",
                      opacity: atCap ? 0.45 : 1,
                    }}
                  >
                    {s.symbol}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section style={panelStyle}>
          {selected.length < 2 ? (
            <div style={{ fontSize: 13, color: "var(--text-secondary)", padding: "32px 0", textAlign: "center" }}>
              Pick at least 2 symbols above to compare them.
            </div>
          ) : (
            <CompareChart series={series} />
          )}
        </section>
      </main>
    </div>
  );
}

export default function ComparePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [checkedAuth, setCheckedAuth] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setUser(getCurrentUser());
    setCheckedAuth(true);
  }, [router]);

  if (!checkedAuth || !user) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <CompareView user={user} />
    </Suspense>
  );
}
