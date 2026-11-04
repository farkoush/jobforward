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


# --- rubric-3.1.0: research verbs and intention clauses ---------------------


def test_research_verbs_fill_the_need_not_the_action():
    """Problem 2: research/mapping verbs are need signals, never action."""
    parts = extract_parts(
        "Benchmarked 7 local and international competitors and mapped Upwork "
        "and Freelancer user journeys to uncover friction in hiring and "
        "project-assignment flows."
    )
    assert parts.user_need == (
        "Benchmarked 7 local and international competitors and mapped Upwork "
        "and Freelancer user journeys"
    )
    assert parts.action == ""
    assert parts.result == "to uncover friction in hiring and project-assignment flows."
    assert parts.product_feature == ""
    assert parts.metric == ""


def test_research_only_bullet_has_no_action():
    parts = extract_parts("Researched why new hires quit within their first year")
    assert parts.user_need == "Researched why new hires quit within their first year"
    assert parts.action == ""
    assert parts.result == ""


def test_purpose_clause_in_an_action_clause_is_not_carved():
    """A clause that fills the action keeps its whole text; no part is
    emptied by the intention carve (rubric-3.0.0 behavior)."""
    parts = extract_parts("I built the export button to reduce churn")
    assert parts.action == "I built the export button to reduce churn"
    assert parts.user_need == "I built the export button to reduce churn"
    assert parts.result == ""


def test_purpose_clause_after_a_delivery_verb_stays_out_of_the_result():
    parts = extract_parts(
        "Led a team of 3 analysts to build a sales dashboard for the Q3 launch"
    )
    assert parts.result == ""


def test_need_marker_phrases_ending_in_to_are_not_intentions():
    parts = extract_parts("Users had no way to export data, so I built the export button")
    assert parts.user_need == "Users had no way to export data"
    assert parts.result == ""


def test_multiline_bullet_extracts_like_single_line():
    """A pasted bullet with a line break inside the purpose phrase must
    extract exactly like the same words on one line (rubric-3.1.0)."""
    parts = extract_parts(
        "Benchmarked 7 local and international competitors and mapped Upwork "
        "and Freelancer user journeys to \nuncover friction in hiring and "
        "project-assignment flows."
    )
    assert parts.user_need == (
        "Benchmarked 7 local and international competitors and mapped Upwork "
        "and Freelancer user journeys"
    )
    assert parts.result == "to uncover friction in hiring and project-assignment flows."
    assert parts.action == ""


def test_improved_bullet_parts_rubric_3_1_0():
    """The re-scored improved bullet: need from "had no", feature from
    "flows" (outside the intention clause), action from "redesigned"."""
    parts = extract_parts(
        "Hiring teams had no clear view of competitor strengths, so I "
        "redesigned the hiring and project-assignment flows, and users no "
        "longer face friction in hiring and project-assignment flows by 35%."
    )
    assert parts.user_need == "Hiring teams had no clear view of competitor strengths"
    assert parts.action == "I redesigned the hiring and project-assignment flows"
    assert parts.product_feature == "project-assignment flows"


def test_feature_marker_inside_intention_clause_is_skipped():
    """Problem 1: a phrase inside the "to …" intention clause is the result,
    never the feature — even when it contains a feature word like "flows"."""
    parts = extract_parts(
        "Benchmarked 7 competitors and mapped Upwork and Freelancer journeys "
        "to uncover friction in hiring and project-assignment flows."
    )
    assert parts.product_feature == ""
    assert parts.result == "to uncover friction in hiring and project-assignment flows."
