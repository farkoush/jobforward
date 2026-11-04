"""Unit tests for hard-skill extraction (002 T012; FR-009–FR-012).

The fixture pair (hard_skills_posting.txt / hard_skills_expected.json) is
the permanent FR-022 regression sample; these tests cover the rules
themselves: cascade order, word lists, one-of merge, duplicate merge,
verbatim evidence, and posting order.
"""

from __future__ import annotations

import json
from pathlib import Path

from src.jobforward.matcher2.hard_skills import (
    extract_hard_skills,
    filter_verbatim,
)
from src.jobforward.matcher2.posting import clean_posting
from src.jobforward.matcher2.rules_version import MATCHER_RULES_VERSION

FIXTURES = Path("tests/fixtures")


def _rows(text: str):
    cleaned = clean_posting(text)
    rows, dropped = extract_hard_skills(cleaned.cleaned_text)
    return rows, dropped, cleaned


# --- FR-022 regression fixture ------------------------------------------ #

def test_regression_fixture_reproduces_the_spec_example():
    raw = (FIXTURES / "hard_skills_posting.txt").read_text(encoding="utf-8")
    expected = json.loads(
        (FIXTURES / "hard_skills_expected.json").read_text(encoding="utf-8")
    )
    rows, dropped, cleaned = _rows(raw)
    assert dropped == 0
    assert len(rows) == 6
    got = [
        {
            "name": r.name,
            "type": r.type,
            "priority": r.priority,
            "default_priority": r.default_priority,
            "is_one_of": r.is_one_of,
            "alternatives": r.alternatives,
            "order": r.order,
            "evidence": r.evidence,
        }
        for r in rows
    ]
    assert got == expected["rows"]
    counts = {"must": 0, "should": 0, "nice": 0}
    for row in rows:
        counts[row.priority] += 1
    assert counts == expected["counts"]


def test_fixture_rules_version_is_pinned():
    expected = json.loads(
        (FIXTURES / "hard_skills_expected.json").read_text(encoding="utf-8")
    )
    assert expected["rules_version"] == MATCHER_RULES_VERSION


# --- Priority cascade (FR-010) ------------------------------------------- #

def test_explicit_word_overrides_section_heading():
    text = (
        "Requirements:\n"
        "- Familiarity with lending and BNPL concepts is a plus\n"
    )
    rows, _, _ = _rows(text)
    assert rows[0].priority == "nice"
    assert rows[0].default_priority is False


def test_section_heading_priority():
    text = "Preferred Qualifications:\n- Experience with digital wallets\n"
    rows, _, _ = _rows(text)
    assert rows[0].priority == "should"
    assert rows[0].default_priority is True


def test_unstructured_posting_defaults_to_must_marked_default():
    text = "Experience with SQL databases and strong dashboards skills\n"
    rows, _, _ = _rows(text)
    assert rows[0].priority == "must"
    assert rows[0].default_priority is True


def test_must_word_list():
    for word in ("must", "required", "mandatory", "essential", "at least", "minimum"):
        text = f"Requirements:\n- Knowledge of SQL {word}\n"
        rows, _, _ = _rows(text)
        assert rows[0].priority == "must", word


def test_should_word_list():
    for word in ("preferred", "desirable", "ideally"):
        text = f"Requirements:\n- Knowledge of SQL is {word}\n"
        rows, _, _ = _rows(text)
        assert rows[0].priority == "should", word


def test_nice_word_list():
    for word in ("a plus", "nice to have", "a bonus", "an advantage"):
        text = f"Requirements:\n- Knowledge of SQL is {word}\n"
        rows, _, _ = _rows(text)
        assert rows[0].priority == "nice", word


def test_recognized_heading_sets():
    for heading in ("Responsibilities", "Requirements", "Required Tools"):
        rows, _, _ = _rows(f"{heading}:\n- Knowledge of SQL\n")
        assert rows[0].priority == "must", heading
    rows, _, _ = _rows("Preferred Qualifications:\n- Knowledge of SQL\n")
    assert rows[0].priority == "should"


# --- One-of merge and duplicate handling (FR-011) ------------------------- #

def test_alternative_tools_become_one_row():
    rows, _, _ = _rows("Required Tools:\n- Power BI, Metabase, or Grafana\n")
    assert len(rows) == 1
    row = rows[0]
    assert row.is_one_of is True
    assert row.alternatives == ["Power BI", "Metabase", "Grafana"]
    assert row.name == "One of: Power BI / Metabase / Grafana"
    assert row.type == "hard_tool"


def test_same_normalized_skill_merges_with_highest_priority():
    text = (
        "Requirements:\n"
        "- Experience with SQL\n"
        "Preferred Qualifications:\n"
        "- SQL\n"
    )
    rows, _, _ = _rows(text)
    assert len(rows) == 1
    assert rows[0].name == "SQL"
    assert rows[0].priority == "must"  # highest priority kept


def test_genuinely_different_skills_stay_separate_rows():
    text = (
        "Requirements:\n"
        "- Experience working on BNPL products\n"
        "- Familiarity with BNPL concepts\n"
    )
    rows, _, _ = _rows(text)
    assert len(rows) == 2
    assert rows[0].name != rows[1].name


# --- Evidence (FR-012) ----------------------------------------------------- #

def test_evidence_is_at_most_12_words_and_verbatim():
    text = (
        "Requirements:\n"
        "- Experience with distributed data platforms and real time streaming "
        "pipelines across regions\n"
    )
    rows, _, cleaned = _rows(text)
    words = rows[0].evidence.split()
    assert len(words) <= 12
    assert rows[0].evidence in cleaned.cleaned_text


def test_non_verbatim_evidence_is_dropped_and_counted():
    row = type(
        "Row",
        (),
        {"evidence": "not in the text at all", "__class__": object},
    )()
    kept, dropped = filter_verbatim([row], "the actual cleaned text")
    assert kept == []
    assert dropped == 1


def test_rows_follow_posting_order():
    rows, _, _ = _rows(
        "Requirements:\n- Alpha skill\n- Beta skill\n- Gamma skill\n"
    )
    assert [r.name for r in rows] == ["Alpha skill", "Beta skill", "Gamma skill"]
