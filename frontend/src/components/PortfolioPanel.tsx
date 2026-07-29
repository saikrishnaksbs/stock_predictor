"use client";

import { useState } from "react";
import { api, type SymbolSuggestion, type User } from "@/lib/api";
import { panelStyle, headingStyle, labelStyle, buttonStyle } from "@/lib/sharedStyles";
import SymbolAutocomplete from "./SymbolAutocomplete";

export default function PortfolioPanel({
  user,
  onUpdated,
}: {
  user: User;
  onUpdated: (symbols: string[]) => void;
}) {
  const [pending, setPending] = useState<SymbolSuggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addPending(s: SymbolSuggestion) {
    setPending((prev) => (prev.some((p) => p.symbol === s.symbol) ? prev : [...prev, s]));
  }

  function removePending(symbol: string) {
    setPending((prev) => prev.filter((p) => p.symbol !== symbol));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending.length === 0) return;

    setBusy(true);
    setError(null);
    try {
      const portfolio = await api.updatePortfolio(pending.map((p) => ({ symbol: p.symbol, name: p.name })));
      onUpdated(portfolio.stocks.map((s) => s.symbol));
      setPending([]);
    } catch {
      setError("Could not update the portfolio.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={panelStyle}>
      <h2 style={headingStyle}>Add stocks to {user.username}&apos;s portfolio</h2>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <SymbolAutocomplete onSelect={addPending} />
          <button type="submit" style={buttonStyle} disabled={busy || pending.length === 0}>
            {busy ? "Adding…" : `Add${pending.length ? ` (${pending.length})` : ""}`}
          </button>
        </div>

        {pending.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {pending.map((p) => (
              <span
                key={p.symbol}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  padding: "4px 8px",
                  borderRadius: 999,
                  background: "var(--page-plane)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
              >
                {p.symbol}
                <button
                  type="button"
                  onClick={() => removePending(p.symbol)}
                  aria-label={`Remove ${p.symbol}`}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: 0,
                    fontSize: 13,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </form>
      <p style={{ ...labelStyle, marginTop: 8 }}>
        Search by company name or ticker — fuzzy matches typos too. Each new symbol spins up its own background
        scraper thread on the backend.
      </p>
      {error && <p style={{ color: "var(--critical)", fontSize: 13, marginTop: 8 }}>{error}</p>}
    </section>
  );
}
