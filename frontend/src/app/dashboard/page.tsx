"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, type Stock, type User } from "@/lib/api";
import { clearSession, getCurrentUser, getToken } from "@/lib/auth";
import Navbar from "@/components/Navbar";
import PortfolioPanel from "@/components/PortfolioPanel";
import StockCard from "@/components/StockCard";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [portfolio, setPortfolio] = useState<Stock[]>([]);
  const [wishlist, setWishlist] = useState<Stock[]>([]);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setUser(getCurrentUser());
    setCheckedAuth(true);
  }, [router]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    async function refresh() {
      try {
        const p = await api.getPortfolio();
        if (cancelled) return;
        setPortfolio(p.stocks);
        // A symbol already in the portfolio doesn't need its own duplicate
        // "bookmarked" card too.
        const portfolioSymbols = new Set(p.stocks.map((s) => s.symbol));
        setWishlist(p.wishlist.filter((w) => !portfolioSymbols.has(w.symbol)));
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) {
          // Expired/invalid token — bounce back to login rather than show a broken dashboard.
          clearSession();
          router.replace("/login");
          return;
        }
        setPortfolio([]);
        setWishlist([]);
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
  }, [user, router]);

  if (!checkedAuth || !user) {
    return null; // redirecting to /login, or first paint before localStorage check runs
  }

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
          gap: 28,
        }}
      >
        <PortfolioPanel user={user} onUpdated={() => { /* next 8s poll picks it up */ }} />

        <section>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
            Portfolio
            <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 13 }}>
              {" "}
              — gold and silver are tracked by default for every user
            </span>
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
              gap: 16,
            }}
          >
            {portfolio.map((s, i) => (
              <StockCard key={s.symbol} symbol={s.symbol} colorIndex={i} />
            ))}
          </div>
        </section>

        {wishlist.length > 0 && (
          <section>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
              Bookmarked
              <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 13 }}>
                {" "}
                — stocks you&apos;ve searched, not yet added to your portfolio
              </span>
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
                gap: 16,
              }}
            >
              {wishlist.map((s, i) => (
                <StockCard key={s.symbol} symbol={s.symbol} colorIndex={portfolio.length + i} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
