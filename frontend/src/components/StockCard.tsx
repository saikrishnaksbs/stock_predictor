"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiError, type PredictedPoint, type Sentiment, type StockTimeSeries } from "@/lib/api";
import ArticleList from "./ArticleList";
import LineChart from "./LineChart";

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

function SentimentBadge({
  sentiment,
  expanded,
  onToggle,
}: {
  sentiment: Sentiment | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (!sentiment || sentiment.article_count === 0) {
    return (
      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
        No recent news
      </span>
    );
  }

  const { avg_score, article_count } = sentiment;
  let label: string;
  let color: string;
  let icon: string;
  if (avg_score > 0.15) {
    label = "Positive";
    color = "var(--good)";
    icon = "▲";
  } else if (avg_score < -0.15) {
    label = "Negative";
    color = "var(--critical)";
    icon = "▼";
  } else {
    label = "Neutral";
    color = "var(--text-muted)";
    icon = "●";
  }

  return (
    <button
      onClick={onToggle}
      title={`Average sentiment ${avg_score.toFixed(2)} over ${article_count} recent article(s) — click to ${expanded ? "hide" : "see"} them`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        fontWeight: 600,
        color,
        background: "none",
        border: "none",
        padding: 0,
        cursor: "pointer",
      }}
    >
      <span aria-hidden>{icon}</span>
      {label}
      <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
        ({article_count} article{article_count === 1 ? "" : "s"}) {expanded ? "▴" : "▾"}
      </span>
    </button>
  );
}

export default function StockCard({
  symbol,
  colorIndex,
  pollMs = 10000,
}: {
  symbol: string;
  colorIndex: number;
  pollMs?: number;
}) {
  const [series, setSeries] = useState<StockTimeSeries | null>(null);
  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  const [predicted, setPredicted] = useState<PredictedPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showArticles, setShowArticles] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const stopScanRef = useRef<(() => void) | null>(null);

  // Close any in-flight SSE connection if the card unmounts mid-scan (e.g.
  // the user switches accounts) — an EventSource left open keeps streaming
  // and calling setState on an unmounted component otherwise.
  useEffect(() => () => stopScanRef.current?.(), []);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const data = await api.getTimeSeries(symbol);
        if (!cancelled) {
          setSeries(data);
          setError(null);
        }
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) {
          setError("No data yet — the scraper thread just started, check back shortly.");
        } else {
          setError("Could not reach the API.");
        }
      }
    }

    poll();
    const id = setInterval(poll, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol, pollMs]);

  useEffect(() => {
    // Sentiment and the prediction curve change far slower than price ticks
    // (news polls every 10 min server-side) — poll them less aggressively.
    let cancelled = false;

    async function pollSlow() {
      try {
        const [s, p] = await Promise.all([api.getSentiment(symbol), api.getPrediction(symbol)]);
        if (cancelled) return;
        setSentiment(s);
        setPredicted(p.predicted);
      } catch {
        // sentiment/prediction are supplementary — a failure here shouldn't blank the price chart
      }
    }

    pollSlow();
    const id = setInterval(pollSlow, 60000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol]);

  function handleScan() {
    if (scanning) return;
    setScanning(true);
    setScanCount(0);
    setShowArticles(true);
    stopScanRef.current = api.streamSentimentScan(
      symbol,
      (article) => {
        setScanCount((c) => c + 1);
        setSentiment((prev) => {
          const base = prev ?? { symbol, avg_score: 0, article_count: 0, articles: [] };
          const articles = [article, ...base.articles];
          const avg_score = articles.reduce((sum, a) => sum + a.score, 0) / articles.length;
          return { ...base, articles, article_count: articles.length, avg_score };
        });
      },
      () => {
        setScanning(false);
        stopScanRef.current = null;
        // Reconcile with the server (e.g. prediction's sentiment window) once the scan settles.
        api.getPrediction(symbol).then((p) => setPredicted(p.predicted)).catch(() => {});
      },
      () => {
        setScanning(false);
        stopScanRef.current = null;
      }
    );
  }

  const color = SERIES_COLORS[colorIndex % SERIES_COLORS.length];

  return (
    <div
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "16px 20px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{symbol}</h3>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {series ? `${series.count} points` : ""}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <SentimentBadge
          sentiment={sentiment}
          expanded={showArticles}
          onToggle={() => setShowArticles((v) => !v)}
        />
        <button
          onClick={handleScan}
          disabled={scanning}
          style={{
            fontSize: 11,
            color: "var(--series-1)",
            background: "none",
            border: "none",
            padding: 0,
            cursor: scanning ? "default" : "pointer",
            opacity: scanning ? 0.6 : 1,
          }}
        >
          {scanning ? `scanning… ${scanCount} new` : "scan latest news"}
        </button>
      </div>

      {showArticles && sentiment && (
        <div style={{ marginBottom: 12, maxHeight: 320, overflowY: "auto" }}>
          <ArticleList articles={sentiment.articles} />
        </div>
      )}

      {error && !series && (
        <div style={{ fontSize: 13, color: "var(--text-secondary)", padding: "24px 0" }}>{error}</div>
      )}

      {series && <LineChart data={series.data} color={color} predicted={predicted} />}
    </div>
  );
}
