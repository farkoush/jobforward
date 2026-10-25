"""Unit tests for the deterministic scoring engine (scoring/metrics.py).

Tests FR-007 formula + the permanent 81.25 reference fixture from the
constitution (Principle 9): ratings (2,2),(2,1),(2,0),(2,2) → exactly 81.25.
"""

from __future__ import annotations

from src.jobforward.scoring.metrics import (
    dimension_score,
    experience_score,
    overall_score,
)


def test_dimension_score():
    """dimension = sum ÷ (2 × n) × 100, where n = number of dimensions rated."""
    # All 2s: sum=8, n=4 → 8 ÷ (2×4) × 100 = 8 ÷ 8 × 100 = 100
    assert dimension_score(8, 4) == 100.0
    # All 0s: sum=0 → 0
    assert dimension_score(0, 4) == 0.0
    # Mixed: sum=5, n=4 → 5 ÷ 8 × 100 = 62.5
    assert dimension_score(5, 4) == 62.5
    # Single dimension: sum=2, n=1 → 2 ÷ 2 × 100 = 100
    assert dimension_score(2, 1) == 100.0


def test_experience_score():
    """experience = equal-weighted mean of the 4 dimension scores."""
    dims = [100.0, 75.0, 50.0, 100.0]
    assert experience_score(dims) == (100 + 75 + 50 + 100) / 4  # 81.25


def test_reference_fixture_81_25():
    """Permanent reference: (2,2),(2,1),(2,0),(2,2) → exactly 81.25.

    Dimension scores: 100, 75, 50, 100 → mean = 81.25
    (Constitution Principle 9 — permanent test fixture.)
    """
    dim_scores = [
        dimension_score(4, 2),   # (2,2) → 4÷4×100 = 100
        dimension_score(3, 2),   # (2,1) → 3÷4×100 = 75
        dimension_score(2, 2),   # (2,0) → 2÷4×100 = 50
        dimension_score(4, 2),   # (2,2) → 4÷4×100 = 100
    ]
    assert experience_score(dim_scores) == 81.25


def test_overall_score_single_entry():
    """overall = simple mean of entries with ≥1 scored bullet."""
    # One entry with experience score 81.25
    assert overall_score([81.25]) == 81.25


def test_overall_score_multiple_entries():
    """overall = mean across all entries that have bullets."""
    scores = [81.25, 50.0, 100.0]
    assert overall_score(scores) == (81.25 + 50.0 + 100.0) / 3  # 77.0833...


def test_overall_score_empty():
    """No entries with bullets → overall is 0.0 (no division by zero)."""
    assert overall_score([]) == 0.0