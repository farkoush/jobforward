"""Data model entities for the Experience Improvement Flow (Level 1 Prototype).

Implemented per `specs/001-experience-improvement-flow/data-model.md`
(rubric-2.0.0: three dimensions — context, role_action_clarity, result).
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
    """Bullet status state machine (locked by Clarification Q4, 2026-10-23).

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


class GateDecision(str, Enum):
    """Answer to the per-bullet rewrite gate (FR-009)."""

    ACCEPTED = "accepted"
    REJECTED = "rejected"


class QuestionDimension(str, Enum):
    """Which framework part a follow-up question covers (spec §6).

    CONTEXT covers the Need question; ROLE_ACTION_CLARITY covers the Action
    question (stored key unchanged); FEATURE and METRIC were added by the
    five-part framework (rubric-3.0.0).
    """

    CONTEXT = "context"
    FEATURE = "feature"
    ROLE_ACTION_CLARITY = "role_action_clarity"
    RESULT = "result"
    METRIC = "metric"


class DraftReason(str, Enum):
    """Why an experience entry is a draft (FR-003)."""

    NO_BULLETS = "no_bullets"
    USER_SAVED = "user_saved"


class EntrySource(str, Enum):
    """Where the entry came from (PDF upload deferred; FR-018)."""

    MANUAL = "manual"


class SkillType(str, Enum):
    """Matcher requirement classification (FR-021)."""

    HARD = "hard"
    SOFT = "soft"


class MatchPriority(str, Enum):
    """Matcher priority classification; red-line groups under REQUIRED."""

    REQUIRED = "required"
    PREFERRED = "preferred"
    BONUS = "bonus"


class MatchActionType(str, Enum):
    """The ONLY legal matcher actions (FR-022); remove/shorten do not exist."""

    HIGHLIGHT = "highlight"
    NO_CHANGE = "no_change"
    NOT_RELEVANT = "not_relevant"


@dataclass
class Ratings:
    """Three per-dimension scores, each int in {0, 1, 2} (rubric-3.0.0).

    Produced by an evaluator adapter; all downstream arithmetic is deterministic
    in scoring/metrics.py — never inside the adapter. The stored key
    ``role_action_clarity`` carries the Specific Action dimension (rubric-3.0.0
    renamed its semantics; the key is unchanged for data compatibility).
    """

    context: int
    role_action_clarity: int
    result: int

    def __post_init__(self) -> None:
        for name in ("context", "role_action_clarity", "result"):
            value = getattr(self, name)
            if value not in (0, 1, 2):
                raise ValueError(
                    f"Ratings.{name} must be in {{0, 1, 2}}, got {value!r}"
                )

    def as_dict(self) -> dict[str, int]:
        return {
            "context": self.context,
            "role_action_clarity": self.role_action_clarity,
            "result": self.result,
        }


PART_NAMES = ("user_need", "product_feature", "action", "result", "metric")


@dataclass
class BulletParts:
    """The five framework parts extracted from one bullet (spec §2/§4).

    Every part is a VERBATIM substring of the bullet text or empty — the
    extractor never paraphrases or invents (constitution Principle 1).
    """

    user_need: str = ""
    product_feature: str = ""
    action: str = ""
    result: str = ""
    metric: str = ""

    def present(self) -> dict[str, bool]:
        """The five ``part_present`` booleans (spec §4)."""
        return {
            name: bool(getattr(self, name).strip()) for name in PART_NAMES
        }


@dataclass
class QuestionRecord:
    """One gate/question/answer/skip trail entry for a bullet (FR-009)."""

    dimension: Optional[QuestionDimension]
    text: str
    round: int
    gate_answer: Optional[GateDecision] = None
    answer: Optional[str] = None
    skipped: bool = False
    answered_at: Optional[str] = None
    skipped_at: Optional[str] = None


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
    The five part fields (rubric-3.0.0, spec §4) hold verbatim extracted
    fragments; ``None`` means the bullet was stored before Phase 10 or the
    parts were never extracted — old documents load unchanged.
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
    user_need: Optional[str] = None
    product_feature: Optional[str] = None
    action: Optional[str] = None
    result: Optional[str] = None
    metric: Optional[str] = None
    part_present: Optional[dict[str, bool]] = None

    def parts_or_extract(self):
        """Stored parts, or a fresh extraction for pre-Phase-10 bullets."""
        from ..flow.parts import extract_parts

        if self.part_present is not None and self.user_need is not None:
            return BulletParts(
                user_need=self.user_need or "",
                product_feature=self.product_feature or "",
                action=self.action or "",
                result=self.result or "",
                metric=self.metric or "",
            )
        return extract_parts(self.text)


@dataclass
class JobRequirement:
    """One skill extracted from the pasted posting (FR-021)."""

    id: int
    text: str  # verbatim posting text; never modified
    skill_type: SkillType
    priority: MatchPriority


@dataclass
class MatchAction:
    """Per-entry matcher output (FR-022); never affects any score."""

    entry_id: int
    action: MatchActionType
    reason: str
    requirement_id: int
    rubric_version: str
    analyzed_at: str


@dataclass
class ExperienceEntry:
    """A single experience entry (job / project / course / side work).

    No organization/start/end fields exist (decision 2026-10-25).
    """

    id: int
    type: ExperienceEntryType
    title: str
    bullets: list[Bullet] = field(default_factory=list)
    draft_reason: Optional[DraftReason] = None
    source: EntrySource = EntrySource.MANUAL
    entry_score: Optional[float] = None
    rubric_version: Optional[str] = None
    match_action: Optional[MatchAction] = None
    deleted: bool = False

    def __post_init__(self) -> None:
        # title: non-empty, trimmed (verbatim after trim)
        if not isinstance(self.title, str) or not self.title.strip():
            raise ValueError("ExperienceEntry.title must be a non-empty string")
        self.title = self.title.strip()

        # bullets: 0 allowed (draft FR-003), 1-6 normal, >6 rejected VR-1 FR-002
        if len(self.bullets) > 6:
            raise ValueError(
                f"ExperienceEntry must have at most 6 bullets, got {len(self.bullets)}"
            )

        # draft: true iff zero bullets (FR-003 / FR-020) or user-saved
        if not self.bullets:
            self.draft_reason = DraftReason.NO_BULLETS

    @property
    def draft(self) -> bool:
        """Draft iff no bullets (FR-003) or the user saved it as a draft."""
        return not self.bullets or self.draft_reason == DraftReason.USER_SAVED

    def save_as_draft(self) -> None:
        """User decision: keep the whole entry as a draft (FR-009)."""
        self.draft_reason = DraftReason.USER_SAVED

    def add_history(self, bullet: Bullet, replaced_at: str) -> None:
        """Preserve the previous bullet text+ratings in history (FR-011)."""
        bullet.history.append(
            BulletHistory(
                text=bullet.text,
                ratings=bullet.ratings,
                rubric_version=bullet.rubric_version,
                replaced_at=replaced_at,
            )
        )


def now_iso8601() -> str:
    """Return current UTC time as ISO-8601 string (FR-015)."""
    return datetime.now(timezone.utc).isoformat()
