import hashlib
import logging
import urllib.parse
from calendar import timegm
from datetime import datetime, timezone

import feedparser

logger = logging.getLogger(__name__)


def _dedup_key(title: str, url: str) -> str:
    basis = (url or title).strip().lower()
    return hashlib.sha256(basis.encode("utf-8")).hexdigest()


def fetch_news(query: str, limit: int = 50) -> list[dict]:
    """Fetch recent news headlines for `query` from Google News RSS."""
    encoded = urllib.parse.quote(query)
    url = f"https://news.google.com/rss/search?q={encoded}&hl=en-IN&gl=IN&ceid=IN:en"
    try:
        feed = feedparser.parse(url)
    except Exception as e:
        logger.warning("News fetch failed for %r: %s", query, e)
        return []

    items = []
    for entry in feed.entries[:limit]:
        title = entry.get("title", "").strip()
        link = entry.get("link", "")
        if not title:
            continue
        source = entry.get("source", {}).get("title") if entry.get("source") else "Google News"

        published_at = None
        if entry.get("published_parsed"):
            published_at = datetime.fromtimestamp(timegm(entry["published_parsed"]), tz=timezone.utc)

        items.append({
            "title": title,
            "url": link,
            "source": source or "Google News",
            "published_at": published_at,
            "dedup_key": _dedup_key(title, link),
        })
    return items
