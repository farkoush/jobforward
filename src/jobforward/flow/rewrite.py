"""Rewrite assembly from allowed sources ONLY (flow/rewrite.py).

Constitution Principle 1 + FR-010: a proposal is built only from the words
and information of the original bullet and the user's answers. The
Context → Action → Result pattern organizes the sentence; it is never a
stored field (FR-004). The final assembled text MUST pass the no-extra-claims
validator before any proposal is shown (VR-6); a violation is a refused
assembly, never a shown proposal (zero tolerance).
"""

from __future__ import annotations

import re
from typing import Iterable

from ..models.entities import QuestionDimension

# Numbers are the zero-tolerance tokens: any number in the proposal must
# exist in the sources. Percentages and plain numbers are covered.
_NUMBER = re.compile(r"\d+(?:[.,]\d+)?%?")

# Structural glue labels used to join user segments into the C→A→R sentence
# pattern. Glue adds NO claim (no number, no impact verb, no new fact).
_GLUE = {
    QuestionDimension.CONTEXT: "Context: ",
    QuestionDimension.ROLE_ACTION_CLARITY: "Action: ",
    QuestionDimension.RESULT: "Result: ",
}


class ExtraClaimError(Exception):
    """Raised when an assembled proposal would add a claim absent from the
    sources (FR-010 violation = bug; the assembly is refused)."""


def _sources_text(sources: Iterable[str]) -> str:
    return "\n".join(sources)


def _numbers_in(text: str) -> set[str]:
    return set(_NUMBER.findall(text))


def validate_no_extra_claims(proposal: str, sources: Iterable[str]) -> None:
    """Raise :class:`ExtraClaimError` if the proposal contains any number
    (or percentage) that is not present in the allowed sources — the bullet
    text and the user's answers.

    Word-level claims are enforced structurally: :func:`assemble_rewrite`
    only ever inserts verbatim user segments, so the only way foreign content
    can appear is a number or a fabricated connector — connectors come from
    the fixed glue set, numbers are checked here.
    """
    allowed = _numbers_in(_sources_text(sources))
    for number in _numbers_in(proposal):
        if number not in allowed:
            raise ExtraClaimError(
                f"proposal contains number {number!r} absent from the "
                f"original bullet and the user's answers (FR-010)"
            )


def assemble_rewrite(
    bullet_text: str,
    answers: dict[QuestionDimension, str],
) -> str:
    """Assemble the proposed rewrite from the original bullet + user answers.

    The bullet's own text is kept verbatim as the base; each answered
    dimension's answer is appended under the pattern's label (structure
    only). Unanswered dimensions add nothing. The result is validated
    against the no-extra-claims rule before being returned (VR-6).
    """
    parts = [bullet_text]
    sources = [bullet_text]
    for dim in QUESTION_ORDER_LABELED:
        answer = answers.get(dim)
        if answer:
            parts.append(f"{_GLUE[dim]}{answer}")
            sources.append(answer)

    proposal = "\n".join(parts)
    validate_no_extra_claims(proposal, sources)
    return proposal


QUESTION_ORDER_LABELED: tuple[QuestionDimension, ...] = (
    QuestionDimension.CONTEXT,
    QuestionDimension.ROLE_ACTION_CLARITY,
    QuestionDimension.RESULT,
)
