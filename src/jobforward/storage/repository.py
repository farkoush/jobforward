"""Atomic load/save of the single-user document ``data/resume.json``.

Per data-model.md and research R-4: the document is written atomically via a
temp file + ``os.replace`` so a crash never leaves a partial file. Serializes
every entity defined in :mod:`src.jobforward.models.entities`.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import tempfile
from pathlib import Path
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

    def _serialize_document(self, entries: list[ExperienceEntry]) -> dict[str, Any]:
        return {
            "document_version": DOCUMENT_VERSION,
            "rubric_version": DEFAULT_RUBRIC_VERSION,
            "entries": [self._serialize_entry(e) for e in entries],
        }

    # ------------------------------------------------------------------ #
    # Deserialization helpers
    # ------------------------------------------------------------------ #
    @staticmethod
    def _deserialize_ratings(data: Optional[dict]) -> Optional[Ratings]:
        if data is None:
            return None
        return Ratings(
            role_action_clarity=data["role_action_clarity"],
            outcome=data["outcome"],
            skill_evidence=data["skill_evidence"],
            structure_scannability=data["structure_scannability"],
        )

    @staticmethod
    def _deserialize_history(data: list[dict[str, Any]]) -> list[BulletHistory]:
        return [
            BulletHistory(
                text=h["text"],
                ratings=Repository._deserialize_ratings(h.get("ratings")),
                rubric_version=h.get("rubric_version"),
                replaced_at=h["replaced_at"],
            )
            for h in data
        ]

    @staticmethod
    def _deserialize_questions(data: list[dict[str, Any]]) -> list[QuestionRecord]:
        return [
            QuestionRecord(
                text=q["text"],
                round=q["round"],
                answer=q.get("answer"),
                rejected=q.get("rejected", False),
                answered_at=q.get("answered_at"),
                rejected_at=q.get("rejected_at"),
            )
            for q in data
        ]

    @staticmethod
    def _deserialize_proposals(data: list[dict[str, Any]]) -> list[ProposalRecord]:
        return [
            ProposalRecord(
                text=p["text"],
                decision=ProposalDecision(p.get("decision", "awaiting")),
                decided_at=p.get("decided_at"),
            )
            for p in data
        ]

    @staticmethod
    def _deserialize_bullet(data: dict[str, Any]) -> Bullet:
        return Bullet(
            id=data["id"],
            text=data["text"],
            status=BulletStatus(data.get("status", "new")),
            ratings=Repository._deserialize_ratings(data.get("ratings")),
            rating_pending=Repository._deserialize_ratings(data.get("rating_pending")),
            rubric_version=data.get("rubric_version"),
            history=Repository._deserialize_history(data.get("history", [])),
            questions=Repository._deserialize_questions(data.get("questions", [])),
            proposals=Repository._deserialize_proposals(data.get("proposals", [])),
            merge_warned=data.get("merge_warned", False),
        )

    @staticmethod
    def _deserialize_entry(data: dict[str, Any]) -> ExperienceEntry:
        return ExperienceEntry(
            id=data["id"],
            type=ExperienceEntryType(data["type"]),
            title=data["title"],
            organization=data.get("organization"),
            start=data.get("start"),
            end=data.get("end"),
            bullets=[Repository._deserialize_bullet(b) for b in data.get("bullets", [])],
            draft=data.get("draft", False),
            overall_score=data.get("overall_score"),
            rubric_version=data.get("rubric_version"),
            deleted=data.get("deleted", False),
        )

    # ------------------------------------------------------------------ #
    # Load / save (atomic)
    # ------------------------------------------------------------------ #
    def load(self) -> list[ExperienceEntry]:
        """Load the document from disk. Returns an empty list if the file
        does not yet exist (first run)."""
        if not self.path.exists():
            return []
        with self.path.open("r", encoding="utf-8") as f:
            doc = json.load(f)
        return [self._deserialize_entry(e) for e in doc.get("entries", [])]

    def save(self, entries: list[ExperienceEntry]) -> None:
        """Atomically save the document to disk via temp file + os.replace."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        document = self._serialize_document(entries)
        tmp_fd, tmp_path = tempfile.mkstemp(
            dir=str(self.path.parent), suffix=".tmp"
        )
        try:
            with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
                json.dump(document, f, ensure_ascii=False, indent=2)
            os.replace(tmp_path, self.path)
        except BaseException:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise
