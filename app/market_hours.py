"""Market hours filtering for IST timezone."""
import datetime as dt
from typing import Optional

MAX_ARTICLE_AGE_DAYS = 3


def is_market_hours(
    published_at: Optional[dt.datetime],
    user_timezone: str = "Asia/Kolkata",
    max_age_days: int = MAX_ARTICLE_AGE_DAYS,
) -> bool:
    """
    Check if an article was published during Indian market hours.

    Market hours: 9:30 AM to 4:00 PM IST, Monday-Friday.
    Also includes articles published Friday 4:00+ PM through Monday 9:29 AM.

    Articles older than `max_age_days` are always excluded, regardless of
    which weekday/time they happen to fall on — the weekday+time check alone
    can't distinguish this Friday's 2pm article from one from 2024, since it
    only looks at time-of-day and day-of-week, not the actual date.
    """
    if not published_at:
        return True  # If no publish time, include it

    # Convert to IST if needed (assume published_at is UTC)
    import pytz
    ist = pytz.timezone("Asia/Kolkata")

    # If published_at is naive, assume UTC
    if published_at.tzinfo is None:
        published_at = pytz.utc.localize(published_at)
    elif published_at.tzinfo != ist:
        published_at = published_at.astimezone(ist)

    cutoff = dt.datetime.now(pytz.utc) - dt.timedelta(days=max_age_days)
    if published_at < cutoff:
        return False

    weekday = published_at.weekday()  # 0=Monday, 4=Friday, 5=Saturday, 6=Sunday
    hour = published_at.hour
    minute = published_at.minute
    time_minutes = hour * 60 + minute

    market_open = 9 * 60 + 30  # 9:30 AM
    market_close = 16 * 60  # 4:00 PM (16:00)

    # Monday to Thursday: 9:30 AM - 4:00 PM
    if 0 <= weekday <= 3:
        return market_open <= time_minutes < market_close

    # Friday: 9:30 AM - 4:00 PM, plus 4:00 PM onwards
    if weekday == 4:
        return time_minutes >= market_open

    # Saturday: only if it's after Friday's close (check day before)
    # Sunday through Monday 9:29 AM
    if weekday == 5 or weekday == 6:
        # Weekend: include if published before Monday 9:30 AM
        # This handles Friday 4:00+ PM through Sunday
        return False

    # Monday morning before 9:30 AM: only if published Friday 4:00+ PM or later
    if weekday == 0 and time_minutes < market_open:
        return True

    return False


def filter_articles_by_market_hours(articles: list, user_timezone: str = "Asia/Kolkata") -> list:
    """Filter articles to only show those published during market hours."""
    return [a for a in articles if is_market_hours(a.get("published_at"), user_timezone)]
