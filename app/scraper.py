import logging
import threading

from app.config import settings
from app.data_source import fetch_latest_quote, QuoteUnavailable
from app.mongo import stock_prices

logger = logging.getLogger(__name__)


class StockScraperManager:
    """Owns exactly one background thread per stock symbol, regardless of how
    many users hold that symbol in their portfolio. Thread-safe start/stop.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._threads: dict[str, threading.Thread] = {}
        self._stop_events: dict[str, threading.Event] = {}

    def is_running(self, symbol: str) -> bool:
        with self._lock:
            t = self._threads.get(symbol)
            return t is not None and t.is_alive()

    def tracked_symbols(self) -> set[str]:
        with self._lock:
            return {s for s, t in self._threads.items() if t.is_alive()}

    def ensure_started(self, symbol: str):
        """Idempotent: starts a scraper thread for `symbol` if one isn't
        already running. Safe to call every time a user adds the stock."""
        with self._lock:
            existing = self._threads.get(symbol)
            if existing is not None and existing.is_alive():
                return

            stop_event = threading.Event()
            thread = threading.Thread(
                target=self._run,
                args=(symbol, stop_event),
                name=f"scraper-{symbol}",
                daemon=True,
            )
            self._stop_events[symbol] = stop_event
            self._threads[symbol] = thread
            thread.start()
            logger.info("Started scraper thread for %s", symbol)

    def stop(self, symbol: str):
        with self._lock:
            stop_event = self._stop_events.get(symbol)
            if stop_event:
                stop_event.set()

    def stop_all(self):
        with self._lock:
            symbols = list(self._stop_events.keys())
        for symbol in symbols:
            self.stop(symbol)
        for symbol in symbols:
            thread = self._threads.get(symbol)
            if thread:
                thread.join(timeout=5)

    def _run(self, symbol: str, stop_event: threading.Event):
        retries = 0
        while not stop_event.is_set():
            try:
                quote = fetch_latest_quote(symbol)
                self._persist(quote)
                retries = 0
            except QuoteUnavailable as e:
                retries += 1
                logger.warning("Scrape failed for %s (attempt %d): %s", symbol, retries, e)
                if retries >= settings.scrape_max_retries:
                    backoff = settings.scrape_retry_backoff_seconds * retries
                    logger.error(
                        "Giving up on %s for now after %d retries, backing off %.1fs",
                        symbol, retries, backoff,
                    )
                    stop_event.wait(backoff)
                    retries = 0
                    continue
            except Exception:
                logger.exception("Unexpected error scraping %s", symbol)

            stop_event.wait(settings.scrape_interval_seconds)

        logger.info("Scraper thread for %s stopped", symbol)

    @staticmethod
    def _persist(quote: dict):
        try:
            stock_prices.insert_one(quote)
        except Exception:
            logger.exception("Failed to persist quote for %s", quote.get("symbol"))


scraper_manager = StockScraperManager()
