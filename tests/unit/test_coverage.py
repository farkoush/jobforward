"""Unit tests for the coverage record (Phase 12, spec §2.2).

The coverage record is DIAGNOSTIC ONLY (research D11): five per-part entries
(quotation / status / reason) plus one entry per maximal contiguous unclaimed
span ("orphaned") with a reason. It must never change scores, questions, or
statuses, and every non-empty quotation must be verbatim in the bullet (P1).
"""

from __future__ import annotations

from src.jobforward.flow.parts import build_coverage, extract_parts
from src.jobforward.models.entities import Ratings

UPWORK_BULLET = (
    "Benchmarked 7 local and international competitors and mapped Upwork "
    "and Freelancer user journeys to uncover friction in hiring and "
    "project-assignment flows."
)


def _record(text: str, ratings: Ratings):
    return build_coverage(text, extract_parts(text), ratings)


def test_five_part_entries_in_order_with_reasons():
    # Context=2 implies need AND feature present (§3), so the feature entry
    # is filled only in a bullet that also states its need.
    record = _record(
        "Users could not find the saved items page",
        Ratings(context=2, role_action_clarity=0, result=0),
    )
    assert [entry["part"] for entry in record[:5]] == [
        "user_need",
        "product_feature",
        "action",
        "result",
        "metric",
    ]
    need = record[0]
    assert need["quote"] == "Users could not find the saved items page"
    assert need["status"] == "filled"
    assert need["reason"] == "The bullet states its user need with these words."
    feature = record[1]
    assert feature["quote"] == "saved items page"
    assert feature["status"] == "filled"
    assert feature["reason"] == "The bullet states its product feature with these words."
    action = record[2]
    assert action["quote"] == ""
    assert action["status"] == "missing"
    assert action["reason"] == "No specific action was found in the bullet."


def test_every_nonempty_quote_is_verbatim():
    record = _record(UPWORK_BULLET, Ratings(context=2, role_action_clarity=0, result=1))
    normalized = " ".join(UPWORK_BULLET.split())
    for entry in record:
        if entry["quote"]:
            assert entry["quote"] in normalized


def test_vague_follows_the_dimension_rating():
    record = _record(
        "Benchmarked 7 competitors and mapped Upwork journeys to uncover "
        "friction in hiring flows.",
        Ratings(context=2, role_action_clarity=0, result=1),
    )
    result_entry = record[3]
    assert result_entry["quote"] == "to uncover friction in hiring flows."
    assert result_entry["status"] == "vague"
    assert result_entry["reason"] == "The result is present but vague (rated 1 of 2)."


def test_empty_part_is_never_vague():
    record = _record(
        "Built a dashboard", Ratings(context=0, role_action_clarity=2, result=0)
    )
    assert record[3]["status"] == "missing"  # result: empty quote + 0 rating
    assert record[4]["status"] == "missing"  # metric


def test_metric_is_never_vague():
    record = _record(
        "Improved the app, conversion grew 15%",
        Ratings(context=0, role_action_clarity=1, result=2),
    )
    assert record[2]["status"] == "vague"  # action rated 1
    assert record[4]["status"] == "filled"  # metric has no dimension


def test_fully_covered_bullet_has_no_orphans():
    record = _record(UPWORK_BULLET, Ratings(context=2, role_action_clarity=0, result=1))
    assert [entry for entry in record if entry["part"] == "orphaned"] == []


def test_feature_inside_action_is_never_orphaned():
    record = _record(
        "Improved the checkout page",
        Ratings(context=0, role_action_clarity=2, result=0),
    )
    assert [entry for entry in record if entry["part"] == "orphaned"] == []


def test_leftover_clause_is_one_orphan_with_reason_citing_words():
    text = "I rebuilt the pricing page, and the rollout finished in two weeks"
    record = _record(text, Ratings(context=0, role_action_clarity=2, result=0))
    orphans = [entry for entry in record if entry["part"] == "orphaned"]
    assert len(orphans) == 1
    orphan = orphans[0]
    assert orphan["status"] == "orphaned"
    assert orphan["quote"] == "and the rollout finished in two weeks"
    assert orphan["quote"] in orphan["reason"]
    assert record[-1] is orphan  # orphans come after the five part entries


def test_coverage_never_changes_ratings():
    from src.jobforward.scoring.adapters.local import LocalHeuristicAdapter

    adapter = LocalHeuristicAdapter()
    text = "I rebuilt the pricing page, and the rollout finished in two weeks"
    parts = extract_parts(text)
    request = type(
        "Req",
        (),
        {"texts": [text], "parts": [parts], "answers": None, "rubric_version": "rubric-3.1.0"},
    )()
    before = adapter.evaluate(request).ratings
    _record(text, Ratings(context=2, role_action_clarity=2, result=2))
    after = adapter.evaluate(request).ratings
    assert [(r.context, r.role_action_clarity, r.result) for r in before] == [
        (r.context, r.role_action_clarity, r.result) for r in after
    ]
