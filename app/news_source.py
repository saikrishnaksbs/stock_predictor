import hashlib
import logging
import urllib.parse
from calendar import timegm
from datetime import datetime, timedelta, timezone

import feedparser

logger = logging.getLogger(__name__)

MAX_ARTICLE_AGE_DAYS = 3


def _dedup_key(title: str, url: str) -> str:
    basis = (url or title).strip().lower()
    return hashlib.sha256(basis.encode("utf-8")).hexdigest()


def fetch_news(query: str, limit: int = 50, max_age_days: int = MAX_ARTICLE_AGE_DAYS) -> list[dict]:
    """Fetch recent news headlines for `query` from Google News RSS, restricted
    to India-region sources and the last `max_age_days` days.

    Google's own "when:Nd" search operator narrows the RSS feed itself (fewer
    stale hits to even parse), but it isn't a hard guarantee, so results are
    also filtered by parsed publish date and sorted newest-first here."""
    scoped_query = f"{query} when:{max_age_days}d"
    encoded = urllib.parse.quote(scoped_query)
    url = f"https://news.google.com/rss/search?q={encoded}&hl=en-IN&gl=IN&ceid=IN:en"
    try:
        feed = feedparser.parse(url)
    except Exception as e:
        logger.warning("News fetch failed for %r: %s", query, e)
        return []

    cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days)
    items = []
    for entry in feed.entries:
        title = entry.get("title", "").strip()
        link = entry.get("link", "")
        if not title:
            continue
        source = entry.get("source", {}).get("title") if entry.get("source") else "Google News"

        published_at = None
        if entry.get("published_parsed"):
            published_at = datetime.fromtimestamp(timegm(entry["published_parsed"]), tz=timezone.utc)

        # Drop anything older than the cutoff outright, and anything with no
        # parseable date at all — an undated hit can't be verified as recent.
        if published_at is None or published_at < cutoff:
            continue

        items.append({
            "title": title,
            "url": link,
            "source": source or "Google News",
            "published_at": published_at,
            "dedup_key": _dedup_key(title, link),
        })

    items.sort(key=lambda item: item["published_at"], reverse=True)
    return items[:limit]
