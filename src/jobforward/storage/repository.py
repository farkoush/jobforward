"""Atomic load/save of the single-user document ``data/resume.json``.

Per data-model.md and research R-4: the document is written atomically via a
temp file + ``os.replace`` so a crash never leaves a partial file. Serializes
every entity defined in :mod:`src.jobforward.models.entities`.
"""

from __future__ import annotations

import json
import os
import tempfile
from typing import Any, Optional

from ..models.entities import (
    ExperienceEntry,
    ExperienceEntryType,
    Bullet,
    BulletStatus,
    Ratings,
    QuestionRecord,
    ProposalRecord,
    BulletHistory,
    ProposalDecision,
)
from ..models.status import now_iso8601

DOCUMENT_VERSION = 1
DEFAULT_RUBRIC_VERSION = "rubric-1.0.0"


class Repository:
    """Persists a single-user resume document atomically."""

    def __init__(self, path: str | Path = "data/resume.json") -> None:
        self.path = Path(path)

    # ------------------------------------------------------------------ #
    # Serialization helpers
    # ------------------------------------------------------------------ #
    def _serialize_ratings(self, ratings: Optional[Ratings]) -> Optional[dict]:
        if ratings is None:
            return None
        return {
            "role_action_clarity": ratings.role_action_clarity,
            "outcome": ratings.outcome,
            "skill_evidence": ratings.skill_evidence,
            "structure_scannability": ratings.structure_scannability,
        }


    def _serialize_history(
        self, history: list[BulletHistory]
    ) -> list[dict[str, Any]]:
        return [
            {
                "text": h.text,
                "ratings": self._serialize_ratings(h.ratings),
                "rubric_version": h.rubric_version,
                "replaced_at": h.replaced_at,
            }
            for h in history
        ]

    def _serialize_questions(
        self, questions: list[QuestionRecord]
    ) -> list[dict[str, Any]]:
        return [
            {
                "text": q.text,
                "round": q.round,
                "answer": q.answer,
                "rejected": q.rejected,
                "answered_at": q.answered_at,
                "rejected_at": q.rejected_at,
            }
            for q in questions
        ]

    def _serialize_proposals(
        self, proposals: list[ProposalRecord]
    ) -> list[dict[str, Any]]:
        return [
            {
                "text": p.text,
                "decision": p.decision.value,
                "decided_at": p.decided_at,
            }
            for p in proposals
        ]

    def _serialize_bullet(self, bullet: Bullet) -> dict[str, Any]:
        return {
            "id": bullet.id,
            "text": bullet.text,
            "status": bullet.status.value,
            "ratings": self._serialize_ratings(bullet.ratings),
            "rating_pending": self._serialize_ratings(bullet.rating_pending),
            "rubric_version": bullet.rubric_version,
            "history": self._serialize_history(bullet.history),
            "questions": self._serialize_questions(bullet.questions),
            "proposals": self._serialize_proposals(bullet.proposals),
            "merge_warned": bullet.merge_warned,
        }

    def _serialize_entry(self, entry: ExperienceEntry) -> dict[str, Any]:
        return {
            "id": entry.id,
            "type": entry.type.value,
            "title": entry.title,
            "organization": entry.organization,
            "start": entry.start,
            "end": entry.end,
            "bullets": [self._serialize_bullet(b) for b in entry.bullets],
            "draft": entry.draft,
            "overall_score": entry.overall_score,
            "rubric_version": entry.rubric_version,
            "deleted": entry.deleted,
        }
