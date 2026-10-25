"""Append-only JSONL event logger for `data/events.log.jsonl`.

Per data-model.md: every important event is logged with an ISO-8601 UTC
timestamp so PRD metrics stay computable without rewriting code
(constitution Principle 7).
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

EVENT_LOG_PATH = Path("data/events.log.jsonl")

# Event types from data-model.md
EVENT_PATH_START = "path_start"
EVENT_ANALYSIS_COMPLETED = "analysis_completed"
EVENT_PROPOSAL_ACCEPTED = "proposal_accepted"
EVENT_PROPOSAL_REJECTED = "proposal_rejected"
EVENT_QUESTION_REJECTED = "question_rejected"
EVENT_QUESTION_SKIPPED = "question_skipped"
EVENT_ENTRY_SAVED_AS_DRAFT = "entry_saved_as_draft"
EVENT_BULLET_DELETED = "bullet_deleted"
EVENT_ENTRY_DELETED = "entry_deleted"
EVENT_SCORE_BEFORE = "score_before"
EVENT_SCORE_AFTER = "score_after"
EVENT_POSTING_ANALYZED = "posting_analyzed"
EVENT_MATCH_ACTION_ASSIGNED = "match_action_assigned"
EVENT_EVALUATOR_INVALID_OUTPUT = "evaluator_invalid_output"
EVENT_EVALUATOR_RETRY = "evaluator_retry"

ALL_EVENT_TYPES = frozenset({
    EVENT_PATH_START,
    EVENT_ANALYSIS_COMPLETED,
    EVENT_PROPOSAL_ACCEPTED,
    EVENT_PROPOSAL_REJECTED,
    EVENT_QUESTION_REJECTED,
    EVENT_QUESTION_SKIPPED,
    EVENT_ENTRY_SAVED_AS_DRAFT,
    EVENT_BULLET_DELETED,
    EVENT_ENTRY_DELETED,
    EVENT_SCORE_BEFORE,
    EVENT_SCORE_AFTER,
    EVENT_POSTING_ANALYZED,
    EVENT_MATCH_ACTION_ASSIGNED,
    EVENT_EVALUATOR_INVALID_OUTPUT,
    EVENT_EVALUATOR_RETRY,
})


def now_iso8601() -> str:
    """Return current UTC time as ISO-8601 string (FR-015)."""
    return datetime.now(timezone.utc).isoformat()


class EventLogger:
    """Append-only JSONL event logger.

    Each line is a single JSON object with at least ``ts`` and ``type``
    fields, plus an optional ``context`` object carrying event-specific data
    (entry_id, bullet_id, rubric_version, numeric before/after scores, etc.).
    """

    def __init__(self, path: str | Path = EVENT_LOG_PATH) -> None:
        self.path = Path(path)

    def log(
        self,
        event_type: str,
        context: Optional[dict[str, Any]] = None,
    ) -> None:
        """Append one event to the JSONL log.

        Raises ``ValueError`` if ``event_type`` is not a known event type.
        """
        if event_type not in ALL_EVENT_TYPES:
            raise ValueError(
                f"Unknown event type {event_type!r}; allowed: "
                f"{sorted(s for s in ALL_EVENT_TYPES)}"
            )

        self.path.parent.mkdir(parents=True, exist_ok=True)
        entry: dict[str, Any] = {
            "ts": now_iso8601(),
            "type": event_type,
        }
        if context is not None:
            entry["context"] = context

        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False))
            f.write("\n")

    # Convenience methods for every event type
    def path_start(self, context: Optional[dict[str, Any]] = None) -> None:
        self.log(EVENT_PATH_START, context)

    def analysis_completed(self, context: Optional[dict[str, Any]] = None) -> None:
        self.log(EVENT_ANALYSIS_COMPLETED, context)

    def proposal_accepted(self, context: Optional[dict[str, Any]] = None) -> None:
        self.log(EVENT_PROPOSAL_ACCEPTED, context)

    def proposal_rejected(self, context: Optional[dict[str, Any]] = None) -> None:
        self.log(EVENT_PROPOSAL_REJECTED, context)

    def question_rejected(self, context: Optional[dict[str, Any]] = None) -> None:
        self.log(EVENT_QUESTION_REJECTED, context)

    def question_skipped(self, context: Optional[dict[str, Any]] = None) -> None:
        self.log(EVENT_QUESTION_SKIPPED, context)

    def entry_saved_as_draft(self, context: Optional[dict[str, Any]] = None) -> None:
        self.log(EVENT_ENTRY_SAVED_AS_DRAFT, context)

    def bullet_deleted(self, context: Optional[dict[str, Any]] = None) -> None:
        self.log(EVENT_BULLET_DELETED, context)

    def entry_deleted(self, context: Optional[dict[str, Any]] = None) -> None:
        self.log(EVENT_ENTRY_DELETED, context)

    def score_before(self, context: Optional[dict[str, Any]] = None) -> None:
        self.log(EVENT_SCORE_BEFORE, context)

    def score_after(self, context: Optional[dict[str, Any]] = None) -> None:
        self.log(EVENT_SCORE_AFTER, context)

    def posting_analyzed(self, context: Optional[dict[str, Any]] = None) -> None:
        self.log(EVENT_POSTING_ANALYZED, context)

    def match_action_assigned(self, context: Optional[dict[str, Any]] = None) -> None:
        self.log(EVENT_MATCH_ACTION_ASSIGNED, context)

    def evaluator_invalid_output(self, context: Optional[dict[str, Any]] = None) -> None:
        self.log(EVENT_EVALUATOR_INVALID_OUTPUT, context)

    def evaluator_retry(self, context: Optional[dict[str, Any]] = None) -> None:
        self.log(EVENT_EVALUATOR_RETRY, context)
