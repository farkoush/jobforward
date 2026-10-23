"""Data model entities for the Experience Improvement Flow (Level 1 Prototype).

Implemented per `specs/001-experience-improvement-flow/data-model.md`.
All user-facing strings live in ``messages.py``; this module contains no
user-facing text (constitution Principle 10).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional


class ExperienceEntryType(str, Enum):
    """Type of a single experience entry (data-model.md)."""

    JOB = "job"
    PROJECT = "project"
    COURSE = "course"
    SIDE_WORK = "side_work"


class BulletStatus(str, Enum):
    """Bullet status state machine (locked by Clarification Q4).

    new -> analyzed -> (edit/approve) -> edited -> analyzed (after re-analysis)
    Failed analysis keeps the previous label.
    """

    NEW = "new"
    ANALYZED = "analyzed"
    EDITED = "edited"


class ProposalDecision(str, Enum):
    """Decision on a proposed rewrite."""

    APPROVED = "approved"
    REJECTED = "rejected"
    AWAITING = "awaiting"


@dataclass
class Ratings:
    """Four per-dimension scores, each int in {0, 1, 2}.

    Produced by an evaluator adapter; all downstream arithmetic is deterministic
    in scoring/metrics.py — never inside the adapter.
    """

    role_action_clarity: int
    outcome: int
    skill_evidence: int
    structure_scannability: int

    def __post_init__(self) -> None:
        for name in (
            "role_action_clarity",
            "outcome",
            "skill_evidence",
            "structure_scannability",
        ):
            value = getattr(self, name)
            if value not in (0, 1, 2):
                raise ValueError(
                    f"Ratings.{name} must be in {{0, 1, 2}}, got {value!r}"
                )


@dataclass
class QuestionRecord:
    """One question / answer / reject trail for a bullet (FR-009, FR-012)."""

    text: str
    round: int
    answer: Optional[str] = None
    rejected: bool = False
    answered_at: Optional[str] = None
    rejected_at: Optional[str] = None


@dataclass
class ProposalRecord:
    """Final proposed rewrite text + decision + timestamp."""

    text: str
    decision: ProposalDecision = ProposalDecision.AWAITING
    decided_at: Optional[str] = None


@dataclass
class BulletHistory:
    """Previous bullet preserved on every approved replacement."""

    text: str
    ratings: Optional[Ratings]
    rubric_version: Optional[str]
    replaced_at: str


@dataclass
class Bullet:
    """A single bullet inside an experience entry.

    ``text`` is stored EXACTLY as written by the user; never reshaped (P10).
    """

    id: int
    text: str
    status: BulletStatus = BulletStatus.NEW
    ratings: Optional[Ratings] = None
    rating_pending: Optional[Ratings] = None
    rubric_version: Optional[str] = None
    history: list[BulletHistory] = field(default_factory=list)
    questions: list[QuestionRecord] = field(default_factory=list)
    proposals: list[ProposalRecord] = field(default_factory=list)
    merge_warned: bool = False


@dataclass
class ExperienceEntry:
    """A single experience entry (job / project / course / side work)."""

    id: int
    type: ExperienceEntryType
    title: str
    organization: Optional[str] = None
    start: Optional[str] = None
    end: Optional[str] = None
    bullets: list[Bullet] = field(default_factory=list)
    draft: bool = False
    overall_score: Optional[float] = None
    rubric_version: Optional[str] = None
    deleted: bool = False

    def __post_init__(self) -> None:
        # title: non-empty, trimmed (verbatim after trim)
        if not isinstance(self.title, str) or not self.title.strip():
            raise ValueError("ExperienceEntry.title must be a non-empty string")
        self.title = self.title.strip()

        # bullets: length 1-6 enforced by VR-1 (FR-001/FR-002)
        if not 1 <= len(self.bullets) <= 6:
            raise ValueError(
                f"ExperienceEntry must have 1-6 bullets, got {len(self.bullets)}"
            )

        # draft: true iff zero bullets (FR-003 / FR-020)
        self.draft = len(self.bullets) == 0

        # overall_score only when entry has bullets and all are scored
        if self.overall_score is not None and not self.bullets:
            raise ValueError("overall_score must be None for entries without bullets")


def now_iso8601() -> str:
    """Return current UTC time as ISO-8601 string (FR-015)."""

    return datetime.now(timezone.utc).isoformat()

