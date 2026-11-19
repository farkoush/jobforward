/**
 * SOFT_TAXONOMY for matcher v3 (spec 002 v3): the EXISTING 56-skill ESCO
 * file (web/data/soft-skills-taxonomy.json — public data, no keys,
 * P14-safe) imported DIRECTLY (build-bundled — the FIX-1 philosophy; no
 * runtime path can go missing).
 *
 * v3 changes (Task 2, owner rulings 2026-11-16):
 * - The R2 soft/trait typing is ARCHIVED/REMOVED (S9): no `type` field.
 * - alt_labels_en are exposed for the prompt table (R15: recognize by
 *   name OR any alt label; always record the canonical label_en).
 * - matchSoftName implements the V5 ambiguous-name precedence (plan
 *   condition ب): exact label_en wins → single alt adopts → multi-alt is
 *   AMBIGUOUS (candidates reported) → no match.
 *
 * The ESCO `id` and `description_en` are never sent to the model and
 * never displayed (v1 rule carried over).
 */

import rawTaxonomy from "../../../../data/soft-skills-taxonomy.json";

export interface SoftTaxonomyEntry {
  label_en: string;
  alt_labels_en: string[];
  group_code: string;
}

export const TAXONOMY_RECORD_COUNT = 56;

interface RawRecord {
  label_en?: unknown;
  group_code?: unknown;
  alt_labels_en?: unknown;
}

const raw = rawTaxonomy as { skills?: RawRecord[] };
const records = Array.isArray(raw.skills) ? raw.skills : [];
if (records.length !== TAXONOMY_RECORD_COUNT) {
  // Fail fast at module load: a broken taxonomy must never reach the
  // prompt builder or the validator (mirrors v1's TaxonomyError gate).
  throw new Error(
    `soft-skills taxonomy: expected ${TAXONOMY_RECORD_COUNT} skills, found ${records.length}`
  );
}

export const SOFT_TAXONOMY: SoftTaxonomyEntry[] = records.map((r) => {
  const labelEn = String(r.label_en ?? "");
  const groupCode = String(r.group_code ?? "");
  const altLabels = Array.isArray(r.alt_labels_en)
    ? (r.alt_labels_en as unknown[]).map((a) => String(a))
    : [];
  if (!labelEn || !groupCode) {
    throw new Error(`soft-skills taxonomy: record missing keys: ${JSON.stringify(r)}`);
  }
  return { label_en: labelEn, alt_labels_en: altLabels, group_code: groupCode };
});

/** One line per skill for the prompt table (R15): recognize by name OR
 *  any alt label; always record the canonical name (first column). */
export function taxonomyTableLines(): string[] {
  return SOFT_TAXONOMY.map(
    (s) => `${s.label_en} | ${s.alt_labels_en.join(", ")} | ${s.group_code}`
  );
}

/** V5 matching precedence (data-model v3 rule 5, plan condition ب):
 *  1. exact case-insensitive label_en match wins over everything;
 *  2. an alt-label match to EXACTLY ONE record adopts that record;
 *  3. an alt-label match to MULTIPLE records is AMBIGUOUS (candidates
 *     reported — the model must use one candidate's exact label_en or
 *     record the skill with in_taxonomy:false + ad_wording);
 *  4. no match → "none". */
export type SoftNameMatch =
  | { kind: "exact"; entry: SoftTaxonomyEntry }
  | { kind: "single"; entry: SoftTaxonomyEntry }
  | { kind: "ambiguous"; candidates: string[] }
  | { kind: "none" };

export function matchSoftName(name: string): SoftNameMatch {
  const needle = name.trim().toLowerCase();
  if (!needle) return { kind: "none" };

  const exact = SOFT_TAXONOMY.find((s) => s.label_en.toLowerCase() === needle);
  if (exact) return { kind: "exact", entry: exact };

  const byAlt = SOFT_TAXONOMY.filter((s) =>
    s.alt_labels_en.some((a) => a.toLowerCase() === needle)
  );
  if (byAlt.length === 1) return { kind: "single", entry: byAlt[0] };
  if (byAlt.length > 1) {
    return {
      kind: "ambiguous",
      candidates: byAlt.map((s) => s.label_en).sort(),
    };
  }
  return { kind: "none" };
}
