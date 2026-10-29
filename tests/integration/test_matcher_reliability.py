"""Integration test for matcher v1 guarantees (002 T020; FR-018–FR-022).

5 consecutive runs on BOTH regression fixtures produce identical skills and
priorities (deterministic → 100% ≥ 90%); no verdict text ever enters the
output; not-a-posting and zero-skill texts use their own fixed messages.
"""

from __future__ import annotations

from pathlib import Path

import src.jobforward.messages as m
from src.jobforward.cli import CLI
from src.jobforward.matcher2.hard_skills import extract_hard_skills
from src.jobforward.matcher2.posting import clean_posting
from src.jobforward.matcher2.report import build_report
from src.jobforward.matcher2.soft_skills import load_taxonomy, match_soft_skills

FIXTURES = Path("tests/fixtures")
HARD_POSTING = (FIXTURES / "hard_skills_posting.txt").read_text(encoding="utf-8")
SOFT_POSTING = (FIXTURES / "soft_skills_posting.txt").read_text(encoding="utf-8")


class ScriptedIO:
    def __init__(self, inputs: list) -> None:
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


def _run_pipeline(raw: str):
    """The full deterministic analysis pipeline (no CLI, no gates)."""
    cleaned = clean_posting(raw)
    taxonomy = load_taxonomy()
    hard_rows, dropped = extract_hard_skills(cleaned.cleaned_text)
    soft_rows, unmatched = match_soft_skills(cleaned.cleaned_text, taxonomy)
    return build_report(hard_rows, soft_rows, unmatched, dropped)


def _snapshot(report) -> tuple:
    hard = tuple(
        (r.name, r.type, r.priority, r.evidence, r.is_one_of)
        for rows in report.hard_tables.values()
        for r in rows
    )
    soft = tuple(
        (r.label_en, r.priority, r.certainty, r.reason, r.evidence)
        for r in report.soft_rows
    )
    return hard, soft


def test_five_consecutive_runs_identical_on_hard_fixture():
    first = _snapshot(_run_pipeline(HARD_POSTING))
    for _ in range(4):
        assert _snapshot(_run_pipeline(HARD_POSTING)) == first


def test_five_consecutive_runs_identical_on_soft_fixture():
    first = _snapshot(_run_pipeline(SOFT_POSTING))
    for _ in range(4):
        assert _snapshot(_run_pipeline(SOFT_POSTING)) == first


def test_rendered_output_contains_no_verdict_text():
    for raw in (HARD_POSTING, SOFT_POSTING):
        report = _run_pipeline(raw)
        io = ScriptedIO([])
        cli = CLI(
            repository_path=Path("data/resume.json"),
            log_path=Path("data/unused-events.jsonl"),
            input_fn=io.input,
            output_fn=io.print,
        )
        cli._render_hard_tables(report)
        cli._render_soft_table(report)
        text = "\n".join(io.outputs).lower()
        assert "does not match" not in text
        assert "not relevant" not in text
        assert "verdict" not in text


def test_not_a_posting_text_uses_its_own_message(tmp_path):
    letter = " ".join(
        [
            "Dear friend I hope this letter finds you well and happy.",
            "Last week we visited the mountains and the old village nearby.",
            "The weather was kind and the road was quiet all morning long.",
        ]
        * 3
    )
    io = ScriptedIO(["2", letter, "END", "C", "3"])
    cli = CLI(
        repository_path=tmp_path / "resume.json",
        log_path=tmp_path / "events.log.jsonl",
        input_fn=io.input,
        output_fn=io.print,
    )
    cli.run()
    assert m.MATCH_ERR_NOT_A_POSTING in "\n".join(io.outputs)


def test_zero_skill_text_uses_its_own_message(tmp_path):
    # Structured posting whose items reduce to nothing (pure boilerplate).
    narrative = (
        "This company builds tools for modern teams and keeps a friendly "
        "office with a garden and a small library for everyone who joins. "
        "People here care about craft and about helping each other grow. "
        "The team meets on Mondays to set the week ahead in peace. "
    )
    text = (
        f"{narrative * 2}\n"
        "Requirements:\n"
        "- Familiarity with\n"
        "- Experience with\n"
        "- Knowledge of\n"
    )
    assert len(clean_posting(text).cleaned_text.split()) >= 100
    io = ScriptedIO(["2", *text.splitlines(), "END", "Y", "C", "3"])
    cli = CLI(
        repository_path=tmp_path / "resume.json",
        log_path=tmp_path / "events.log.jsonl",
        input_fn=io.input,
        output_fn=io.print,
    )
    cli.run()
    text_out = "\n".join(io.outputs)
    assert m.MATCH_ERR_ZERO_SKILLS in text_out
    assert "does not match" not in text_out.lower()


def test_regression_fixture_files_exist_and_are_permanent():
    for name in (
        "hard_skills_posting.txt",
        "hard_skills_expected.json",
        "soft_skills_posting.txt",
        "soft_skills_expected.json",
    ):
        assert (FIXTURES / name).is_file()
