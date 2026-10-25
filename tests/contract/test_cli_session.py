"""Contract tests for the CLI session (contracts/cli-session.md).

Tests FR-017 Persian-only prompts; verbatim bullet echo; prompt-id contract.
Every visible prompt is Persian, taken from messages.py; every question offers
a numbered reject/skip choice.
"""

from __future__ import annotations

from src.jobforward.messages import (
    ADD_TYPE,
    ADD_TITLE,
    ADD_ORG,
    ADD_START,
    ADD_END,
    ADD_BULLET_PROMPT,
    Q_RESULT_HINT,
    ASK_RESULT_IMPACT,
    ASK_SKILL_RELEVANCE,
    PROPOSAL_SHOW,
    PROPOSAL_ACCEPTED,
    PROPOSAL_REJECTED,
    MERGE_WARN,
    CONFIRM_DELETE_BULLET,
    SCORE_BULLET_HEADER,
    SCORE_DIMENSION,
    SCORE_EXPERIENCE,
    SCORE_OVERALL,
    SCORE_BEFORE_AFTER,
    ERR_TOO_MANY_BULLETS,
)


def test_prompts_are_persian():
    """All user-facing prompts must be Persian (constitution Principle 10)."""
    # Every prompt should contain non-ASCII (Persian/Arabic script) characters.
    persian_prompts = [
        ADD_TYPE, ADD_TITLE, ADD_ORG, ADD_START, ADD_END,
        ADD_BULLET_PROMPT, Q_RESULT_HINT, ASK_RESULT_IMPACT,
        ASK_SKILL_RELEVANCE, PROPOSAL_SHOW, MERGE_WARN,
        CONFIRM_DELETE_BULLET, ERR_TOO_MANY_BULLETS,
    ]
    for prompt in persian_prompts:
        assert any(ord(ch) > 127 for ch in prompt), f"Not Persian: {prompt!r}"


def test_q_result_hint_value():
    """Q_RESULT_HINT must match the constitution-mandated Persian string."""
    assert Q_RESULT_HINT == "اگر عدد واقعی داری، همان را اضافه کن"


def test_score_display_keys():
    """SCORE_* prompts must contain the expected format keys."""
    assert "{text}" in SCORE_BULLET_HEADER
    assert "{rubric}" in SCORE_BULLET_HEADER
    assert "{dimension}" in SCORE_DIMENSION
    assert "{value}" in SCORE_DIMENSION
    assert "{value}" in SCORE_EXPERIENCE
    assert "{value}" in SCORE_OVERALL
    assert "{before}" in SCORE_BEFORE_AFTER
    assert "{after}" in SCORE_BEFORE_AFTER


def test_proposal_prompt_has_choices():
    """PROPOSAL_SHOW must offer approve/reject numbered choices."""
    assert "۱)" in PROPOSAL_SHOW  # تایید و جایگزینی
    assert "۲)" in PROPOSAL_SHOW  # رد و عدم تغییر


def test_ask_prompt_has_reject_choice():
    """Every ASK_* prompt must offer a reject/skip choice (FR-009)."""
    for prompt in (ASK_RESULT_IMPACT, ASK_SKILL_RELEVANCE):
        assert "رد سوال" in prompt  # reject question option