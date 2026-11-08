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
    QUOTE_FIELDS,
    BulletRating,
    BulletRatingRequest,
    BulletRatingResponse,
    DIMENSIONS,
    EvaluatorOutputError,
    RatingQuotes,
    validate_rating_evidence,
    validate_response,
)
from src.jobforward.scoring.adapters.local import LocalHeuristicAdapter
from src.jobforward.scoring.adapters.llm import LlmHeuristicAdapter


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
    result — no PM-skill or structure dimension. §14 adds the per-rating
    verbatim quotes (optional; None = legacy raw-text path)."""
    assert DIMENSIONS == ("context", "role_action_clarity", "result")
    fields = {f.name for f in dataclasses.fields(BulletRating)}
    assert fields == {
        "bullet_index",
        "context",
        "role_action_clarity",
        "result",
        "quotes",
    }


def test_request_has_no_posting_field():
    """FR-006: the rating request physically cannot carry a job posting.

    rubric-3.0.0 adds ``parts`` (the bullet's own five-part extraction —
    still bullet-derived data, never posting data)."""
    fields = {f.name for f in dataclasses.fields(BulletRatingRequest)}
    assert fields == {"texts", "answers", "rubric_version", "parts"}


# --- §14 (amendment 2026-11-08): single-source scoring output ---------------


def _quotes(**overrides) -> RatingQuotes:
    values = {
        "user_need": "users could not finish checkout",
        "product_feature": "the checkout form",
        "action": "I simplified the checkout form",
        "result": "more users finished checkout",
        "metric": "",
    }
    values.update(overrides)
    return RatingQuotes(**values)


def test_quotes_fields_match_the_five_parts():
    """§14.1: the quotation fields are exactly the five framework parts."""
    assert QUOTE_FIELDS == (
        "user_need",
        "product_feature",
        "action",
        "result",
        "metric",
    )


def test_evidence_valid_output_accepted():
    """A coherent rating + verbatim quotes passes §14.2."""
    rating = BulletRating(
        bullet_index=0,
        context=2,
        role_action_clarity=2,
        result=1,
        quotes=_quotes(),
    )
    text = (
        "users could not finish checkout, so I simplified the checkout form "
        "and more users finished checkout"
    )
    validate_rating_evidence(rating, text)


def test_full_score_without_quote_rejected():
    """§14.2: the state 'full score with an empty quote' is invalid."""
    text = (
        "users could not finish checkout, so I simplified the checkout form "
        "and more users finished checkout"
    )
    cases = [
        (2, 2, 1, _quotes(product_feature="")),  # context 2 without feature
        (2, 2, 1, _quotes(user_need="")),  # context 2 without need
        (1, 1, 1, _quotes(user_need="")),  # context 1 without need quote
        (0, 1, 1, _quotes(user_need="users could not finish checkout")),  # 0 with a need quote
        (2, 1, 1, _quotes(action="")),  # action 1 without action quote
        (2, 2, 2, _quotes(result="")),  # result 2 without result quote
    ]
    for context, action, result, quotes in cases:
        rating = BulletRating(
            bullet_index=0,
            context=context,
            role_action_clarity=action,
            result=result,
            quotes=quotes,
        )
        with pytest.raises(EvaluatorOutputError):
            validate_rating_evidence(rating, text)


def test_non_verbatim_quote_rejected():
    """§14.2: every quote must be a whitespace-normalized verbatim
    substring of the bullet's own text — paraphrase is invalid."""
    rating = BulletRating(
        bullet_index=0,
        context=2,
        role_action_clarity=2,
        result=1,
        quotes=_quotes(user_need="users were unable to check out"),
    )
    text = (
        "users could not finish checkout, so I simplified the checkout form "
        "and more users finished checkout"
    )
    with pytest.raises(EvaluatorOutputError):
        validate_rating_evidence(rating, text)


def test_verbatim_quote_allows_whitespace_difference():
    """Whitespace normalization: a quote that differs only in spacing is
    verbatim (multi-line bullets equal their single-line equivalent)."""
    rating = BulletRating(
        bullet_index=0,
        context=2,
        role_action_clarity=1,
        result=0,
        quotes=_quotes(
            user_need="users  could not\nfinish checkout",
            action="I simplified  the checkout\nform",
            result="",
            metric="",
        ),
    )
    validate_rating_evidence(
        rating,
        "users could not finish checkout, so I simplified the checkout form",
    )


