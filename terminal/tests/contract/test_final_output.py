"""Contract tests for the final output (spec §8, T060).

The final text renders inside the copy block: one bullet per line prefixed
with ``- ``, no brackets, unimproved bullets keep their original wording,
and the tool tells the candidate they can copy the text.
"""

from __future__ import annotations

from src.jobforward import messages as m
from src.jobforward.cli import CLI


def test_final_output_copy_block(tmp_path):
    outputs: list[str] = []

    def inp(prompt=""):
        return inputs.pop(0)

    bullet_a = "Led a team of 3 analysts to build a sales dashboard for the Q3 launch"
    bullet_b = "Improved onboarding, raising activation by 15%"
    inputs = [
        "1", "1", "Growth internship",  # add experience
        bullet_a,
        bullet_b,
        "",                             # finish bullets
        "2",                            # gate b1: reject
        "2",                            # gate b2: reject
        "4",                            # menu: copy this experience
        "5",                            # menu: continue
        "3",                            # exit
    ]
    cli = CLI(
        repository_path=tmp_path / "resume.json",
        log_path=tmp_path / "events.log.jsonl",
        input_fn=inp,
        output_fn=outputs.append,
    )
    assert cli.run() == 0
    rendered = "\n".join(outputs)

    assert m.COPY_BEGIN in rendered
    assert f"- {bullet_a}" in rendered
    assert f"- {bullet_b}" in rendered
    assert m.COPY_END in rendered
    assert m.COPY_NOTICE in rendered
    # Unimproved bullets keep their exact original wording (no brackets,
    # no reshaping): the exact texts appear once inside the block.
    block = rendered.split(m.COPY_BEGIN)[1].split(m.COPY_END)[0]
    assert bullet_a in block and bullet_b in block
    assert "[" not in block  # no framework brackets in the final text
