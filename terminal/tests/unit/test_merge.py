"""Unit tests for the merge warning (FR-013, scoring/overlap.py).

Overlap detection flags only real overlap; the warning never changes any
score; a no-merge decision is a no-op.
"""

from __future__ import annotations

from src.jobforward.models.entities import Bullet, ExperienceEntry, ExperienceEntryType
from src.jobforward.scoring.overlap import find_overlaps, overlap_score


def test_real_overlap_flagged():
    a = "Led the analytics team to build a sales dashboard"
    b = "Led the analytics team to build a reporting dashboard"
    assert overlap_score(a, b) >= 0.6
    pairs = find_overlaps([a, b])
    assert [(p.bullet_a, p.bullet_b) for p in pairs] == [(1, 2)]


def test_distinct_bullets_not_flagged():
    a = "Led the analytics team to build a dashboard"
    b = "Painted 20 watercolor pieces for a local exhibition"
    assert find_overlaps([a, b]) == []


def test_warning_presence_changes_no_scores(tmp_path):
    from src.jobforward.cli import CLI

    outputs: list[str] = []

    def inp(prompt=""):
        raise AssertionError("no prompt expected before the merge decision")

    entry = ExperienceEntry(
        id=1,
        type=ExperienceEntryType.JOB,
        title="Analytics",
        bullets=[
            Bullet(id=1, text="Led the analytics team to build a sales dashboard"),
            Bullet(id=2, text="Led the analytics team to build a reporting dashboard"),
        ],
    )
    cli = CLI(
        repository_path=tmp_path / "r.json",
        log_path=tmp_path / "e.jsonl",
        input_fn=inp,
        output_fn=outputs.append,
    )
    cli.repository.save([entry])
    # Score without any user input: the warning is rendered but scores move 0.
    inputs = iter(["2", "2", "5", "3"])  # gate rejections, continue, exit

    def scripted(prompt=""):
        return next(inputs)

    cli._input = scripted
    cli.current_entry = entry
    cli.state = "SCORE_SHOWN"
    assert cli._score_and_show(entry)
    before = (entry.entry_score, [b.ratings for b in entry.bullets])
    cli._merge_warning(entry)
    after = (entry.entry_score, [b.ratings for b in entry.bullets])
    assert before == after  # warning alone never changes any score
    assert all(b.merge_warned for b in entry.bullets)


def test_no_merge_decision_is_a_no_op(tmp_path):
    from src.jobforward.cli import CLI

    entry = ExperienceEntry(
        id=1,
        type=ExperienceEntryType.JOB,
        title="Analytics",
        bullets=[
            Bullet(id=1, text="Led the analytics team to build a sales dashboard"),
            Bullet(id=2, text="Led the analytics team to build a reporting dashboard"),
        ],
    )
    cli = CLI(
        repository_path=tmp_path / "r.json",
        log_path=tmp_path / "e.jsonl",
        input_fn=lambda prompt="": "2",
        output_fn=lambda text="": None,
    )
    texts_before = [b.text for b in entry.bullets]
    cli._merge_warning(entry)
    assert [b.text for b in entry.bullets] == texts_before
    assert len(entry.bullets) == 2
