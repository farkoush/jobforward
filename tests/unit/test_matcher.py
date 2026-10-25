"""Unit tests for the local matcher (matcher/adapters/local.py + actions.py).

FR-021/FR-022: classification (hard/soft; required/preferred/bonus;
red-line → required), exactly one action per entry, no Remove/Shorten, and
zero effect on any score.
"""

from __future__ import annotations

from src.jobforward.matcher.adapters.local import LocalRuleAdapter
from src.jobforward.matcher.actions import assign_actions
from src.jobforward.models.entities import (
    Bullet,
    ExperienceEntry,
    ExperienceEntryType,
    MatchActionType,
    MatchPriority,
    SkillType,
)

POSTING = """Product Manager - Growth
Requirements:
- Must have 3 years of SQL and dashboarding experience
- Strong stakeholder communication skills
- Nice to have: A/B testing background
"""

SQL_ENTRY_TITLE = "Analytics intern"


def _entry(title: str, bullet: str) -> ExperienceEntry:
    return ExperienceEntry(
        id=1,
        type=ExperienceEntryType.JOB,
        title=title,
        bullets=[Bullet(id=1, text=bullet)],
    )


def test_classification_hard_soft_priority():
    analysis = LocalRuleAdapter().analyze(POSTING)
    by_text = {r.text: r for r in analysis.requirements}

    sql = by_text["Must have 3 years of SQL and dashboarding experience"]
    assert sql.skill_type == SkillType.HARD
    assert sql.priority == MatchPriority.REQUIRED  # red-line → required

    soft = by_text["Strong stakeholder communication skills"]
    assert soft.skill_type == SkillType.SOFT

    ab = by_text["Nice to have: A/B testing background"]
    assert ab.skill_type == SkillType.HARD
    assert ab.priority == MatchPriority.BONUS


def test_exactly_one_action_per_entry():
    analysis = LocalRuleAdapter().analyze(POSTING)
    entries = [
        _entry(SQL_ENTRY_TITLE,
               "Built SQL dashboards for the analytics team"),
        _entry("Course: watercolor painting",
               "Painted 20 watercolor pieces for a local exhibition"),
    ]
    actions = assign_actions(analysis, entries)
    assert len(actions) == 2
    assert {a.entry_id for a in actions} == {e.id for e in entries}
    assert all(a.action in set(MatchActionType) for a in actions)


def test_highlight_reason_cites_type_and_priority():
    analysis = LocalRuleAdapter().analyze(POSTING)
    entry = _entry(SQL_ENTRY_TITLE,
                   "Built SQL dashboards for the analytics team")
    (action,) = assign_actions(analysis, [entry])
    assert action.action == MatchActionType.HIGHLIGHT
    assert "required" in action.reason
    assert "hard skill" in action.reason


def test_unrelated_entry_is_not_relevant_with_reason():
    analysis = LocalRuleAdapter().analyze(POSTING)
    entry = _entry("Course: watercolor painting",
                   "Painted 20 watercolor pieces for a local exhibition")
    (action,) = assign_actions(analysis, [entry])
    assert action.action == MatchActionType.NOT_RELEVANT
    assert action.reason.strip()


def test_no_remove_or_shorten_ever_assigned():
    analysis = LocalRuleAdapter().analyze(POSTING)
    entries = [_entry(SQL_ENTRY_TITLE, "Built SQL dashboards"),
               _entry("Watercolor", "Painted 20 pieces"),
               _entry("Side work", "Sold prints at a market")]
    actions = assign_actions(analysis, entries)
    assert all(
        a.action in (MatchActionType.HIGHLIGHT,
                     MatchActionType.NO_CHANGE,
                     MatchActionType.NOT_RELEVANT)
        for a in actions
    )


def test_matcher_output_changes_no_score():
    """Matcher output has zero effect on any clarity score (P3/P6)."""
    analysis = LocalRuleAdapter().analyze(POSTING)
    entry = _entry(SQL_ENTRY_TITLE, "Built SQL dashboards for the analytics team")
    entry.bullets[0].ratings = __import__(
        "src.jobforward.models.entities", fromlist=["Ratings"]
    ).Ratings(context=2, role_action_clarity=2, result=1)
    entry.bullets[0].rubric_version = "rubric-2.0.0"
    entry.entry_score = 250 / 3
    before = (entry.entry_score, entry.bullets[0].ratings)
    assign_actions(analysis, [entry])
    assert (entry.entry_score, entry.bullets[0].ratings) == before
    # Text is never modified either.
    assert entry.bullets[0].text == "Built SQL dashboards for the analytics team"
