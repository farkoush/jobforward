"""Storage invariants and versioned rubric field (storage/schema.py).

Implements the VR-1..VR-9 check functions from data-model.md. Pure checks —
no I/O, no user-facing strings (constitution Principle 10).
"""

from __future__ import annotations

from typing import Optional

from ..models.entities import ExperienceEntry, MatchActionType
from .repository import DEFAULT_RUBRIC_VERSION

RUBRIC_VERSION = DEFAULT_RUBRIC_VERSION

# The ONLY legal matcher actions (FR-022); remove/shorten do not exist.
LEGAL_MATCH_ACTIONS = frozenset({
    MatchActionType.HIGHLIGHT,
    MatchActionType.NO_CHANGE,
    MatchActionType.NOT_RELEVANT,
})


def check_bullet_count(entry: ExperienceEntry) -> Optional[str]:
    """VR-1: 1..6 bullets, or 0 for a draft (FR-002/FR-003)."""
    n = len(entry.bullets)
    if n > 6:
        return f"entry {entry.id}: {n} bullets exceeds the maximum of 6"
    return None


def check_rubric_version(entry: ExperienceEntry) -> Optional[str]:
    """VR-3: rubric_version recorded next to every stored score (FR-008)."""
    if entry.entry_score is not None and entry.rubric_version != RUBRIC_VERSION:
        return f"entry {entry.id}: entry_score stored without rubric_version"
    for bullet in entry.bullets:
        if bullet.ratings is not None and bullet.rubric_version != RUBRIC_VERSION:
            return (
                f"entry {entry.id} bullet {bullet.id}: ratings without rubric_version"
            )
    return None


def check_match_action(entry: ExperienceEntry) -> Optional[str]:
    """VR-9: matcher action restricted to the legal enum (FR-022)."""
    ma = entry.match_action
    if ma is None:
        return None
    if ma.action not in LEGAL_MATCH_ACTIONS:
        return f"entry {entry.id}: illegal matcher action {ma.action!r}"
    if not ma.reason.strip():
        return f"entry {entry.id}: matcher action without a reason"
    return None


def is_eligible_for_overall(entry: ExperienceEntry) -> bool:
    """VR-2: overall-score eligibility — has >= 1 scored bullet, is not a
    draft and not deleted (FR-003/FR-007/FR-020)."""
    if entry.deleted or entry.draft:
        return False
    return bool(entry.bullets) and all(b.ratings is not None for b in entry.bullets)


def validate_document(entries: list[ExperienceEntry]) -> list[str]:
    """Run every invariant over a document; returns all violations found."""
    violations: list[str] = []
    ids: set[int] = set()
    for entry in entries:
        if entry.id in ids:
            violations.append(f"duplicate entry id {entry.id}")
        ids.add(entry.id)
        for check in (check_bullet_count, check_rubric_version, check_match_action):
            violation = check(entry)
            if violation:
                violations.append(violation)
        bullet_ids: set[int] = set()
        for bullet in entry.bullets:
            if bullet.id in bullet_ids:
                violations.append(
                    f"entry {entry.id}: duplicate bullet id {bullet.id}"
                )
            bullet_ids.add(bullet.id)
            if bullet.ratings is not None and bullet.rubric_version is None:
                violations.append(
                    f"entry {entry.id} bullet {bullet.id}: ratings without rubric_version"
                )
    return violations
