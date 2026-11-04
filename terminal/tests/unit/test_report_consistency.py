"""Unit tests for report consistency (002 T019; FR-020, FR-013).

Totals must equal displayed + hidden rows for every table; a deliberately
inconsistent report must fail the check so the CLI can suppress the report;
dropped rows flow into the MATCH_DROPPED message.
"""

from __future__ import annotations

import src.jobforward.messages as m
from src.jobforward.matcher2.hard_skills import HardSkillRow
from src.jobforward.matcher2.report import (
    AnalysisReport,
    build_report,
    check_consistency,
)
from src.jobforward.matcher2.soft_skills import SoftSkillRow


def _hard_row(name="SQL", priority="must", order=0) -> HardSkillRow:
    return HardSkillRow(
        name=name,
        type="hard",
        priority=priority,
        default_priority=True,
        evidence=f"{name} in the text",
        order=order,
    )


def _soft_row(label="work in teams", priority="must", order=0) -> SoftSkillRow:
    return SoftSkillRow(
        label_en=label,
        group_code="T4.3",
        id="http://example/esco/" + label.replace(" ", "-"),
        evidence=f"{label} mentioned",
        reason=None,
        priority=priority,
        certainty="explicit",
        order=order,
    )


def test_totals_equal_displayed_plus_hidden_for_every_table():
    hard = [_hard_row(f"skill {i}", order=i) for i in range(8)]  # 8 > 5 shown
    soft = [_soft_row(f"soft {i}", order=i) for i in range(3)]
    report = build_report(hard, soft, [], dropped_count=2)
    assert report.hard_totals == {"must": 8, "should": 0, "nice": 0}
    assert report.soft_total == 3
    assert report.consistency_ok is True
    assert len(report.displayed_hard("must")) == 5  # hidden: 3
    assert len(report.displayed_soft()) == 3


def test_empty_groups_are_present_with_zero_totals():
    report = build_report([_hard_row()], [], [], dropped_count=0)
    assert report.hard_tables["should"] == []
    assert report.hard_totals["should"] == 0
    assert report.soft_rows == []
    assert report.soft_total == 0


def test_deliberately_inconsistent_report_fails_the_check():
    report = build_report([_hard_row()], [], [], 0)
    report.hard_totals["must"] = 5  # tampered: 1 real row
    assert check_consistency(report) is False


def test_inconsistent_soft_total_fails_the_check():
    report = build_report([], [_soft_row()], [], 0)
    report.soft_total = 3
    assert check_consistency(report) is False


def test_dropped_count_flows_into_the_message():
    report = build_report([_hard_row()], [], [], dropped_count=4)
    text = m.MATCH_DROPPED.format(count=report.dropped_count)
    assert "4" in text
    assert report.dropped_count == 4


def test_soft_rows_ordered_priority_then_certainty():
    rows = [
        _soft_row("should explicit", priority="should", order=0),
        _soft_row("must inferred", priority="must", order=1),
        _soft_row("must explicit", priority="must", order=2),
    ]
    rows[1].certainty = "inferred"
    report = build_report([], rows, [], 0)
    labels = [r.label_en for r in report.soft_rows]
    assert labels == ["must explicit", "must inferred", "should explicit"]


def test_hard_rows_within_a_table_follow_posting_order():
    hard = [
        _hard_row("second", order=1),
        _hard_row("first", order=0),
        _hard_row("third", order=2),
    ]
    report = build_report(hard, [], [], 0)
    names = [r.name for r in report.hard_tables["must"]]
    assert names == ["first", "second", "third"]
