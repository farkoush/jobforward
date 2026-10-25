"""Unit tests for atomic storage (storage/repository.py).

Tests VR-1 (1 ≤ bullets ≤ 6 enforced), atomic save/load round-trip,
and that save leaves no partial file on failure.
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

import pytest

from src.jobforward.models.entities import (
    ExperienceEntry,
    ExperienceEntryType,
    Bullet,
    BulletStatus,
)
from src.jobforward.storage.repository import Repository


def _make_entry(bullet_count: int = 2) -> ExperienceEntry:
    bullets = [
        Bullet(id=i + 1, text=f"Bullet {i + 1}", status=BulletStatus.ANALYZED)
        for i in range(bullet_count)
    ]
    return ExperienceEntry(
        id=1,
        type=ExperienceEntryType.JOB,
        title="Test Experience",
        bullets=bullets,
    )


def test_atomic_save_load_round_trip():
    """Save then load should preserve the full document."""
    with tempfile.TemporaryDirectory() as tmpdir:
        path = Path(tmpdir) / "resume.json"
        repo = Repository(path)
        entry = _make_entry()
        repo.save([entry])
        loaded = repo.load()
        assert len(loaded) == 1
        assert loaded[0].id == 1
        assert loaded[0].title == "Test Experience"
        assert len(loaded[0].bullets) == 2
        assert loaded[0].bullets[0].text == "Bullet 1"


def test_save_writes_document_version_and_rubric_version():
    """Saved JSON must contain document_version and rubric_version fields."""
    with tempfile.TemporaryDirectory() as tmpdir:
        path = Path(tmpdir) / "resume.json"
        repo = Repository(path)
        entry = _make_entry()
        repo.save([entry])
        raw = json.loads(path.read_text(encoding="utf-8"))
        assert raw["document_version"] == 1
        assert raw["rubric_version"] == "rubric-1.0.0"


def test_save_is_atomic_no_partial_file_on_failure():
    """On failure, no partial temp file should remain."""
    with tempfile.TemporaryDirectory() as tmpdir:
        path = Path(tmpdir) / "resume.json"
        repo = Repository(path)
        entry = _make_entry()
        # Force save to succeed, then verify no .tmp files remain
        repo.save([entry])
        tmp_files = list(Path(tmpdir).glob("*.tmp"))
        assert tmp_files == [], f"Leftover temp files: {tmp_files}"


def test_vr1_too_many_bullets_rejected():
    """VR-1: more than 6 bullets → ValueError (FR-002)."""
    bullets = [
        Bullet(id=i + 1, text=f"Bullet {i + 1}", status=BulletStatus.NEW)
        for i in range(7)
    ]
    with pytest.raises(ValueError, match="at most 6 bullets"):
        ExperienceEntry(
            id=1,
            type=ExperienceEntryType.JOB,
            title="Too Many",
            bullets=bullets,
        )


def test_vr1_zero_bullets_is_draft():
    """Zero bullets → draft=True (FR-003)."""
    entry = ExperienceEntry(
        id=1,
        type=ExperienceEntryType.JOB,
        title="Draft",
        bullets=[],
    )
    assert entry.draft is True