import datetime as dt

import numpy as np

from app.config import settings
from app.mongo import sentiment_scores, stock_prices


def get_sentiment_summary(symbol: str) -> dict:
    """Average article sentiment over the recent lookback window, plus how
    many articles fed into it (0 articles -> neutral, not "negative")."""
    since = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=settings.prediction_sentiment_lookback_hours)
    rows = list(sentiment_scores.find({"symbol": symbol, "time": {"$gte": since}}))
    if not rows:
        return {"avg_score": 0.0, "article_count": 0}
    avg = sum(r["score"] for r in rows) / len(rows)
    return {"avg_score": avg, "article_count": len(rows)}


def predict_price_curve(symbol: str) -> dict:
    """Heuristic price projection: fit a straight line through the recent
    price history, then bend that trend's slope by recent news sentiment.

    This is NOT a trained model — it's a transparent, explainable baseline
    (linear trend +/- a sentiment nudge) suitable for a demo dashboard, not
    a real forecasting signal. The response says so explicitly via `method`.
    """
    rows = list(
        stock_prices.find({"symbol": symbol}).sort("time", -1).limit(settings.prediction_lookback_points)
    )
    if len(rows) < 2:
        return {
            "symbol": symbol,
            "method": "insufficient-data",
            "trend_slope_per_point": 0.0,
            "sentiment": get_sentiment_summary(symbol),
            "predicted": [],
        }

    rows.sort(key=lambda r: r["time"])  # chronological
    prices = np.array([r["price"] for r in rows], dtype=float)
    x = np.arange(len(prices), dtype=float)

    slope, intercept = np.polyfit(x, prices, 1)
    last_price = float(prices[-1])

    # A least-squares fit over a genuinely-constant series (e.g. markets
    # closed, price hasn't ticked) still returns a nonzero slope of ~1e-12 —
    # floating-point residue from the solve, not a real trend. Left as-is,
    # that noise compounds over `prediction_horizon_points` steps until it
    # tips the final predicted price to a different float64 value than the
    # others, which reads as a huge jump once charted. Snap anything below
    # one-thousandth of a rupee-per-point to exactly zero.
    if abs(slope) < 1e-3:
        slope = 0.0

    sentiment = get_sentiment_summary(symbol)
    bias = 1.0 + settings.prediction_sentiment_weight * sentiment["avg_score"]
    adjusted_slope = slope * bias

    last_time = rows[-1]["time"]
    interval = dt.timedelta(seconds=settings.scrape_interval_seconds)

    predicted = []
    for step in range(1, settings.prediction_horizon_points + 1):
        predicted.append({
            "time": (last_time + interval * step).isoformat(),
            # Rounded to paise: these are currency values, not raw floats,
            # and rounding also guarantees a flat trend renders as bit-identical
            # numbers rather than accumulating its own float noise per step.
            "price": round(max(0.0, last_price + adjusted_slope * step), 2),
        })

    return {
        "symbol": symbol,
        "method": "linear-trend + sentiment-bias (heuristic, not a trained model)",
        "trend_slope_per_point": float(slope),
        "sentiment_adjusted_slope_per_point": float(adjusted_slope),
        "sentiment": sentiment,
        "predicted": predicted,
    }
