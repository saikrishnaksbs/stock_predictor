import argparse
import time

from db import init_db, get_conn, has_seen, insert_article, get_interval_history
from sentiment import score_text
from fetchers import fetch_google_news_rss, fetch_duckduckgo_news, fetch_google_search_playwright

INTERVAL_SECONDS = 10 * 60  # 10-minute buckets


def floor_to_interval(ts: int, interval_seconds: int = INTERVAL_SECONDS) -> int:
    return (ts // interval_seconds) * interval_seconds


def collect_all(query: str):
    all_items = []
    for fetcher in (fetch_google_news_rss, fetch_duckduckgo_news, fetch_google_search_playwright):
        try:
            items = fetcher(query)
            all_items.extend(items)
        except Exception as e:
            print(f"[warn] {fetcher.__name__} failed: {e}")
    return all_items


def run_once(stock: str, db_path: str = "sentiment.db"):
    init_db(db_path)
    now = int(time.time())
    items = collect_all(stock)

    new_count = 0
    skipped_count = 0

    with get_conn(db_path) as conn:
        for item in items:
            if has_seen(conn, stock, item["dedup_key"]):
                skipped_count += 1
                continue

            published_ts = item["published_ts"] or now
            # Bucket by the article's own published time, not fetch time,
            # so old news re-surfacing doesn't land in "now"'s bucket.
            interval_start = floor_to_interval(published_ts)
            score = score_text(item["title"])

            insert_article(
                conn,
                stock=stock,
                dedup_key=item["dedup_key"],
                url=item["url"],
                title=item["title"],
                source=item["source"],
                published_ts=published_ts,
                fetched_ts=now,
                sentiment_score=score,
                interval_start=interval_start,
            )
            new_count += 1

    print(f"[{stock}] fetched={len(items)} new={new_count} duplicates_skipped={skipped_count}")
    return new_count, skipped_count


def poll_forever(stock: str, poll_seconds: int = 300, db_path: str = "sentiment.db"):
    while True:
        run_once(stock, db_path)
        time.sleep(poll_seconds)


def print_history(stock: str, db_path: str = "sentiment.db"):
    init_db(db_path)
    with get_conn(db_path) as conn:
        rows = get_interval_history(conn, stock)
    print(f"\nInterval sentiment history for '{stock}' ({INTERVAL_SECONDS // 60}-min buckets):")
    for interval_start, sentiment_count, article_count in rows:
        ts_str = time.strftime("%Y-%m-%d %H:%M", time.localtime(interval_start))
        print(f"  {ts_str}  sentiment={sentiment_count:+d}  articles={article_count}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Poll news sources and track stock sentiment over time.")
    parser.add_argument("stock", help="Stock/company name to search for, e.g. 'Tata Motors'")
    parser.add_argument("--once", action="store_true", help="Run a single fetch pass and exit")
    parser.add_argument("--poll-seconds", type=int, default=300, help="Seconds between polls in continuous mode")
    parser.add_argument("--history", action="store_true", help="Print interval sentiment history and exit")
    parser.add_argument("--db", default="sentiment.db", help="Path to SQLite DB file")
    args = parser.parse_args()

    if args.history:
        print_history(args.stock, args.db)
    elif args.once:
        run_once(args.stock, args.db)
        print_history(args.stock, args.db)
    else:
        poll_forever(args.stock, args.poll_seconds, args.db)
