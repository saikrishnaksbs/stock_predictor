"use client";

import { useEffect, useState } from "react";
import { api, type Stock, type User } from "@/lib/api";
import UserPanel from "@/components/UserPanel";
import PortfolioPanel from "@/components/PortfolioPanel";
import StockCard from "@/components/StockCard";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [wishlist, setWishlist] = useState<Stock[]>([]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    async function refresh() {
      try {
        const p = await api.getPortfolio(user!.id);
        if (cancelled) return;
        setSymbols(p.stocks.map((s) => s.symbol));
        setWishlist(p.wishlist);
      } catch {
        if (!cancelled) {
          setSymbols([]);
          setWishlist([]);
        }
      }
    }

    refresh();
    // Picks up wishlist entries created by searches typed in PortfolioPanel,
    // since those happen server-side without a matching client-side event.
    const id = setInterval(refresh, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user]);

  return (
    <main
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "32px 24px 80px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      <header>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Stock Portfolio Dashboard</h1>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 4 }}>
          Live-scraped, time-series-backed portfolio tracking.
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: user ? "1fr 1fr" : "1fr",
          gap: 20,
        }}
      >
        <UserPanel activeUser={user} onSelect={setUser} />
        {user && (
          <PortfolioPanel
            user={user}
            onUpdated={(syms) => setSymbols(syms)}
          />
        )}
      </div>

      {user && wishlist.length > 0 && (
        <section>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
            Wishlist — stocks you&apos;ve searched
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {wishlist.map((w) => (
              <span
                key={w.symbol}
                style={{
                  fontSize: 13,
                  padding: "6px 12px",
                  borderRadius: 999,
                  background: "var(--surface-1)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
              >
                <strong>{w.symbol}</strong>
                {w.name && <span style={{ color: "var(--text-secondary)" }}> — {w.name}</span>}
              </span>
            ))}
          </div>
        </section>
      )}

      {user && (
        <section>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
            {symbols.length > 0 ? `${user.username}'s portfolio` : "No stocks yet — add one above"}
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
              gap: 16,
            }}
          >
            {symbols.map((symbol, i) => (
              <StockCard key={symbol} symbol={symbol} colorIndex={i} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
