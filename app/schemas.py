import datetime as dt
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserLogin(BaseModel):
    username_or_email: str
    password: str


class UserOut(BaseModel):
    id: str
    username: str
    email: str
    created_at: dt.datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class PortfolioCreate(BaseModel):
    symbols: list[str] = Field(min_length=1)


class StockOut(BaseModel):
    symbol: str
    name: Optional[str] = None


class PortfolioOut(BaseModel):
    user_id: str
    stocks: list[StockOut]
    wishlist: list[StockOut] = []


class WishlistOut(BaseModel):
    user_id: str
    wishlist: list[StockOut]


class PricePoint(BaseModel):
    time: dt.datetime
    symbol: str
    price: float
    volume: Optional[int] = None
    open: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    source: str


class StockTimeSeriesOut(BaseModel):
    symbol: str
    count: int
    data: list[PricePoint]


class SymbolSuggestion(BaseModel):
    symbol: str
    name: Optional[str] = None
    exchange: Optional[str] = None


class SentimentArticle(BaseModel):
    time: dt.datetime  # when WE scraped it
    published_at: Optional[dt.datetime] = None  # when the article actually went live
    score: int
    title: str
    source: str
    url: Optional[str] = None


class SentimentOut(BaseModel):
    symbol: str
    avg_score: float
    article_count: int
    articles: list[SentimentArticle]


class ArticleFullText(BaseModel):
    url: str
    resolved_url: Optional[str] = None
    title: Optional[str] = None
    text: Optional[str] = None
    success: bool
    error: Optional[str] = None


class ArticleSummary(BaseModel):
    url: str
    summary: Optional[str] = None
    success: bool
    error: Optional[str] = None


class PredictedPoint(BaseModel):
    time: dt.datetime
    price: float


class SentimentSummary(BaseModel):
    avg_score: float
    article_count: int


class PredictionOut(BaseModel):
    symbol: str
    method: str
    trend_slope_per_point: float
    sentiment_adjusted_slope_per_point: Optional[float] = None
    sentiment: SentimentSummary
    predicted: list[PredictedPoint]
