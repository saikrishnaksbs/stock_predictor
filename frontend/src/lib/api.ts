import { getToken } from "./auth";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8123";

export type User = {
  id: string;
  username: string;
  email: string;
  timezone: string;
  created_at: string;
};

export type AuthResponse = {
  access_token: string;
  token_type: string;
  user: User;
};

export type Stock = {
  symbol: string;
  name: string | null;
};

export type Portfolio = {
  user_id: string;
  stocks: Stock[];
  wishlist: Stock[];
};

export type PricePoint = {
  time: string;
  symbol: string;
  price: number;
  volume: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  source: string;
};

export type StockTimeSeries = {
  symbol: string;
  count: number;
  data: PricePoint[];
};

export type SymbolSuggestion = {
  symbol: string;
  name: string | null;
  exchange: string | null;
};

export type SentimentArticle = {
  time: string;
  published_at: string | null;
  score: number;
  title: string;
  source: string;
  url: string | null;
};

export type ArticleFullText = {
  url: string;
  resolved_url: string | null;
  title: string | null;
  text: string | null;
  success: boolean;
  error: string | null;
};

export type ArticleSummary = {
  url: string;
  summary: string | null;
  success: boolean;
  error: string | null;
};

export type Sentiment = {
  symbol: string;
  avg_score: number;
  article_count: number;
  articles: SentimentArticle[];
};

export type PredictedPoint = {
  time: string;
  price: number;
  // 95% prediction-interval bounds. Null/absent when the series is too flat
  // or too short to have a meaningful spread — render the projection without
  // a band in that case rather than collapsing it to a zero-height sliver.
  lower?: number | null;
  upper?: number | null;
};

export type Prediction = {
  symbol: string;
  method: string;
  trend_slope_per_point: number;
  sentiment_adjusted_slope_per_point: number | null;
  sentiment: { avg_score: number; article_count: number };
  predicted: PredictedPoint[];
};

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, body || res.statusText);
  }
  return res.json() as Promise<T>;
}

export const api = {
  signup: (username: string, email: string, password: string) =>
    request<AuthResponse>("/users", { method: "POST", body: JSON.stringify({ username, email, password }) }),
  login: (usernameOrEmail: string, password: string) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username_or_email: usernameOrEmail, password }),
    }),
  getMe: () => request<User>("/users/me"),
  updateTimezone: (timezone: string) =>
    request<User>("/users/me/timezone", { method: "PUT", body: JSON.stringify({ timezone }) }),

  getPortfolio: () => request<Portfolio>("/portfolio"),
  updatePortfolio: (symbols: { symbol: string; name?: string | null }[]) =>
    request<Portfolio>("/portfolio", { method: "POST", body: JSON.stringify({ symbols }) }),
  getWishlist: () => request<{ user_id: string; wishlist: Stock[] }>("/wishlist"),

  getTimeSeries: (symbol: string, limit = 500) =>
    request<StockTimeSeries>(`/stocks/${encodeURIComponent(symbol)}/timeseries?limit=${limit}`),
  searchSymbols: (q: string, limit = 8) =>
    request<SymbolSuggestion[]>(`/symbols/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  getSentiment: (symbol: string, limit = 20) =>
    request<Sentiment>(`/stocks/${encodeURIComponent(symbol)}/sentiment?limit=${limit}`),
  getPrediction: (symbol: string) =>
    request<Prediction>(`/stocks/${encodeURIComponent(symbol)}/prediction`),
  getArticleFullText: (url: string) =>
    request<ArticleFullText>(`/articles/full-text?url=${encodeURIComponent(url)}`),
  getArticleSummary: (url: string) =>
    request<ArticleSummary>(`/articles/summarize?url=${encodeURIComponent(url)}`),

  /** Streams newly-scored articles one at a time via SSE, instead of making
   * the caller wait for the whole batch (up to 50 headlines) to finish.
   * Returns a cleanup function — call it to close the connection early. */
  streamSentimentScan: (
    symbol: string,
    onArticle: (article: SentimentArticle) => void,
    onDone: (newCount: number) => void,
    onError?: () => void
  ) => {
    const es = new EventSource(`${API_BASE}/stocks/${encodeURIComponent(symbol)}/sentiment/scan`);
    es.onmessage = (e) => onArticle(JSON.parse(e.data));
    es.addEventListener("done", (e: MessageEvent) => {
      onDone(JSON.parse(e.data).new_count);
      es.close();
    });
    es.addEventListener("error", () => {
      onError?.();
      es.close();
    });
    return () => es.close();
  },
};

export { ApiError };
