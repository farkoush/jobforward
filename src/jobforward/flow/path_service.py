"""Entry recording, validation, and mutation services (flow/path_service.py).

Implements the user paths from spec.md: record an entry (US1), save as
draft / delete / copy (US2 partial-answers, FR-020 deletion, FR-019 copy),
with the English-input boundary (VR-8) and verbatim bullet storage.

All mutations happen through explicit service calls triggered by user
actions in the CLI — never silently (constitution Principle 2).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

from ..models.entities import (
    ExperienceEntry,
    ExperienceEntryType,
    Bullet,
    BulletStatus,
    DraftReason,
)
from ..storage.repository import Repository, DEFAULT_RUBRIC_VERSION

# Scripts that are NOT English (FR-017). The posting path never calls this
# check (FR-021 exemption).
_NON_ENGLISH_RANGES = (
    (0x0370, 0x03FF),   # Greek
    (0x0400, 0x04FF),   # Cyrillic
    (0x0590, 0x05FF),   # Hebrew
    (0x0600, 0x06FF),   # Arabic (incl. Persian)
    (0x0750, 0x077F),   # Arabic supplement
    (0x0900, 0x0DFF),   # Indic scripts
    (0x3000, 0x9FFF),   # CJK
    (0xAC00, 0xD7AF),   # Hangul
)
# Latin letters beyond ASCII are English-compatible (é, ü, ñ …).
_ALLOWED_HIGH_RANGES = (
    (0x00C0, 0x024F),   # Latin-1 supplement + Latin extended
    (0x2000, 0x206F),   # general punctuation (— … “ ”)
)


@dataclass
class EntryResult:
    """Outcome of add_entry()."""

    entry: Optional[ExperienceEntry] = None
    error: Optional[str] = None
    is_draft: bool = False


def contains_non_english(text: str) -> bool:
    """True if the text contains characters from non-English scripts
    (FR-017). ASCII, Latin-extended letters, and general punctuation pass.
    """
    for ch in text:
        code = ord(ch)
        if code < 0x80:
            continue
        if any(lo <= code <= hi for lo, hi in _ALLOWED_HIGH_RANGES):
            continue
        if any(lo <= code <= hi for lo, hi in _NON_ENGLISH_RANGES):
            return True
        # Any other high codepoint (emoji, symbols) is suspicious but is not
        # another language script — allow it to keep verbatim storage intact.
    return False


def validate_english_bullet(text: str) -> Optional[str]:
    """Return an error id if the bullet/answer text is not English."""
    if contains_non_english(text):
        return "ERR_NON_ENGLISH_INPUT"
    return None


class PathService:
    """Orchestrates entry recording, drafts, deletion, and copy-text."""

    def __init__(self, repository: Repository) -> None:
        self.repository = repository

    # ------------------------------------------------------------------ #
    # Recording (US1)
    # ------------------------------------------------------------------ #
    def add_entry(
        self,
        entry_type: ExperienceEntryType,
        title: str,
        bullets: list[str],
    ) -> EntryResult:
        """Create and persist an experience entry.

        Returns an EntryResult with either the persisted entry or an error
        message id. Never raises for validation failures — errors are
        returned so the CLI can show the prompt and let the user retry.
        """
        # VR-1: more than 6 bullets → explicit rejection (FR-002)
        if len(bullets) > 6:
            return EntryResult(error="ERR_TOO_MANY_BULLETS")

        # English-only boundary (VR-8): bullets must be English; the title
        # is user input too and must be English.
        for text in [title, *bullets]:
            if contains_non_english(text):
                return EntryResult(error="ERR_NON_ENGLISH_INPUT")

        entries = self.repository.load()
        entry = ExperienceEntry(
            id=Repository.next_entry_id(entries),
            type=entry_type,
            title=title,
            bullets=[
                Bullet(id=i + 1, text=b, status=BulletStatus.NEW)
                for i, b in enumerate(bullets)
            ],
        )
        entries.append(entry)
        self.repository.save(entries)
        return EntryResult(entry=entry, is_draft=entry.draft)

    # ------------------------------------------------------------------ #
    # Drafts (FR-003 / FR-009 partial-answers branch)
    # ------------------------------------------------------------------ #
    def save_entry_as_draft(self, entry: ExperienceEntry) -> None:
        """User decision: keep the whole entry as a draft (FR-009)."""
        entry.save_as_draft()
        self._persist_entry(entry)

    # ------------------------------------------------------------------ #
    # Direct bullet edit (FR-012)
    # ------------------------------------------------------------------ #
    def edit_bullet_text(self, entry: ExperienceEntry, bullet_id: int, text: str) -> Optional[str]:
        """Direct user edit = explicit consent; flips only that bullet to
        'edited' for re-analysis. Returns an error id or None."""
        if contains_non_english(text):
            return "ERR_NON_ENGLISH_INPUT"
        bullet = self._bullet(entry, bullet_id)
        if bullet is None:
            return "ERR_INVALID_CHOICE"
        bullet.text = text
        bullet.status = BulletStatus.EDITED
        self._persist_entry(entry)
        return None

    # ------------------------------------------------------------------ #
    # Deletion (FR-020; confirmation is the CLI's responsibility)
    # ------------------------------------------------------------------ #
    def delete_bullet(self, entry: ExperienceEntry, bullet_id: int) -> bool:
        """Remove a bullet after CLI-level confirmation. Survivor histories
        stay intact; an entry dropping to 0 bullets reverts to draft."""
        bullet = self._bullet(entry, bullet_id)
        if bullet is None:
            return False
        entry.bullets.remove(bullet)
        if not entry.bullets:
            # FR-020: an entry that loses its last bullet reverts to draft.
            entry.draft_reason = DraftReason.NO_BULLETS
        self._persist_entry(entry)
        return True

    def delete_entry(self, entry_id: int) -> bool:
        """Tombstone-delete a whole entry after CLI-level confirmation."""
        entries = self.repository.load()
        for entry in entries:
            if entry.id == entry_id and not entry.deleted:
                entry.deleted = True
                self.repository.save(entries)
                return True
        return False

    # ------------------------------------------------------------------ #
    # Copy text (FR-019)
    # ------------------------------------------------------------------ #
    @staticmethod
    def copy_text(entry: ExperienceEntry) -> str:
        """The exact entry text for clipboard use; non-mutating."""
        lines = [entry.title]
        lines.extend(b.text for b in entry.bullets)
        return "\n".join(lines)

    # ------------------------------------------------------------------ #
    # Internals
    # ------------------------------------------------------------------ #
    def _persist_entry(self, entry: ExperienceEntry) -> None:
        entries = self.repository.load()
        for i, existing in enumerate(entries):
            if existing.id == entry.id:
                entries[i] = entry
                break
        self.repository.save(entries)

    @staticmethod
    def _bullet(entry: ExperienceEntry, bullet_id: int) -> Optional[Bullet]:
        for bullet in entry.bullets:
            if bullet.id == bullet_id:
                return bullet
        return None
