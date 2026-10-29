"""Unit tests for part-based scoring (rubric-3.0.0, spec §3).

Context is scored from the extracted user_need / product_feature parts;
Result applies the bare-number rule; the metric never changes the result
score. Bullets WITHOUT part fields keep the raw-text heuristics (plan
Five-Part Framework Design §2).
"""

from __future__ import annotations

from src.jobforward.models.entities import BulletParts
from src.jobforward.scoring.adapters.local import LocalHeuristicAdapter
from src.jobforward.scoring.evaluator import BulletRatingRequest


def _score(text: str, part: BulletParts | None) -> tuple[int, int, int]:
    adapter = LocalHeuristicAdapter()
    request = BulletRatingRequest(
        texts=[text], parts=[part] if part is not None else None
    )
    response = adapter.evaluate_with_retry(request)
    rating = response.ratings[0]
    return rating.context, rating.role_action_clarity, rating.result


def test_context_two_when_specific_need_and_feature():
    part = BulletParts(
        user_need="New users could not find their saved items",
        product_feature="a saved-items dashboard",
    )
    assert _score("any text", part)[0] == 2


def test_context_zero_when_need_missing_even_with_feature():
    part = BulletParts(product_feature="a sales dashboard")
    assert _score("Led a team of 3 to build a sales dashboard", part)[0] == 0


def test_context_one_for_generic_need():
    part = BulletParts(
        user_need="Better efficiency for various things",
        product_feature="a dashboard",
    )
    assert _score("text", part)[0] == 1


def test_context_one_when_feature_missing():
    part = BulletParts(user_need="Users could not export their reports")
    assert _score("text", part)[0] == 1


def test_bare_number_result_scores_one():
    """'20% growth' — a number without a result — scores 1 (spec §3)."""
    part = BulletParts(metric="20% growth")
    _, _, result = _score("20% growth", part)
    assert result == 1


def test_metric_does_not_change_specific_result():
    part = BulletParts(
        result="more users coming back",
        metric="return visits grew by 15%",
    )
    _, _, result = _score("text", part)
    assert result == 2


def test_action_rated_from_action_part():
    part = BulletParts(action="I built a saved-items dashboard")
    _, action, _ = _score("other words entirely", part)
    assert action == 2


def test_parts_absent_keeps_raw_heuristics():
    """No parts argument → the Phase-9 raw-text behavior is unchanged."""
    text = "Improved onboarding, raising activation by 15%"
    context, action, result = _score(text, None)
    assert (context, action, result) == (0, 2, 2)


def test_full_framework_bullet_scores_complete():
    """The spec's worked example reaches 2/2/2 (metric present, non-bare)."""
    text = (
        "New users could not find their saved items, so I built a saved-items "
        "dashboard, resulting in more users coming back; return visits grew "
        "by 15%."
    )
    from src.jobforward.flow.parts import extract_parts

    part = extract_parts(text)
    assert _score(text, part) == (2, 2, 2)
