"""Local heuristic evaluator adapter (scoring/adapters/local.py).

Deterministic, fully offline rule-based ratings per bullet. Each dimension
receives 0/1/2 based on text features only — no LLM, no aggregate math
(that lives in scoring/metrics.py).

Per research R-2: this is the default adapter; every run stays offline
and repeatable for the 5-run stability criterion (SC-003).
"""

from __future__ import annotations

import re
from typing import Optional

from ..evaluator import (
    BulletEvaluator,
    BulletRatingRequest,
    BulletRatingResponse,
    BulletRating,
    DIMENSIONS,
    validate_response,
)

# Skill keywords that indicate higher skill_evidence (Persian + English).
_SKILL_KEYWORDS = frozenset({
    "تحلیل", "تولید", "مدیریت", "طراحی", "توسعه", "اجراء", "راه‌اندازی",
    "تحسین", "تقویت", "بهینه‌سازی", "برنامه‌ریزی", "تأمین", "ارائه",
    "analysis", "produced", "managed", "designed", "developed", "led",
    "created", "implemented", "optimized", "planned", "delivered",
})

# Quantified outcome indicators (numbers, percentages, outcomes).
_QUANTIFIED_PATTERNS = [
    r"\d+%",           # percentages
    r"\d+\s*(تومان|ريال|دولار|یورو)",  # currency amounts
    r"\d+\s*(نفر|کاربر|مشتری|پروژه|مرحله)",  # counts
    r"\d+",            # any number
]

# Single-verb action sentence start (strong action verb).
_ACTION_VERBS = frozenset({
    "مدیریت کرد", "توسعه داد", "طراحی کرد", "تولید کرد", "اجرای",
    "تحلیل کرد", "راه اندازی کرد", "پیاده سازی کرد", "بهینه سازی کرد",
    "managed", "developed", "designed", "led", "created", "implemented",
    "analyzed", "optimized", "delivered",
})

# Context→Action→Result template markers.
_CTA_MARKERS = (" contexte", "action", "result", "عمل", "نتیجه", "زمینه")


def _has_quantified_outcome(text: str) -> bool:
    """True if the bullet contains a number or quantified outcome."""
    return any(re.search(p, text) for p in _QUANTIFIED_PATTERNS)


def _has_action_verb(text: str) -> bool:
    """True if the bullet starts with or contains a strong action verb."""
    first_word = text.split()[0] if text.split() else ""
    return first_word in _ACTION_VERBS or any(v in text for v in _ACTION_VERBS)


def _has_cta_structure(text: str) -> bool:
    """True if the bullet shows context→action→result structure."""
    return any(m in text.lower() for m in _CTA_MARKERS)


def _has_skill_keywords(text: str) -> bool:
    """True if the bullet contains skill-related keywords."""
    return any(k in text for k in _SKILL_KEYWORDS)


def _rate_role_action_clarity(text: str) -> int:
    """0: no action verb; 1: has action verb; 2: action verb + clear subject."""
    if not text or not text.strip():
        return 0
    if _has_action_verb(text):
        return 2
    return 1


def _rate_outcome(text: str) -> int:
    """0: no outcome; 1: vague outcome; 2: quantified/measurable outcome."""
    if not text or not text.strip():
        return 0
    if _has_quantified_outcome(text):
        return 2
    # Vague outcome words
    vague = ("بهبود", "کاهش", "افزایش", "پرداخت", "دریافت", "انجام",
             "improved", "reduced", "increased", "completed", "delivered")
    if any(v in text for v in vague):
        return 1
    return 0


def _rate_skill_evidence(text: str) -> int:
    """0: no skill; 1: some skill keyword; 2: strong skill evidence."""
    if not text or not text.strip():
        return 0
    if _has_skill_keywords(text):
        return 2
    return 1


def _rate_structure_scannability(text: str) -> int:
    """0: no structure; 1: some structure; 2: clear CTA structure."""
    if not text or not text.strip():
        return 0
    if _has_cta_structure(text):
        return 2
    # Short bullets are scannable
    if len(text.split()) <= 12:
        return 1
    return 0


class LocalHeuristicAdapter(BulletEvaluator):
    """Deterministic local adapter producing 0/1/2 ratings per dimension."""

    def evaluate(self, request: BulletRatingRequest) -> BulletRatingResponse:
        """Rate each bullet in the request using rule-based heuristics."""
        ratings = []
        for i, text in enumerate(request.texts):
            ratings.append(BulletRating(
                bullet_index=i,
                role_action_clarity=_rate_role_action_clarity(text),
                outcome=_rate_outcome(text),
                skill_evidence=_rate_skill_evidence(text),
                structure_scannability=_rate_structure_scannability(text),
            ))

        response = BulletRatingResponse(
            rubric_version=request.rubric_version,
            ratings=ratings,
            notes="Local heuristic ratings; deterministic and offline.",
        )
        validate_response(response, len(request.texts))
        return response
