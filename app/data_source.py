import datetime as dt
import logging

import yfinance as yf

from app.fx import get_rate_to_inr

logger = logging.getLogger(__name__)

# Synthetic symbols that don't exist on yfinance: each rides on a real
# ("base") ticker's quote, relabeled and rescaled to a unit Indian bullion
# markets actually quote in.
#
# Deliberately NOT using COMEX futures (GC=F/SI=F) here: those are the
# international/US spot price and only approximate the Indian price once
# converted at the FX rate — they exclude Indian import duty, AIDC, and GST,
# so they read noticeably different from what an Indian buyer actually pays.
# GoldBees/SilverBees are NSE-listed ETFs backed by physical bullion held in
# India, so their unit price already reflects the real domestic INR market.
SYMBOL_ALIASES = {
    # GOLDBEES: 1 unit ~= 1/100 gram of gold -> price/gram = unit_price * 100
    # "news_query" is what actually gets sent to news search — kept apart from
    # "name" (the UI label) because a bare commodity word like "Silver" pulls
    # in unrelated noise (e.g. Commonwealth Games medal reports).
    "GOLD_10G": {
        "base": "GOLDBEES.NS", "unit_factor": 1000,
        "name": "Gold (per 10g, NSE GoldBees)", "news_query": "gold price india",
    },
    "GOLD_1KG": {
        "base": "GOLDBEES.NS", "unit_factor": 100000,
        "name": "Gold (per 1kg, NSE GoldBees)", "news_query": "gold price india",
    },
    # SILVERBEES: 1 unit ~= 1 gram of silver -> price/gram = unit_price
    "SILVER_1KG": {
        "base": "SILVERBEES.NS", "unit_factor": 1000,
        "name": "Silver (per 1kg, NSE SilverBees)", "news_query": "silver price india",
    },
}


class QuoteUnavailable(Exception):
    pass


def _fetch_fast_info(ticker_symbol: str) -> dict:
    """Raises QuoteUnavailable if `ticker_symbol` has no live price on yfinance."""
    try:
        fast_info = yf.Ticker(ticker_symbol).fast_info
        price = fast_info.get("lastPrice") or fast_info.get("last_price")
    except Exception as e:
        raise QuoteUnavailable(f"Failed to fetch quote for {ticker_symbol}: {e}") from e
    if price is None:
        raise QuoteUnavailable(f"No last price for {ticker_symbol}")
    return fast_info


def fetch_latest_quote(symbol: str) -> dict:
    """Fetch the latest price snapshot for `symbol` via yfinance, converted
    to INR regardless of the instrument's native currency (NSE stocks are
    already INR and pass through at rate 1.0; USD-quoted instruments like
    GC=F/SI=F get multiplied by the live USDINR rate).

    `symbol` may be one of SYMBOL_ALIASES (e.g. "GOLD_10G") — in that case the
    quote is fetched from the alias's underlying yfinance ticker and rescaled
    to the alias's unit before being stored under the alias's own name.

    A bare symbol with no exchange suffix (e.g. "TCS" instead of "TCS.NS") is
    not resolvable on Yahoo Finance and would otherwise retry forever — as a
    convenience for this India-focused app, such symbols fall back to ".NS"
    before giving up.

    Raises QuoteUnavailable if no data could be retrieved, so the caller's
    retry logic can distinguish "network/API hiccup" from a working fetch.
    """
    alias = SYMBOL_ALIASES.get(symbol)
    fetch_symbol = alias["base"] if alias else symbol
    unit_factor = alias["unit_factor"] if alias else 1.0

    is_bare = alias is None and "." not in fetch_symbol and "=" not in fetch_symbol
    try:
        fast_info = _fetch_fast_info(fetch_symbol)
    except QuoteUnavailable:
        if not is_bare:
            raise
        fetch_symbol = f"{fetch_symbol}.NS"
        fast_info = _fetch_fast_info(fetch_symbol)  # let this one raise uncaught if it also fails

    price = fast_info.get("lastPrice") or fast_info.get("last_price")
    currency = fast_info.get("currency", "INR")
    rate = get_rate_to_inr(currency) * unit_factor

    def to_inr(value):
        return float(value) * rate if value else None

    return {
        "time": dt.datetime.now(dt.timezone.utc),
        "symbol": symbol,
        "price": to_inr(price),
        "volume": int(fast_info.get("lastVolume") or fast_info.get("last_volume") or 0) or None,
        "open": to_inr(fast_info.get("open")),
        "high": to_inr(fast_info.get("dayHigh") or fast_info.get("day_high")),
        "low": to_inr(fast_info.get("dayLow") or fast_info.get("day_low")),
        "source": "yfinance",
    }
