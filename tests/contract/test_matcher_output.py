"""Contract tests for the matcher output (contracts matcher-output section).

FR-021/FR-022 + VR-9: valid requirements + actions accepted; illegal
skill_type / priority / action values (including "remove"/"shorten") →
invalid; missing action for an entry; empty reason → invalid; invalid →
rejected, one retry, then reported with data intact.
"""

from __future__ import annotations

import pytest

from src.jobforward.matcher.analyzer import (
    MatcherOutputError,
    PostingAnalysis,
    validate_analysis,
)
from src.jobforward.models.entities import (
    JobRequirement,
    MatchAction,
    MatchActionType,
    MatchPriority,
    SkillType,
)


def _valid_analysis() -> PostingAnalysis:
    return PostingAnalysis(
        rubric_version="rubric-2.0.0",
        requirements=[
            JobRequirement(id=0, text="3+ years of SQL experience",
                           skill_type=SkillType.HARD, priority=MatchPriority.REQUIRED),
            JobRequirement(id=1, text="clear written communication",
                           skill_type=SkillType.SOFT, priority=MatchPriority.PREFERRED),
        ],
        notes=None,
    )


def test_valid_analysis_accepted():
    validate_analysis(_valid_analysis())


def test_wrong_rubric_version_rejected():
    analysis = _valid_analysis()
    analysis.rubric_version = "rubric-1.0.0"
    with pytest.raises(MatcherOutputError):
        validate_analysis(analysis)


def test_illegal_skill_type_rejected():
    analysis = _valid_analysis()
    analysis.requirements[0].skill_type = "managerial"  # type: ignore[arg-type]
    with pytest.raises(MatcherOutputError):
        validate_analysis(analysis)


def test_illegal_priority_rejected():
    analysis = _valid_analysis()
    analysis.requirements[0].priority = "must-have"  # type: ignore[arg-type]
    with pytest.raises(MatcherOutputError):
        validate_analysis(analysis)


def test_duplicate_requirement_ids_rejected():
    analysis = _valid_analysis()
    analysis.requirements[1].id = 0
    with pytest.raises(MatcherOutputError):
        validate_analysis(analysis)


def test_red_line_must_be_required():
    """A red-line requirement classified as preferred/bonus is invalid."""
    analysis = _valid_analysis()
    analysis.requirements[0].text = "MUST HAVE: 3+ years of SQL"
    analysis.requirements[0].priority = MatchPriority.PREFERRED
    with pytest.raises(MatcherOutputError):
        validate_analysis(analysis)


def test_match_action_enum_has_no_remove_or_shorten():
    """The actions Remove and Shorten do not exist (FR-022)."""
    legal = {a.value for a in MatchActionType}
    assert legal == {"highlight", "no_change", "not_relevant"}
    with pytest.raises(ValueError):
        MatchActionType("remove")
    with pytest.raises(ValueError):
        MatchActionType("shorten")


def test_action_with_empty_reason_is_invalid_data_state():
    """A persisted action without a reason fails the document invariant
    (VR-9, enforced by storage.schema.check_match_action)."""
    from src.jobforward.models.entities import ExperienceEntry, ExperienceEntryType
    from src.jobforward.storage.schema import check_match_action
    from src.jobforward.storage.repository import DEFAULT_RUBRIC_VERSION

    entry = ExperienceEntry(id=1, type=ExperienceEntryType.JOB, title="T")
    entry.match_action = MatchAction(
        entry_id=1,
        action=MatchActionType.HIGHLIGHT,
        reason="   ",
        requirement_id=0,
        rubric_version=DEFAULT_RUBRIC_VERSION,
        analyzed_at="2026-10-25T10:00:00+00:00",
    )
    assert check_match_action(entry) is not None
