"""Atomic load/save of the single-user document ``data/resume.json``.

Per data-model.md: the document is written atomically via a temp file +
``os.replace`` so a crash never leaves a partial file. Serializes every
entity defined in :mod:`src.jobforward.models.entities`.
Document version 2, rubric-2.0.0 (three dimensions).
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any, Optional

from ..models.entities import (
    ExperienceEntry,
    ExperienceEntryType,
    EntrySource,
    DraftReason,
    Bullet,
    BulletStatus,
    Ratings,
    QuestionRecord,
    QuestionDimension,
    GateDecision,
    ProposalRecord,
    ProposalDecision,
    BulletHistory,
    MatchAction,
    MatchActionType,
    MatchPriority,
    SkillType,
)

DOCUMENT_VERSION = 2
# rubric-3.0.0: the Specific Action checklist (Phase 9,
# specs/001-experience-improvement-flow/checklists/specific-action.md).
# Stored ratings keep the rubric version they were scored under.
DEFAULT_RUBRIC_VERSION = "rubric-3.0.0"


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
        return ratings.as_dict()

    def _serialize_history(self, history: list[BulletHistory]) -> list[dict[str, Any]]:
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
                "dimension": q.dimension.value if q.dimension else None,
                "text": q.text,
                "round": q.round,
                "gate_answer": q.gate_answer.value if q.gate_answer else None,
                "answer": q.answer,
                "skipped": q.skipped,
                "answered_at": q.answered_at,
                "skipped_at": q.skipped_at,
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
            "user_need": bullet.user_need,
            "product_feature": bullet.product_feature,
            "action": bullet.action,
            "result": bullet.result,
            "metric": bullet.metric,
            "part_present": bullet.part_present,
        }

    def _serialize_match_action(
        self, match_action: Optional[MatchAction]
    ) -> Optional[dict[str, Any]]:
        if match_action is None:
            return None
        return {
            "entry_id": match_action.entry_id,
            "action": match_action.action.value,
            "reason": match_action.reason,
            "requirement_id": match_action.requirement_id,
            "rubric_version": match_action.rubric_version,
            "analyzed_at": match_action.analyzed_at,
        }

    def _serialize_entry(self, entry: ExperienceEntry) -> dict[str, Any]:
        return {
            "id": entry.id,
            "type": entry.type.value,
            "title": entry.title,
            "bullets": [self._serialize_bullet(b) for b in entry.bullets],
            "draft_reason": entry.draft_reason.value if entry.draft_reason else None,
            "source": entry.source.value,
            "entry_score": entry.entry_score,
            "rubric_version": entry.rubric_version,
            "match_action": self._serialize_match_action(entry.match_action),
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
            context=data["context"],
            role_action_clarity=data["role_action_clarity"],
            result=data["result"],
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
                dimension=QuestionDimension(q["dimension"]) if q.get("dimension") else None,
                text=q["text"],
                round=q["round"],
                gate_answer=GateDecision(q["gate_answer"]) if q.get("gate_answer") else None,
                answer=q.get("answer"),
                skipped=q.get("skipped", False),
                answered_at=q.get("answered_at"),
                skipped_at=q.get("skipped_at"),
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
            user_need=data.get("user_need"),
            product_feature=data.get("product_feature"),
            action=data.get("action"),
            result=data.get("result"),
            metric=data.get("metric"),
            part_present=data.get("part_present"),
        )

    @staticmethod
    def _deserialize_match_action(data: Optional[dict[str, Any]]) -> Optional[MatchAction]:
        if data is None:
            return None
        return MatchAction(
            entry_id=data["entry_id"],
            action=MatchActionType(data["action"]),
            reason=data["reason"],
            requirement_id=data["requirement_id"],
            rubric_version=data["rubric_version"],
            analyzed_at=data["analyzed_at"],
        )

    @staticmethod
    def _deserialize_entry(data: dict[str, Any]) -> ExperienceEntry:
        return ExperienceEntry(
            id=data["id"],
            type=ExperienceEntryType(data["type"]),
            title=data["title"],
            bullets=[Repository._deserialize_bullet(b) for b in data.get("bullets", [])],
            draft_reason=DraftReason(data["draft_reason"]) if data.get("draft_reason") else None,
            source=EntrySource(data.get("source", "manual")),
            entry_score=data.get("entry_score"),
            rubric_version=data.get("rubric_version"),
            match_action=Repository._deserialize_match_action(data.get("match_action")),
            deleted=data.get("deleted", False),
        )

    # ------------------------------------------------------------------ #
    # Load / save (atomic) + id allocation
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

    @staticmethod
    def next_entry_id(entries: list[ExperienceEntry]) -> int:
        """max(persisted ids) + 1 so restarts never duplicate ids
        (data-model.md id invariant)."""
        return max((e.id for e in entries), default=0) + 1
