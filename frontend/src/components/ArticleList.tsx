"use client";

import { useMemo, useState } from "react";
import { api, type SentimentArticle } from "@/lib/api";

function scoreColor(score: number): string {
  if (score > 0) return "var(--good)";
  if (score < 0) return "var(--critical)";
  return "var(--text-muted)";
}

function scoreLabel(score: number): string {
  if (score > 0) return "+1";
  if (score < 0) return "−1";
  return "0";
}

function fmt(iso: string | null): string {
  if (!iso) return "unknown";
  // Google News surfaces genuinely old evergreen articles alongside today's
  // news — always show the year, or e.g. "19 Jun" for a 2020 article reads
  // as more recent than "09 Jul" for a 2025 one.
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type PanelMode = "none" | "full" | "summary";

function ArticleRow({ article }: { article: SentimentArticle }) {
  const [mode, setMode] = useState<PanelMode>("none");
  const [loading, setLoading] = useState(false);
  const [fullText, setFullText] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle(target: "full" | "summary") {
    if (!article.url) return;
    if (mode === target) {
      setMode("none");
      return;
    }
    setMode(target);
    setError(null);

    const already = target === "full" ? fullText : summary;
    if (already) return;

    setLoading(true);
    try {
      if (target === "full") {
        const res = await api.getArticleFullText(article.url);
        if (res.success && res.text) setFullText(res.text);
        else setError(res.error ?? "Could not extract article text.");
      } else {
        const res = await api.getArticleSummary(article.url);
        if (res.success && res.summary) setSummary(res.summary);
        else setError(res.error ?? "Could not summarize this article.");
      }
    } catch {
      setError("Request failed — this can take a while (real page load + model call) and may time out.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <li
      style={{
        padding: "10px 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: scoreColor(article.score),
            minWidth: 18,
          }}
        >
          {scoreLabel(article.score)}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{article.title}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
            {article.source} · published {fmt(article.published_at)} · scraped {fmt(article.time)}
            {article.url && (
              <>
                {" · "}
                <button
                  onClick={() => handleToggle("summary")}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    color: "var(--series-1)",
                    fontSize: 11,
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  {mode === "summary" ? "hide summary" : "summarize"}
                </button>
                {" · "}
                <button
                  onClick={() => handleToggle("full")}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    color: "var(--series-1)",
                    fontSize: 11,
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  {mode === "full" ? "hide full text" : "read full text"}
                </button>
              </>
            )}
          </div>

          {mode !== "none" && (
            <div
              style={{
                marginTop: 8,
                padding: "10px 12px",
                background: "var(--page-plane)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
                color: "var(--text-secondary)",
                lineHeight: 1.6,
                maxHeight: 240,
                overflowY: "auto",
              }}
            >
              {loading &&
                (mode === "summary"
                  ? "Summarizing (real page load + HF model call, can take ~15-30s, longer if the model is cold-starting)…"
                  : "Loading full article (this opens the real page and can take ~10-20s)…")}
              {error && <span style={{ color: "var(--critical)" }}>{error}</span>}
              {mode === "summary" ? summary : fullText}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function articleTimestamp(a: SentimentArticle): number {
  // Sort by when the article actually went live. Older articles scraped
  // before we started capturing publish dates have no published_at — sink
  // those to the bottom (unknown, not "-Infinity" ordering) rather than
  // using scrape time as a stand-in, which would make a months-old article
  // that just happened to get re-scraped today look freshly published.
  return a.published_at ? new Date(a.published_at).getTime() : -Infinity;
}

export default function ArticleList({ articles }: { articles: SentimentArticle[] }) {
  const sorted = useMemo(
    () => [...articles].sort((a, b) => articleTimestamp(b) - articleTimestamp(a)),
    [articles]
  );

  if (sorted.length === 0) {
    return <p style={{ fontSize: 12, color: "var(--text-muted)" }}>No articles yet.</p>;
  }
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {sorted.map((a) => (
        <ArticleRow key={`${a.title}-${a.time}`} article={a} />
      ))}
    </ul>
  );
}
