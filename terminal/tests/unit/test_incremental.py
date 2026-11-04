"""Unit tests for incremental re-analysis (flow/incremental.py) + statuses.

FR-012 + Clarifications Q2/Q4: status semantics drive which bullets
re-analyze; unchanged bullets keep previous ratings + rubric_version AND
their label; a direct user edit flips only that bullet to "edited"; after
re-analysis it returns to "analyzed".
"""

from __future__ import annotations

from src.jobforward.flow.incremental import (
    needs_reanalysis,
    select_for_reanalysis,
    unchanged_bullets,
)
from src.jobforward.models.entities import Bullet, BulletStatus, Ratings
from src.jobforward.models.status import transition
from src.jobforward.storage.repository import DEFAULT_RUBRIC_VERSION


def _bullet(bid: int, text: str, status: BulletStatus) -> Bullet:
    return Bullet(
        id=bid,
        text=text,
        status=status,
        ratings=Ratings(context=2, role_action_clarity=2, result=2),
        rubric_version=DEFAULT_RUBRIC_VERSION,
    )


def test_new_and_edited_need_reanalysis():
    assert needs_reanalysis(_bullet(1, "a", BulletStatus.NEW))
    assert needs_reanalysis(_bullet(2, "b", BulletStatus.EDITED))
    assert not needs_reanalysis(_bullet(3, "c", BulletStatus.ANALYZED))


def test_selection_preserves_order_and_excludes_analyzed():
    bullets = [
        _bullet(1, "one", BulletStatus.ANALYZED),
        _bullet(2, "two", BulletStatus.EDITED),
        _bullet(3, "three", BulletStatus.NEW),
    ]
    assert [b.id for b in select_for_reanalysis(bullets)] == [2, 3]
    assert [b.id for b in unchanged_bullets(bullets)] == [1]


def test_direct_edit_flips_only_that_bullet():
    """A direct user edit is explicit consent; only that bullet becomes
    'edited' (FR-012)."""
    bullets = [
        _bullet(1, "one", BulletStatus.ANALYZED),
        _bullet(2, "two", BulletStatus.ANALYZED),
        _bullet(3, "three", BulletStatus.ANALYZED),
    ]
    result = transition(bullets[1].status, BulletStatus.EDITED)
    assert result.ok
    bullets[1].status = BulletStatus.EDITED

    assert [b.id for b in select_for_reanalysis(bullets)] == [2]
    # Unchanged bullets keep ratings, rubric version, AND label.
    for bullet in unchanged_bullets(bullets):
        assert bullet.status == BulletStatus.ANALYZED
        assert bullet.ratings is not None
        assert bullet.rubric_version == DEFAULT_RUBRIC_VERSION


def test_reanalysis_returns_edited_to_analyzed():
    bullet = _bullet(1, "one", BulletStatus.EDITED)
    result = transition(bullet.status, BulletStatus.ANALYZED)
    assert result.ok and result.changed
    bullet.status = BulletStatus.ANALYZED
    assert not needs_reanalysis(bullet)


def test_failed_analysis_keeps_label():
    """FR-014: a failed analysis does not change the label — the transition
    helper treats same→same as a no-op."""
    for status in (BulletStatus.NEW, BulletStatus.EDITED, BulletStatus.ANALYZED):
        result = transition(status, status)
        assert result.ok and not result.changed
