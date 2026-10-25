"""Local heuristic evaluator adapter (scoring/adapters/local.py) — rubric-2.0.0.

Deterministic, fully offline rule-based ratings per bullet on the THREE
dimensions (context, role_action_clarity, result). No LLM, no aggregate math
(that lives in scoring/metrics.py). English-only input is guaranteed by the
recording boundary, so heuristics can be English-focused.

Per research R-2: this is the default adapter; every run stays offline and
repeatable for the 90% stability criterion (deterministic → 100%, SC-003).
"""

from __future__ import annotations

import re

from ..evaluator import (
    BulletEvaluator,
    BulletRatingRequest,
    BulletRatingResponse,
    BulletRating,
    validate_response,
)

# --- Context heuristics ---------------------------------------------------
# Specific situation markers: a named project/team/problem.
_SPECIFIC_CONTEXT = re.compile(
    r"\b(project|team|customer|client|user|launch|migration|redesign|"
    r"problem|issue|goal|campaign|product)\b",
    re.IGNORECASE,
)
# Generic-context markers ("in an app" style vagueness).
_GENERIC_CONTEXT = re.compile(
    r"\b(in an app|in the app|at (the )?company|in a company|at work)\b",
    re.IGNORECASE,
)

# --- Role and action clarity ----------------------------------------------
_ACTION_VERB_START = re.compile(
    r"^(i\s+)?(led|built|designed|created|managed|launched|ran|owned|"
    r"organized|coordinated|analyzed|improved|developed|delivered|wrote|"
    r"planned|tested|researched|prototyped|automated|negotiated)\b",
    re.IGNORECASE,
)
_ACTION_VERB_ANY = re.compile(
    r"\b(led|built|designed|created|managed|launched|ran|owned|organized|"
    r"coordinated|analyzed|improved|developed|delivered|wrote|planned|"
    r"tested|researched|prototyped|automated|negotiated)\b",
    re.IGNORECASE,
)

# --- Result heuristics -----------------------------------------------------
_QUANTIFIED = re.compile(r"(\d+(\.\d+)?\s*%|\b\d+(\.\d+)?\b)")
# Specific qualitative result markers (observable change).
_SPECIFIC_RESULT = re.compile(
    r"\b(which resulted|resulting in|so that|enabling|leading to|"
    r"which increased|which reduced|adopted by|used by|raised|"
    r"cut|grew|doubled|halved)\b",
    re.IGNORECASE,
)
# Vague-result markers (PRD §4.3: improved/reduced without a what).
_VAGUE_RESULT = re.compile(
    r"\b(improved|reduced|increased|optimized|enhanced|better|faster)\b",
    re.IGNORECASE,
)
# Output-only markers ("built a dashboard" with no impact clause).
_OUTPUT_ONLY = re.compile(
    r"\b(built|created|made|produced|wrote|designed)\b", re.IGNORECASE
)
# Personal learning markers (PRD §4.3: scores 1, not 2).
_LEARNING = re.compile(
    r"\b(learned|learnt|understood how|studied how|explored how)\b",
    re.IGNORECASE,
)


def _rate_context(text: str) -> int:
    """0: missing; 1: general ('in an app'); 2: specific situation."""
    lowered = text.lower()
    if _GENERIC_CONTEXT.search(lowered) and not _SPECIFIC_CONTEXT.search(lowered):
        return 1
    if _SPECIFIC_CONTEXT.search(lowered):
        return 2
    return 0


def _rate_role_action_clarity(text: str) -> int:
    """0: no action verb; 1: action verb present but not leading;
    2: first-person action verb leads the sentence."""
    if not text.strip():
        return 0
    if _ACTION_VERB_START.search(text):
        return 2
    if _ACTION_VERB_ANY.search(text):
        return 1
    return 0


def _rate_result(text: str) -> int:
    """Per PRD §4.3: 2 = specific qualitative (or numeric) result;
    1 = vague result, output-only, or personal learning; 0 = no result."""
    if not text.strip():
        return 0
    if _QUANTIFIED.search(text) or _SPECIFIC_RESULT.search(text):
        return 2
    if _LEARNING.search(text):
        return 1
    if _VAGUE_RESULT.search(text):
        return 1
    if _OUTPUT_ONLY.search(text):
        return 1
    return 0


class LocalHeuristicAdapter(BulletEvaluator):
    """Deterministic local adapter producing 0/1/2 ratings per dimension."""

    def evaluate(self, request: BulletRatingRequest) -> BulletRatingResponse:
        """Rate each bullet in the request using rule-based heuristics."""
        ratings = []
        for i, text in enumerate(request.texts):
            ratings.append(
                BulletRating(
                    bullet_index=i,
                    context=_rate_context(text),
                    role_action_clarity=_rate_role_action_clarity(text),
                    result=_rate_result(text),
                )
            )

        response = BulletRatingResponse(
            rubric_version=request.rubric_version,
            ratings=ratings,
            notes="Local heuristic ratings; deterministic and offline.",
        )
        # Notes contain the word "ratings" but no aggregates; the shared
        # validity check would reject arithmetic, so validate defensively.
        response.notes = None
        validate_response(response, len(request.texts))
        return response
