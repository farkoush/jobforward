"""Optional opt-in LLM scoring adapter (scoring/adapters/llm.py).

Sends ONLY verbatim bullet text (+ the user's answers when assembling a
rewrite) to a user-configured endpoint; validates output against the
three-dimension evaluator schema PLUS the §14 evidence invariants (verbatim
quotes + score-quote coherence); on invalid output one internal retry then
reports ``EvaluatorOutputError`` (data intact — FR-014); the caller logs
``evaluator_invalid_output`` / ``evaluator_retry``. The default run stays
fully local (constitution P8): this adapter is used only when the user
explicitly enables it.

Zero runtime dependencies: plain ``urllib.request``.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any, Optional

from ...rubric import RUBRIC_VERSION
from ..evaluator import (
    QUOTE_FIELDS,
    BulletEvaluator,
    BulletRatingRequest,
    BulletRatingResponse,
    BulletRating,
    EvaluatorOutputError,
    RatingQuotes,
    validate_rating_evidence,
)

TIMEOUT_SECONDS = 30


class LlmHeuristicAdapter(BulletEvaluator):
    """LLM-backed adapter behind the evaluator port (opt-in).

    ``endpoint`` must return JSON matching the evaluator contract (§14.1):
    ``{"rubric_version": ..., "ratings": [{"bullet_index", "context",
    "role_action_clarity", "result", "quotes": {"user_need",
    "product_feature", "action", "result", "metric"}}...], "notes"}``.
    """

    def __init__(
        self,
        endpoint: str,
        rubric_version: str = RUBRIC_VERSION,
        api_key: Optional[str] = None,
    ) -> None:
        super().__init__(rubric_version=rubric_version)
        self.endpoint = endpoint
        self.api_key = api_key

    # ------------------------------------------------------------------ #
    # Transport (isolated for tests)
    # ------------------------------------------------------------------ #
    def _post_json(self, payload: dict[str, Any]) -> dict[str, Any]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        request = urllib.request.Request(
            self.endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            return json.loads(response.read().decode("utf-8"))

    # ------------------------------------------------------------------ #
    # Port implementation
    # ------------------------------------------------------------------ #
    def evaluate(self, request: BulletRatingRequest) -> BulletRatingResponse:
        """One LLM call → validated BulletRatingResponse.

        The payload carries ONLY verbatim bullet texts (and answers when
        present) plus the rubric version — never any job posting (FR-006),
        never any user document beyond the bullet texts (P8).
        """
        try:
            raw = self._post_json(
                {
                    "rubric_version": request.rubric_version,
                    "bullets": request.texts,
                    **({"answers": request.answers} if request.answers else {}),
                }
            )
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise EvaluatorOutputError(f"evaluator endpoint unreachable: {exc}") from exc

        return self._parse(raw, len(request.texts), request.texts)

    def _parse(
        self, raw: dict[str, Any], bullet_count: int, texts: list[str]
    ) -> BulletRatingResponse:
        """Schema-parse the raw JSON; any deviation → EvaluatorOutputError.

        No arithmetic, no text changes — parse only (constitution P4). The
        §14.2 evidence invariants (verbatim quotes + score-quote coherence)
        are checked here, before the response leaves the adapter.
        """
        try:
            rubric = raw["rubric_version"]
            raw_ratings = raw["ratings"]
        except (KeyError, TypeError) as exc:
            raise EvaluatorOutputError(f"missing required key: {exc}") from exc

        if rubric != self.rubric_version:
            raise EvaluatorOutputError(
                f"rubric_version mismatch: {rubric!r} != {self.rubric_version!r}"
            )
        if not isinstance(raw_ratings, list) or len(raw_ratings) != bullet_count:
            raise EvaluatorOutputError("one rating per requested bullet required")

        ratings: list[BulletRating] = []
        for i, item in enumerate(raw_ratings):
            try:
                ratings.append(
                    BulletRating(
                        bullet_index=i,
                        context=int(item["context"]),
                        role_action_clarity=int(item["role_action_clarity"]),
                        result=int(item["result"]),
                        quotes=self._parse_quotes(i, item),
                    )
                )
            except (KeyError, TypeError, ValueError) as exc:
                raise EvaluatorOutputError(f"rating {i} invalid: {exc}") from exc

        for i, rating in enumerate(ratings):
            validate_rating_evidence(rating, texts[i])

        notes = raw.get("notes")
        if notes is not None and not isinstance(notes, str):
            raise EvaluatorOutputError("notes must be a string or null")
        return BulletRatingResponse(
            rubric_version=self.rubric_version, ratings=ratings, notes=notes
        )

    @staticmethod
    def _parse_quotes(index: int, item: dict[str, Any]) -> RatingQuotes:
        """The per-rating quotes object is REQUIRED (§14.1); every field is
        a string (empty when the bullet has no such part)."""
        raw_quotes = item.get("quotes")
        if not isinstance(raw_quotes, dict):
            raise EvaluatorOutputError(f"rating {index} missing the quotes object")
        values: dict[str, str] = {}
        for name in QUOTE_FIELDS:
            value = raw_quotes.get(name)
            if not isinstance(value, str):
                raise EvaluatorOutputError(f"rating {index}.{name} quote must be a string")
            values[name] = value
        return RatingQuotes(**values)
