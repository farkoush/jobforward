"""Contract tests for the framework display (spec §5, T055/T056).

The framework is shown for the selected bullet BEFORE the rewrite gate:
header + Original line, bracketed parts (missing/vague notes), and the
Filled correctly / Still needs to be filled lists. All strings come from
messages.py (English B1, constitution P10).
"""

from __future__ import annotations

from src.jobforward import messages as m
from src.jobforward.cli import CLI


def _scripted(tmp_path, inputs):
    outputs: list[str] = []

    def inp(prompt=""):
        assert inputs, f"script exhausted at {prompt!r}"
        return inputs.pop(0)

    cli = CLI(
        repository_path=tmp_path / "resume.json",
        log_path=tmp_path / "events.log.jsonl",
        input_fn=inp,
        output_fn=outputs.append,
    )
    return cli, outputs


def test_framework_display_before_gate(tmp_path):
    cli, outputs = _scripted(
        tmp_path,
        [
            "1",               # idle: add experience
            "1",               # type: job
            "Saved items revamp",  # title
            # Action extractable but generic (score 1 → vague); no need,
            # feature, result, or metric part.
            "Managed various projects and improved processes",
            "",                # finish bullets
            "2",               # gate: reject (stop the flow)
            "5",               # menu: continue
            "3",               # idle: exit
        ],
    )
    assert cli.run() == 0
    rendered = "\n".join(outputs)

    header = m.FRAMEWORK_HEADER.format(title="Saved items revamp", n=1, total=1)
    assert header in rendered
    assert (
        m.FRAMEWORK_ORIGINAL.format(
            text="Managed various projects and improved processes"
        )
        in rendered
    )
    # Missing parts carry the missing note (spec §5 example).
    assert m.FRAMEWORK_PART_MISSING.format(label=m.PART_LABEL_NEED) in rendered
    assert m.FRAMEWORK_PART_MISSING.format(label=m.PART_LABEL_FEATURE) in rendered
    assert m.FRAMEWORK_PART_MISSING.format(label=m.PART_LABEL_RESULT) in rendered
    assert m.FRAMEWORK_PART_MISSING.format(label=m.PART_LABEL_METRIC) in rendered
    # The action part has words but scored 1 → exact words + vague note.
    assert (
        m.FRAMEWORK_PART_VAGUE.format(
            label=m.PART_LABEL_ACTION,
            words="Managed various projects and improved processes",
        )
        in rendered
    )
    # The lists: nothing filled correctly; all five parts still need work.
    assert m.FRAMEWORK_NEEDS in rendered
    assert m.FRAMEWORK_FILLED not in rendered
    for label in (
        m.PART_LABEL_NEED,
        m.PART_LABEL_FEATURE,
        m.PART_LABEL_ACTION,
        m.PART_LABEL_RESULT,
        m.PART_LABEL_METRIC,
    ):
        assert m.FRAMEWORK_NEEDS_LINE.format(label=label) in rendered
    # The framework appears BEFORE the gate prompt.
    assert rendered.index(header) < rendered.index(m.ASK_REWRITE_GATE)


def test_question_has_identification_line(tmp_path):
    cli, outputs = _scripted(
        tmp_path,
        [
            "1", "1", "Saved items revamp",
            "Built a dashboard",
            "",
            "1",                          # gate: accept → questions follow
            "2",                          # Need question: skip
            "2",                          # Result question: skip
            "2",                          # Metric question: skip
            "5",                          # menu: continue
            "3",                          # exit
        ],
    )
    assert cli.run() == 0
    rendered = "\n".join(outputs)
    intro = m.ASK_PART_INTRO.format(
        title="Saved items revamp", n=1, total=1, part=m.PART_NAME_NEED
    )
    assert intro in rendered
    assert m.ASK_NEED in rendered
    assert m.ASK_METRIC in rendered
    # Result question too (result scored 1): three questions in order.
    assert m.ASK_RESULT in rendered
    assert rendered.index(intro) < rendered.index(m.ASK_NEED)
    # All questions skipped → no rewrite.
    assert m.NO_REWRITE in rendered
