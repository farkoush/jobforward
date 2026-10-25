"""Contract tests for the CLI session (contracts/cli-session.md).

Every visible prompt is English B1 from messages.py; bullets are echoed
verbatim; scores carry the rubric version; data survives every error.
The CLI is driven with injected input/output for deterministic scripting.
"""

from __future__ import annotations

import src.jobforward.messages as messages
from src.jobforward.cli import CLI
from src.jobforward.models.entities import (
    Bullet,
    ExperienceEntry,
    ExperienceEntryType,
    Ratings,
)


class ScriptedIO:
    """Deterministic stdin/stdout replacement for tests.

    Raises when the script is exhausted so a session loop bug surfaces as a
    test failure instead of a hang.
    """

    def __init__(self, inputs: list[str]) -> None:
        self.inputs = list(inputs)
        self.outputs: list[str] = []

    def input(self, prompt: str = "") -> str:
        if prompt:
            self.outputs.append(prompt)
        if not self.inputs:
            raise AssertionError("scripted input exhausted — session loop bug?")
        return self.inputs.pop(0)

    def print(self, text: str = "") -> None:
        self.outputs.append(text)


def _make_cli(inputs, tmp_path):
    io = ScriptedIO(inputs)
    cli = CLI(
        repository_path=tmp_path / "resume.json",
        log_path=tmp_path / "events.log.jsonl",
        input_fn=io.input,
        output_fn=io.print,
    )
    return cli, io


def _add_entry_inputs(title="My internship", bullets=None):
    """Add an entry, reject the rewrite gate for every bullet (no questions,
    no rewrite), then continue and exit."""
    bullets = bullets or [
        "Led a team of 3 analysts to build a sales dashboard",
        "Improved onboarding, raising activation by 15%",
    ]
    lines = ["1", "1", title]  # idle menu (add) + type job + title
    for b in bullets:
        lines.append(b)
    lines.append("")          # empty line finishes bullets
    lines.extend("2" for _ in bullets)  # gate rejected per bullet
    lines.append("5")         # SCORE_SHOWN menu: continue (finish this experience)
    lines.append("3")         # IDLE menu: exit
    return lines


def test_session_prompts_are_from_messages(tmp_path):
    cli, io = _make_cli(_add_entry_inputs(), tmp_path)
    cli.run()
    rendered = "\n".join(io.outputs)
    # Prompt ids exist and come from messages.py (English B1).
    assert messages.ADD_TYPE in rendered
    assert messages.ADD_TITLE in rendered
    assert messages.SCORE_EXPERIENCE.format(value=1, rubric="x").split(":")[0] in rendered


def test_bullets_echoed_verbatim(tmp_path):
    bullet = "Led  a  team   of 3 — with odd spacing!"
    cli, io = _make_cli(_add_entry_inputs(bullets=[bullet]), tmp_path)
    cli.run()
    assert bullet in "\n".join(io.outputs)


def test_scores_carry_rubric_version(tmp_path):
    cli, io = _make_cli(_add_entry_inputs(), tmp_path)
    cli.run()
    rendered = "\n".join(io.outputs)
    assert "rubric-2.0.0" in rendered


def test_non_english_bullet_rejected_data_survives(tmp_path):
    cli, io = _make_cli(
        [
            "1",                # add experience
            "1",                # type job
            "My job",           # title
            "تحلیل داده",        # non-English bullet → rejected
            "Led a team of 3",  # valid bullet
            "",                 # finish bullets
            "2",                # gate rejected for the bullet
            "5",                # continue from SCORE_SHOWN
            "3",                # exit
        ],
        tmp_path,
    )
    code = cli.run()
    rendered = "\n".join(io.outputs)
    assert messages.ERR_NON_ENGLISH_INPUT in rendered
    assert code == 0
    # The valid bullet was still accepted; the rejected one was not stored.
    entries = cli.repository.load()
    assert len(entries) == 1
    assert [b.text for b in entries[0].bullets] == ["Led a team of 3"]


def test_too_many_bullets_rejected(tmp_path):
    cli, io = _make_cli(
        [
            "1", "1", "Big job",
            "b1", "b2", "b3", "b4", "b5", "b6", "b7",  # 7th → rejected, 6 kept
            "2", "2", "2", "2", "2", "2",  # gate rejected per bullet
            "5", "3",
        ],
        tmp_path,
    )
    cli.run()
    assert messages.ERR_TOO_MANY_BULLETS in "\n".join(io.outputs)
    entries = cli.repository.load()
    assert len(entries[0].bullets) == 6


def test_zero_bullets_entry_becomes_draft_with_suggestion(tmp_path):
    cli, io = _make_cli(["1", "2", "Project x", "", "3"], tmp_path)
    cli.run()
    rendered = "\n".join(io.outputs)
    assert messages.DRAFT_NOTICE in rendered
    assert messages.DRAFT_SUGGESTION in rendered
    entries = cli.repository.load()
    assert entries[0].draft


def test_draft_session_shows_no_overall(tmp_path):
    """A draft-only session never displays a numeric overall score (the
    misleading zero is impossible; FR-003/edge case)."""
    cli, io = _make_cli(["1", "2", "Project x", "", "3"], tmp_path)
    cli.run()
    rendered = "\n".join(io.outputs)
    assert messages.SCORE_OVERALL.format(value=0, rubric="rubric-2.0.0") not in rendered
    assert "Overall score: 0" not in rendered


def test_overall_hidden_when_no_eligible_entries(tmp_path):
    """A scored-but-draft entry is ineligible: the display shows the hidden
    message instead of a misleading zero (VR-2)."""
    cli, io = _make_cli([], tmp_path)
    entry = ExperienceEntry(
        id=1,
        type=ExperienceEntryType.PROJECT,
        title="Saved draft",
        bullets=[Bullet(id=1, text="Led a team of 3",
                        ratings=Ratings(context=2, role_action_clarity=2, result=2),
                        rubric_version="rubric-2.0.0")],
    )
    entry.save_as_draft()
    entry.entry_score = 100.0
    entry.rubric_version = "rubric-2.0.0"
    cli.repository.save([entry])
    cli._show_overall()
    assert messages.SCORE_OVERALL_HIDDEN in "\n".join(io.outputs)
