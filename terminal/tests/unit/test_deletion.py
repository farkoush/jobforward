"""Unit tests for deletion with confirmation (FR-020, Clarification Q3).

Confirm-gated deletion; deleted items excluded from all scores and merge
analysis; entry dropping to 0 bullets reverts to draft; survivor histories
untouched; bullet_deleted/entry_deleted events logged.
"""

from __future__ import annotations

import json

from src.jobforward.cli import CLI
from src.jobforward.models.entities import (
    Bullet,
    ExperienceEntry,
    ExperienceEntryType,
    Ratings,
    BulletStatus,
)
from src.jobforward.storage.repository import DEFAULT_RUBRIC_VERSION


def _entry() -> ExperienceEntry:
    b1 = Bullet(
        id=1,
        text="Led the analytics team",
        status=BulletStatus.ANALYZED,
        ratings=Ratings(context=2, role_action_clarity=2, result=2),
        rubric_version=DEFAULT_RUBRIC_VERSION,
    )
    b2 = Bullet(
        id=2,
        text="Built the reporting dashboard",
        status=BulletStatus.ANALYZED,
        ratings=Ratings(context=1, role_action_clarity=2, result=1),
        rubric_version=DEFAULT_RUBRIC_VERSION,
    )
    b2.history.append(
        __import__(
            "src.jobforward.models.entities", fromlist=["BulletHistory"]
        ).BulletHistory(
            text="Built dashboards",
            ratings=None,
            rubric_version=None,
            replaced_at="2026-10-25T09:00:00+00:00",
        )
    )
    return ExperienceEntry(
        id=1, type=ExperienceEntryType.JOB, title="Analytics", bullets=[b1, b2]
    )


def _make_cli(tmp_path, inputs):
    outputs: list[str] = []

    def inp(prompt=""):
        assert inputs, "script exhausted"
        return inputs.pop(0)

    cli = CLI(
        repository_path=tmp_path / "r.json",
        log_path=tmp_path / "e.jsonl",
        input_fn=inp,
        output_fn=outputs.append,
    )
    return cli, outputs


def _read_events(tmp_path):
    lines = (tmp_path / "e.jsonl").read_text(encoding="utf-8").splitlines()
    return [json.loads(line) for line in lines if line.strip()]


def test_delete_bullet_requires_confirmation(tmp_path):
    cli, outputs = _make_cli(tmp_path, ["2"])  # "No" at the confirmation
    entry = _entry()
    cli.current_entry = entry
    cli._show = outputs.append
    # menu 2 → delete bullet → pick 1 → confirm "2" (no)
    cli._prompt = lambda text: inputs_p.pop(0)
    inputs_p = ["1", "2"]
    result = cli._delete_bullet_flow(entry)
    assert result is False
    assert len(entry.bullets) == 2  # nothing deleted without confirmation


def test_delete_bullet_excludes_from_scores_and_logs(tmp_path):
    cli, outputs = _make_cli(tmp_path, [])
    entry = _entry()
    cli.repository.save([entry])
    cli.current_entry = entry
    cli._show = outputs.append
    cli._prompt = lambda text: inputs_p.pop(0)
    inputs_p = ["1", "1"]  # delete bullet 1, confirm yes

    entry.entry_score = 250 / 3
    became_draft = cli._delete_bullet_flow(entry)

    assert became_draft is False
    assert [b.id for b in entry.bullets] == [2]
    # Survivor history untouched.
    assert entry.bullets[0].history[0].text == "Built dashboards"
    # Entry re-scored from the surviving bullet only:
    # context 1 → 50, action 2 → 100, result 1 → 50 → mean = 200/3.
    assert entry.entry_score == 200 / 3

    events = _read_events(tmp_path)
    types = [e["type"] for e in events]
    assert "bullet_deleted" in types
    deleted = next(e for e in events if e["type"] == "bullet_deleted")
    assert deleted["context"]["bullet_id"] == 1
    assert "T" in deleted["ts"]


def test_deleting_last_bullet_reverts_entry_to_draft(tmp_path):
    cli, outputs = _make_cli(tmp_path, [])
    entry = _entry()
    cli.current_entry = entry
    cli._show = outputs.append
    cli._prompt = lambda text: inputs_p.pop(0)
    inputs_p = ["1", "1"]  # delete bullet 1, confirm
    became_draft = cli._delete_bullet_flow(entry)
    assert became_draft is False  # one bullet left

    cli._prompt = lambda text: inputs_p.pop(0)
    inputs_p = ["1", "1"]  # delete the last bullet, confirm
    became_draft = cli._delete_bullet_flow(entry)
    assert became_draft is True
    assert entry.draft and entry.draft_reason.value == "no_bullets"


def test_delete_entry_tombstones_and_logs(tmp_path):
    cli, outputs = _make_cli(tmp_path, [])
    entry = _entry()
    cli.repository.save([entry])
    cli.current_entry = entry
    cli._show = outputs.append
    cli._prompt = lambda text: inputs_p.pop(0)
    inputs_p = ["1"]  # confirm yes

    done = cli._delete_entry_flow(entry)
    assert done is True
    stored = cli.repository.load()[0]
    assert stored.deleted is True
    events = _read_events(tmp_path)
    assert any(e["type"] == "entry_deleted" for e in events)


def test_deleted_entries_excluded_from_overall(tmp_path):
    from src.jobforward.storage.schema import is_eligible_for_overall

    entry = _entry()
    entry.deleted = True
    assert not is_eligible_for_overall(entry)
    entry.deleted = False
    entry.save_as_draft()
    assert not is_eligible_for_overall(entry)
