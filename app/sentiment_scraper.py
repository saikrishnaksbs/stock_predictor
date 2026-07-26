import datetime as dt
import logging
import threading
from typing import Iterator

from pymongo.errors import DuplicateKeyError

from app.config import settings
from app.hf_sentiment import score_text_hf
from app.mongo import sentiment_articles_seen, sentiment_scores
from app.news_source import fetch_news

logger = logging.getLogger(__name__)


def scan_and_score(symbol: str, query: str) -> Iterator[dict]:
    """Fetch up to `settings.news_fetch_limit` headlines, then process them
    ONE AT A TIME: dedup-check -> score via FinBERT (Hugging Face) -> persist -> yield.

    Each article is scored and written to Mongo individually — not batched —
    so a caller streaming this generator to an HTTP response (see
    main.py's /sentiment/scan endpoint) can push each result to the client
    the moment it's ready, instead of waiting for all ~50 headlines to finish.
    Articles already seen for this symbol (same dedup_key) are skipped
    entirely: no re-score, no re-yield.
    """
    articles = fetch_news(query, limit=settings.news_fetch_limit)
    for article in articles:
        try:
            sentiment_articles_seen.insert_one({"symbol": symbol, "dedup_key": article["dedup_key"]})
        except DuplicateKeyError:
            continue  # already scored this exact article for this symbol

        score = score_text_hf(article["title"])
        doc = {
            "time": dt.datetime.now(dt.timezone.utc),  # when WE scraped it
            "published_at": article.get("published_at"),  # when the article actually went live
            "symbol": symbol,
            "score": score,
            "title": article["title"],
            "source": article["source"],
            "url": article["url"],
        }
        sentiment_scores.insert_one(doc)
        yield doc


class SentimentScraperManager:
    """One background thread per stock symbol, polling news headlines and
    scoring only the ones it hasn't seen before — a headline that keeps
    resurfacing across scrapes (same dedup_key) is never re-counted, so the
    sentiment tally only moves when genuinely new news appears."""

    def __init__(self):
        self._lock = threading.Lock()
        self._threads: dict[str, threading.Thread] = {}
        self._stop_events: dict[str, threading.Event] = {}

    def ensure_started(self, symbol: str, query: str):
        with self._lock:
            existing = self._threads.get(symbol)
            if existing is not None and existing.is_alive():
                return

            stop_event = threading.Event()
            thread = threading.Thread(
                target=self._run,
                args=(symbol, query, stop_event),
                name=f"sentiment-{symbol}",
                daemon=True,
            )
            self._stop_events[symbol] = stop_event
            self._threads[symbol] = thread
            thread.start()
            logger.info("Started sentiment scraper thread for %s (query=%r)", symbol, query)

    def stop_all(self):
        with self._lock:
            symbols = list(self._stop_events.keys())
        for symbol in symbols:
            self._stop_events[symbol].set()
        for symbol in symbols:
            thread = self._threads.get(symbol)
            if thread:
                thread.join(timeout=5)

    def _run(self, symbol: str, query: str, stop_event: threading.Event):
        while not stop_event.is_set():
            try:
                new_count = sum(1 for _ in scan_and_score(symbol, query))
                if new_count:
                    logger.info("Scored %d new article(s) for %s", new_count, symbol)
            except Exception:
                logger.exception("Unexpected error scraping sentiment for %s", symbol)
            stop_event.wait(settings.sentiment_interval_seconds)
        logger.info("Sentiment scraper thread for %s stopped", symbol)


sentiment_scraper_manager = SentimentScraperManager()
