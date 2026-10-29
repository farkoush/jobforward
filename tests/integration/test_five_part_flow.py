"""Integration test: the full five-part workflow end-to-end (T061, SC-001).

framework display → gate → questions (skip + answer) → draft-or-confirm →
approve → re-analysis under rubric-3.0.0 → final copyable output, plus
5-run extraction/scoring stability on the resulting bullet.
"""

from __future__ import annotations

import json

from src.jobforward import messages as m
from src.jobforward.cli import CLI
from src.jobforward.flow.parts import extract_parts
from src.jobforward.scoring.adapters.local import LocalHeuristicAdapter
from src.jobforward.scoring.evaluator import BulletRatingRequest

BULLET = (
    "New users could not find their saved items, so I built a saved-items "
    "dashboard for the mobile app."
)
METRIC_ANSWER = "Return visits grew by 15%"


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


def test_five_part_flow_end_to_end(tmp_path):
    cli, outputs = _scripted_cli(
        tmp_path,
        [
            "1",                    # idle: add experience
            "1",                    # type: job
            "Saved items revamp",   # title
            BULLET,
            "",                     # finish bullets
            # Bullet is 2/2/1 (result output-only): questions Result, Metric.
            "1",                    # gate: accept
            "2",                    # Result question: skip
            "1",                    # Metric question: answer
            METRIC_ANSWER,
            "2",                    # partial answers: confirm rewrite
            "1",                    # proposal: approve
            "4",                    # menu: copy the final text
            "5",                    # menu: continue
            "3",                    # exit
        ],
    )
    assert cli.run() == 0
    rendered = "\n".join(outputs)

    # Framework display preceded the gate (spec §5).
    header = m.FRAMEWORK_HEADER.format(title="Saved items revamp", n=1, total=1)
    assert header in rendered
    assert rendered.index(header) < rendered.index(m.ASK_REWRITE_GATE)
    assert m.FRAMEWORK_ORIGINAL.format(text=BULLET) in rendered

    # Question round with identification lines, skip, and answer (spec §6).
    assert m.ASK_PART_INTRO.format(
        title="Saved items revamp", n=1, total=1, part=m.PART_NAME_RESULT
    ) in rendered
    assert m.ASK_RESULT in rendered
    assert m.ASK_METRIC in rendered
    assert m.DRAFT_OR_APPROVE in rendered

    # Proposal contains ONLY bullet words + the metric answer (spec §7).
    assert f"Metric: {METRIC_ANSWER}" in rendered
    assert m.SCORE_BEFORE_AFTER.split("{before}")[0] in rendered

    # Storage: bullet replaced (edited → analyzed), history retained, and
    # the new score carries rubric-3.0.0.
    entries = cli.repository.load()
    (entry,) = entries
    bullet = entry.bullets[0]
    assert bullet.status.value == "analyzed"
    assert bullet.rubric_version == "rubric-3.0.0"
    assert METRIC_ANSWER in bullet.text
    assert bullet.history[0].text == BULLET
    assert bullet.ratings.role_action_clarity == 2

    # Final output: copy block, "- " lines, copy notice (spec §8).
    block = rendered.split(m.COPY_BEGIN)[1].split(m.COPY_END)[0]
    assert f"- {bullet.text}" in block
    assert "[" not in block
    assert m.COPY_NOTICE in rendered

    # Events (SC-008).
    types = [e["type"] for e in _read_events(tmp_path)]
    for required in (
        "path_start",
        "analysis_completed",
        "proposal_accepted",
        "score_before",
        "score_after",
    ):
        assert required in types, f"missing event {required}"


def test_five_run_stability_on_rewritten_bullet(tmp_path):
    """5 consecutive analyses of the rewritten bullet are identical
    (deterministic → 100% ≥ 90%, FR-016)."""
    rewritten = f"{BULLET}\nMetric: {METRIC_ANSWER}"
    adapter = LocalHeuristicAdapter()
    runs = []
    for _ in range(5):
        parts = extract_parts(rewritten)
        response = adapter.evaluate_with_retry(
            BulletRatingRequest(texts=[rewritten], parts=[parts])
        )
        r = response.ratings[0]
        runs.append((r.context, r.role_action_clarity, r.result))
    assert all(run == runs[0] for run in runs[1:])
    assert runs[0] == (2, 2, 2)
