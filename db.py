import sqlite3
from contextlib import contextmanager

DB_PATH = "sentiment.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock TEXT NOT NULL,
    dedup_key TEXT NOT NULL,
    url TEXT,
    title TEXT NOT NULL,
    source TEXT NOT NULL,
    published_ts INTEGER,
    fetched_ts INTEGER NOT NULL,
    sentiment_score INTEGER NOT NULL,
    interval_start INTEGER NOT NULL,
    UNIQUE(stock, dedup_key)
);

CREATE TABLE IF NOT EXISTS interval_sentiment (
    stock TEXT NOT NULL,
    interval_start INTEGER NOT NULL,
    sentiment_count INTEGER NOT NULL DEFAULT 0,
    article_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (stock, interval_start)
);
"""


@contextmanager
def get_conn(db_path: str = DB_PATH):
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db(db_path: str = DB_PATH):
    with get_conn(db_path) as conn:
        conn.executescript(SCHEMA)


def has_seen(conn, stock: str, dedup_key: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM articles WHERE stock = ? AND dedup_key = ?",
        (stock, dedup_key),
    ).fetchone()
    return row is not None


def insert_article(conn, stock, dedup_key, url, title, source,
                    published_ts, fetched_ts, sentiment_score, interval_start):
    conn.execute(
        """INSERT OR IGNORE INTO articles
           (stock, dedup_key, url, title, source, published_ts, fetched_ts,
            sentiment_score, interval_start)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (stock, dedup_key, url, title, source, published_ts, fetched_ts,
         sentiment_score, interval_start),
    )

    conn.execute(
        """INSERT INTO interval_sentiment (stock, interval_start, sentiment_count, article_count)
           VALUES (?, ?, ?, 1)
           ON CONFLICT(stock, interval_start) DO UPDATE SET
               sentiment_count = sentiment_count + excluded.sentiment_count,
               article_count = article_count + 1""",
        (stock, interval_start, sentiment_score),
    )


def get_interval_history(conn, stock: str):
    return conn.execute(
        """SELECT interval_start, sentiment_count, article_count
           FROM interval_sentiment WHERE stock = ? ORDER BY interval_start""",
        (stock,),
    ).fetchall()
