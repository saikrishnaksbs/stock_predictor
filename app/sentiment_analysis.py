import re

POSITIVE_WORDS = {
    "surge", "surges", "surged", "rally", "rallies", "rallied", "gain", "gains", "gained",
    "jump", "jumps", "jumped", "soar", "soars", "soared", "beat", "beats", "outperform",
    "upgrade", "upgraded", "upgrades", "profit", "profits", "record high", "buyback",
    "growth", "grows", "grew", "strong", "bullish", "boost", "boosts", "boosted",
    "expansion", "expands", "wins", "won", "win", "positive", "high", "rise", "rises",
    "rose", "recovery", "recovers", "recovered", "dividend", "milestone", "deal",
}

NEGATIVE_WORDS = {
    "fall", "falls", "fell", "falling", "drop", "drops", "dropped", "plunge", "plunges",
    "plunged", "slump", "slumps", "slumped", "crash", "crashes", "crashed", "loss",
    "losses", "downgrade", "downgraded", "downgrades", "miss", "misses", "missed",
    "weak", "bearish", "decline", "declines", "declined", "cut", "cuts", "layoff",
    "layoffs", "fraud", "probe", "investigation", "lawsuit", "penalty", "fine",
    "resign", "resigns", "resigned", "scam", "default", "negative", "low", "slowdown",
    "recession", "warns", "warning", "concern", "concerns",
}

_word_re = re.compile(r"[a-zA-Z']+")


def score_text(text: str) -> int:
    """Return -1, 0, or +1 based on net keyword hits in a headline."""
    words = _word_re.findall(text.lower())
    pos = sum(1 for w in words if w in POSITIVE_WORDS)
    neg = sum(1 for w in words if w in NEGATIVE_WORDS)
    net = pos - neg
    if net > 0:
        return 1
    if net < 0:
        return -1
    return 0
