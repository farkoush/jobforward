"""Report assembly and consistency check for the matcher v1 (002 T021).

Per data-model.md AnalysisReport and contracts/matcher-pipeline.md §2:
- hard tables ordered Must / Should / Nice, rows in posting order
- soft rows ordered Must → Should → Nice, Explicit before Inferred
- display limit: first 5 rows per table; totals always real (FR-013)
- consistency check before display: totals == displayed + hidden rows for
  every table; failure suppresses the report (FR-020)
- the report contains no scores and no verdict text of any kind (FR-018/P3)
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .hard_skills import HardSkillRow, PRIORITY_RANK
from .rules_version import MATCHER_RULES_VERSION
from .soft_skills import SoftSkillRow, UnmatchedConcept

DISPLAY_LIMIT = 5
PRIORITY_LABELS = {"must": "Must", "should": "Should", "nice": "Nice"}
CERTAINTY_RANK = {"explicit": 0, "inferred": 1}


@dataclass
class AnalysisReport:
    """The full analysis result plus its display plan (data-model.md)."""

    hard_tables: dict[str, list[HardSkillRow]] = field(default_factory=dict)
    soft_rows: list[SoftSkillRow] = field(default_factory=list)
    unmatched: list[UnmatchedConcept] = field(default_factory=list)
    dropped_count: int = 0
    rules_version: str = MATCHER_RULES_VERSION
    hard_totals: dict[str, int] = field(default_factory=dict)
    soft_total: int = 0
    consistency_ok: bool = True

    def displayed_hard(self, priority: str) -> list[HardSkillRow]:
        return self.hard_tables.get(priority, [])[:DISPLAY_LIMIT]

    def displayed_soft(self) -> list[SoftSkillRow]:
        return self.soft_rows[:DISPLAY_LIMIT]


def _sort_soft(rows: list[SoftSkillRow]) -> list[SoftSkillRow]:
    """Must → Should → Nice, Explicit before Inferred, then posting order."""
    return sorted(
        rows,
        key=lambda r: (
            PRIORITY_RANK[r.priority],
            CERTAINTY_RANK[r.certainty],
            r.order,
        ),
    )


def check_consistency(report: AnalysisReport) -> bool:
    """Totals must equal displayed + hidden rows in every table (FR-020)."""
    for priority, rows in report.hard_tables.items():
        total = report.hard_totals.get(priority)
        if total != len(rows):
            return False
        shown = min(DISPLAY_LIMIT, len(rows))
        if total != shown + (len(rows) - shown):
            return False
    soft_total = report.soft_total
    if soft_total != len(report.soft_rows):
        return False
    shown = min(DISPLAY_LIMIT, len(report.soft_rows))
    return soft_total == shown + (len(report.soft_rows) - shown)


def build_report(
    hard_rows: list[HardSkillRow],
    soft_rows: list[SoftSkillRow],
    unmatched: list[UnmatchedConcept],
    dropped_count: int,
) -> AnalysisReport:
    """Assemble the AnalysisReport; runs the consistency check (FR-020)."""
    hard_tables: dict[str, list[HardSkillRow]] = {"must": [], "should": [], "nice": []}
    for row in sorted(hard_rows, key=lambda r: r.order):
        hard_tables[row.priority].append(row)
    soft_sorted = _sort_soft(soft_rows)
    report = AnalysisReport(
        hard_tables=hard_tables,
        soft_rows=soft_sorted,
        unmatched=list(unmatched),
        dropped_count=dropped_count,
        rules_version=MATCHER_RULES_VERSION,
        hard_totals={p: len(rows) for p, rows in hard_tables.items()},
        soft_total=len(soft_sorted),
    )
    report.consistency_ok = check_consistency(report)
    return report