def test_metric_quote_free_but_verbatim():
    """§14.1: the metric has no score and no invariant — but a non-empty
    metric quote must still be verbatim."""
    text = "Signups grew by 25%"
    ok = BulletRating(
        bullet_index=0,
        context=0,
        role_action_clarity=0,
        result=2,
        quotes=_quotes(
            user_need="",
            product_feature="",
            action="",
            result="Signups grew",
            metric="25%",
        ),
    )
    validate_rating_evidence(ok, text)
    bad = BulletRating(
        bullet_index=0,
        context=0,
        role_action_clarity=0,
        result=2,
        quotes=_quotes(
            user_need="",
            product_feature="",
            action="",
            result="Signups grew",
            metric="by twenty five percent",
        ),
    )
    with pytest.raises(EvaluatorOutputError):
        validate_rating_evidence(bad, text)


def test_rating_without_quotes_object_rejected():
    """§14.1: a model rating must carry the quotes object."""
    rating = BulletRating(bullet_index=0, context=2, role_action_clarity=2, result=1)
    with pytest.raises(EvaluatorOutputError):
        validate_rating_evidence(rating, "any text")


def test_local_adapter_quotes_are_its_extraction():
    """§14.1: the deterministic adapter's quotes are exactly its extraction
    results (provenance echo — byte-identical outputs)."""
    text = "Users could not finish checkout, so I simplified the checkout form"
    adapter = LocalHeuristicAdapter()
    from src.jobforward.flow.parts import extract_parts

    parts = extract_parts(text)
    response = adapter.evaluate(
        BulletRatingRequest(texts=[text], rubric_version="rubric-3.2.0", parts=[parts])
    )
    rating = response.ratings[0]
    assert rating.quotes is not None
    assert rating.quotes.as_parts() == parts


def test_llm_adapter_requires_quotes_per_rating():
    """§14.1: the LLM contract requires the quotes object on every rating;
    a missing object invalidates the whole response (retry, then refuse)."""

    class FakeEndpointAdapter(LlmHeuristicAdapter):
        def __init__(self, raw: dict) -> None:
            super().__init__(endpoint="http://local")
            self._raw = raw

        def _post_json(self, payload: dict) -> dict:
            return self._raw

    raw = {
        "rubric_version": "rubric-3.2.0",
        "ratings": [
            {
                "bullet_index": 0,
                "context": 2,
                "role_action_clarity": 2,
                "result": 1,
                # no "quotes" key
            }
        ],
        "notes": None,
    }
    adapter = FakeEndpointAdapter(raw)
    with pytest.raises(EvaluatorOutputError):
        adapter.evaluate(BulletRatingRequest(texts=["some bullet"]))


def test_llm_adapter_rejects_incoherent_quotes():
    """§14.2: the LLM adapter enforces the score-quote invariants before
    the response leaves the adapter (invalid → retry, then refuse)."""
    raw = {
        "rubric_version": "rubric-3.2.0",
        "ratings": [
            {
                "bullet_index": 0,
                "context": 2,
                "role_action_clarity": 2,
                "result": 1,
                "quotes": {
                    "user_need": "users needed it faster",
                    "product_feature": "",  # context 2 without the feature quote
                    "action": "I simplified the form",
                    "result": "signups grew",
                    "metric": "",
                },
            }
        ],
        "notes": None,
    }

    class FakeEndpointAdapter(LlmHeuristicAdapter):
        def __init__(self, raw: dict) -> None:
            super().__init__(endpoint="http://local")
            self._raw = raw

        def _post_json(self, payload: dict) -> dict:
            return self._raw

    adapter = FakeEndpointAdapter(raw)
    with pytest.raises(EvaluatorOutputError):
        adapter.evaluate(BulletRatingRequest(texts=["some bullet text"]))


def test_llm_adapter_accepts_coherent_quotes():
    raw = {
        "rubric_version": "rubric-3.2.0",
        "ratings": [
            {
                "bullet_index": 0,
                "context": 2,
                "role_action_clarity": 2,
                "result": 2,
                "quotes": {
                    "user_need": "New visitors abandoned the form",
                    "product_feature": "the form",
                    "action": "I simplified the form",
                    "result": "signups grew by 25%",
                    "metric": "25%",
                },
            }
        ],
        "notes": None,
    }

    class FakeEndpointAdapter(LlmHeuristicAdapter):
        def __init__(self, raw: dict) -> None:
            super().__init__(endpoint="http://local")
            self._raw = raw

        def _post_json(self, payload: dict) -> dict:
            return self._raw

    adapter = FakeEndpointAdapter(raw)
    response = adapter.evaluate(
        BulletRatingRequest(texts=["New visitors abandoned the form, so I simplified the form and signups grew by 25%"])
    )
    assert response.ratings[0].quotes is not None
    assert response.ratings[0].quotes.metric == "25%"
