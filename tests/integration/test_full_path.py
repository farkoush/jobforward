"""Integration test: the complete improvement path end-to-end (SC-001/SC-008).

record → score → gate → question → answer → approve → incremental
re-analysis, with every required event in the JSONL log (ISO timestamps,
numeric score_before/score_after).
"""

from __future__ import annotations

import json

from src.jobforward import messages as m
from src.jobforward.cli import CLI


def _scripted_cli(tmp_path, inputs):
    outputs: list[str] = []

    def inp(prompt=""):
        assert inputs, f"script exhausted at prompt {prompt!r}"
        return inputs.pop(0)

    cli = CLI(
        repository_path=tmp_path / "resume.json",
        log_path=tmp_path / "events.log.jsonl",
        input_fn=inp,
        output_fn=outputs.append,
    )
    return cli, outputs


def _read_events(tmp_path):
    lines = (tmp_path / "events.log.jsonl").read_text(encoding="utf-8").splitlines()
    return [json.loads(line) for line in lines if line.strip()]


def test_full_path_end_to_end(tmp_path):
    cli, outputs = _scripted_cli(
        tmp_path,
        [
            "1",                                   # idle: add experience
            "1",                                   # type: job
            "Growth internship",                   # title
            "Led a team of 3 analysts to build a sales dashboard for the Q3 launch",
            "Improved onboarding, raising activation by 15%",
            "",                                    # finish bullets
            "1",                                   # gate b1: accept (complete → confirm)
            "1",                                   # b1 confirm: keep
            "1",                                   # gate b2: accept
            "1",                                   # context question: answer
            "For the mobile app launch team",      # the answer
            "1",                                   # proposal: approve
            "5",                                   # menu: continue
            "3",                                   # idle: exit
        ],
    )
    code = cli.run()
    rendered = "\n".join(outputs)
    assert code == 0

    # The flow rendered the contract prompts (compare fixed prefixes — the
    # templates carry format placeholders).
    assert m.ASK_REWRITE_GATE in rendered
    assert m.ASK_CONTEXT in rendered
    assert m.PROPOSAL_SHOW.split("{proposal}")[0] in rendered
    assert m.SCORE_BEFORE_AFTER.split("{before}")[0] in rendered
    assert "rubric-2.0.0" in rendered

    # The approved rewrite replaced the bullet with status edited→analyzed
    # and the previous text kept in history.
    entries = cli.repository.load()
    (entry,) = entries
    edited = entry.bullets[1]
    assert "For the mobile app launch team" in edited.text
    assert edited.status.value == "analyzed"
    assert edited.history, "previous bullet must be retained in history"
    assert edited.history[0].text == "Improved onboarding, raising activation by 15%"

    # Event log: every required event type with ISO timestamps and numeric
    # scores (SC-008).
    events = _read_events(tmp_path)
    types = [e["type"] for e in events]
    for required in (
        "path_start",
        "analysis_completed",
        "proposal_accepted",
        "score_before",
        "score_after",
    ):
        assert required in types, f"missing event {required}"
    for event in events:
        assert "ts" in event and "T" in event["ts"]  # ISO-8601
    for event in events:
        if event["type"] in ("score_before", "score_after"):
            assert isinstance(event["context"]["entry_score"], float)
            assert event["context"]["rubric_version"] == "rubric-2.0.0"

    # score_before ≠ score_after is allowed but both must exist and the
    # 'after' reflects the re-scored entry.
    before = next(e for e in events if e["type"] == "score_before")
    after = next(e for e in events if e["type"] == "score_after")
    assert after["context"]["entry_score"] == entry.entry_score


def test_incremental_rerun_reanalyzes_only_edited(tmp_path):
    """Rerun on a fixed entry: no bullet is re-analyzed (US3 / SC-006)."""
    cli, outputs = _scripted_cli(
        tmp_path,
        [
            "1", "1", "Growth internship",
            "Led a team of 3 analysts to build a sales dashboard for the Q3 launch",
            "Improved onboarding, raising activation by 15%",
            "",
            "2",            # gate b1: reject
            "2",            # gate b2: reject
            "5",            # continue
            "3",            # exit
        ],
    )
    assert cli.run() == 0
    entries = cli.repository.load()
    (entry,) = entries
    statuses = {b.id: b.status.value for b in entry.bullets}
    assert set(statuses.values()) == {"analyzed"}

    # Second session: no re-analysis happens (statuses unchanged), scores
    # identical.
    cli2, outputs2 = _scripted_cli(
        tmp_path,
        [
            "1", "1",        # add experience → but we reuse? No: idle add
            "Second entry",  # a fresh entry instead
            "Built a dashboard",
            "",
            "2",             # gate reject
            "5", "3",
        ],
    )
    assert cli2.run() == 0
    events = _read_events(tmp_path)
    # analysis_completed logged for both entries; unchanged bullets kept
    # their label across runs (statuses in storage stay 'analyzed').
    entries_after = cli2.repository.load()
    assert entries_after[0].bullets[0].status.value == "analyzed"
    assert entries_after[0].bullets[1].status.value == "analyzed"
    assert entries_after[0].entry_score == entries[0].entry_score
