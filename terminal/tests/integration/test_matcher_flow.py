"""Integration test for the matcher v1 staged CLI flow (002 T008; FR-001,
FR-007, FR-008). Drives the real CLI with scripted I/O: full-paste input +
END, gates, cancel paths, invalid keys, and the language/length rejections.
"""

from __future__ import annotations

import json
from pathlib import Path

import src.jobforward.messages as m
from src.jobforward.cli import CLI

POSTING = Path("tests/fixtures/hard_skills_posting.txt").read_text(encoding="utf-8")
POSTING_LINES = POSTING.splitlines()


class ScriptedIO:
    """Deterministic stdin/stdout replacement (raises when exhausted)."""

    def __init__(self, inputs: list) -> None:
        self.inputs = list(inputs)
        self.outputs: list[str] = []

    def input(self, prompt: str = "") -> str:
        if prompt:
            self.outputs.append(prompt)
        if not self.inputs:
            raise AssertionError("scripted input exhausted — session loop bug?")
        item = self.inputs.pop(0)
        if item is EOFERROR:
            raise EOFError
        return item

    def print(self, text: str = "") -> None:
        self.outputs.append(text)


EOFERROR = object()


def _make_cli(inputs: list, tmp_path):
    io = ScriptedIO(inputs)
    cli = CLI(
        repository_path=tmp_path / "resume.json",
        log_path=tmp_path / "events.log.jsonl",
        input_fn=io.input,
        output_fn=io.print,
    )
    return cli, io


def _paste_inputs() -> list:
    return POSTING_LINES + ["END"]


def _events(tmp_path) -> list[dict]:
    path = tmp_path / "events.log.jsonl"
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


def _text(outputs) -> str:
    return "\n".join(outputs)


def test_full_flow_paste_review_hard_soft_then_exit(tmp_path):
    cli, io = _make_cli(
        ["2", *_paste_inputs(), "Y", "Y", "Y", "3"], tmp_path
    )
    code = cli.run()
    assert code == 0
    text = _text(io.outputs)
    assert m.MATCH_PROMPT_PASTE in text
    assert "Word count: " in text
    assert m.MATCH_TABLE_HARD_HEADER in text
    assert m.MATCH_COUNTS.format(must=3, should=2, nice=1) in text
    assert m.MATCH_TABLE_SOFT_HEADER in text
    # the ESCO id is stored, never shown (FR-017)
    assert "http://data.europa.eu" not in text
    # no free-form verdict anywhere (FR-018)
    assert "does not match" not in text
    types = [e["type"] for e in _events(tmp_path)]
    assert types.count("stage_confirmed") == 3
    assert "posting_received" in types
    assert "posting_cleaned" in types
    assert "posting_analyzed" in types


def test_cancel_at_review_returns_to_paste_then_cancel_at_paste_exits(tmp_path):
    cli, io = _make_cli(
        ["2", *_paste_inputs(), "C", "C", "3"], tmp_path
    )
    code = cli.run()
    assert code == 0
    text = _text(io.outputs)
    assert m.MATCH_CANCELLED in text  # back to PASTE, result discarded
    assert m.MATCH_PROMPT_PASTE in text
    assert m.MATCH_CANCELLED_EXIT in text
    types = [e["type"] for e in _events(tmp_path)]
    assert "stage_cancelled" in types
    assert "posting_analyzed" not in types


def test_cancel_at_paste_exits_immediately(tmp_path):
    cli, io = _make_cli(["2", "C", "3"], tmp_path)
    code = cli.run()
    assert code == 0
    assert m.MATCH_CANCELLED_EXIT in _text(io.outputs)


def test_invalid_gate_key_reprompts(tmp_path):
    cli, io = _make_cli(
        ["2", *_paste_inputs(), "X", "Y", "Y", "Y", "3"], tmp_path
    )
    code = cli.run()
    assert code == 0
    assert m.MATCH_ERR_INVALID_KEY in _text(io.outputs)


def test_too_short_text_returns_to_paste_and_never_analyzes(tmp_path):
    short_words = " ".join(["developer"] * 42)
    cli, io = _make_cli(["2", short_words, "END", "C", "3"], tmp_path)
    code = cli.run()
    assert code == 0
    text = _text(io.outputs)
    message = m.MATCH_ERR_TOO_SHORT.format(count=42, limit=100)
    assert message in text
    assert "posting_analyzed" not in [e["type"] for e in _events(tmp_path)]


def test_too_long_text_returns_to_paste(tmp_path):
    long_words = " ".join(["task"] * 1800)
    cli, io = _make_cli(["2", long_words, "END", "C", "3"], tmp_path)
    code = cli.run()
    text = _text(io.outputs)
    assert m.MATCH_ERR_TOO_LONG.format(count=1800, limit=1500) in text


def test_persian_text_is_rejected_with_fixed_message(tmp_path):
    persian = "این متن آگهی شغلی نیست و بیشتر حروفش فارسی است پس رد میشود"
    cli, io = _make_cli(["2", persian, "END", "C", "3"], tmp_path)
    code = cli.run()
    assert m.MATCH_ERR_PERSIAN in _text(io.outputs)


def test_scattered_persian_names_are_accepted(tmp_path):
    text = POSTING.replace(
        "banks across the region", "banks across the region (Ali, Reza apply)"
    )
    cli, io = _make_cli(
        ["2", *text.splitlines(), "END", "Y", "Y", "Y", "3"], tmp_path
    )
    code = cli.run()
    assert code == 0
    assert m.MATCH_ERR_PERSIAN not in _text(io.outputs)


def test_not_a_posting_returns_to_paste_without_a_gate(tmp_path):
    letter = " ".join(
        [
            "Dear friend I hope this letter finds you well and happy.",
            "Last week we visited the mountains and the old village nearby.",
            "The weather was kind and the road was quiet all morning long.",
        ]
        * 3
    )
    cli, io = _make_cli(["2", letter, "END", "C", "3"], tmp_path)
    code = cli.run()
    text = _text(io.outputs)
    assert m.MATCH_ERR_NOT_A_POSTING in text
    assert m.MATCH_GATE not in text  # no gate was shown for a non-posting


def test_end_of_input_is_an_accepted_terminator(tmp_path):
    cli, io = _make_cli(
        ["2", *POSTING_LINES, EOFERROR, "Y", "Y", "Y", "3"], tmp_path
    )
    code = cli.run()
    assert code == 0
    assert m.MATCH_COUNTS.format(must=3, should=2, nice=1) in _text(io.outputs)
