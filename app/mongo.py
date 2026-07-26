import logging

from pymongo import ASCENDING, MongoClient
from pymongo.errors import CollectionInvalid

from app.config import settings

logger = logging.getLogger(__name__)

client = MongoClient(settings.mongo_uri)
db = client[settings.mongo_db_name]

users = db["users"]
portfolio = db["portfolio"]      # {user_id, symbol, name, added_at} — a user's held stocks
wishlist = db["wishlist"]        # {user_id, symbol, name, exchange, added_at} — stocks they've searched
stock_prices = db["stock_prices"]  # native Mongo time-series collection

# One row per new (deduped) news article: {time, symbol, score, title, source}
sentiment_scores = db["sentiment_scores"]  # native Mongo time-series collection
# Tracks which articles we've already scored, so a headline re-appearing in a
# later scrape (same dedup_key) doesn't get counted again.
sentiment_articles_seen = db["sentiment_articles_seen"]  # {symbol, dedup_key}


def init_indexes_and_collections():
    users.create_index([("username", ASCENDING)], unique=True)
    users.create_index([("email", ASCENDING)], unique=True)

    portfolio.create_index([("user_id", ASCENDING), ("symbol", ASCENDING)], unique=True)
    wishlist.create_index([("user_id", ASCENDING), ("symbol", ASCENDING)], unique=True)
    sentiment_articles_seen.create_index([("symbol", ASCENDING), ("dedup_key", ASCENDING)], unique=True)

    try:
        db.create_collection(
            "stock_prices",
            timeseries={"timeField": "time", "metaField": "symbol", "granularity": "seconds"},
        )
        logger.info("Created Mongo time-series collection 'stock_prices'")
    except CollectionInvalid:
        pass  # already exists

    try:
        db.create_collection(
            "sentiment_scores",
            timeseries={"timeField": "time", "metaField": "symbol", "granularity": "minutes"},
        )
        logger.info("Created Mongo time-series collection 'sentiment_scores'")
    except CollectionInvalid:
        pass  # already exists
