/**
 * Pure display-state helpers for the web's five-part analysis UI
 * (Phase 15, spec §5.2/§6.2) — WEB-ONLY presentation logic; there is NO
 * Python twin because nothing here is analysis (research D24): partStates
 * mirrors the engine's PartDisplayState rule (empty = missing ALWAYS,
 * vague requires non-empty words), and questionOrder is the focused-loop
 * order (missing parts first, then vague parts, each in
 * Need→Feature→Action→Result order, the Metric LAST — spec §6.2).
 */

export type PartDisplayStatus = "complete" | "vague" | "missing";

export interface DisplayRow {
  key: string;
  words: string;
  vague: boolean;
}

const PART_ORDER = [
  "user_need",
  "product_feature",
  "action",
  "result",
  "metric",
] as const;

/** Per-part status: missing = empty words ALWAYS; vague = non-empty words
 * plus the vague flag; complete otherwise (§5.2 states; data-model
 * PartDisplayState). */
export function partStates(
  rows: DisplayRow[]
): Record<string, PartDisplayStatus> {
  const out: Record<string, PartDisplayStatus> = {};
  for (const r of rows) {
    out[r.key] = !r.words.trim()
      ? "missing"
      : r.vague
        ? "vague"
        : "complete";
  }
  return out;
}

/** Focused-loop question order (§6.2): missing parts first, then vague
 * parts, each group in the fixed Need→Feature→Action→Result order, the
 * Metric LAST (it is never inside the two groups). A complete part is out;
 * a complete bullet yields []. */
export function questionOrder(rows: DisplayRow[]): string[] {
  const states = partStates(rows);
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const missing: string[] = [];
  const vague: string[] = [];
  let metric: string | null = null;
  for (const key of PART_ORDER) {
    const r = byKey.get(key);
    if (!r) continue;
    if (key === "metric") {
      if (states[key] !== "complete") metric = key;
      continue;
    }
    if (states[key] === "missing") missing.push(key);
    else if (states[key] === "vague") vague.push(key);
  }
  return [...missing, ...vague, ...(metric ? [metric] : [])];
}
