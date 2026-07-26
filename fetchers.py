import hashlib
import time
import urllib.parse
from calendar import timegm

import feedparser


def _dedup_key(title: str, url: str) -> str:
    basis = (url or title).strip().lower()
    return hashlib.sha256(basis.encode("utf-8")).hexdigest()


def fetch_google_news_rss(query: str, limit: int = 20):
    """Fetch recent news for `query` from Google News RSS."""
    encoded = urllib.parse.quote(query)
    url = f"https://news.google.com/rss/search?q={encoded}&hl=en-IN&gl=IN&ceid=IN:en"
    feed = feedparser.parse(url)
    items = []
    for entry in feed.entries[:limit]:
        title = entry.get("title", "").strip()
        link = entry.get("link", "")
        if hasattr(entry, "published_parsed") and entry.published_parsed:
            published_ts = timegm(entry.published_parsed)
        else:
            published_ts = None
        source = entry.get("source", {}).get("title") if entry.get("source") else "Google News"
        items.append({
            "title": title,
            "url": link,
            "source": source or "Google News",
            "published_ts": published_ts,
            "dedup_key": _dedup_key(title, link),
        })
    return items


def fetch_duckduckgo_news(query: str, limit: int = 20):
    """Fetch recent news for `query` via duckduckgo-search."""
    try:
        from ddgs import DDGS
    except ImportError:
        try:
            from duckduckgo_search import DDGS
        except ImportError:
            return []

    items = []
    with DDGS() as ddgs:
        for r in ddgs.news(query, max_results=limit):
            title = (r.get("title") or "").strip()
            url = r.get("url", "")
            date_str = r.get("date")
            published_ts = None
            if date_str:
                try:
                    published_ts = int(
                        time.mktime(time.strptime(date_str[:19], "%Y-%m-%dT%H:%M:%S"))
                    )
                except ValueError:
                    published_ts = None
            items.append({
                "title": title,
                "url": url,
                "source": r.get("source", "DuckDuckGo News"),
                "published_ts": published_ts,
                "dedup_key": _dedup_key(title, url),
            })
    return items


def fetch_google_search_playwright(query: str, limit: int = 10):
    """Scrape Google search results (News tab) via Playwright as a fallback source."""
    from playwright.sync_api import sync_playwright

    encoded = urllib.parse.quote(query)
    url = f"https://www.google.com/search?q={encoded}&tbm=nws"
    items = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(user_agent=(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
        ))
        page.goto(url, timeout=30000)
        page.wait_for_timeout(1500)
        cards = page.query_selector_all("div.SoaBEf, div.WlydOe")
        for card in cards[:limit]:
            try:
                title_el = card.query_selector("div[role='heading']") or card.query_selector("div.n0jPhd")
                link_el = card.query_selector("a")
                title = title_el.inner_text().strip() if title_el else ""
                link = link_el.get_attribute("href") if link_el else ""
                if not title or not link:
                    continue
                items.append({
                    "title": title,
                    "url": link,
                    "source": "Google Search (Playwright)",
                    "published_ts": None,
                    "dedup_key": _dedup_key(title, link),
                })
            except Exception:
                continue
        browser.close()
    return items
