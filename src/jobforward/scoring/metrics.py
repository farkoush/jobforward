"""Deterministic scoring engine (scoring/metrics.py).

All arithmetic is deterministic and lives here — never in an evaluator
adapter (constitution Principle 4). Pure functions, trivially testable.

Formulas (FR-007/FR-008):
  dimension_score  = sum_points ÷ (2 × n_dimensions) × 100
  experience_score = equal-weighted mean of the 4 dimension scores
  overall_score    = simple mean of experience scores (entries with bullets)

The permanent reference fixture: ratings (2,2),(2,1),(2,0),(2,2)
→ dimension scores 100, 75, 50, 100 → experience 81.25.
"""

from __future__ import annotations

NUM_DIMENSIONS = 4
MAX_RATING = 2


def dimension_score(sum_points: int, n_dimensions: int = NUM_DIMENSIONS) -> float:
    """Score for one dimension group: sum ÷ (2 × n) × 100.

    Args:
        sum_points: Sum of the per-dimension ratings (each 0/1/2).
        n_dimensions: Number of dimensions being scored (default 4).

    Returns:
        Score from 0.0 to 100.0.
    """
    if n_dimensions <= 0:
        raise ValueError("n_dimensions must be > 0")
    return (sum_points / (2 * n_dimensions)) * 100


def experience_score(dimension_scores: list[float]) -> float:
    """Equal-weighted mean of the 4 dimension scores.

    Args:
        dimension_scores: List of 4 dimension scores (each 0-100).

    Returns:
        Experience score from 0.0 to 100.0.
    """
    if not dimension_scores:
        return 0.0
    return sum(dimension_scores) / len(dimension_scores)


def overall_score(experience_scores: list[float]) -> float:
    """Simple mean of experience scores for entries with ≥1 scored bullet.

    Drafts (0 bullets) and deleted entries are excluded by the caller.

    Args:
        experience_scores: List of experience scores (each 0-100).

    Returns:
        Overall score from 0.0 to 100.0, or 0.0 if no entries.
    """
    if not experience_scores:
        return 0.0
    return sum(experience_scores) / len(experience_scores)
