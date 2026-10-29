"""Contract test for the matcher v1 fixed messages (002 T007).

Every fixed message from contracts/matcher-pipeline.md §1 exists in
messages.py with the exact drafted text. The drafted texts are contractual:
reproduced character-for-character. All messages are English B1 — their
alphabetic characters are ASCII (the "·" separator in MATCH_GATE /
MATCH_COUNTS is punctuation, not text).
"""

from __future__ import annotations

import src.jobforward.messages as m


def test_fixed_messages_exist_with_exact_text():
    assert m.MATCH_PROMPT_PASTE == (
        "Paste the full job posting in English. When you're done, type END on "
        "its own line (or press Ctrl+D)."
    )
    assert m.MATCH_ERR_PERSIAN == (
        "Persian input isn't supported yet. Please paste the job posting in English."
    )
    assert m.MATCH_CLEAN_SCRIPT_ONE == (
        "I removed 1 script block from your text. I did not run it."
    )
    assert m.MATCH_CLEAN_BLOCKS == (
        "I removed {scripts} script blocks and {styles} style blocks from your "
        "text. I did not run them."
    )
    assert m.MATCH_CLEAN_TAGS == (
        "I removed HTML tags from your text. The text inside them was kept."
    )
    assert m.MATCH_WORD_COUNT == "Word count: {count}"
    assert m.MATCH_GATE == "Review the result above. [Y] Continue · [C] Cancel"
    assert m.MATCH_CANCELLED == (
        "Cancelled. Going back to the start. Paste the job posting again."
    )
    assert m.MATCH_CANCELLED_EXIT == "Cancelled. Exiting."
    assert m.MATCH_ERR_INVALID_KEY == "Please type Y to continue or C to cancel."
    assert m.MATCH_ERR_NOT_A_POSTING == (
        "This doesn't look like a job posting, so I didn't analyze it. "
        "Please paste the full text of a job posting."
    )
    assert m.MATCH_ERR_ZERO_SKILLS == (
        "I couldn't extract any skills from this text. Nothing was analyzed."
    )
    assert m.MATCH_ERR_CONSISTENCY == (
        "The report failed its consistency check, so I'm not showing it. "
        "Please run the analysis again."
    )
    assert m.MATCH_DROPPED == (
        "I left out {count} item(s) because I couldn't find supporting text in "
        "the posting."
    )
    assert m.MATCH_LIMIT_HARD == (
        "{priority}: showing {shown} of {total}. Version 1 shows up to 5 rows "
        "per table."
    )
    assert m.MATCH_LIMIT_SOFT == (
        "Showing {shown} of {total} soft skills. Version 1 shows up to 5 rows."
    )
    assert m.MATCH_NO_TAXONOMY_MATCH == "No taxonomy match: {text}"
    assert m.MATCH_COUNTS == "Must: {must} · Should: {should} · Nice: {nice}"


def test_length_gate_messages_carry_count_and_limit_placeholders():
    short = m.MATCH_ERR_TOO_SHORT.format(count=42, limit=100)
    assert "42" in short and "100" in short
    long = m.MATCH_ERR_TOO_LONG.format(count=1800, limit=1500)
    assert "1800" in long and "1500" in long


def test_all_matcher2_messages_are_english_b1_ascii_letters():
    keys = [
        "MATCH_PROMPT_PASTE", "MATCH_ERR_PERSIAN", "MATCH_ERR_TOO_SHORT",
        "MATCH_ERR_TOO_LONG", "MATCH_CLEAN_SCRIPT_ONE", "MATCH_CLEAN_BLOCKS",
        "MATCH_CLEAN_TAGS", "MATCH_WORD_COUNT", "MATCH_GATE", "MATCH_CANCELLED",
        "MATCH_CANCELLED_EXIT", "MATCH_ERR_INVALID_KEY", "MATCH_ERR_NOT_A_POSTING",
        "MATCH_ERR_ZERO_SKILLS", "MATCH_ERR_CONSISTENCY", "MATCH_DROPPED",
        "MATCH_LIMIT_HARD", "MATCH_LIMIT_SOFT", "MATCH_NO_TAXONOMY_MATCH",
        "MATCH_COUNTS", "MATCH_TABLE_HARD_HEADER", "MATCH_TABLE_SOFT_HEADER",
    ]
    for key in keys:
        text = getattr(m, key)
        letters = [c for c in text if c.isalpha()]
        assert all(ord(c) < 128 for c in letters), key


def test_table_headers_match_the_spec_columns():
    assert m.MATCH_TABLE_HARD_HEADER == "Skill | Type | Evidence"
    assert m.MATCH_TABLE_SOFT_HEADER == "Skill | Group | Evidence | Priority | Certainty"
