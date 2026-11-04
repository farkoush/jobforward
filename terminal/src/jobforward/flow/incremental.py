"""Incremental re-analysis (flow/incremental.py).

Constitution Principle 5 + FR-012: only new or edited bullets are
re-analyzed; unchanged bullets keep their previous ratings, rubric_version,
AND status label. Direct user edits and approved rewrites both produce the
"edited" status upstream, so this module only needs the status labels.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from ..models.entities import BulletStatus

if TYPE_CHECKING:  # pragma: no cover
    from ..models.entities import Bullet


def needs_reanalysis(bullet: "Bullet") -> bool:
    """A bullet is re-analyzed iff it is new (never analyzed) or edited
    (changed after an earlier analysis)."""
    return bullet.status in (BulletStatus.NEW, BulletStatus.EDITED)


def select_for_reanalysis(bullets: list["Bullet"]) -> list["Bullet"]:
    """The set of bullets to re-analyze in this run, preserving order."""
    return [b for b in bullets if needs_reanalysis(b)]


def unchanged_bullets(bullets: list["Bullet"]) -> list["Bullet"]:
    """Analyzed bullets whose score and label must be carried forward
    untouched."""
    return [b for b in bullets if not needs_reanalysis(b)]
