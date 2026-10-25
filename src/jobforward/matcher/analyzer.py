"""Matcher port: pasted posting → validated JobRequirement list (FR-021).

Stage 1 of the JD matcher (constitution P6): full posting analysis. Each
extracted requirement is classified by skill_type (hard/soft) and priority
(required/preferred/bonus; red-line groups under required). The posting text
is never modified and may be Persian or English (FR-021 exemption from the
English-input rule).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

from ..models.entities import JobRequirement, MatchPriority, SkillType

LEGAL_SKILL_TYPES = frozenset({SkillType.HARD, SkillType.SOFT})
LEGAL_PRIORITIES = frozenset({
    MatchPriority.REQUIRED,
    MatchPriority.PREFERRED,
    MatchPriority.BONUS,
})

# Red-line phrases (FR-021): any requirement containing one of these MUST be
# classified `required` — enforced by the shared validator, not just by an
# adapter's classification heuristic.
_REDLINE = re.compile(
    r"\b(must have|minimum requirement|red.line|non.negotiable|dealbreaker)\b",
    re.IGNORECASE,
)


@dataclass
class PostingAnalysis:
    """Stage-1 output (contracts matcher-output schema)."""

    rubric_version: str
    requirements: list[JobRequirement] = field(default_factory=list)
    notes: Optional[str] = None


class MatcherOutputError(Exception):
    """Raised when matcher output fails schema validation (FR-021/VR-9)."""


@dataclass
class PostingAnalyzer:
    """The PostingAnalyzer port. Adapters implement the analysis source."""

    rubric_version: str = "rubric-2.0.0"

    def analyze(self, posting_text: str) -> PostingAnalysis:
        raise NotImplementedError("Adapters must implement analyze()")

    def analyze_with_retry(self, posting_text: str) -> PostingAnalysis:
        """One internal retry on validation failure, then raise (FR-014)."""
        last_error: Optional[MatcherOutputError] = None
        for _attempt in range(2):
            try:
                analysis = self.analyze(posting_text)
                validate_analysis(analysis)
                return analysis
            except MatcherOutputError as exc:
                last_error = exc
        assert last_error is not None
        raise last_error


def validate_analysis(analysis: PostingAnalysis) -> None:
    """Shared validity check for matcher stage-1 output (VR-9)."""
    if analysis.rubric_version != "rubric-2.0.0":
        raise MatcherOutputError(
            f"unexpected rubric_version {analysis.rubric_version!r}"
        )
    ids: set[int] = set()
    for req in analysis.requirements:
        if req.id in ids:
            raise MatcherOutputError(f"duplicate requirement id {req.id}")
        ids.add(req.id)
        if req.skill_type not in LEGAL_SKILL_TYPES:
            raise MatcherOutputError(
                f"requirement {req.id}: illegal skill_type {req.skill_type!r}"
            )
        if req.priority not in LEGAL_PRIORITIES:
            raise MatcherOutputError(
                f"requirement {req.id}: illegal priority {req.priority!r}"
            )
        if _REDLINE.search(req.text) and req.priority != MatchPriority.REQUIRED:
            raise MatcherOutputError(
                f"requirement {req.id}: red-line requirement must be "
                f"classified 'required', got {req.priority.value!r}"
            )
        if not req.text.strip():
            raise MatcherOutputError(f"requirement {req.id}: empty text")
