"""Unit tests for deterministic five-part extraction (flow/parts.py).

Pins the finalized framework contract (spec §2/§4): each part is a VERBATIM
substring of the bullet text or empty — extraction never paraphrases, never
invents, and never guesses an undetectable part (Principle 1). Marker lists
are versioned with the rubric.
"""

from __future__ import annotations

from src.jobforward.flow.parts import extract_parts

FULL_BULLET = (
    "New users could not find their saved items, so I built a saved-items "
    "dashboard, resulting in more users coming back; return visits grew by 15%."
)


def test_full_five_parts_extracted():
    parts = extract_parts(FULL_BULLET)
    assert parts.user_need == "New users could not find their saved items"
    assert parts.product_feature == "a saved-items dashboard"
    assert parts.action == "I built a saved-items dashboard"
    assert parts.result == "more users coming back"
    assert parts.metric == "return visits grew by 15%."


def test_parts_are_verbatim_substrings():
    parts = extract_parts(FULL_BULLET)
    for value in (
        parts.user_need,
        parts.product_feature,
        parts.action,
        parts.result,
        parts.metric,
    ):
        assert value == "" or value in FULL_BULLET


def test_number_only_result_lands_in_metric():
    """'20% growth' is a metric with no outcome narrative (spec §3)."""
    parts = extract_parts("20% growth")
    assert parts.metric == "20% growth"
    assert parts.result == ""


def test_metric_clause_with_number_and_measure():
    parts = extract_parts("Improved onboarding, raising activation by 15%")
    assert parts.metric == "raising activation by 15%"
    assert parts.action == "Improved onboarding"
    assert parts.user_need == ""


def test_action_and_feature_without_need():
    parts = extract_parts(
        "Led a team of 3 analysts to build a sales dashboard for the Q3 launch"
    )
    assert parts.action == (
        "Led a team of 3 analysts to build a sales dashboard for the Q3 launch"
    )
    assert parts.product_feature == "a sales dashboard"
    assert parts.user_need == ""
    assert parts.result == ""
    assert parts.metric == ""


def test_undetectable_parts_stay_empty():
    """Learning statements yield no action part; nothing is invented."""
    parts = extract_parts("Learned how the data pipeline works")
    assert parts.user_need == ""
    assert parts.product_feature == ""
    assert parts.action == ""
    assert parts.result == ""
    assert parts.metric == ""


def test_part_present_booleans():
    parts = extract_parts(FULL_BULLET)
    assert parts.present() == {
        "user_need": True,
        "product_feature": True,
        "action": True,
        "result": True,
        "metric": True,
    }
    empty = extract_parts("Learned how the data pipeline works")
    assert all(value is False for value in empty.present().values())


def test_extraction_is_deterministic():
    assert extract_parts(FULL_BULLET) == extract_parts(FULL_BULLET)
