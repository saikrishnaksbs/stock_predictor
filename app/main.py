import datetime as dt
import json
import logging
from contextlib import asynccontextmanager
from typing import Optional

from bson import ObjectId
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pymongo.errors import DuplicateKeyError

from app.article_fetcher import fetch_full_text
from app.auth import create_access_token, get_current_user_id, hash_password, verify_password
from app.config import settings
from app.data_source import SYMBOL_ALIASES
from app.hf_summarize import summarize_text_hf
from app.mongo import init_indexes_and_collections, portfolio, sentiment_scores, stock_prices, users, wishlist
from app.prediction import predict_price_curve
from app.scraper import scraper_manager
from app.schemas import (
    UserCreate, UserLogin, UserOut, TokenOut, PortfolioCreate, PortfolioOut, StockOut, StockTimeSeriesOut,
    PricePoint, SymbolSuggestion, WishlistOut, SentimentOut, SentimentArticle, PredictionOut, ArticleFullText,
    ArticleSummary,
)
from app.sentiment_scraper import scan_and_score, sentiment_scraper_manager
from app.symbol_search import search_symbols

logging.basicConfig(level=settings.log_level)
logger = logging.getLogger(__name__)

DEFAULT_SYMBOL_NAMES = {
    "GC=F": "Gold Futures",
    "SI=F": "Silver Futures",
    **{sym: meta["name"] for sym, meta in SYMBOL_ALIASES.items()},
}


def user_out(doc: dict) -> UserOut:
    return UserOut(id=str(doc["_id"]), username=doc["username"], email=doc["email"], created_at=doc["created_at"])


def issue_token(doc: dict) -> TokenOut:
    return TokenOut(access_token=create_access_token(str(doc["_id"])), user=user_out(doc))


def news_query_for(symbol: str, name: Optional[str]) -> str:
    """What to search news for — prefer the human name (better recall than a
    raw ticker), falling back to the symbol with its exchange suffix stripped."""
    if name:
        return name
    return symbol.split(".")[0].replace("_", " ")


def resolve_news_query(symbol: str) -> str:
    """Same preference order as news_query_for, but for endpoints that only
    have a bare symbol (no portfolio-add context to carry a name along)."""
    name = DEFAULT_SYMBOL_NAMES.get(symbol)
    if not name:
        doc = portfolio.find_one({"symbol": symbol, "name": {"$ne": None}})
        name = doc.get("name") if doc else None
    return news_query_for(symbol, name)


def _json_default(value):
    if isinstance(value, dt.datetime):
        return value.isoformat()
    return str(value)


def ensure_symbol_tracked(symbol: str, name: Optional[str]):
    """Start (or confirm already-running) price + sentiment scraper threads
    for `symbol`, subject to the app-wide symbol cap. Shared by both the
    portfolio and the wishlist — a bookmarked stock gets the same live
    price/sentiment data as one actually added to the portfolio, so the
    dashboard can show real detail cards for it, not just a name."""
    if symbol not in scraper_manager.tracked_symbols():
        if len(scraper_manager.tracked_symbols()) >= settings.max_tracked_symbols:
            raise HTTPException(
                429,
                f"This app is already tracking the max of {settings.max_tracked_symbols} distinct "
                f"symbols. '{symbol}' isn't one of them — remove an unused one first.",
            )
    scraper_manager.ensure_started(symbol)
    sentiment_scraper_manager.ensure_started(symbol, news_query_for(symbol, name))


def add_to_portfolio(user_id: ObjectId, symbol: str) -> StockOut:
    name = DEFAULT_SYMBOL_NAMES.get(symbol)
    ensure_symbol_tracked(symbol, name)
    portfolio.update_one(
        {"user_id": user_id, "symbol": symbol},
        {"$setOnInsert": {"name": name, "added_at": dt.datetime.now(dt.timezone.utc)}},
        upsert=True,
    )
    return StockOut(symbol=symbol, name=name)


def add_to_wishlist(user_id: ObjectId, symbol: str, name: Optional[str], exchange: Optional[str]):
    ensure_symbol_tracked(symbol, name)
    wishlist.update_one(
        {"user_id": user_id, "symbol": symbol},
        {"$setOnInsert": {"name": name, "exchange": exchange, "added_at": dt.datetime.now(dt.timezone.utc)}},
        upsert=True,
    )


