"""Cleaning pipeline for a pasted job posting (matcher v1 step 0).

Pure functions per contracts/matcher-pipeline.md §2 and data-model.md
CleanedPosting. Ordered steps (order matters — script removal precedes tag
stripping so block content cannot leak):

1. remove control characters (keep ``\\n``, ``\\t``)
2. normalize line endings (``\\r\\n``/``\\r`` → ``\\n``)
3. remove ``<script>``/``<style>`` blocks with all content (counted)
4. remove remaining HTML tags keeping inner text (counted)

The text is data only: nothing here executes or resolves anything from the
posting (FR-002). Word count and the language check operate on the cleaned
text (FR-005/FR-006/FR-007).
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

# Letters only (spec Assumption): the ratio counts English letters against
# Persian/Arabic-script letters; digits and punctuation never affect it.
_ARABIC_RANGES = (
    (0x0600, 0x06FF),
    (0x0750, 0x077F),
    (0x08A0, 0x08FF),
    (0xFB50, 0xFDFF),
    (0xFE70, 0xFEFF),
)

_CONTROL_KEEP = {"\n", "\r", "\t"}
_SCRIPT_RE = re.compile(r"<script\b[^>]*>.*?</script\s*>", re.IGNORECASE | re.DOTALL)
_STYLE_RE = re.compile(r"<style\b[^>]*>.*?</style\s*>", re.IGNORECASE | re.DOTALL)
_TAG_RE = re.compile(r"<[^>]*>")


@dataclass
class CleanedPosting:
    """Result of the cleaning pipeline (data-model.md CleanedPosting)."""

    raw_text: str
    cleaned_text: str
    script_blocks_removed: int
    style_blocks_removed: int
    html_tags_removed: int
    word_count: int
    language_ok: bool


def clean_posting(raw: str) -> CleanedPosting:
    """Clean ``raw`` and return the CleanedPosting with counts and gates."""
    text = "".join(
        ch for ch in raw
        if ch in _CONTROL_KEEP or unicodedata.category(ch) != "Cc"
    )
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    script_blocks = len(_SCRIPT_RE.findall(text))
    text = _SCRIPT_RE.sub("", text)
    style_blocks = len(_STYLE_RE.findall(text))
    text = _STYLE_RE.sub("", text)
    html_tags = len(_TAG_RE.findall(text))
    text = _TAG_RE.sub("", text)
    return CleanedPosting(
        raw_text=raw,
        cleaned_text=text,
        script_blocks_removed=script_blocks,
        style_blocks_removed=style_blocks,
        html_tags_removed=html_tags,
        word_count=len(text.split()),
        language_ok=language_ok(text),
    )


def language_ratio(text: str) -> float:
    """Persian/Arabic-script letters divided by all letters (0 when none)."""
    latin = sum(1 for ch in text if "a" <= ch <= "z" or "A" <= ch <= "Z")
    arabic = sum(
        1
        for ch in text
        if any(lo <= ord(ch) <= hi for lo, hi in _ARABIC_RANGES)
    )
    total = latin + arabic
    if total == 0:
        return 0.0
    return arabic / total


def language_ok(text: str) -> bool:
    """False when more than 10% of the letters are Persian/Arabic script."""
    return language_ratio(text) <= 0.10
