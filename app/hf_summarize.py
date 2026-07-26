import logging

from app.config import settings
from app.hf_client import hf_infer, HFUnavailable

logger = logging.getLogger(__name__)

# BART-large-cnn's summarization was trained on ~1024-token inputs; longer
# articles get truncated rather than chunked+merged, which is simpler and
# fine for a "quick summary" feature (a full multi-chunk map-reduce summary
# is real added complexity for a marginal quality gain here).
_MAX_INPUT_CHARS = 4000


def summarize_text_hf(text: str) -> dict:
    """Summarize article text via a Hugging Face summarization model
    (default: facebook/bart-large-cnn; swap to google/flan-t5-base via
    HF_SUMMARY_MODEL if you'd rather have an instruction-tuned model that
    can also do things like 'summarize in 2 bullet points')."""
    truncated = text[:_MAX_INPUT_CHARS]
    is_flan = "flan-t5" in settings.hf_summary_model.lower()
    payload = (
        {"inputs": f"Summarize this news article:\n\n{truncated}"}
        if is_flan
        else {"inputs": truncated, "parameters": {"max_length": 130, "min_length": 30}}
    )

    try:
        result = hf_infer(settings.hf_summary_model, payload)
        item = result[0] if isinstance(result, list) else result
        summary = item.get("summary_text") or item.get("generated_text")
        if not summary:
            raise KeyError("no summary_text/generated_text in response")
        return {"summary": summary.strip(), "success": True, "error": None}
    except (HFUnavailable, KeyError, IndexError, TypeError) as e:
        logger.warning("HF summarization failed: %s", e)
        return {"summary": None, "success": False, "error": str(e)}
