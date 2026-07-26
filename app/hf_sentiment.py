import logging

from app.config import settings
from app.hf_client import hf_infer, HFUnavailable
from app.sentiment_analysis import score_text as score_text_keyword

logger = logging.getLogger(__name__)

_LABEL_TO_SCORE = {"positive": 1, "negative": -1, "neutral": 0}


def score_text_hf(text: str) -> int:
    """Classify a headline's sentiment with FinBERT (finance-tuned BERT)
    via the Hugging Face Inference API.

    Falls back to the keyword scorer (app/sentiment_analysis.py) on any
    failure — no token, rate limit, cold-start timeout, malformed response —
    so a flaky free-tier API call never stalls the scraper thread or drops
    sentiment coverage to zero.
    """
    try:
        result = hf_infer(settings.hf_sentiment_model, {"inputs": text})
        # FinBERT's response shape: [[{"label": "positive", "score": 0.98}, ...]]
        scores = result[0] if isinstance(result, list) and result and isinstance(result[0], list) else result
        best = max(scores, key=lambda s: s["score"])
        return _LABEL_TO_SCORE[best["label"].lower()]
    except (HFUnavailable, KeyError, IndexError, TypeError) as e:
        logger.warning("HF sentiment scoring failed (%s), falling back to keyword scorer", e)
        return score_text_keyword(text)
