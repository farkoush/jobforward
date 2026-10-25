"""Unit tests for the no-extra-claims validator (flow/rewrite.py).

FR-010 + constitution Principle 1: a rewrite is built only from the original
bullet + the user's answers; any added number, impact, or claim is a refused
assembly, never a shown proposal. The rule applies to pattern-guided
rewrites too.
"""

from __future__ import annotations

import pytest

from src.jobforward.flow.rewrite import (
    ExtraClaimError,
    assemble_rewrite,
    validate_no_extra_claims,
)
from src.jobforward.models.entities import QuestionDimension


def test_reassembled_user_segments_accepted():
    proposal = assemble_rewrite(
        "Led the dashboard rebuild",
        {
            QuestionDimension.CONTEXT: "for the sales team during Q3",
            QuestionDimension.RESULT: "adoption grew to 40 teams",
        },
    )
    assert "Led the dashboard rebuild" in proposal
    assert "Context: for the sales team during Q3" in proposal
    assert "Result: adoption grew to 40 teams" in proposal


def test_added_number_rejected():
    with pytest.raises(ExtraClaimError):
        validate_no_extra_claims(
            "Improved performance by 40%",
            ["Improved performance"],
        )


def test_number_from_sources_accepted():
    validate_no_extra_claims(
        "Raised activation by 15%",
        ["Raised activation by 15%", "the answer mentioned 15%"],
    )


def test_numbers_written_by_the_user_are_valid_sources():
    """FR-010: sources = original bullet ∪ the user's answers. A number the
    user typed in their own answer is legitimate; only foreign numbers are
    refused."""
    proposal = assemble_rewrite(
        "Ran user interviews",
        {QuestionDimension.RESULT: "satisfaction reached 90 points"},
    )
    assert "90 points" in proposal


def test_unanswered_dimensions_add_nothing():
    proposal = assemble_rewrite(
        "Led the dashboard rebuild",
        {QuestionDimension.RESULT: "shipped in March"},
    )
    assert "Context:" not in proposal
    assert "Action:" not in proposal
    assert "Result: shipped in March" in proposal


def test_pattern_is_structure_only():
    """FR-004: the C→A→R pattern organizes the sentence; it is not a stored
    field and never invents content — the assembly output contains only
    verbatim bullet text, glue labels, and verbatim answers."""
    proposal = assemble_rewrite(
        "Migrated the reporting pipeline",
        {QuestionDimension.CONTEXT: "to cut weekly reporting time"},
    )
    allowed_lines = {
        "Migrated the reporting pipeline",
        "Context: to cut weekly reporting time",
    }
    assert set(proposal.split("\n")) == allowed_lines


def test_zero_tolerance_error_message():
    with pytest.raises(ExtraClaimError, match="FR-010"):
        validate_no_extra_claims("grew revenue by 25%", ["grew revenue"])
