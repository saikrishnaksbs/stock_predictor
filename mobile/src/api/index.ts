import EventSource from "react-native-sse";
import { API_BASE, getToken, request } from "./client";
import type {
  ArticleFullText,
  ArticleSummary,
  AuthResponse,
  Portfolio,
  Prediction,
  Sentiment,
  SentimentArticle,
  Stock,
  StockTimeSeries,
  SymbolSuggestion,
  User,
} from "./types";

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
  getPrediction: (symbol: string) => request<Prediction>(`/stocks/${encodeURIComponent(symbol)}/prediction`),

  getArticleFullText: (url: string) =>
    request<ArticleFullText>(`/articles/full-text?url=${encodeURIComponent(url)}`),
  getArticleSummary: (url: string) =>
    request<ArticleSummary>(`/articles/summarize?url=${encodeURIComponent(url)}`),

  /** Streams newly-scored articles one at a time via SSE instead of making the
   * caller wait for the whole batch (up to 50 headlines) to finish. Returns a
   * cleanup function — call it to close the connection early. */
  streamSentimentScan: (
    symbol: string,
    onArticle: (article: SentimentArticle) => void,
    onDone: (newCount: number) => void,
    onError?: () => void
  ) => {
    let closed = false;
    let es: EventSource | null = null;

    (async () => {
      const token = await getToken();
      if (closed) return;
      es = new EventSource(`${API_BASE}/stocks/${encodeURIComponent(symbol)}/sentiment/scan`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      es.addEventListener("message", (e: any) => {
        if (e.data) onArticle(JSON.parse(e.data));
      });
      es.addEventListener("done" as any, (e: any) => {
        onDone(e.data ? JSON.parse(e.data).new_count : 0);
        es?.close();
      });
      es.addEventListener("error", () => {
        onError?.();
        es?.close();
      });
    })();

    return () => {
      closed = true;
      es?.close();
    };
  },
};

export { ApiError, setToken, getToken } from "./client";
export * from "./types";
