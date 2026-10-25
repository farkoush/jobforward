"""Unit tests for the rewrite gate and question flow (flow/questions.py).

FR-009 + Clarifications Session 2026-10-25: gate default Yes; answering No →
no questions, no rewrite; exactly one question per dimension scoring 0 or 1
(0–3) in Context, Action, Result order; every question skippable; ONE round
per bullet per run; partial answers → draft-or-approve branch.
"""

from __future__ import annotations

import pytest

from src.jobforward.flow.questions import (
    MAX_ROUND,
    all_skipped,
    build_questions,
    deficient_dimensions,
    gate_allowed,
    has_partial_answers,
    next_round,
)
from src.jobforward.models.entities import (
    Bullet,
    GateDecision,
    QuestionDimension,
    QuestionRecord,
    Ratings,
)


def _bullet(**dim) -> Bullet:
    ratings = Ratings(
        context=dim.get("context", 2),
        role_action_clarity=dim.get("action", 2),
        result=dim.get("result", 2),
    )
    return Bullet(id=1, text="Led a team of 3", ratings=ratings)


def test_deficient_dimensions_in_locked_order():
    """Order is locked: Context → Role and Action Clarity → Result."""
    bullet = _bullet(context=1, action=0, result=1)
    dims = deficient_dimensions(bullet.ratings)
    assert dims == [
        QuestionDimension.CONTEXT,
        QuestionDimension.ROLE_ACTION_CLARITY,
        QuestionDimension.RESULT,
    ]


def test_zero_questions_for_complete_bullet():
    bullet = _bullet(context=2, action=2, result=2)
    assert deficient_dimensions(bullet.ratings) == []
    assert build_questions(bullet, bullet.ratings, GateDecision.ACCEPTED) == []


def test_gate_rejected_means_no_questions():
    bullet = _bullet(context=0, action=0, result=0)
    assert build_questions(bullet, bullet.ratings, GateDecision.REJECTED) == []


def test_max_three_questions():
    bullet = _bullet(context=0, action=0, result=0)
    questions = build_questions(bullet, bullet.ratings, GateDecision.ACCEPTED)
    assert len(questions) == 3


def test_question_text_is_fixed_english():
    bullet = _bullet(result=0)
    (question,) = build_questions(bullet, bullet.ratings, GateDecision.ACCEPTED)
    assert "What changed after your work?" in question.text
    assert "If you have real numbers, include them." in question.text
    assert "1) Answer 2) Skip" in question.text


def test_one_round_cap_per_bullet():
    """A bullet already asked once (any round) may not be asked again in the
    same run (Clarification Q1)."""
    bullet = _bullet(result=0)
    assert gate_allowed(bullet)
    bullet.questions.append(
        QuestionRecord(
            dimension=QuestionDimension.RESULT,
            text="q",
            round=1,
            gate_answer=GateDecision.ACCEPTED,
        )
    )
    assert next_round(bullet) == 2
    assert not gate_allowed(bullet)  # round cap: MAX_ROUND == 1 per run
    assert MAX_ROUND == 1


def test_partial_answers_trigger_draft_or_approve():
    bullet = _bullet(context=0, result=0)
    questions = build_questions(bullet, bullet.ratings, GateDecision.ACCEPTED)
    questions[0].answer = "A startup mobile app launch"  # answered
    assert has_partial_answers(questions)
    assert not all_skipped(questions)


def test_all_skipped_means_no_rewrite():
    bullet = _bullet(context=0, result=0)
    questions = build_questions(bullet, bullet.ratings, GateDecision.ACCEPTED)
    for q in questions:
        q.skipped = True
    assert all_skipped(questions)
    assert not has_partial_answers(questions)