def get_wishlist(user_id: ObjectId) -> list[StockOut]:
    return [StockOut(symbol=d["symbol"], name=d.get("name")) for d in wishlist.find({"user_id": user_id})]


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_indexes_and_collections()

    # Gold/silver scrape from the moment the app is up, independent of any
    # user's portfolio, so data is already accumulating by the time anyone asks.
    for symbol in settings.default_symbols:
        scraper_manager.ensure_started(symbol)
        sentiment_scraper_manager.ensure_started(symbol, news_query_for(symbol, DEFAULT_SYMBOL_NAMES.get(symbol)))

    logger.info("Startup complete")
    yield
    logger.info("Shutting down scraper threads...")
    scraper_manager.stop_all()
    sentiment_scraper_manager.stop_all()


app = FastAPI(title="Stock Portfolio Service", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------
# Auth — password-based. Every endpoint below that touches a specific
# user's data uses get_current_user_id (verifies the bearer token) instead
# of trusting a client-supplied user_id, so a valid session can only ever
# act on its own account.
# --------------------------------------------------------------------------
@app.post("/users", response_model=TokenOut, status_code=201)
def create_user(payload: UserCreate):
    doc = {
        "username": payload.username,
        "email": payload.email,
        "password_hash": hash_password(payload.password),
        "created_at": dt.datetime.now(dt.timezone.utc),
    }
    try:
        result = users.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(409, "Username or email already exists")
    doc["_id"] = result.inserted_id

    # Every new user starts with gold and silver already in their portfolio.
    for symbol in settings.default_symbols:
        add_to_portfolio(doc["_id"], symbol)

    return issue_token(doc)


@app.post("/auth/login", response_model=TokenOut)
def login(payload: UserLogin):
    doc = users.find_one({"$or": [{"username": payload.username_or_email}, {"email": payload.username_or_email}]})
    if not doc or not doc.get("password_hash") or not verify_password(payload.password, doc["password_hash"]):
        raise HTTPException(401, "Incorrect username/email or password")
    return issue_token(doc)


@app.get("/users/me", response_model=UserOut)
def get_me(user_id: ObjectId = Depends(get_current_user_id)):
    doc = users.find_one({"_id": user_id})
    if not doc:
        raise HTTPException(404, "User not found")
    return user_out(doc)


# --------------------------------------------------------------------------
# Portfolio
# --------------------------------------------------------------------------
@app.post("/portfolio", response_model=PortfolioOut, status_code=201)
def create_or_update_portfolio(payload: PortfolioCreate, user_id: ObjectId = Depends(get_current_user_id)):
    """Attach the given stock symbols to the authenticated user's portfolio
    and make sure each one has a live scraper thread running."""
    requested = [s.strip().upper() for s in payload.symbols if s.strip()]
    # Gold and silver are always included, even if the caller didn't ask for them.
    all_symbols = list(dict.fromkeys(settings.default_symbols + requested))

    stocks_out = [add_to_portfolio(user_id, symbol) for symbol in all_symbols]

    return PortfolioOut(user_id=str(user_id), stocks=stocks_out, wishlist=get_wishlist(user_id))


@app.get("/portfolio", response_model=PortfolioOut)
def get_portfolio(user_id: ObjectId = Depends(get_current_user_id)):
    stocks = [StockOut(symbol=d["symbol"], name=d.get("name")) for d in portfolio.find({"user_id": user_id})]
    return PortfolioOut(user_id=str(user_id), stocks=stocks, wishlist=get_wishlist(user_id))


# --------------------------------------------------------------------------
# Wishlist — every stock a user has searched for gets remembered here,
# surfaced back to them on every portfolio/wishlist fetch.
# --------------------------------------------------------------------------
@app.get("/wishlist", response_model=WishlistOut)
def get_user_wishlist(user_id: ObjectId = Depends(get_current_user_id)):
    return WishlistOut(user_id=str(user_id), wishlist=get_wishlist(user_id))


# --------------------------------------------------------------------------
# Symbol search (typeahead for "what stock did they mean") — searching
# automatically wishlists the top match for the authenticated user.
# --------------------------------------------------------------------------
@app.get("/symbols/search", response_model=list[SymbolSuggestion])
def symbol_search(
    q: str = Query(min_length=1),
    limit: int = Query(default=8, le=20),
    user_id: ObjectId = Depends(get_current_user_id),
):
    results = search_symbols(q, limit)
    if results:
        top = results[0]
        add_to_wishlist(user_id, top["symbol"], top.get("name"), top.get("exchange"))
    return results


# --------------------------------------------------------------------------
# Stock time-series — not user-scoped (a symbol's price history isn't
# private data), no auth required.
# --------------------------------------------------------------------------
@app.get("/stocks/{symbol}/timeseries", response_model=StockTimeSeriesOut)
def get_stock_timeseries(symbol: str, limit: int = Query(default=1000, le=10000)):
    """Return all recorded time-series data points for a stock symbol,
    most recent first."""
    symbol = symbol.strip().upper()
    rows = list(stock_prices.find({"symbol": symbol}).sort("time", -1).limit(limit))

    if not rows:
        raise HTTPException(404, f"No time-series data yet for {symbol}")

    return StockTimeSeriesOut(
        symbol=symbol,
        count=len(rows),
        data=[PricePoint(**r) for r in rows],
    )


# --------------------------------------------------------------------------
# Sentiment — also not user-scoped.
# --------------------------------------------------------------------------
@app.get("/stocks/{symbol}/sentiment", response_model=SentimentOut)
def get_stock_sentiment(symbol: str, limit: int = Query(default=50, le=500)):
    """Recent news-derived sentiment for a symbol: each article's own score,
    plus the running average. A headline that keeps resurfacing across scrapes
    is only counted once (see sentiment_scraper.py's dedup)."""
    symbol = symbol.strip().upper()
    rows = list(sentiment_scores.find({"symbol": symbol}).sort("time", -1).limit(limit))

    avg_score = sum(r["score"] for r in rows) / len(rows) if rows else 0.0
    return SentimentOut(
        symbol=symbol,
        avg_score=avg_score,
        article_count=len(rows),
        articles=[SentimentArticle(**r) for r in rows],
    )


# --------------------------------------------------------------------------
# Prediction — heuristic, not a trained model. See app/prediction.py.
# --------------------------------------------------------------------------
@app.get("/stocks/{symbol}/prediction", response_model=PredictionOut)
def get_stock_prediction(symbol: str):
    symbol = symbol.strip().upper()
    return PredictionOut(**predict_price_curve(symbol))


# --------------------------------------------------------------------------
# On-demand sentiment scan, streamed via Server-Sent Events: fetches up to
# `news_fetch_limit` (50) headlines in one RSS call, then scores and persists
# them ONE AT A TIME through the LLM, pushing each result to the client the
# moment it's ready — instead of the client waiting ~5-9s for a full batch of
# 15-50 articles to finish before seeing anything. The background scraper
# thread (sentiment_scraper.py) already does this same one-at-a-time
# fetch->score->persist internally on its own 10-min cadence; this endpoint
# just also streams the results out live for whoever's watching a chart.
# --------------------------------------------------------------------------
@app.get("/stocks/{symbol}/sentiment/scan")
def scan_stock_sentiment(symbol: str):
    symbol = symbol.strip().upper()
    query = resolve_news_query(symbol)

    def event_stream():
        count = 0
        try:
            for doc in scan_and_score(symbol, query):
                count += 1
                payload = {k: v for k, v in doc.items() if k != "_id"}
                yield f"data: {json.dumps(payload, default=_json_default)}\n\n"
        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
        yield f"event: done\ndata: {json.dumps({'new_count': count})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# --------------------------------------------------------------------------
# On-demand full article text — resolves the Google News redirect link and
# extracts the real page's main content. Not run in bulk (see article_fetcher.py
# for why): call this for one article the user actually wants to read.
# --------------------------------------------------------------------------
@app.get("/articles/full-text", response_model=ArticleFullText)
def get_article_full_text(url: str):
    return ArticleFullText(**fetch_full_text(url))


# --------------------------------------------------------------------------
# On-demand article summary — resolves + extracts the article (same as
# full-text above) then summarizes it via a Hugging Face summarization
# model (BART/FLAN-T5, see app/hf_summarize.py). Also on-demand, not bulk:
# it chains two slow external calls (a real page load + an HF inference
# call) per article.
# --------------------------------------------------------------------------
@app.get("/articles/summarize", response_model=ArticleSummary)
def get_article_summary(url: str):
    article = fetch_full_text(url)
    if not article["success"] or not article.get("text"):
        return ArticleSummary(url=url, success=False, error=article.get("error", "Could not extract article text"))
    result = summarize_text_hf(article["text"])
    return ArticleSummary(url=url, **result)


@app.get("/health")
def health():
    return {"status": "ok"}
