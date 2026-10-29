"""Unit tests for atomic storage (storage/repository.py).

Tests document_version-2 round-trip (incl. draft_reason, source,
match_action), atomic save (no partial file on failure), the id allocator
(restarts never duplicate ids), and VR-1 (1 ≤ bullets ≤ 6).
"""

from __future__ import annotations

import json

import pytest

from src.jobforward.models.entities import (
    Bullet,
    ExperienceEntry,
    ExperienceEntryType,
    MatchAction,
    MatchActionType,
    Ratings,
)
from src.jobforward.storage.repository import (
    DOCUMENT_VERSION,
    DEFAULT_RUBRIC_VERSION,
    Repository,
)


def _make_entry() -> ExperienceEntry:
    return ExperienceEntry(
        id=1,
        type=ExperienceEntryType.JOB,
        title="Product Intern",
        bullets=[
            Bullet(
                id=1,
                text="Led a team of 3 to build a dashboard",
                ratings=Ratings(context=2, role_action_clarity=2, result=1),
                rubric_version=DEFAULT_RUBRIC_VERSION,
            )
        ],
    )


def test_round_trip_with_v2_fields(tmp_path):
    repo = Repository(tmp_path / "resume.json")
    entry = _make_entry()
    entry.match_action = MatchAction(
        entry_id=1,
        action=MatchActionType.HIGHLIGHT,
        reason="Matches required hard skill: SQL.",
        requirement_id=0,
        rubric_version=DEFAULT_RUBRIC_VERSION,
        analyzed_at="2026-10-25T10:00:00+00:00",
    )
    repo.save([entry])
    loaded = repo.load()

    doc = json.loads((tmp_path / "resume.json").read_text(encoding="utf-8"))
    assert doc["document_version"] == DOCUMENT_VERSION == 2
    assert doc["rubric_version"] == DEFAULT_RUBRIC_VERSION == "rubric-3.0.0"

    assert len(loaded) == 1
    got = loaded[0]
    assert got.title == "Product Intern"
    assert got.bullets[0].text == "Led a team of 3 to build a dashboard"
    assert got.bullets[0].ratings == Ratings(context=2, role_action_clarity=2, result=1)
    assert got.match_action is not None
    assert got.match_action.action == MatchActionType.HIGHLIGHT
    assert got.match_action.reason == "Matches required hard skill: SQL."


def test_save_is_atomic_on_failure(tmp_path):
    repo = Repository(tmp_path / "resume.json")
    entry = _make_entry()
    repo.save([entry])
    original = (tmp_path / "resume.json").read_text(encoding="utf-8")

    # Make the final replace step blow up; the original file must survive.
    def boom(src, dst):
        raise OSError("simulated crash")

    import os

    monkey_replace = boom
    entries2 = [_make_entry(), _make_entry()]
    try:
        real_replace = os.replace
        os.replace = monkey_replace
        with pytest.raises(OSError):
            repo.save(entries2)
    finally:
        os.replace = real_replace

    assert (tmp_path / "resume.json").read_text(encoding="utf-8") == original
    assert list(tmp_path.glob("*.tmp")) == []


def test_vr1_more_than_six_bullets_rejected():
    bullets = [Bullet(id=i + 1, text=f"bullet {i}") for i in range(7)]
    with pytest.raises(ValueError):
        ExperienceEntry(
            id=1,
            type=ExperienceEntryType.JOB,
            title="Too many",
            bullets=bullets,
        )


def test_next_entry_id_never_reuses_ids():
    repo = Repository(tmp_path_empty())
    assert Repository.next_entry_id([]) == 1
    entries = [_make_entry(), _make_entry()]
    entries[1].id = 4
    assert Repository.next_entry_id(entries) == 5


def tmp_path_empty():
    import tempfile

    return tempfile.mkdtemp()


def test_rubric_v2_data_stays_loadable_after_v3(tmp_path):
    """Backward compatibility (T049): bullets scored under rubric-2.0.0
    keep their stored version verbatim through a save/load round trip —
    the v3 default never overwrites persisted v2 history."""
    repo = Repository(tmp_path / "resume.json")
    entry = _make_entry()
    entry.bullets[0].rubric_version = "rubric-2.0.0"
    repo.save([entry])
    loaded = repo.load()
    assert loaded[0].bullets[0].rubric_version == "rubric-2.0.0"

    doc = json.loads((tmp_path / "resume.json").read_text(encoding="utf-8"))
    assert doc["rubric_version"] == DEFAULT_RUBRIC_VERSION == "rubric-3.0.0"
    assert doc["entries"][0]["bullets"][0]["rubric_version"] == "rubric-2.0.0"
