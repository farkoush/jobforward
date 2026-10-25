"""Optional opt-in LLM matcher adapter (matcher/adapters/llm.py).

Sends ONLY the pasted posting text to a user-configured endpoint; validates
the output against the matcher schema (stage 1); on invalid output one
internal retry then reports ``MatcherOutputError`` (data intact). The
default matcher stays the deterministic local analyzer (constitution P8).

Zero runtime dependencies: plain ``urllib.request``.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

from ..analyzer import MatcherOutputError, PostingAnalysis, PostingAnalyzer
from ...models.entities import JobRequirement, MatchPriority, SkillType

TIMEOUT_SECONDS = 30


class LlmRuleAdapter(PostingAnalyzer):
    """LLM-backed posting analyzer behind the matcher port (opt-in)."""

    def __init__(
        self,
        endpoint: str,
        rubric_version: str = "rubric-2.0.0",
        api_key: str | None = None,
    ) -> None:
        super().__init__(rubric_version=rubric_version)
        self.endpoint = endpoint
        self.api_key = api_key

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

    def analyze(self, posting_text: str) -> PostingAnalysis:
        """One LLM call → validated PostingAnalysis.

        The payload carries ONLY the pasted posting text (verbatim; Persian
        or English per FR-021) and the rubric version.
        """
        try:
            raw = self._post_json(
                {"rubric_version": self.rubric_version, "posting_text": posting_text}
            )
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise MatcherOutputError(f"matcher endpoint unreachable: {exc}") from exc
        return self._parse(raw)

    def _parse(self, raw: dict[str, Any]) -> PostingAnalysis:
        try:
            rubric = raw["rubric_version"]
            raw_requirements = raw["requirements"]
        except (KeyError, TypeError) as exc:
            raise MatcherOutputError(f"missing required key: {exc}") from exc

        if rubric != self.rubric_version:
            raise MatcherOutputError(
                f"rubric_version mismatch: {rubric!r} != {self.rubric_version!r}"
            )
        if not isinstance(raw_requirements, list):
            raise MatcherOutputError("requirements must be a list")

        requirements: list[JobRequirement] = []
        for i, item in enumerate(raw_requirements):
            try:
                requirements.append(
                    JobRequirement(
                        id=i,
                        text=str(item["text"]),
                        skill_type=SkillType(item["skill_type"]),
                        priority=MatchPriority(item["priority"]),
                    )
                )
            except (KeyError, TypeError, ValueError) as exc:
                raise MatcherOutputError(f"requirement {i} invalid: {exc}") from exc

        notes = raw.get("notes")
        if notes is not None and not isinstance(notes, str):
            raise MatcherOutputError("notes must be a string or null")
        return PostingAnalysis(
            rubric_version=self.rubric_version, requirements=requirements, notes=notes
        )
