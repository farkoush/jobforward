"""Unit tests for the deterministic scoring engine (scoring/metrics.py).

Tests the three-dimension FR-007 formula + the permanent reference fixture
from the constitution (Principle 9, v2.0.0): role_action_clarity (2,2),
result (2,1), context (2,1) → entry score 250/3 ≈ 83.33 (dimension scores
100, 75, 75).
"""

from __future__ import annotations

import pytest

from src.jobforward.scoring.metrics import (
    dimension_score,
    entry_score,
    entry_score_from_ratings,
    overall_score,
)
from src.jobforward.models.entities import Ratings


def test_dimension_score():
    """dimension = sum ÷ (2 × bullet_count) × 100."""
    # Both bullets rated 2: sum=4, n=2 → 4 ÷ 4 × 100 = 100
    assert dimension_score(4, 2) == 100.0
    # All 0s: sum=0 → 0
    assert dimension_score(0, 2) == 0.0
    # Mixed: sum=3, n=2 → 3 ÷ 4 × 100 = 75
    assert dimension_score(3, 2) == 75.0
    # Single bullet: sum=2, n=1 → 100
    assert dimension_score(2, 1) == 100.0
    # bullet_count 0 is invalid
    with pytest.raises(ValueError):
        dimension_score(4, 0)


def test_entry_score():
    """entry = equal-weighted mean of the 3 dimension scores."""
    dims = [100.0, 75.0, 75.0]
    assert entry_score(dims) == pytest.approx(250 / 3, abs=1e-9)
    assert entry_score([]) == 0.0


def test_reference_fixture_83_33():
    """Permanent reference: role_action (2,2), result (2,1), context (2,1)
    → dimension scores 100, 75, 75 → entry 250/3 ≈ 83.33.

    A naive `== 83.33` float compare is a bug (250/3 = 83.333...):
    assert the exact fraction or pytest.approx.
    """
    ratings = [
        Ratings(context=2, role_action_clarity=2, result=2),
        Ratings(context=1, role_action_clarity=2, result=1),
    ]
    value = entry_score_from_ratings(ratings)
    assert value == 250 / 3
    assert value == pytest.approx(83.33, abs=0.01)


def test_overall_score_single_entry():
    """overall = simple mean of eligible entries."""
    assert overall_score([250 / 3]) == 250 / 3


def test_overall_score_multiple_entries():
    """overall = simple mean across all eligible entries."""
    scores = [83.33, 50.0, 100.0]
    assert overall_score(scores) == pytest.approx((83.33 + 50.0 + 100.0) / 3)


def test_overall_score_empty():
    """No eligible entries → overall is 0.0 (caller hides the display)."""
    assert overall_score([]) == 0.0
