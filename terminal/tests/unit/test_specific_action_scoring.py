"""Unit tests for the Specific Action scoring checklist (rubric-3.0.0).

Pins the 0/1/2 levels defined in
specs/001-experience-improvement-flow/checklists/specific-action.md
(Phase 9, T047). Tests were written BEFORE the adapter update (T046) and
must fail against the rubric-2.0.0 heuristics.
"""

from __future__ import annotations

import pytest

from src.jobforward.scoring.adapters.local import LocalHeuristicAdapter
from src.jobforward.scoring.evaluator import BulletRatingRequest

# (bullet text, expected Specific Action score) per the checklist doc.
CASES = [
    # --- 2: action verb + concrete object or scope ---------------------- #
    ("Led a team of 3 analysts to build a sales dashboard for the Q3 launch", 2),
    ("Improved onboarding, raising activation by 15%", 2),
    ("Analyzed churn data from the signup funnel", 2),
    ("Built and ran A/B tests on the checkout flow", 2),
    # verb mid-sentence, concrete object still earns the 2 (leading dropped)
    ("During the internship, designed a new onboarding flow in Figma", 2),
    # generic phrase + real verb + concrete object -> verb wins
    ("Worked with the data team and built a churn dashboard", 2),
    # --- 1: generic action ----------------------------------------------- #
    # v2 gave 2 (leading verb); v3 demands a concrete object
    ("Led meetings", 1),
    ("Analyzed data", 1),
    ("Managed various projects and improved processes", 1),
    # v2 gave 0 (no list verb); v3 sees asserted-but-vague involvement
    ("Worked on the search feature", 1),
    ("Responsible for the team backlog", 1),
    ("Helped with testing", 1),
    ("Was involved in the launch", 1),
    # --- 0: no action at all ---------------------------------------------- #
    ("Product Manager on the payments team", 0),
    ("Learned how the data pipeline works", 0),
    ("A 3-month internship at a fintech company", 0),
    ("", 0),
]


def _action_scores(texts: list[str]) -> list[int]:
    adapter = LocalHeuristicAdapter()
    request = BulletRatingRequest(texts=texts)
    response = adapter.evaluate_with_retry(request)
    return [r.role_action_clarity for r in response.ratings]


@pytest.mark.parametrize("text,expected", CASES)
def test_specific_action_level(text: str, expected: int):
    """Each checklist example lands on its documented 0/1/2 level."""
    assert _action_scores([text]) == [expected]


def test_all_cases_in_one_request():
    """Ratings stay per-bullet when evaluated together (order preserved)."""
    texts = [text for text, _ in CASES]
    assert _action_scores(texts) == [expected for _, expected in CASES]


def test_scores_stay_in_valid_range():
    """Specific Action remains an int in {0, 1, 2} on every case."""
    for value in _action_scores([text for text, _ in CASES]):
        assert value in (0, 1, 2)
