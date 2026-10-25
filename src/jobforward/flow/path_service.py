"""Entry recording and validation service (flow/path_service.py).

Implements User Story 1 (P1): the user records an experience entry with
1–6 bullets and sees per-dimension, experience, and overall scores.

Responsibilities (per tasks.md T015):
  - add_entry() enforces VR-1 (>6 bullets rejected, FR-002)
  - zero bullets → draft + suggestion (FR-003)
  - sections saved verbatim via Repository
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from ..models.entities import (
    ExperienceEntry,
    ExperienceEntryType,
    Bullet,
    BulletStatus,
)
from ..storage.repository import Repository, DEFAULT_RUBRIC_VERSION


@dataclass
class EntryResult:
    """Outcome of add_entry()."""

    entry: Optional[ExperienceEntry] = None
    error: Optional[str] = None
    is_draft: bool = False


class PathService:
    """Orchestrates entry recording and validation."""

    def __init__(self, repository: Repository) -> None:
        self.repository = repository

    def add_entry(
        self,
        entry_id: int,
        entry_type: ExperienceEntryType,
        title: str,
        organization: Optional[str],
        start: Optional[str],
        end: Optional[str],
        bullets: list[str],
    ) -> EntryResult:
        """Create and persist an experience entry.

        Returns an EntryResult with either the persisted entry or an error
        message. Never raises for validation failures — errors are returned
        so the CLI can show a Persian prompt and let the user retry.
        """
        # VR-1: more than 6 bullets → explicit rejection (FR-002)
        if len(bullets) > 6:
            return EntryResult(
                error="ERR_TOO_MANY_BULLETS",
                is_draft=False,
            )

        # Build Bullet objects (verbatim text, status NEW)
        bullet_objs = [
            Bullet(id=i + 1, text=b, status=BulletStatus.NEW)
            for i, b in enumerate(bullets)
        ]

        # Zero bullets → draft (FR-003); draft entries are excluded from
        # the overall average by the scoring layer.
        entry = ExperienceEntry(
            id=entry_id,
            type=entry_type,
            title=title,
            organization=organization,
            start=start,
            end=end,
            bullets=bullet_objs,
            draft=len(bullets) == 0,
        )

        # Persist atomically via repository
        existing = self.repository.load()
        existing.append(entry)
        self.repository.save(existing)

        return EntryResult(
            entry=entry,
            is_draft=entry.draft,
        )
