"""Deterministic five-part extraction (flow/parts.py) — rubric-3.0.0.

Splits a bullet's own words into the framework parts (user_need,
product_feature, action, result, metric) per spec §2/§4 and the plan's
Five-Part Framework Design:

  - every part is a VERBATIM substring of the bullet text or empty —
    extraction never paraphrases, never invents (Principle 1);
  - an undetectable part stays empty (``part_present`` False), never guessed;
  - the marker lists below are part of the versioned heuristic: any change
    that alters extracted output is a rubric change (constitution P4).

Heuristics (clause = text split on , ; and the connectors "so"/"because"):
  metric   = clause containing a number AND a measurement marker
  need     = first clause containing a specific-need marker
  feature  = a feature marker with up to 2 preceding words (window)
  action   = first clause containing an action verb
  result   = text after a result connector inside a clause
"""

from __future__ import annotations

import re

from ..models.entities import BulletParts

_CLAUSE_SPLIT = re.compile(r"[,;]|\bso\b|\bbecause\b", re.IGNORECASE)

# --- Need: specific-need signals (people + problem statements) ------------
_NEED_MARKER = re.compile(
    r"\b(users?|customers?|clients?|employers?|candidates?|job seekers?|"
    r"people|could not|couldn't|can't|cannot|unable to|struggl(?:ed|e|ing)|"
    r"complain(?:ed|ts)?|frustrat(?:ed|ing)|confus(?:ed|ing)|"
    r"too (?:hard|difficult|slow|complex)|hard to|difficult to|no way to|"
    r"problems?|issues?|pain point|needed|needs to|wanted|looking for|"
    r"missing|lacked|lack of|dropped off|churn(ed)?)\b",
    re.IGNORECASE,
)

# --- Feature: named product surfaces --------------------------------------
_FEATURE_MARKER = re.compile(
    r"\b(page|feature|app|application|module|platform|dashboard|workflow|"
    r"tool|website|site|system|component|api|screen|tab|panel|report|"
    r"service|funnel|checkout|onboarding|search)\b",
    re.IGNORECASE,
)

# --- Action: superset of the Phase-9 verb list (extraction only; scoring
# still uses the checklist's own lists) -------------------------------------
_ACTION_VERB = re.compile(
    r"\b(led|built|designed|created|managed|launched|ran|owned|organized|"
    r"coordinated|analyzed|improved|developed|delivered|wrote|planned|"
    r"tested|researched|prototyped|automated|negotiated|rebuilt|redesigned|"
    r"implemented|introduced|shipped|migrated|established|spearheaded)\b",
    re.IGNORECASE,
)

# --- Metric: a number together with a measurement word ---------------------
_NUMBER = re.compile(r"\d+(?:[.,]\d+)?%?|\b\d+\+")
_MEASURE = re.compile(
    r"(%|percent|grew|growth|increased|increase|reduced|reduction|decreased|"
    r"dropped|drop|doubled|tripled|halved|conversion|retention|activation|"
    r"adoption|revenue|visits|sessions|signups|sign-ups|churn|clicks|"
    r"downloads|x faster|from \d+ to \d+)",
    re.IGNORECASE,
)

# --- Result: outcome connectors; the outcome is the text AFTER them --------
_RESULT_CONNECTOR = re.compile(
    r"(which resulted in|resulted in|resulting in|as a result,?|so that|"
    r"which led to|led to|leading to|enabling|enabled|which increased|"
    r"which reduced|which improved|came back|returned to|adopted by|"
    r"used by|went up|went down)",
    re.IGNORECASE,
)

# Feature window: up to this many words before the marker are included.
_FEATURE_WINDOW_WORDS = 2


def _clauses(text: str) -> list[str]:
    return [clause.strip() for clause in _CLAUSE_SPLIT.split(text) if clause.strip()]


def _find_metric(clauses: list[str]) -> str:
    for clause in clauses:
        if _NUMBER.search(clause) and _MEASURE.search(clause):
            return clause
    return ""


def _find_need(clauses: list[str]) -> str:
    for clause in clauses:
        if _NEED_MARKER.search(clause):
            return clause
    return ""


def _find_action(clauses: list[str]) -> str:
    for clause in clauses:
        if _ACTION_VERB.search(clause):
            return clause
    return ""


def _find_result(clauses: list[str]) -> str:
    for clause in clauses:
        match = _RESULT_CONNECTOR.search(clause)
        if match:
            after = clause[match.end():].strip()
            if after:
                return after
            return clause
    return ""


def _find_feature(text: str, clauses: list[str]) -> str:
    """A feature marker with up to 2 preceding words, verbatim substring."""
    match = _FEATURE_MARKER.search(text)
    if not match:
        return ""
    before = text[: match.start()].rstrip()
    if not before:
        return text[match.start() : match.end()].strip()
    words = before.split(" ")
    window_words = words[-_FEATURE_WINDOW_WORDS:]
    # A leading action verb or pronoun in the window is the sentence's
    # action, not part of the feature name ("Built a dashboard" ->
    # "a dashboard").
    while window_words and (
        _ACTION_VERB.fullmatch(window_words[0])
        or window_words[0].lower() in ("i", "we", "my", "our")
    ):
        window_words = window_words[1:]
    fragment = " ".join([*window_words, text[match.start() : match.end()]])
    return fragment.strip()


def extract_parts(text: str) -> BulletParts:
    """Extract the five framework parts from one bullet (deterministic)."""
    clauses = _clauses(text)
    return BulletParts(
        user_need=_find_need(clauses),
        product_feature=_find_feature(text, clauses),
        action=_find_action(clauses),
        result=_find_result(clauses),
        metric=_find_metric(clauses),
    )
