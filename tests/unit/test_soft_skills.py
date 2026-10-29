"""Unit tests for soft-skill matching against the taxonomy (002 T016;
FR-014–FR-016). The soft-skills fixture pair is the second permanent FR-022
regression sample.
"""

from __future__ import annotations

import json
from pathlib import Path

from src.jobforward.matcher2.posting import clean_posting
from src.jobforward.matcher2.report import CERTAINTY_RANK, PRIORITY_RANK
from src.jobforward.matcher2.soft_skills import (
    load_taxonomy,
    match_soft_skills,
)
from src.jobforward.matcher2.rules_version import MATCHER_RULES_VERSION

FIXTURES = Path("tests/fixtures")


def _match(text: str):
    cleaned = clean_posting(text)
    taxonomy = load_taxonomy()
    return match_soft_skills(cleaned.cleaned_text, taxonomy)


def _report_order(rows):
    """Must → Should → Nice, Explicit before Inferred (report ordering)."""
    return sorted(
        rows,
        key=lambda r: (PRIORITY_RANK[r.priority], CERTAINTY_RANK[r.certainty], r.order),
    )


# --- FR-022 regression fixture ------------------------------------------ #

def test_regression_fixture_reproduces_the_spec_example():
    raw = (FIXTURES / "soft_skills_posting.txt").read_text(encoding="utf-8")
    expected = json.loads(
        (FIXTURES / "soft_skills_expected.json").read_text(encoding="utf-8")
    )
    rows, unmatched = _match(raw)
    got = [
        {
            "label_en": r.label_en,
            "group_code": r.group_code,
            "priority": r.priority,
            "certainty": r.certainty,
            "reason": r.reason,
            "evidence": r.evidence,
        }
        for r in _report_order(rows)
    ]
    assert got == expected["rows"]
    assert [u.text for u in unmatched] == expected["unmatched"]
    # the company sentence created no row
    assert expected["no_row_from_company_sentence"] is True
    assert all("fintech" not in r.evidence.lower() for r in rows)


def test_fixture_rules_version_is_pinned():
    expected = json.loads(
        (FIXTURES / "soft_skills_expected.json").read_text(encoding="utf-8")
    )
    assert expected["rules_version"] == MATCHER_RULES_VERSION


# --- Explicit matching ------------------------------------------------------ #

def test_explicit_match_on_label_en_is_whole_word_and_case_insensitive():
    rows, _ = _match("Requirements:\n- WORK IN TEAMS with other developers\n")
    assert [r.label_en for r in rows] == ["work in teams"]
    assert rows[0].certainty == "explicit"


def test_explicit_match_on_alt_labels_en():
    rows, _ = _match("Responsibilities:\n- You will give an account of the facts\n")
    assert [r.label_en for r in rows] == ["report facts"]


def test_no_partial_word_matches():
    # "decoder" contains "make decisions"? no — but a word like "teamwork"
    # must not match the label "work in teams" partially.
    rows, _ = _match("Requirements:\n- Experience with teamwork frameworks\n")
    assert rows == []


# --- Inference table --------------------------------------------------------- #

def test_inference_table_provides_reason_and_certainty():
    rows, _ = _match("Responsibilities:\n- Manage stakeholders across the company\n")
    assert [r.label_en for r in rows] == ["build networks"]
    assert rows[0].certainty == "inferred"
    assert rows[0].reason
    assert rows[0].reason.endswith("closest option.")


def test_no_inference_from_company_industry_or_title_lines():
    text = (
        "Fast-growing fintech company. Manage stakeholders nowhere.\n"
        "We build wallets.\n"
    )
    rows, _ = _match(text)
    assert rows == []


# --- Merge and structure ------------------------------------------------------- #

def test_multiple_evidence_pieces_merge_to_one_row():
    text = (
        "Responsibilities:\n"
        "- Work in teams with designers\n"
        "Preferred Qualifications:\n"
        "- You work in teams with partners too\n"
    )
    rows, _ = _match(text)
    assert len(rows) == 1
    assert rows[0].label_en == "work in teams"
    assert rows[0].priority == "must"  # highest priority kept


def test_removal_test_holds_structurally():
    # every row's evidence contains its own label or a table-backed phrase
    raw = (FIXTURES / "soft_skills_posting.txt").read_text(encoding="utf-8")
    cleaned = clean_posting(raw).cleaned_text
    rows, _ = _match(raw)
    for row in rows:
        assert row.evidence in cleaned
        if row.certainty == "explicit":
            assert row.label_en.lower() in row.evidence.lower()
        else:
            assert row.reason  # table-backed


def test_unmatched_concept_never_becomes_a_row():
    rows, unmatched = _match("Requirements:\n- Excellent communication skills\n")
    assert rows == []
    assert [u.text for u in unmatched] == ["Excellent communication skills"]
