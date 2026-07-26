import logging
import time
from typing import Union

import requests

from app.config import settings

logger = logging.getLogger(__name__)

HF_ROUTER = "https://router.huggingface.co/hf-inference/models"


class HFUnavailable(Exception):
    pass


def hf_infer(model_id: str, payload: dict, retries: int = 2) -> Union[dict, list]:
    """POST to the Hugging Face serverless Inference API for `model_id`.

    Free-tier serverless models are unloaded when idle: the first request
    after a quiet period returns 503 with an `estimated_time` while HF spins
    the model up, so this retries a couple of times on a 503 (waiting the
    time HF actually reports, capped) before giving up. Raises HFUnavailable
    on missing token, auth failure, timeout, or exhausted retries — callers
    are expected to fall back to something else rather than propagate this.
    """
    if not settings.hf_api_token:
        raise HFUnavailable(
            "HF_API_TOKEN is not set — get a free token at "
            "https://huggingface.co/settings/tokens and set it in .env"
        )

    headers = {"Authorization": f"Bearer {settings.hf_api_token}"}
    url = f"{HF_ROUTER}/{model_id}"

    last_error = None
    for attempt in range(retries + 1):
        try:
            resp = requests.post(url, headers=headers, json=payload, timeout=settings.hf_timeout_seconds)
        except requests.RequestException as e:
            raise HFUnavailable(f"Request to {model_id} failed: {e}") from e

        if resp.status_code == 200:
            return resp.json()

        if resp.status_code == 503 and attempt < retries:
            wait = min(resp.json().get("estimated_time", 5), 20)
            logger.info("%s is cold-starting on HF, waiting %.1fs (attempt %d)", model_id, wait, attempt + 1)
            time.sleep(wait)
            continue

        if resp.status_code == 401:
            raise HFUnavailable(f"HF_API_TOKEN was rejected (401) for {model_id}")

        last_error = f"{resp.status_code}: {resp.text[:200]}"

    raise HFUnavailable(f"HF inference for {model_id} failed: {last_error}")
