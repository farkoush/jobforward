"""Optional opt-in LLM scoring adapter (scoring/adapters/llm.py).

Sends ONLY verbatim bullet text (+ the user's answers when assembling a
rewrite) to a user-configured endpoint; validates output against the
three-dimension evaluator schema; on invalid output one internal retry then
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

from ..evaluator import (
    BulletEvaluator,
    BulletRatingRequest,
    BulletRatingResponse,
    BulletRating,
    EvaluatorOutputError,
)

TIMEOUT_SECONDS = 30


class LlmHeuristicAdapter(BulletEvaluator):
    """LLM-backed adapter behind the evaluator port (opt-in).

    ``endpoint`` must return JSON matching the evaluator contract:
    ``{"rubric_version": ..., "ratings": [{"bullet_index", "context",
    "role_action_clarity", "result"}...], "notes"}``.
    """

    def __init__(
        self,
        endpoint: str,
        rubric_version: str = "rubric-3.0.0",
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

        return self._parse(raw, len(request.texts))

    def _parse(self, raw: dict[str, Any], bullet_count: int) -> BulletRatingResponse:
        """Schema-parse the raw JSON; any deviation → EvaluatorOutputError.

        No arithmetic, no text changes — parse only (constitution P4).
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
                    )
                )
            except (KeyError, TypeError, ValueError) as exc:
                raise EvaluatorOutputError(f"rating {i} invalid: {exc}") from exc

        notes = raw.get("notes")
        if notes is not None and not isinstance(notes, str):
            raise EvaluatorOutputError("notes must be a string or null")
        return BulletRatingResponse(
            rubric_version=self.rubric_version, ratings=ratings, notes=notes
        )
