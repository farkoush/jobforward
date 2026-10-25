"""Per-bullet rewrite gate and follow-up questions (flow/questions.py).

Locked by FR-009 + Clarifications Session 2026-10-25:
  - analysis runs BEFORE any question;
  - for each bullet the gate "Do you want me to rewrite this bullet…?" is
    asked (default Yes); answering No → no questions, no rewrite;
  - on accept: exactly one skippable question per dimension scoring 0 or 1,
    asked in Context → Role and Action Clarity → Result order (0–3 total);
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
    ASK_CONTEXT,
    ASK_ACTION,
    ASK_RESULT,
)

# Question order locked by the PRD: context, action (role clarity), result.
QUESTION_ORDER: tuple[QuestionDimension, ...] = (
    QuestionDimension.CONTEXT,
    QuestionDimension.ROLE_ACTION_CLARITY,
    QuestionDimension.RESULT,
)

QUESTION_TEXT = {
    QuestionDimension.CONTEXT: ASK_CONTEXT,
    QuestionDimension.ROLE_ACTION_CLARITY: ASK_ACTION,
    QuestionDimension.RESULT: ASK_RESULT,
}

# Hard cap: one round per bullet per improvement run (Clarification Q1).
MAX_ROUND = 1


def deficient_dimensions(ratings: Ratings) -> list[QuestionDimension]:
    """Dimensions scoring 0 or 1, in the locked question order."""
    values = {
        QuestionDimension.CONTEXT: ratings.context,
        QuestionDimension.ROLE_ACTION_CLARITY: ratings.role_action_clarity,
        QuestionDimension.RESULT: ratings.result,
    }
    return [dim for dim in QUESTION_ORDER if values[dim] < 2]


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
    """Build the question records for this round (0–3 questions).

    Preconditions: gate_answer == ACCEPTED and gate_allowed(bullet).
    """
    if gate_answer == GateDecision.REJECTED:
        return []
    if round_number is None:
        round_number = next_round(bullet)
    return [
        QuestionRecord(
            dimension=dim,
            text=QUESTION_TEXT[dim],
            round=round_number,
            gate_answer=gate_answer,
        )
        for dim in deficient_dimensions(ratings)
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
