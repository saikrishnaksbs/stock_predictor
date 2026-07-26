FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Playwright's pip package is just the driver — the browser binary and its
# OS-level libraries (fonts, codecs, etc.) still need a separate install step,
# needed for the on-demand article full-text fetch (app/article_fetcher.py).
RUN playwright install --with-deps chromium

COPY app ./app

EXPOSE 8000
# Shell form (not exec array) so $PORT actually expands — Render assigns its
# own port via this env var and requires the app to bind to it; falls back to
# 8000 for local/docker-compose use where PORT is unset.
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
