"""Unit tests for scoring stability (SC-003 / FR-016 / constitution P4 v2.0.0).

Across 5 consecutive runs on an unchanged entry, at least 90% of
bullet-by-dimension scores must be exactly the same. The deterministic local
adapter must achieve 100%.
"""

from __future__ import annotations

from src.jobforward.scoring.adapters.local import LocalHeuristicAdapter
from src.jobforward.scoring.evaluator import BulletRatingRequest

BULLETS = [
    "Led a team of 3 analysts to build a sales dashboard for the Q3 launch",
    "Improved onboarding, raising activation by 15%",
    "Learned how the data pipeline works",
]


def _run_once(adapter: LocalHeuristicAdapter):
    request = BulletRatingRequest(texts=list(BULLETS), rubric_version="rubric-2.0.0")
    response = adapter.evaluate_with_retry(request)
    return [
        (r.bullet_index, r.context, r.role_action_clarity, r.result)
        for r in response.ratings
    ]


def test_five_consecutive_runs_at_least_90_percent_identical():
    adapter = LocalHeuristicAdapter(rubric_version="rubric-2.0.0")
    runs = [_run_once(adapter) for _ in range(5)]

    total = 0
    identical = 0
    first = runs[0]
    for run in runs[1:]:
        for a, b in zip(first, run):
            # Compare per dimension: tuples are (index, context, action, result).
            for da, db in zip(a[1:], b[1:]):
                total += 1
                if da == db:
                    identical += 1
    assert total == 4 * 3 * 3  # 4 comparisons x 3 bullets x 3 dimensions
    ratio = identical / total
    assert ratio >= 0.9


def test_deterministic_adapter_gives_100_percent():
    adapter = LocalHeuristicAdapter(rubric_version="rubric-2.0.0")
    runs = [_run_once(adapter) for _ in range(5)]
    assert all(run == runs[0] for run in runs[1:])
