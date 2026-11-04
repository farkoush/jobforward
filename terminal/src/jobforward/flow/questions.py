"""Per-bullet rewrite gate and follow-up questions (flow/questions.py).

Finalized five-part framework (spec §§4.1, 6, 7) + FR-009:
  - analysis runs BEFORE any question;
  - for each bullet the gate "Do you want me to rewrite this bullet…?" is
    asked (default Yes); answering No → no questions, no rewrite;
  - on accept: exactly one skippable question per missing/vague part, in the
    fixed order Need → Feature → Action → Result → Metric (0–5 total).
    Conditions: Need/Action/Result when their dimension score is 0 or 1;
    Feature/Metric when the field is empty;
  - a COMPLETE bullet (Context, Specific Action, Result all 2) gets NO
    questions — only a final confirmation;
  - at most ONE question round per bullet per improvement run;
  - ≥ 1 answered + others unanswered → the CLI offers save-entry-as-draft or
    approve-rewrite-from-answers-so-far.
"""

from __future__ import annotations

from ..models.entities import (
    Bullet,
    BulletStatus,
    GateDecision,
    QuestionDimension,
    QuestionRecord,
    Ratings,
)
from ..messages import (
    ASK_REWRITE_GATE,
    ASK_NEED,
    ASK_FEATURE,
    ASK_ACTION,
    ASK_RESULT,
    ASK_METRIC,
)

# Question order locked by the finalized spec §6.
QUESTION_ORDER: tuple[QuestionDimension, ...] = (
    QuestionDimension.CONTEXT,
    QuestionDimension.FEATURE,
    QuestionDimension.ROLE_ACTION_CLARITY,
    QuestionDimension.RESULT,
    QuestionDimension.METRIC,
)

QUESTION_TEXT = {
    QuestionDimension.CONTEXT: ASK_NEED,
    QuestionDimension.FEATURE: ASK_FEATURE,
    QuestionDimension.ROLE_ACTION_CLARITY: ASK_ACTION,
    QuestionDimension.RESULT: ASK_RESULT,
    QuestionDimension.METRIC: ASK_METRIC,
}

# Hard cap: one round per bullet per improvement run (Clarification Q1).
MAX_ROUND = 1


def is_complete(ratings: Ratings) -> bool:
    """A bullet is complete when all three dimensions score 2 (spec §6);
    the metric is never required."""
    return (
        ratings.context == 2
        and ratings.role_action_clarity == 2
        and ratings.result == 2
    )


def deficient_dimensions(ratings: Ratings) -> list[QuestionDimension]:
    """Dimensions scoring 0 or 1, in the locked question order."""
    values = {
        QuestionDimension.CONTEXT: ratings.context,
        QuestionDimension.ROLE_ACTION_CLARITY: ratings.role_action_clarity,
        QuestionDimension.RESULT: ratings.result,
    }
    return [
        dim
        for dim in QUESTION_ORDER
        if dim in values and values[dim] < 2
    ]


def _field_empty(bullet: Bullet, dimension: QuestionDimension) -> bool:
    field = {
        QuestionDimension.FEATURE: bullet.product_feature,
        QuestionDimension.METRIC: bullet.metric,
    }.get(dimension)
    return not (field or "").strip()


def questions_for(bullet: Bullet, ratings: Ratings) -> list[QuestionDimension]:
    """The parts to ask about, in locked order (spec §6 conditions)."""
    if is_complete(ratings):
        return []  # complete bullets get a confirmation, never questions
    asks: list[QuestionDimension] = []
    for dimension in QUESTION_ORDER:
        if dimension in (QuestionDimension.FEATURE, QuestionDimension.METRIC):
            if _field_empty(bullet, dimension):
                asks.append(dimension)
        else:
            score = {
                QuestionDimension.CONTEXT: ratings.context,
                QuestionDimension.ROLE_ACTION_CLARITY: ratings.role_action_clarity,
                QuestionDimension.RESULT: ratings.result,
            }[dimension]
            if score < 2:
                asks.append(dimension)
    return asks


def gate_allowed(bullet: Bullet) -> bool:
    """One round per bullet per run: a bullet asked in this run is skipped.

    A bullet qualifies if it has never been asked (round 0) — i.e. it is new
    to questioning this run. Asking twice in one run is illegal.
    """
    if bullet.status == BulletStatus.NEW and not bullet.questions:
        return True
    # Analyzed bullets may be asked on a later improvement run.
    max_round = max((q.round for q in bullet.questions), default=0)
    return max_round < MAX_ROUND


def next_round(bullet: Bullet) -> int:
    """The round number for this improvement run (1 on the first run)."""
    return max((q.round for q in bullet.questions), default=0) + 1


def build_questions(
    bullet: Bullet,
    ratings: Ratings,
    gate_answer: GateDecision,
    round_number: int | None = None,
) -> list[QuestionRecord]:
    """Build the question records for this round (0–5 questions).

    Preconditions: gate_answer == ACCEPTED and gate_allowed(bullet).
    A complete bullet yields an empty list (confirmation only, spec §6).
    """
    if gate_answer == GateDecision.REJECTED:
        return []
    if round_number is None:
        round_number = next_round(bullet)
    return [
        QuestionRecord(
            dimension=dimension,
            text=QUESTION_TEXT[dimension],
            round=round_number,
            gate_answer=gate_answer,
        )
        for dimension in questions_for(bullet, ratings)
    ]


def answered_and_skipped(questions: list[QuestionRecord]) -> tuple[int, int]:
    """(answered, skipped-or-unanswered) counts for a round's questions."""
    answered = sum(1 for q in questions if q.answer is not None)
    other = len(questions) - answered
    return answered, other


def has_partial_answers(questions: list[QuestionRecord]) -> bool:
    """≥ 1 answered AND ≥ 1 unanswered → the draft-or-approve branch."""
    answered, other = answered_and_skipped(questions)
    return answered >= 1 and other >= 1


def all_skipped(questions: list[QuestionRecord]) -> bool:
    """No question answered → no rewrite (FR-009)."""
    answered, _ = answered_and_skipped(questions)
    return answered == 0
