import ipaddress
import logging
import socket
from urllib.parse import urlparse

import trafilatura
from playwright.sync_api import sync_playwright

logger = logging.getLogger(__name__)


class UnsafeUrl(Exception):
    pass


def _assert_public_url(url: str):
    """Block SSRF: this endpoint takes a caller-supplied URL and has a real
    headless browser fetch it server-side. Without this check, anyone could
    pass url=http://host.docker.internal:11434/... or a cloud metadata
    endpoint (http://169.254.169.254/...) and get the response reflected
    back to them — the server has no other access control in front of it.
    Rejects anything that isn't http(s), or whose hostname resolves to a
    private/loopback/link-local/reserved address."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise UnsafeUrl(f"Unsupported scheme: {parsed.scheme!r}")
    if not parsed.hostname:
        raise UnsafeUrl("No hostname in URL")

    try:
        addrs = {info[4][0] for info in socket.getaddrinfo(parsed.hostname, None)}
    except socket.gaierror as e:
        raise UnsafeUrl(f"Could not resolve hostname: {e}") from e

    for addr in addrs:
        ip = ipaddress.ip_address(addr)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            raise UnsafeUrl(f"Refusing to fetch a non-public address ({addr})")


def fetch_full_text(url: str) -> dict:
    """Resolve a Google News redirect link to the real publisher URL and
    extract the article's main text.

    This is deliberately NOT run automatically for every scraped headline —
    it's a real browser page-load per call (slow), and many publishers
    paywall or block scrapers, so a meaningful fraction of calls will fail.
    Use it on-demand for one article at a time, not in bulk.
    """
    try:
        _assert_public_url(url)
    except UnsafeUrl as e:
        return {"url": url, "success": False, "error": str(e)}

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
            ))
            page.goto(url, timeout=20000, wait_until="domcontentloaded")
            page.wait_for_timeout(2000)
            resolved_url = page.url
            html = page.content()
            browser.close()
    except Exception as e:
        return {"url": url, "success": False, "error": f"Could not load page: {e}"}

    # The initial URL passed the public-address check, but Google News'
    # redirect could still land somewhere internal — check again post-nav
    # before returning any content extracted from the resolved page.
    try:
        _assert_public_url(resolved_url)
    except UnsafeUrl as e:
        return {"url": url, "resolved_url": resolved_url, "success": False, "error": str(e)}

    text = trafilatura.extract(html)
    title = trafilatura.extract_metadata(html).title if html else None

    if not text:
        return {
            "url": url,
            "resolved_url": resolved_url,
            "title": title,
            "success": False,
            "error": "Page loaded but no article text could be extracted (likely a paywall or non-article page)",
        }

    return {
        "url": url,
        "resolved_url": resolved_url,
        "title": title,
        "text": text,
        "success": True,
    }
