"""Unit tests for the rewrite wording rules (flow/rewrite.py, spec §7).

Keywords (nouns, verbs, tool names, numbers, results, product names) must
stay unchanged; only grammar/spelling/tense, the short linking words
(and/to/with/by/for), word order, and the structural glue are allowed. A
proposal needing a new keyword is refused, never shown.
"""

from __future__ import annotations

import pytest

from src.jobforward.flow.rewrite import (
    ExtraClaimError,
    assemble_rewrite,
    validate_wording_rules,
)
from src.jobforward.models.entities import QuestionDimension

BULLET = "Improved onboarding for the mobile app"


def test_assembled_rewrite_passes_wording_rules():
    answers = {QuestionDimension.CONTEXT: "New users dropped off during onboarding"}
    proposal = assemble_rewrite(BULLET, answers)
    assert BULLET in proposal
    assert "New users dropped off during onboarding" in proposal


def test_new_keyword_rejected():
    """A token absent from the sources is a new keyword → refused."""
    with pytest.raises(ExtraClaimError):
        validate_wording_rules(
            f"{BULLET}\nContext: New users hated the slow search page",
            [BULLET, "New users dropped off during onboarding"],
        )


def test_linking_words_allowed():
    """The spec's linking words never count as new keywords."""
    validate_wording_rules(
        "Improved the onboarding and the mobile app to with by for",
        [BULLET],
    )


def test_glue_labels_allowed():
    validate_wording_rules("Context: x\nFeature: y\nMetric: z", ["x", "y", "z"])


def test_numbers_still_rejected_by_no_extra_claims():
    from src.jobforward.flow.rewrite import validate_no_extra_claims

    with pytest.raises(ExtraClaimError):
        validate_no_extra_claims("Activation grew by 40%", ["Activation grew"])


def test_new_verb_rejected_as_keyword():
    with pytest.raises(ExtraClaimError):
        validate_wording_rules(
            f"{BULLET} and rebuilt the flow", [BULLET]
        )


def test_metric_answer_lands_in_proposal():
    answers = {QuestionDimension.METRIC: "Return visits grew by 15%"}
    proposal = assemble_rewrite(BULLET, answers)
    assert "Metric: Return visits grew by 15%" in proposal
