import logging
import threading
import time

import yfinance as yf

logger = logging.getLogger(__name__)

_CACHE_TTL_SECONDS = 300
_cache: dict[str, tuple[float, float]] = {}  # currency -> (rate_to_inr, fetched_at)
_lock = threading.Lock()


def get_rate_to_inr(currency: str) -> float:
    """Return the multiplier to convert 1 unit of `currency` into INR.
    Cached for a few minutes so every stock scrape doesn't re-fetch FX."""
    currency = currency.upper()
    if currency == "INR":
        return 1.0

    now = time.time()
    with _lock:
        cached = _cache.get(currency)
        if cached and (now - cached[1]) < _CACHE_TTL_SECONDS:
            return cached[0]

    pair = f"{currency}INR=X"
    try:
        fast_info = yf.Ticker(pair).fast_info
        rate = float(fast_info["lastPrice"])
    except Exception as e:
        logger.warning("Could not fetch FX rate for %s, falling back to cached/1.0: %s", pair, e)
        with _lock:
            cached = _cache.get(currency)
        return cached[0] if cached else 1.0

    with _lock:
        _cache[currency] = (rate, now)
    return rate
