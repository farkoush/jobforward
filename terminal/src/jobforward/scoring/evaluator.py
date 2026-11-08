"""BulletEvaluator port — the interface between adapters and scoring.

Per research R-2 and contracts/evaluator-output (rubric-2.0.0): an adapter
receives verbatim bullet texts (plus optional user answers and rubric
version) and returns structured 0/1/2 ratings on the THREE dimensions —
context, role_action_clarity, result. All arithmetic happens downstream in
scoring/metrics.py — never in the adapter.

Includes the shared validity check used by all adapters (FR-014).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Optional

from ..rubric import RUBRIC_VERSION

if TYPE_CHECKING:  # pragma: no cover - type-only import
    from ..models.entities import BulletParts

# The three scoring dimensions, in canonical order (data-model.md).
DIMENSIONS = ("context", "role_action_clarity", "result")

# The five per-part quotation fields of the rating output (spec §14.1) —
# the same names as the stored five parts (models/entities.PART_NAMES).
QUOTE_FIELDS = ("user_need", "product_feature", "action", "result", "metric")

VALID_RATINGS = frozenset({0, 1, 2})

# Tokens that would indicate the adapter computed an aggregate score
# (constitution Principle 4: arithmetic never lives in an adapter).
_FORBIDDEN_NOTE_TOKENS = ("/", "%", "Overall", "Experience", "Score", "score")


@dataclass
class BulletRatingRequest:
    """Request sent to an evaluator adapter.

    ``texts`` holds the verbatim bullet texts. ``answers`` (optional) holds
    user-provided answers used when assembling a rewrite. ``parts``
    (optional, rubric-3.0.0) holds the extracted five-part framework parts
    per bullet; when absent, adapters fall back to raw-text heuristics.
    ``rubric_version`` records which rubric produced the ratings.
    """

    texts: list[str]
    answers: Optional[list[str]] = None
    rubric_version: str = RUBRIC_VERSION
    parts: Optional[list["BulletParts"]] = None


@dataclass
class RatingQuotes:
    """Verbatim per-part quotations accompanying one bullet's ratings (§14).

    Amendment 2026-11-08: the rating output is the single source of truth
    for the five-part template. Each field is the EXACT words copied from
    the bullet (equality after whitespace normalization) or empty when the
    bullet has no such part. The metric quotation is optional evidence with
    no score (spec §3). The deterministic adapter echoes its own extraction
    results here; every MODEL-produced rating must satisfy
    ``validate_rating_evidence`` before use.
    """

    user_need: str = ""
    product_feature: str = ""
    action: str = ""
    result: str = ""
    metric: str = ""

    def as_dict(self) -> dict[str, str]:
        return {name: getattr(self, name) for name in QUOTE_FIELDS}

    def as_parts(self) -> "BulletParts":
        """The five stored part fields built from these quotes (§14.3)."""
        from ..models.entities import BulletParts

        return BulletParts(**self.as_dict())


@dataclass
class BulletRating:
    """One bullet's three dimension scores, each int in {0, 1, 2}.

    ``quotes`` (spec §14.1) carries the verbatim per-part quotations the
    rating is based on; ``None`` only for the legacy raw-text fallback path
    (no framework parts in the request).
    """

    bullet_index: int
    context: int
    role_action_clarity: int
    result: int
    quotes: Optional[RatingQuotes] = None

    def __post_init__(self) -> None:
        for name in DIMENSIONS:
            value = getattr(self, name)
            if value not in VALID_RATINGS:
                raise ValueError(
                    f"BulletRating.{name} must be in {{0, 1, 2}}, got {value!r}"
                )


@dataclass
class BulletRatingResponse:
    """Response returned by an evaluator adapter.

    ``rubric_version`` echoes the request's rubric version. ``ratings`` holds
    one BulletRating per requested bullet, in the same order. ``notes`` is
    optional human-readable text (English B1) and must not contain aggregated
    scores or text modifications.
    """

    rubric_version: str
    ratings: list[BulletRating]
    notes: Optional[str] = None

    def __post_init__(self) -> None:
        if len(self.ratings) == 0:
            raise ValueError("Response must contain at least one rating")


class EvaluatorOutputError(Exception):
    """Raised when evaluator output fails schema validation (FR-014)."""


def validate_response(
    response: BulletRatingResponse,
    expected_bullet_count: int,
) -> None:
    """Shared validity check for all evaluator adapters.

    Checks: schema match (all three dimension keys present, ints in {0,1,2});
    one rating per bullet in the request; ratings in the same order as the
    requested bullets; notes without aggregated scores.

    Raises EvaluatorOutputError on any failure. Adapters catch this, retry
    once internally, then surface the failure.
    """
    if len(response.ratings) != expected_bullet_count:
        raise EvaluatorOutputError(
            f"Expected {expected_bullet_count} ratings, got "
            f"{len(response.ratings)}"
        )

    for i, rating in enumerate(response.ratings):
        if rating.bullet_index != i:
            raise EvaluatorOutputError(
                f"Rating {i} has bullet_index {rating.bullet_index}, "
                f"expected {i}"
            )
        for name in DIMENSIONS:
            value = getattr(rating, name)
            if value not in VALID_RATINGS:
                raise EvaluatorOutputError(
                    f"Rating {i}.{name} = {value!r} not in {{0, 1, 2}}"
                )

    if response.notes is not None:
        if any(token in response.notes for token in _FORBIDDEN_NOTE_TOKENS):
            raise EvaluatorOutputError(
                "Adapter notes must not contain aggregated scores"
            )


def _normalized(text: str) -> str:
    """Whitespace normalization shared with §2.1 and the coverage pass."""
    return " ".join(text.split())


def validate_rating_evidence(rating: BulletRating, text: str) -> None:
    """Spec §14.2 invariants: verbatim quotes + score-quote coherence.

    Enforced on every MODEL-produced rating (the terminal's opt-in LLM
    adapter and the web gateway path) before any use. The deterministic
    adapter's echoes are its own extraction results and are not re-judged
    here (its scores are rubric-frozen). Raises EvaluatorOutputError on any
    violation; the caller retries once, then refuses (FR-014).
    """
    quotes = rating.quotes
    if quotes is None:
        raise EvaluatorOutputError("rating missing the quotes object (§14.1)")
    normalized = _normalized(text)
    for name in QUOTE_FIELDS:
        quote = _normalized(getattr(quotes, name))
        if quote and quote not in normalized:
            raise EvaluatorOutputError(
                f"rating {rating.bullet_index}.{name} quote is not verbatim"
            )
    need = _normalized(quotes.user_need)
    feature = _normalized(quotes.product_feature)
    action = _normalized(quotes.action)
    result = _normalized(quotes.result)
    label = f"rating {rating.bullet_index}"
    if rating.context == 2 and (not need or not feature):
        raise EvaluatorOutputError(
            f"{label}: context 2 requires the need and feature quotes"
        )
    if rating.context == 1 and not need:
        raise EvaluatorOutputError(f"{label}: context 1 requires the need quote")
    if rating.context == 0 and need:
        raise EvaluatorOutputError(f"{label}: context 0 forbids a need quote")
    if rating.role_action_clarity >= 1 and not action:
        raise EvaluatorOutputError(
            f"{label}: action {rating.role_action_clarity} requires the action quote"
        )
    if rating.result >= 1 and not result:
        raise EvaluatorOutputError(
            f"{label}: result {rating.result} requires the result quote"
        )
    # The metric quotation is free evidence: no score, no invariant (§14.1).


@dataclass
class BulletEvaluator:
    """The BulletEvaluator port.

    ``evaluate(request)`` returns a BulletRatingResponse. Adapters implement
    the actual rating source — local heuristic or LLM — but all share the
    same request/response schema and validity check.
    """
    rubric_version: str = RUBRIC_VERSION

    def evaluate(self, request: BulletRatingRequest) -> BulletRatingResponse:
        """Evaluate one or more bullets and return structured ratings."""
        raise NotImplementedError("Adapters must implement evaluate()")

    def evaluate_with_retry(
        self,
        request: BulletRatingRequest,
    ) -> BulletRatingResponse:
        """Evaluate with one internal retry on validation failure (FR-014).

        On the first invalid response, retries once. If both attempts fail,
        raises EvaluatorOutputError so the caller can show ERR_* and protect
        user data.
        """
        last_error: Optional[EvaluatorOutputError] = None
        for attempt in range(2):
            try:
                response = self.evaluate(request)
                validate_response(response, len(request.texts))
                return response
            except EvaluatorOutputError as exc:
                last_error = exc
        # Both attempts failed — surface the failure to the caller.
        assert last_error is not None
        raise last_error
