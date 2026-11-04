"""Bullet overlap detection for the merge warning (scoring/overlap.py).

FR-013 + Clarification (2026-10-25): each new bullet is compared with all
existing bullets in the same entry; the warning surfaces at entry level.
The warning NEVER affects any score, and no merge happens without the
user's explicit confirmation. The overlap threshold lives in the rubric
version: a change requires a new rubric version (constitution P4).
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# Overlap threshold (rubric-2.0.0): two bullets overlap when their
# normalized word sets share at least this Jaccard-like fraction.
OVERLAP_THRESHOLD = 0.6
RUBRIC_VERSION = "rubric-2.0.0"

_STOPWORDS = frozenset({
    "a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "with",
    "by", "at", "as", "is", "was", "were", "i", "my", "our", "we", "it",
    "that", "this", "which", "from",
})


@dataclass(frozen=True)
class OverlapPair:
    """Two bullet ids (1-based, as stored on the entry) that overlap."""

    bullet_a: int
    bullet_b: int
    score: float


def _tokens(text: str) -> set[str]:
    return {
        tok
        for tok in re.findall(r"[a-z0-9]+", text.lower())
        if tok not in _STOPWORDS
    }


def overlap_score(text_a: str, text_b: str) -> float:
    """Jaccard similarity of the two bullets' content words (0..1)."""
    set_a, set_b = _tokens(text_a), _tokens(text_b)
    if not set_a or not set_b:
        return 0.0
    return len(set_a & set_b) / len(set_a | set_b)


def find_overlaps(bullet_texts: list[str]) -> list[OverlapPair]:
    """All overlapping pairs (threshold from the rubric version), comparing
    each bullet with every other bullet in the entry."""
    pairs: list[OverlapPair] = []
    for i in range(len(bullet_texts)):
        for j in range(i + 1, len(bullet_texts)):
            score = overlap_score(bullet_texts[i], bullet_texts[j])
            if score >= OVERLAP_THRESHOLD:
                pairs.append(
                    OverlapPair(bullet_a=i + 1, bullet_b=j + 1, score=score)
                )
    return pairs
