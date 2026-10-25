"""Deterministic local posting analyzer (matcher/adapters/local.py).

Rule-based, fully offline classification of the pasted posting text
(research R-9): requirement lines are extracted and classified by skill_type
(hard/soft) and priority (required/preferred/bonus; red-line phrases force
`required`). Deterministic so the default run is repeatable and testable.
"""

from __future__ import annotations

import re

from ..analyzer import PostingAnalysis, PostingAnalyzer
from ...models.entities import JobRequirement, MatchPriority, SkillType

# Priority markers. Red-line phrases MUST classify as required (FR-021).
_REDLINE = re.compile(
    r"\b(must have|minimum requirement|red.line|non.negotiable|dealbreaker)\b",
    re.IGNORECASE,
)
_REQUIRED = re.compile(
    r"\b(required|must|minimum|at least|needs? to have)\b", re.IGNORECASE
)
_PREFERRED = re.compile(r"\b(preferred|should have)\b", re.IGNORECASE)
_BONUS = re.compile(r"\b(bonus|nice to have|plus|a plus|desirable)\b", re.IGNORECASE)

# Hard-skill markers (product-management-relevant, extendable rubric).
_HARD = re.compile(
    r"\b(sql|python|excel|tableau|power bi|looker|figma|analytics|a/b|"
    r"experiment|roadmap|backlog|user stor(y|ies)|dashboard|kpi|metrics|"
    r"wireframe|prototype|api|data model|sql queries|reporting|"
    r"product analytics|market research)\b",
    re.IGNORECASE,
)
# Soft-skill markers.
_SOFT = re.compile(
    r"\b(communication|stakeholder|leadership|collaboration|teamwork|"
    r"mentoring|written|presentation|negotiation|cross.functional|"
    r"problem.solving|time management)\b",
    re.IGNORECASE,
)


def _split_lines(posting_text: str) -> list[str]:
    """Requirement candidates: non-empty lines / sentence fragments."""
    candidates: list[str] = []
    for raw in posting_text.splitlines():
        line = raw.strip().lstrip("-•*· ").strip()
        if not line:
            continue
        candidates.append(line)
    return candidates


class LocalRuleAdapter(PostingAnalyzer):
    """Deterministic keyword/rule adapter (default in v1)."""

    def analyze(self, posting_text: str) -> PostingAnalysis:
        requirements: list[JobRequirement] = []
        next_id = 0
        for line in _split_lines(posting_text):
            skill_type = self._classify_skill_type(line)
            if skill_type is None:
                continue  # not a recognizable requirement line
            requirements.append(
                JobRequirement(
                    id=next_id,
                    text=line,  # verbatim posting text; never modified
                    skill_type=skill_type,
                    priority=self._classify_priority(line),
                )
            )
            next_id += 1

        return PostingAnalysis(
            rubric_version=self.rubric_version,
            requirements=requirements,
            notes=None,
        )

    @staticmethod
    def _classify_skill_type(line: str) -> SkillType | None:
        if _REDLINE.search(line):
            # A red-line requirement still needs a type; hard/soft decided by
            # the remaining markers (hard wins ties).
            if _SOFT.search(line) and not _HARD.search(line):
                return SkillType.SOFT
            return SkillType.HARD
        if _HARD.search(line):
            return SkillType.HARD
        if _SOFT.search(line):
            return SkillType.SOFT
        return None

    @staticmethod
    def _classify_priority(line: str) -> MatchPriority:
        if _REDLINE.search(line) or _REQUIRED.search(line):
            return MatchPriority.REQUIRED
        if _BONUS.search(line):
            return MatchPriority.BONUS
        if _PREFERRED.search(line):
            return MatchPriority.PREFERRED
        # Unmarked lines default to required (a posting lists demands).
        return MatchPriority.REQUIRED
