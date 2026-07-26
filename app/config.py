from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    mongo_uri: str = "mongodb://localhost:27017"
    mongo_db_name: str = "stockdb"

    # Comma-separated, e.g. "https://your-app.vercel.app,http://localhost:3000"
    # — plain comma-separated string (env var: CORS_ALLOW_ORIGINS) rather than
    # a list field, so it's easy to paste into a single env var box in
    # Render/Vercel's dashboard without needing JSON-array syntax.
    cors_allow_origins_raw: str = Field(default="http://localhost:3000", alias="CORS_ALLOW_ORIGINS")

    @property
    def cors_allow_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_allow_origins_raw.split(",") if o.strip()]

    scrape_interval_seconds: int = 30
    scrape_max_retries: int = 3
    scrape_retry_backoff_seconds: float = 2.0

    # News is far lower-frequency than price ticks, and Google News RSS will
    # rate-limit/serve stale results if hit too often.
    sentiment_interval_seconds: int = 600
    news_fetch_limit: int = 50

    # Prediction is a heuristic, not a trained model: it extrapolates the
    # recent linear price trend, then nudges that trend by recent news
    # sentiment. This weight controls how much sentiment can bend the trend
    # (0 = ignore sentiment entirely, 1 = a fully-positive/negative recent
    # sentiment window can double/zero the trend's slope).
    prediction_sentiment_weight: float = 0.5
    prediction_horizon_points: int = 12
    prediction_lookback_points: int = 30
    prediction_sentiment_lookback_hours: int = 24

    # Included in every user's portfolio automatically, and scraped from
    # app startup regardless of whether any user has requested them yet.
    default_symbols: list[str] = ["GOLD_10G", "SILVER_1KG"]

    # Every distinct symbol gets two permanent background threads (price +
    # sentiment), each polling forever. Cap how many distinct symbols the
    # whole app will ever track at once, as a resource-exhaustion backstop.
    max_tracked_symbols: int = 200

    # Session tokens (JWT). CHANGE THIS via env var for any non-local
    # deployment — anyone who knows the secret can forge valid login tokens
    # for any user. Generate one with: python -c "import secrets; print(secrets.token_hex(32))"
    jwt_secret_key: str = "insecure-dev-secret-change-me"
    jwt_expire_minutes: int = 60 * 24 * 30  # 30 days — no refresh-token flow, so this is the full session length

    # Hugging Face Inference API (serverless, free tier) — replaces the
    # local-only Ollama/Qwen setup so this backend can run on free hosting
    # that has no GPU and no room for a multi-GB local model. Needs a free
    # token from https://huggingface.co/settings/tokens (read access is
    # enough); without one every call 401s and falls back to the keyword
    # scorer / a "summary unavailable" response.
    hf_api_token: str = ""
    hf_sentiment_model: str = "ProsusAI/finbert"
    hf_summary_model: str = "facebook/bart-large-cnn"
    hf_timeout_seconds: float = 30.0

    log_level: str = "INFO"

    class Config:
        env_file = ".env"


settings = Settings()
