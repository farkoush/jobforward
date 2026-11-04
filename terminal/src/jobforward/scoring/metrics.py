"""Deterministic scoring engine (scoring/metrics.py) — rubric-2.0.0.

All arithmetic is deterministic and lives here — never in an evaluator
adapter (constitution Principle 4). Pure functions, trivially testable.

Formulas (FR-007/FR-008):
  dimension_score  = sum of bullet scores in that dimension ÷ (2 × bullet_count) × 100
  entry_score      = equal-weighted mean of the 3 dimension scores
  overall_score    = simple mean of the eligible entries' scores

Eligible entry (VR-2): has ≥ 1 bullet, all bullets scored, not a draft,
not deleted (FR-003/FR-020) — enforced by storage.schema.is_eligible_for_overall.

The permanent reference fixture: role_action_clarity (2,2), result (2,1),
context (2,1) → dimension scores 100, 75, 75 → entry score 250/3 ≈ 83.33.
Assert the exact fraction — a naive `== 83.33` float compare is a bug.
"""

from __future__ import annotations

from fractions import Fraction
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover
    from ..models.entities import Ratings

NUM_DIMENSIONS = 3
MAX_RATING = 2


def dimension_score(sum_points: int, bullet_count: int) -> float:
    """Score for one dimension: sum of that dimension's bullet ratings
    ÷ (2 × number of bullets) × 100.

    Args:
        sum_points: Sum of the per-dimension ratings (each 0/1/2).
        bullet_count: Number of bullets in the entry (> 0).

    Returns:
        Score from 0.0 to 100.0.
    """
    if bullet_count <= 0:
        raise ValueError("bullet_count must be > 0")
    return (sum_points / (2 * bullet_count)) * 100


def entry_score(dimension_scores: list[float]) -> float:
    """Equal-weighted mean of the 3 dimension scores.

    Args:
        dimension_scores: List of 3 dimension scores (each 0-100).

    Returns:
        Entry score from 0.0 to 100.0, or 0.0 if empty.
    """
    if not dimension_scores:
        return 0.0
    return sum(dimension_scores) / len(dimension_scores)


def entry_score_from_ratings(ratings: list["Ratings"]) -> float:
    """Exact entry score from a list of per-bullet Ratings.

    Returns the exact fraction (as float) — for the reference fixture this is
    250/3, NOT 83.33. Computed via Fractions to avoid float drift.
    """
    if not ratings:
        return 0.0
    n = len(ratings)
    sums = {
        "context": sum(r.context for r in ratings),
        "role_action_clarity": sum(r.role_action_clarity for r in ratings),
        "result": sum(r.result for r in ratings),
    }
    frac = sum(Fraction(s, 2 * n) * 100 for s in sums.values()) / NUM_DIMENSIONS
    return float(frac)


def overall_score(entry_scores: list[float]) -> float:
    """Simple mean of the eligible entries' scores.

    Drafts (0 bullets or user-saved) and deleted entries are excluded by the
    caller (VR-2).

    Args:
        entry_scores: List of entry scores (each 0-100).

    Returns:
        Overall score from 0.0 to 100.0, or 0.0 if no entries (the display
        hides the overall line in that case).
    """
    if not entry_scores:
        return 0.0
    return sum(entry_scores) / len(entry_scores)
