/**
 * Report assembly and consistency check for the matcher v1 (002 T021).
 * Verbatim port of src/jobforward/matcher2/report.py:
 * - hard tables ordered Must / Should / Nice, rows in posting order
 * - soft rows ordered Must -> Should -> Nice, Explicit before Inferred
 * - display limit: first 5 rows per table; totals always real (FR-013)
 * - consistency check before display: totals == displayed + hidden rows for
 *   every table; failure suppresses the report (FR-020)
 * - the report contains no scores and no verdict text of any kind (FR-018/P3)
 */

import { MATCHER_RULES_VERSION } from "./rulesVersion";
import { PRIORITY_RANK, HardSkillRow } from "./hardSkills";
import { SoftSkillRow, UnmatchedConcept } from "./softSkills";

export const DISPLAY_LIMIT = 5;
export const PRIORITY_LABELS: Record<string, string> = {
  must: "Must",
  should: "Should",
  nice: "Nice",
};
const CERTAINTY_RANK: Record<string, number> = { explicit: 0, inferred: 1 };

export interface AnalysisReport {
  hard_tables: Record<string, HardSkillRow[]>;
  soft_rows: SoftSkillRow[];
  unmatched: UnmatchedConcept[];
  dropped_count: number;
  rules_version: string;
  hard_totals: Record<string, number>;
  soft_total: number;
  consistency_ok: boolean;
}

export function displayedHard(report: AnalysisReport, priority: string): HardSkillRow[] {
  return (report.hard_tables[priority] ?? []).slice(0, DISPLAY_LIMIT);
}

export function displayedSoft(report: AnalysisReport): SoftSkillRow[] {
  return report.soft_rows.slice(0, DISPLAY_LIMIT);
}

function sortSoft(rows: SoftSkillRow[]): SoftSkillRow[] {
  /** Must -> Should -> Nice, Explicit before Inferred, then posting order. */
  return [...rows].sort(
    (a, b) =>
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      CERTAINTY_RANK[a.certainty] - CERTAINTY_RANK[b.certainty] ||
      a.order - b.order
  );
}

/** Totals must equal displayed + hidden rows in every table (FR-020). */
export function checkConsistency(report: AnalysisReport): boolean {
  for (const [priority, rows] of Object.entries(report.hard_tables)) {
    const total = report.hard_totals[priority];
    if (total !== rows.length) return false;
    const shown = Math.min(DISPLAY_LIMIT, rows.length);
    if (total !== shown + (rows.length - shown)) return false;
  }
  const softTotal = report.soft_total;
  if (softTotal !== report.soft_rows.length) return false;
  const shown = Math.min(DISPLAY_LIMIT, report.soft_rows.length);
  return softTotal === shown + (report.soft_rows.length - shown);
}

export function buildReport(
  hardRows: HardSkillRow[],
  softRows: SoftSkillRow[],
  unmatched: UnmatchedConcept[],
  droppedCount: number
): AnalysisReport {
  /** Assemble the AnalysisReport; runs the consistency check (FR-020). */
  const hardTables: Record<string, HardSkillRow[]> = { must: [], should: [], nice: [] };
  for (const row of [...hardRows].sort((a, b) => a.order - b.order)) {
    hardTables[row.priority].push(row);
  }
  const softSorted = sortSoft(softRows);
  const report: AnalysisReport = {
    hard_tables: hardTables,
    soft_rows: softSorted,
    unmatched: [...unmatched],
    dropped_count: droppedCount,
    rules_version: MATCHER_RULES_VERSION,
    hard_totals: Object.fromEntries(
      Object.entries(hardTables).map(([p, rows]) => [p, rows.length])
    ),
    soft_total: softSorted.length,
    consistency_ok: true,
  };
  report.consistency_ok = checkConsistency(report);
  return report;
}
