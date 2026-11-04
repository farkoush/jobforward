"""Deterministic five-part extraction (flow/parts.py) — rubric-3.1.0.

Splits a bullet's own words into the framework parts (user_need,
product_feature, action, result, metric) per spec §2/§4 and the plan's
Five-Part Framework Design:

  - every part is a VERBATIM substring of the bullet text or empty —
    extraction never paraphrases, never invents (Principle 1);
  - an undetectable part stays empty (``part_present`` False), never guessed;
  - the marker lists below are part of the versioned heuristic: any change
    that alters extracted output is a rubric change (constitution P4).

rubric-3.1.0 extraction rules (research/intention, specs/001-experience-improvement-flow/few-shot/parser-prompt
Problems 2/4):
  - research/mapping verbs (analyzed, researched, benchmarked, mapped, …)
    are need signals, never action verbs — an all-research bullet leaves the
    action part empty;
  - an infinitive purpose clause ("to uncover friction in …") is the result
    part (a vague result), but only in clauses that are neither the need nor
    an action and carry no metric, so no two parts share words.

Heuristics (clause = text split on , ; and the connectors "so"/"because"):
  metric   = clause containing a number AND a measurement marker
  need     = first clause containing a specific-need marker
  feature  = a feature marker with up to 2 preceding words (window)
  action   = first clause containing an action verb
  result   = text after a result connector inside a clause, else an
             intention clause ("to …") from the marker onward
"""

from __future__ import annotations

import re

from ..models.entities import BulletParts

_CLAUSE_SPLIT = re.compile(r"[,;]|\bso\b|\bbecause\b", re.IGNORECASE)

# --- Need: specific-need signals (people + problem statements) plus the
# problem-discovery verbs (rubric-3.1.0: research/mapping verbs included;
# specs/001-experience-improvement-flow/few-shot/parser-prompt Problem 2) --------------------------------------
_NEED_MARKER = re.compile(
    r"\b(users?|customers?|clients?|employers?|candidates?|job seekers?|"
    r"people|could not|couldn't|can't|cannot|unable to|struggl(?:ed|e|ing)|"
    r"complain(?:ed|ts)?|frustrat(?:ed|ing)|confus(?:ed|ing)|"
    r"too (?:hard|difficult|slow|complex)|hard to|difficult to|no way to|"
    r"had no|"
    r"problems?|issues?|pain point|needed|needs to|wanted|looking for|"
    r"missing|lacked|lack of|dropped off|churn(ed)?|"
    r"analyzed|researched|identified|noticed|found|"
    r"benchmarked|mapped|surveyed|audited|compared|evaluated)\b",
    re.IGNORECASE,
)

# --- Feature: named product surfaces (rubric-3.1.0: "flow" added — the
# parser prompt's Problem 1 lists a flow as a product component) -----------
_FEATURE_MARKER = re.compile(
    r"\b(page|feature|app|application|module|platform|dashboard|workflow|"
    r"tool|website|site|system|component|api|screen|tab|panel|report|"
    r"service|funnel|checkout|onboarding|search|flows?)\b",
    re.IGNORECASE,
)

# --- Action: superset of the Phase-9 verb list (extraction only; scoring
# still uses the checklist's own lists). rubric-3.1.0: the problem-discovery
# verbs (analyzed, researched) moved to the need list — research never fills
# the action part (specs/001-experience-improvement-flow/few-shot/parser-prompt Problem 2). --------------------
_ACTION_VERB = re.compile(
    r"\b(led|built|designed|created|managed|launched|ran|owned|organized|"
    r"coordinated|improved|developed|delivered|wrote|planned|"
    r"tested|prototyped|automated|negotiated|rebuilt|redesigned|"
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

# --- Result (rubric-3.1.0): an infinitive purpose clause ("to uncover …")
# is a vague result; the phrase is taken FROM the marker onward. The
# lookbehinds keep need-marker phrases that end in "to" ("no way to",
# "needed to", …) out of the intention match. A purpose phrase never comes
# from a clause that fills the action or a metric, so no two parts share
# words (specs/001-experience-improvement-flow/few-shot/parser-prompt Problems 2/4). -----------------------------
_INTENTION_MARKER = re.compile(
    r"(?<!\bno way )(?<!\bunable )(?<!\bhard )(?<!\bdifficult )"
    r"(?<!\bneeds )(?<!\bneed )(?<!\bwanted )(?<!\bway )(?<!\bto )"
    r"\bto (uncover|deliver|improve|make|help|enable|ensure|provide|"
    r"support|reduce|increase|allow|show|learn|understand|explore|"
    r"identify|validate|measure|avoid|prevent|solve|address)\b",
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


def _find_need(clauses: list[str]) -> tuple[str, str]:
    """Return (need, intention_tail): a purpose clause inside the need
    clause is carved off — it belongs to the result part (rubric-3.1.0).
    A clause that also fills the action keeps its whole text (rubric-3.0.0
    behavior) so no part is emptied by the carve."""
    for clause in clauses:
        if _NEED_MARKER.search(clause):
            if not _ACTION_VERB.search(clause):
                match = _INTENTION_MARKER.search(clause)
                if match:
                    return clause[: match.start()].strip(), clause[match.start() :].strip()
            return clause, ""
    return "", ""


def _find_action(clauses: list[str]) -> str:
    for clause in clauses:
        if _ACTION_VERB.search(clause):
            return clause
    return ""


def _find_result(clauses: list[str], intention_from_need: str) -> str:
    for clause in clauses:
        match = _RESULT_CONNECTOR.search(clause)
        if match:
            after = clause[match.end():].strip()
            if after:
                return after
            return clause
    # rubric-3.1.0: an intention phrase ("to uncover …") is a vague result —
    # either carved from the need clause, or a standalone intention clause
    # that fills neither the action nor a metric (no shared words).
    if intention_from_need:
        return intention_from_need
    for clause in clauses:
        if _ACTION_VERB.search(clause):
            continue
        if _NUMBER.search(clause) and _MEASURE.search(clause):
            continue
        match = _INTENTION_MARKER.search(clause)
        if match:
            return clause[match.start() :].strip()
    return ""


def _find_feature(text: str, intention_tail: str) -> str:
    """A feature marker with up to 2 preceding words, verbatim substring.
    Markers inside the intention tail ("to uncover … flows") are skipped:
    a phrase inside a purpose clause is the result, not the feature
    (specs/001-experience-improvement-flow/few-shot/parser-prompt Problem 1)."""
    tail_start = text.find(intention_tail) if intention_tail else -1
    for match in _FEATURE_MARKER.finditer(text):
        if tail_start >= 0 and match.start() >= tail_start:
            continue
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
        return re.sub(r"^(and|or)\s+", "", fragment.strip(), flags=re.IGNORECASE)
    return ""


def extract_parts(text: str) -> BulletParts:
    """Extract the five framework parts from one bullet (deterministic)."""
    # Whitespace is normalized first (newlines/tabs collapse to single
    # spaces): a pasted multi-line bullet must extract exactly like the
    # same words on one line (rubric-3.1.0).
    text = " ".join(text.split())
    clauses = _clauses(text)
    need, intention_from_need = _find_need(clauses)
    return BulletParts(
        user_need=need,
        product_feature=_find_feature(text, intention_from_need),
        action=_find_action(clauses),
        result=_find_result(clauses, intention_from_need),
        metric=_find_metric(clauses),
    )
