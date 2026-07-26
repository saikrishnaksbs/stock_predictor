import logging

import requests
from rapidfuzz import fuzz, process

from app.data_source import SYMBOL_ALIASES

logger = logging.getLogger(__name__)

YAHOO_SEARCH_URL = "https://query1.finance.yahoo.com/v1/finance/search"
_HEADERS = {"User-Agent": "Mozilla/5.0"}

# Indian-exchange codes get boosted to the top of Yahoo's results, since this
# app is India-focused and Yahoo's own ranking mixes in US/global listings.
_INDIAN_EXCHANGES = {"NSI", "BSE"}

# A small curated fallback list: our synthetic commodity aliases (which Yahoo
# has no knowledge of) plus enough well-known NSE names that fuzzy search
# still works for typos or when Yahoo's search API is unreachable.
LOCAL_SYMBOLS = [
    {"symbol": sym, "name": meta["name"], "exchange": "NSE (derived)"}
    for sym, meta in SYMBOL_ALIASES.items()
] + [
    {"symbol": "TCS.NS", "name": "Tata Consultancy Services", "exchange": "NSE"},
    {"symbol": "RELIANCE.NS", "name": "Reliance Industries", "exchange": "NSE"},
    {"symbol": "INFY.NS", "name": "Infosys", "exchange": "NSE"},
    {"symbol": "HDFCBANK.NS", "name": "HDFC Bank", "exchange": "NSE"},
    {"symbol": "ICICIBANK.NS", "name": "ICICI Bank", "exchange": "NSE"},
    {"symbol": "SBIN.NS", "name": "State Bank of India", "exchange": "NSE"},
    {"symbol": "HINDUNILVR.NS", "name": "Hindustan Unilever", "exchange": "NSE"},
    {"symbol": "ITC.NS", "name": "ITC Limited", "exchange": "NSE"},
    {"symbol": "BHARTIARTL.NS", "name": "Bharti Airtel", "exchange": "NSE"},
    {"symbol": "LT.NS", "name": "Larsen & Toubro", "exchange": "NSE"},
    {"symbol": "TATAMOTORS.NS", "name": "Tata Motors", "exchange": "NSE"},
    {"symbol": "TATASTEEL.NS", "name": "Tata Steel", "exchange": "NSE"},
    {"symbol": "MARUTI.NS", "name": "Maruti Suzuki", "exchange": "NSE"},
    {"symbol": "SUNPHARMA.NS", "name": "Sun Pharmaceutical", "exchange": "NSE"},
    {"symbol": "WIPRO.NS", "name": "Wipro", "exchange": "NSE"},
    {"symbol": "COALINDIA.NS", "name": "Coal India", "exchange": "NSE"},
    {"symbol": "ONGC.NS", "name": "Oil and Natural Gas Corporation", "exchange": "NSE"},
    {"symbol": "ADANIENT.NS", "name": "Adani Enterprises", "exchange": "NSE"},
    {"symbol": "ZOMATO.NS", "name": "Zomato", "exchange": "NSE"},
    {"symbol": "DIXON.NS", "name": "Dixon Technologies", "exchange": "NSE"},
]


def _search_yahoo(query: str, limit: int) -> list[dict]:
    try:
        resp = requests.get(
            YAHOO_SEARCH_URL,
            params={"q": query, "quotesCount": limit, "newsCount": 0},
            headers=_HEADERS,
            timeout=4,
        )
        resp.raise_for_status()
        quotes = resp.json().get("quotes", [])
    except Exception as e:
        logger.warning("Yahoo symbol search failed for %r: %s", query, e)
        return []

    results = []
    for q in quotes:
        symbol = q.get("symbol")
        if not symbol:
            continue
        results.append({
            "symbol": symbol,
            "name": q.get("shortname") or q.get("longname"),
            "exchange": q.get("exchange"),
        })

    # Indian listings first, preserving Yahoo's relative order within each group.
    results.sort(key=lambda r: 0 if r["exchange"] in _INDIAN_EXCHANGES else 1)
    return results


def _search_local(query: str, limit: int) -> list[dict]:
    if len(query) < 3:
        return []  # too short for partial_ratio to mean anything; avoids 1-char noise matches
    choices = {f"{s['symbol']} {s['name']}": s for s in LOCAL_SYMBOLS}
    matches = process.extract(query, choices.keys(), scorer=fuzz.partial_ratio, limit=limit, score_cutoff=65)
    return [choices[key] for key, _score, _idx in matches]


def search_symbols(query: str, limit: int = 8) -> list[dict]:
    """Search for stock symbols by name or ticker. Combines a live Yahoo
    Finance lookup (the closest thing to "all stocks" without a paid data
    vendor) with fuzzy matching over a small local list, so typos and our
    own synthetic gold/silver symbols are still found even if Yahoo's search
    doesn't know about them or is unreachable."""
    query = query.strip()
    if not query:
        return []

    # Local matches (our gold/silver aliases + curated Indian majors) surface
    # first — they're the most relevant for this app even when Yahoo's global
    # index also has hits for the same query (e.g. "gold" pulling up US ETFs).
    combined = _search_local(query, limit) + _search_yahoo(query, limit)

    seen = set()
    deduped = []
    for item in combined:
        if item["symbol"] in seen:
            continue
        seen.add(item["symbol"])
        deduped.append(item)

    return deduped[:limit]
