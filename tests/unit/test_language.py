"""Unit tests for the language boundary (constitution P10 v2.0.0, FR-017).

All tool text is English B1; bullets and answers must be English; pasted
posting text is exempt (FR-021).
"""

from __future__ import annotations

import src.jobforward.messages as messages
from src.jobforward.flow.path_service import contains_non_english


def test_all_messages_are_english():
    """Every user-facing string is English B1 (all LETTERS are ASCII; no
    Persian). The "·" separator in the contractual matcher v1 gate and
    counts lines (specs/002-jd-matcher) is punctuation, not text."""
    for name in dir(messages):
        if name.startswith("_"):
            continue
        value = getattr(messages, name)
        if not isinstance(value, str):
            continue
        letters = [c for c in value if c.isalpha()]
        assert all(ord(c) < 128 for c in letters), (
            f"{name} is not English B1: {value!r}"
        )


def test_persian_bullet_rejected():
    """Persian bullet text is not accepted (FR-017)."""
    assert contains_non_english("تحلیل داده انجام دادم")
    assert contains_non_english("Led the team, و بعد نتایج")


def test_other_non_english_scripts_rejected():
    assert contains_non_english("数据分析")  # CJK
    assert contains_non_english("анализ данных")  # Cyrillic


def test_english_bullet_accepted():
    assert not contains_non_english("Led a team of 3 analysts to build a dashboard")
    assert not contains_non_english("Improved onboarding, raising activation by 15%")


def test_common_punctuation_allowed():
    """Typographic punctuation is fine; the check targets other scripts."""
    assert not contains_non_english("Led the team — shipped the “new” app…")


def test_posting_text_is_exempt():
    """The English check applies to bullets/answers; posting text may be
    Persian or English (FR-021). The exemption is a caller decision: the
    matcher path never invokes contains_non_english on the posting."""
    assert contains_non_english("نیازمندی: تحلیل داده")  # the check itself works


def test_score_prompts_carry_rubric_placeholder():
    """Every score line shows the rubric version next to the score (FR-008)."""
    assert "{rubric}" in messages.SCORE_EXPERIENCE
    assert "{rubric}" in messages.SCORE_OVERALL
    assert "{rubric}" in messages.SCORE_BULLET_HEADER
    assert "{rubric}" in messages.SCORE_BEFORE_AFTER
