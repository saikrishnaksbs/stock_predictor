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
  exchange?: string | null;
};

export type SentimentArticle = {
  time: string;
  published_at: string | null;
  score: number;
  title: string;
  source: string;
  url: string | null;
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

export type Prediction = {
  symbol: string;
  method: string;
  trend_slope_per_point: number;
  sentiment_adjusted_slope_per_point: number | null;
  sentiment: { avg_score: number; article_count: number };
  predicted: PredictedPoint[];
};
