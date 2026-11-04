"""Contract tests for the evaluator port (scoring/evaluator.py) — rubric-2.0.0.

Tests the THREE-dimension schema: schema-compliant output accepted; output
with a rating of 3 / missing `context` key / extra aggregate number →
invalid; invalid → rejected, one retry, then reported; no partial scoring;
FR-006 enforced (no posting input anywhere in the rating path).
"""

from __future__ import annotations

import dataclasses

import pytest

from src.jobforward.scoring.evaluator import (
    BulletRating,
    BulletRatingRequest,
    BulletRatingResponse,
    DIMENSIONS,
    EvaluatorOutputError,
    validate_response,
)
from src.jobforward.scoring.adapters.local import LocalHeuristicAdapter


def _valid_response(n: int = 1) -> BulletRatingResponse:
    return BulletRatingResponse(
        rubric_version="rubric-2.0.0",
        ratings=[
            BulletRating(
                bullet_index=i,
                context=2,
                role_action_clarity=1,
                result=0,
            )
            for i in range(n)
        ],
        notes=None,
    )


def test_valid_response_accepted():
    validate_response(_valid_response(), expected_bullet_count=1)


def test_wrong_rating_count_rejected():
    resp = BulletRatingResponse(
        rubric_version="rubric-2.0.0",
        ratings=_valid_response(2).ratings,
        notes=None,
    )
    with pytest.raises(EvaluatorOutputError):
        validate_response(resp, expected_bullet_count=1)


def test_rating_out_of_range_rejected():
    with pytest.raises(ValueError):
        BulletRating(bullet_index=0, context=3, role_action_clarity=1, result=0)
    resp = _valid_response()
    resp.ratings[0].context = 3  # bypass constructor validation post-hoc
    with pytest.raises(EvaluatorOutputError):
        validate_response(resp, expected_bullet_count=1)


def test_notes_with_aggregate_rejected():
    resp = _valid_response()
    resp.notes = "Overall score: 83"
    with pytest.raises(EvaluatorOutputError):
        validate_response(resp, expected_bullet_count=1)


def test_retry_once_then_reported():
    """Invalid output → rejected, one internal retry, then the failure is
    raised for the caller to report (FR-014). No partial scoring."""

    class FlakyAdapter(LocalHeuristicAdapter):
        def __init__(self) -> None:
            super().__init__()
            self.calls = 0

        def evaluate(self, request: BulletRatingRequest) -> BulletRatingResponse:
            self.calls += 1
            # Always wrong: two ratings for one bullet.
            return BulletRatingResponse(
                rubric_version="rubric-2.0.0",
                ratings=_valid_response(2).ratings,
                notes=None,
            )

    adapter = FlakyAdapter()
    with pytest.raises(EvaluatorOutputError):
        adapter.evaluate_with_retry(BulletRatingRequest(texts=["one bullet"]))
    assert adapter.calls == 2  # first attempt + exactly one retry


def test_evaluator_signature_has_three_dimensions():
    """The rubric-2.0.0 port carries exactly context, role_action_clarity,
    result — no PM-skill or structure dimension."""
    assert DIMENSIONS == ("context", "role_action_clarity", "result")
    fields = {f.name for f in dataclasses.fields(BulletRating)}
    assert fields == {"bullet_index", "context", "role_action_clarity", "result"}


def test_request_has_no_posting_field():
    """FR-006: the rating request physically cannot carry a job posting.

    rubric-3.0.0 adds ``parts`` (the bullet's own five-part extraction —
    still bullet-derived data, never posting data)."""
    fields = {f.name for f in dataclasses.fields(BulletRatingRequest)}
    assert fields == {"texts", "answers", "rubric_version", "parts"}
