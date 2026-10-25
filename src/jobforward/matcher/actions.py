"""Matcher stage 2: per-entry actions (matcher/actions.py).

FR-022 + constitution P6: exactly ONE action per entry — Highlight / No
change / Not relevant to this job — each with a one-line B1-English reason
citing the referenced requirement's skill type + priority. The actions
"Remove" and "Shorten" do not exist anywhere; the tool never recommends
removing an entry; output has zero effect on any score.
"""

from __future__ import annotations

import re

from ..models.entities import (
    ExperienceEntry,
    JobRequirement,
    MatchAction,
    MatchActionType,
    MatchPriority,
    SkillType,
)
from .analyzer import PostingAnalysis
from ..storage.repository import DEFAULT_RUBRIC_VERSION

_PRIORITY_LABEL = {
    MatchPriority.REQUIRED: "required",
    MatchPriority.PREFERRED: "preferred",
    MatchPriority.BONUS: "bonus",
}
_TYPE_LABEL = {SkillType.HARD: "hard skill", SkillType.SOFT: "soft skill"}


def _stem(token: str) -> str:
    """Light suffix stripping so 'dashboards'/'dashboarding' meet on
    'dashboard' (rubric-2.0.0 matcher rules; a change here is a rubric
    change)."""
    for suffix in ("ing", "ies", "ied", "ed", "es", "s"):
        if len(token) > len(suffix) + 2 and token.endswith(suffix):
            return token[: -len(suffix)]
    return token


def _tokens(text: str) -> set[str]:
    return {
        _stem(tok)
        for tok in re.findall(r"[a-z0-9]+", text.lower())
        if len(tok) >= 2
    }


def _requirement_tokens(req: JobRequirement) -> set[str]:
    return _tokens(req.text)


def _entry_tokens(entry: ExperienceEntry) -> set[str]:
    words: set[str] = _tokens(entry.title)
    for bullet in entry.bullets:
        words |= _tokens(bullet.text)
    return words


def _best_requirement(
    analysis: PostingAnalysis, entry: ExperienceEntry
) -> tuple[JobRequirement | None, float]:
    """The requirement with the highest word overlap with the entry, plus
    its overlap fraction."""
    entry_words = _entry_tokens(entry)
    best: JobRequirement | None = None
    best_score = 0.0
    for req in analysis.requirements:
        req_words = _requirement_tokens(req)
        # Meaning words only: drop pure priority/skill-type markers so the
        # match reflects the skill itself.
        meaningful = {
            w
            for w in req_words
            if w
            not in {
                "required", "must", "minimum", "preferred", "should", "have",
                "bonus", "nice", "to", "plus", "at", "least", "hard", "soft",
                "skill", "skills", "years", "experience", "strong", "clear",
                "good", "great", "background", "year",
            }
        }
        if not meaningful:
            continue
        overlap = len(meaningful & entry_words) / len(meaningful)
        if overlap > best_score:
            best, best_score = req, overlap
    return best, best_score


def assign_action(
    analysis: PostingAnalysis,
    entry: ExperienceEntry,
    strong_threshold: float = 0.5,
    partial_threshold: float = 0.15,
) -> MatchAction:
    """Exactly one action for the entry (highlight / no_change /
    not_relevant) with a reason citing the skill's type + priority."""
    req, score = _best_requirement(analysis, entry)

    if req is None or score < partial_threshold:
        reason = (
            "No connection to the skills extracted from this job description."
        )
        return _action(entry, MatchActionType.NOT_RELEVANT, reason, 0)

    kind = _TYPE_LABEL[req.skill_type]
    prio = _PRIORITY_LABEL[req.priority]
    if score >= strong_threshold:
        reason = f"Matches {prio} {kind}: {req.text}"
        action = MatchActionType.HIGHLIGHT
    else:
        reason = (
            f"Only partly related to a {prio} {kind} ({req.text}); "
            f"it is fine as it is."
        )
        action = MatchActionType.NO_CHANGE
    return _action(entry, action, reason, req.id)


def _action(
    entry: ExperienceEntry,
    action: MatchActionType,
    reason: str,
    requirement_id: int,
) -> MatchAction:
    from ..models.entities import now_iso8601

    return MatchAction(
        entry_id=entry.id,
        action=action,
        reason=reason,
        requirement_id=requirement_id,
        rubric_version=DEFAULT_RUBRIC_VERSION,
        analyzed_at=now_iso8601(),
    )


def assign_actions(
    analysis: PostingAnalysis,
    entries: list[ExperienceEntry],
) -> list[MatchAction]:
    """Exactly one action per non-deleted entry; no entry omitted."""
    return [
        assign_action(analysis, entry)
        for entry in entries
        if not entry.deleted
    ]
