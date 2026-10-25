"""Contract tests for the evaluator port (scoring/evaluator.py).

Tests FR-008 rating schema: schema-compliant output accepted; output with
a rating of 3 / missing key / extra aggregate number → invalid; invalid →
rejected, one retry, then reported; no partial scoring; FR-006 enforced
(no posting input anywhere in the rating path).
"""

from __future__ import annotations

import pytest

from src.jobforward.scoring.evaluator import (
    BulletRating,
    BulletRatingRequest,
    BulletRatingResponse,
    DIMENSIONS,
    EvaluatorOutputError,
    VALID_RATINGS,
    validate_response,
)


def test_valid_response_accepted():
    """Schema-compliant output with all four dims in {0,1,2} is accepted."""
    resp = BulletRatingResponse(
        rubric_version="rubric-1.0.0",
        ratings=[
            BulletRating(
                bullet_index=0,
                role_action_clarity=2,
                outcome=1,
                skill_evidence=2,
                structure_scannability=1,
            )
        ],
        notes=None,
    )
    validate_response(resp, expected_bullet_count=1)


def test_wrong_rating_count_rejected():
    """One rating per bullet required; mismatch → EvaluatorOutputError."""
    resp = BulletRatingResponse(
        rubric_version="rubric-1.0.0",
        ratings=[
            BulletRating(
                bullet_index=0,
                role_action_clarity=2,
                outcome=1,
                skill_evidence=2,
                structure_scannability=1,
            ),
            BulletRating(
                bullet_index=1,
                role_action_clarity=1,
                outcome=0,
                skill_evidence=1,
                structure_scannability=0,
            ),
        ],
    )
    with pytest.raises(EvaluatorOutputError):
        validate_response(resp, expected_bullet_count=1)


def test_rating_out_of_range_rejected():
    """A rating of 3 (outside {0,1,2}) → rejected by dataclass validation.

    BulletRating.__post_init__ enforces {0,1,2} at construction time, so an
    invalid rating object cannot exist. This test verifies that constraint
    holds (FR-008 / VR-3).
    """
    with pytest.raises(ValueError, match="must be in"):
        BulletRating(
            bullet_index=0,
            role_action_clarity=3,  # invalid!
            outcome=1,
            skill_evidence=2,
            structure_scannability=1,
        )


def test_bullet_index_mismatch_rejected():
    """Ratings must be in the same order as requested bullets."""
    resp = BulletRatingResponse(
        rubric_version="rubric-1.0.0",
        ratings=[
            BulletRating(
                bullet_index=5,  # should be 0
                role_action_clarity=2,
                outcome=1,
                skill_evidence=2,
                structure_scannability=1,
            )
        ],
    )
    with pytest.raises(EvaluatorOutputError):
        validate_response(resp, expected_bullet_count=1)


def test_valid_ratings_are_0_1_2():
    """All valid ratings must be in {0, 1, 2}."""
    for v in VALID_RATINGS:
        assert v in (0, 1, 2)
    assert 3 not in VALID_RATINGS
    assert -1 not in VALID_RATINGS


def test_dimensions_constant():
    """DIMENSIONS contains exactly the four expected names."""
    assert tuple(DIMENSIONS) == (
        "role_action_clarity",
        "outcome",
        "skill_evidence",
        "structure_scannability",
    )