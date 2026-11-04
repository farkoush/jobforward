"""Unit tests for the rewrite gate and question flow (flow/questions.py).

Finalized five-part framework (spec §6) + FR-009: gate default Yes; answering
No → no questions, no rewrite; exactly one skippable question per
missing/vague part (0–5) in Need → Feature → Action → Result → Metric order;
Need/Action/Result asked when their dimension score is 0/1, Feature/Metric
when the field is empty; a complete bullet gets NO questions; ONE round per
bullet per run; partial answers → draft-or-approve branch.
"""

from __future__ import annotations

from src.jobforward.flow.questions import (
    MAX_ROUND,
    all_skipped,
    build_questions,
    gate_allowed,
    has_partial_answers,
    is_complete,
    next_round,
    questions_for,
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
    bullet = Bullet(id=1, text="Built a dashboard", ratings=ratings)
    bullet.product_feature = dim.get("feature", "a dashboard")
    bullet.metric = dim.get("metric", "return visits grew by 15%")
    return bullet


def test_questions_in_locked_five_part_order():
    """Order is locked: Need → Feature → Action → Result → Metric."""
    bullet = _bullet(context=1, feature="", action=0, result=1, metric="")
    assert questions_for(bullet, bullet.ratings) == [
        QuestionDimension.CONTEXT,
        QuestionDimension.FEATURE,
        QuestionDimension.ROLE_ACTION_CLARITY,
        QuestionDimension.RESULT,
        QuestionDimension.METRIC,
    ]


def test_zero_questions_for_complete_bullet():
    bullet = _bullet()  # 2/2/2, feature and metric present
    assert questions_for(bullet, bullet.ratings) == []
    assert build_questions(bullet, bullet.ratings, GateDecision.ACCEPTED) == []


def test_complete_bullet_gets_no_metric_question():
    """A 2/2/2 bullet with an empty metric is still complete: no questions
    (spec §6 — the metric never blocks completeness)."""
    bullet = _bullet(metric="")
    assert is_complete(bullet.ratings)
    assert build_questions(bullet, bullet.ratings, GateDecision.ACCEPTED) == []


def test_gate_rejected_means_no_questions():
    bullet = _bullet(context=0, action=0, result=0, feature="", metric="")
    assert build_questions(bullet, bullet.ratings, GateDecision.REJECTED) == []


def test_max_five_questions():
    bullet = _bullet(context=0, action=0, result=0, feature="", metric="")
    questions = build_questions(bullet, bullet.ratings, GateDecision.ACCEPTED)
    assert len(questions) == 5


def test_feature_and_metric_asked_only_when_field_empty():
    bullet = _bullet(context=0)  # dims: 0/2/2, feature+metric present
    assert questions_for(bullet, bullet.ratings) == [QuestionDimension.CONTEXT]
    bullet.metric = ""
    assert questions_for(bullet, bullet.ratings) == [
        QuestionDimension.CONTEXT,
        QuestionDimension.METRIC,
    ]


def test_question_text_is_fixed_english():
    bullet = _bullet(result=0, metric="")
    questions = build_questions(bullet, bullet.ratings, GateDecision.ACCEPTED)
    result_question = next(
        q for q in questions if q.dimension == QuestionDimension.RESULT
    )
    assert "What changed after your work?" in result_question.text
    assert "1) Answer 2) Skip" in result_question.text
    metric_question = next(
        q for q in questions if q.dimension == QuestionDimension.METRIC
    )
    assert "Do you have a real number?" in metric_question.text


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
    questions[0].answer = "New users could not find their saved items"
    assert has_partial_answers(questions)
    assert not all_skipped(questions)


def test_all_skipped_means_no_rewrite():
    bullet = _bullet(context=0, result=0)
    questions = build_questions(bullet, bullet.ratings, GateDecision.ACCEPTED)
    for q in questions:
        q.skipped = True
    assert all_skipped(questions)
    assert not has_partial_answers(questions)
