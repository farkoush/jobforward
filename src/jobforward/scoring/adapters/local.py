"""Local heuristic evaluator adapter (scoring/adapters/local.py) — rubric-3.0.0.

Deterministic, fully offline rule-based ratings per bullet on the THREE
dimensions (context, role_action_clarity, result). No LLM, no aggregate math
(that lives in scoring/metrics.py). English-only input is guaranteed by the
recording boundary, so heuristics can be English-focused.

rubric-3.0.0 renames the second dimension's semantics to Specific Action
(stored key role_action_clarity unchanged); its 0/1/2 levels are defined in
specs/001-experience-improvement-flow/checklists/specific-action.md.

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

# --- Specific action (rubric-3.0.0) ----------------------------------------
_ACTION_VERB_ANY = re.compile(
    r"\b(led|built|designed|created|managed|launched|ran|owned|organized|"
    r"coordinated|analyzed|improved|developed|delivered|wrote|planned|"
    r"tested|researched|prototyped|automated|negotiated)\b",
    re.IGNORECASE,
)
# Generic-involvement phrasing: something was done, but vaguely.
_GENERIC_ACTION = re.compile(
    r"\b(worked|working)\s+(on|with)\b|\b(helped|helping)\s+with\b|"
    r"\bresponsible for\b|\bin charge of\b|\binvolved in\b|\bpart of\b|"
    r"\bassisted with\b|\btasked with\b|\bdid research\b|"
    r"\bmade improvements\b|\bdid analysis\b",
    re.IGNORECASE,
)
# Concrete objects: named artifacts, product areas, data/tool surfaces.
_CONCRETE_OBJECT = re.compile(
    r"\b(dashboard|roadmap|survey|prototype|prd|spec|user stories|backlog|"
    r"report|deck|presentation|pricing|onboarding|funnel|checkout|signup|"
    r"retention|activation|churn|conversion|launch plan|test plan|database|"
    r"query|sql|figma)\b|\ba/b\s*tests?\b",
    re.IGNORECASE,
)
# Quantified scope ("team of 3", "12 users", "4-week beta" style).
_QUANTIFIED_SCOPE = re.compile(
    r"\b(team|group)\s+of\s+\d+\b|"
    r"\b\d+\s+(users?|customers?|people|interviews?|participants?|teams?|"
    r"analysts?|weeks?|sprints?|sessions?)\b",
    re.IGNORECASE,
)

# --- Result heuristics -----------------------------------------------------
_QUANTIFIED = re.compile(r"(\d+(\.\d+)?\s*%|\b\d+(\.\d+)?\b)")
# Specific qualitative result markers (observable change).
_SPECIFIC_RESULT = re.compile(
    r"\b(which resulted|resulting in|so that|enabling|leading to|"
    r"which increased|which reduced|adopted by|used by|raised|"
    r"cut|grew|doubled|halved|coming back|came back|more users|returned)\b",
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


# --- Context from framework parts (rubric-3.0.0, spec §3) ------------------
_SPECIFIC_NEED = re.compile(
    r"\b(users?|customers?|clients?|employers?|candidates?|job seekers?|"
    r"people|could not|couldn't|can't|cannot|unable to|struggl(?:ed|e|ing)|"
    r"complain(?:ed|ts)?|frustrat(?:ed|ing)|confus(?:ed|ing)|"
    r"too (?:hard|difficult|slow|complex)|hard to|difficult to|no way to|"
    r"problems?|issues?|pain point|needed|needs to|wanted|looking for|"
    r"missing|lacked|lack of|dropped off|churn(ed)?)\b",
    re.IGNORECASE,
)
_GENERIC_NEED = re.compile(
    r"\b(better|improve|improvement|various|some|several|many|things|stuff|"
    r"efficiency|productivity|processes)\b",
    re.IGNORECASE,
)


def _rate_context_parts(need: str, feature: str) -> int:
    """rubric-3.0.0 Context from the extracted parts (spec §3):
    0: need missing (even with a feature);
    1: generic need, or specific need with the feature missing;
    2: specific need and feature both present."""
    if not need.strip():
        return 0
    if _GENERIC_NEED.search(need) and not _SPECIFIC_NEED.search(need):
        return 1
    if not feature.strip():
        return 1
    return 2


# A result that is only a number (optionally with a bare growth word) is not
# an outcome narrative: score 1 and ask what the number represents (spec §3).
_BARE_NUMBER_RESULT = re.compile(
    r"^\W*\d+(?:[.,]\d+)?\s*%?\s*x?\s*"
    r"(?:percent|growth|increase|decrease|improvement|reduction|uplift|"
    r"drop|decline)?\W*$",
    re.IGNORECASE,
)


def _rate_specific_action(text: str) -> int:
    """rubric-3.0.0 checklist (checklists/specific-action.md):
    0: no action verb and no involvement phrase;
    1: generic action (verb without a concrete object, or vague involvement);
    2: action verb plus a concrete object or quantified scope."""
    if not text.strip():
        return 0
    has_verb = bool(_ACTION_VERB_ANY.search(text))
    has_generic = bool(_GENERIC_ACTION.search(text))
    if not has_verb and not has_generic:
        return 0
    has_concrete = bool(
        _CONCRETE_OBJECT.search(text) or _QUANTIFIED_SCOPE.search(text)
    )
    if has_verb and has_concrete:
        return 2
    return 1


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
        """Rate each bullet in the request using rule-based heuristics.

        When the request carries extracted framework ``parts``, Context is
        scored from the need/feature parts (rubric-3.0.0), the action from
        the action part, and the bare-number Result rule applies. Without
        parts, the raw-text heuristics are used unchanged.
        """
        ratings = []
        parts = request.parts or []
        for i, text in enumerate(request.texts):
            part = parts[i] if i < len(parts) else None
            if part is not None:
                context = _rate_context_parts(part.user_need, part.product_feature)
                action_text = part.action.strip() or text
                result_text = part.result.strip() or text
            else:
                context = _rate_context(text)
                action_text = text
                result_text = text
            result = _rate_result(result_text)
            if part is not None:
                bare_number = (
                    (_BARE_NUMBER_RESULT.match(part.result) if part.result else None)
                    or (
                        not part.result.strip()
                        and part.metric
                        and _BARE_NUMBER_RESULT.match(part.metric)
                    )
                )
                if bare_number:
                    result = min(result, 1)
            ratings.append(
                BulletRating(
                    bullet_index=i,
                    context=context,
                    role_action_clarity=_rate_specific_action(action_text),
                    result=result,
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
