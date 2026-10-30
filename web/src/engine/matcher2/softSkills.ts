/**
 * Soft-skill matching against the 56-skill taxonomy (matcher v1 step 1-b).
 * Verbatim port of src/jobforward/matcher2/soft_skills.py:
 * - taxonomy fields used verbatim label_en / alt_labels_en / group_code /
 *   group_label / id; a malformed or missing file raises TaxonomyError
 * - Explicit = whole-word, case-insensitive occurrence of label_en or any
 *   alt_labels_en variant
 * - Inferred = only via the curated inference table (versioned with
 *   matcher-rules-1.0.0), matched against section items only — never from
 *   company/industry/title lines
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import {
  MUST_HEADINGS,
  SHOULD_HEADINGS,
  PRIORITY_RANK,
  BULLET_MARKERS,
  isHeadingLike,
  explicitPriority,
} from "./hardSkills";
import { MATCHER_RULES_VERSION } from "./rulesVersion";

export const TAXONOMY_RECORD_COUNT = 56;

const REQUIRED_KEYS = [
  "id",
  "label_en",
  "label_fa",
  "category_code",
  "category_label",
  "group_code",
  "group_label",
  "alt_labels_en",
  "description_en",
  "resume_eligible",
];

export class TaxonomyError extends Error {}

export interface TaxonomyRecord {
  id: string;
  label_en: string;
  label_fa: string;
  category_code: string;
  category_label: string;
  group_code: string;
  group_label: string;
  alt_labels_en: string[];
  description_en: string;
  resume_eligible: boolean | string;
  [key: string]: unknown;
}

let cachedTaxonomy: TaxonomyRecord[] | null = null;

/** Load and validate the 56-skill taxonomy; raise TaxonomyError on any
 * shape problem so the caller can report an extraction failure. */
export function loadTaxonomy(): TaxonomyRecord[] {
  if (cachedTaxonomy) return cachedTaxonomy;
  const filePath = path.join(process.cwd(), "data", "soft-skills-taxonomy.json");
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(filePath, "utf-8"));
  } catch (exc) {
    throw new TaxonomyError(`cannot read taxonomy file: ${String(exc)}`);
  }
  if (typeof data !== "object" || data === null || !Array.isArray((data as { skills?: unknown }).skills)) {
    throw new TaxonomyError("taxonomy file must be an object with a 'skills' list");
  }
  const records = (data as { skills: unknown[] }).skills;
  if (records.length !== TAXONOMY_RECORD_COUNT) {
    throw new TaxonomyError(
      `expected ${TAXONOMY_RECORD_COUNT} skills, found ${records.length}`
    );
  }
  for (const record of records) {
    if (typeof record !== "object" || record === null) {
      throw new TaxonomyError(`taxonomy record misses required keys: ${String(record)}`);
    }
    const keys = Object.keys(record as object);
    for (const required of REQUIRED_KEYS) {
      if (!keys.includes(required)) {
        throw new TaxonomyError(
          `taxonomy record misses required keys: ${JSON.stringify(record)}`
        );
      }
    }
    if (!Array.isArray((record as TaxonomyRecord).alt_labels_en)) {
      throw new TaxonomyError(
        `alt_labels_en must be a list: ${(record as TaxonomyRecord).label_en!}`
      );
    }
  }
  cachedTaxonomy = records as TaxonomyRecord[];
  return cachedTaxonomy;
}

// Curated inference table (plan.md Complexity Tracking; versioned with
// matcher-rules-1.0.0). phrase -> (label_en, fixed one-sentence reason).
export const INFERENCE_TABLE: Array<[string, string, string]> = [
  [
    "manage stakeholders",
    "build networks",
    "Stakeholder management has no direct equivalent and this is the closest option.",
  ],
];

// Skill-ish phrases with no taxonomy equivalent land on the "No taxonomy
// match" line instead of becoming rows (FR-016).
export const UNMATCHED_SKILLISH_PHRASES = [
  "communication skills",
  "leadership skills",
  "interpersonal skills",
  "presentation skills",
  "negotiation skills",
  "organizational skills",
  "problem-solving skills",
  "teamwork skills",
  "soft skills",
];

export interface SoftSkillRow {
  label_en: string;
  group_code: string;
  id: string;
  evidence: string;
  reason: string | null;
  priority: string; // "must" | "should" | "nice"
  certainty: string; // "explicit" | "inferred"
  order: number;
}

export interface UnmatchedConcept {
  text: string;
  note: string;
}

function stripBulletMarker(stripped: string): string {
  for (const marker of BULLET_MARKERS) {
    if (stripped.startsWith(marker)) return stripped.slice(marker.length).trim();
  }
  return stripped;
}

/** [item_text, section] pairs for recognized sections only (FR-015). */
function sectionItems(cleanedText: string): Array<[string, string]> {
  const result: Array<[string, string]> = [];
  let current: string | null = null;
  for (const line of cleanedText.split("\n")) {
    let stripped = line.trim();
    if (!stripped) continue;
    const lowered = stripped.replace(/:+$/, "").trim().toLowerCase();
    if (MUST_HEADINGS.includes(lowered)) {
      current = "must";
      continue;
    }
    if (SHOULD_HEADINGS.includes(lowered)) {
      current = "should";
      continue;
    }
    if (isHeadingLike(stripped)) {
      current = null;
      continue;
    }
    if (current === null) continue;
    stripped = stripBulletMarker(stripped);
    result.push([stripped, current]);
  }
  return result;
}

function phrasePattern(phrase: string): RegExp {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![A-Za-z])${escaped}(?![A-Za-z])`, "i");
}

/** Priority cascade on where the evidence appears (FR-015). */
function priorityOf(evidenceLine: string, section: string): string {
  return explicitPriority(evidenceLine) ?? section;
}

/** First whole-word occurrence of phrase -> [line index, evidence line]. */
function findPhrase(phrase: string, cleanedText: string): [number, string] | null {
  const pattern = phrasePattern(phrase);
  let position = 0;
  for (const line of cleanedText.split("\n")) {
    const match = pattern.exec(line);
    if (match) {
      return [position, stripBulletMarker(line.trim())];
    }
    position += 1;
  }
  return null;
}

export function matchSoftSkills(
  cleanedText: string,
  skills: TaxonomyRecord[]
): [SoftSkillRow[], UnmatchedConcept[]] {
  const sectionItemsList = sectionItems(cleanedText);
  const candidates = new Map<string, SoftSkillRow>();
  const unmatched: UnmatchedConcept[] = [];
  const matchedLabels = new Set<string>();

  let order = 0;
  // Explicit: whole-word match on label_en / alt_labels_en.
  for (const record of skills) {
    let hit = findPhrase(record.label_en, cleanedText);
    if (hit === null) {
      for (const alt of record.alt_labels_en) {
        hit = findPhrase(alt, cleanedText);
        if (hit !== null) break;
      }
    }
    if (hit === null) continue;
    const [lineIndex, evidenceLine] = hit;
    const section = sectionItemsList.find(([text]) => text === evidenceLine)?.[1] ?? null;
    const priority = priorityOf(evidenceLine, section ?? "must");
    candidates.set(record.id, {
      label_en: record.label_en,
      group_code: record.group_code,
      id: record.id,
      evidence: evidenceLine,
      reason: null,
      priority,
      certainty: "explicit",
      order: lineIndex,
    });
    matchedLabels.add(record.label_en.toLowerCase());
    order += 1;
  }

  // Inferred: only via the curated inference table, on section items.
  for (const [text, section] of sectionItemsList) {
    for (const [phrase, label, reason] of INFERENCE_TABLE) {
      if (!phrasePattern(phrase).exec(text)) continue;
      const record = skills.find((r) => r.label_en === label);
      if (!record) continue;
      const existing = candidates.get(record.id);
      const row: SoftSkillRow = {
        label_en: record.label_en,
        group_code: record.group_code,
        id: record.id,
        evidence: text,
        reason,
        priority: priorityOf(text, section),
        certainty: "inferred",
        order,
      };
      order += 1;
      if (existing === undefined) {
        candidates.set(record.id, row);
      } else if (PRIORITY_RANK[row.priority] < PRIORITY_RANK[existing.priority]) {
        candidates.set(record.id, row);
      }
      matchedLabels.add(record.label_en.toLowerCase());
    }
  }

  // Unmatched skill-ish concepts (FR-016): never become rows.
  const seenUnmatched = new Set<string>();
  for (const [text] of sectionItemsList) {
    for (const phrase of UNMATCHED_SKILLISH_PHRASES) {
      if (phrasePattern(phrase).exec(text.toLowerCase())) {
        const concept = text.replace(/[.!?]+$/, "").trim();
        if (!matchedLabels.has(concept.toLowerCase()) && !seenUnmatched.has(concept)) {
          unmatched.push({
            text: concept,
            note: "The taxonomy has no general equivalent for this.",
          });
          seenUnmatched.add(concept);
        }
        break;
      }
    }
  }

  const rows = [...candidates.values()].sort((a, b) => a.order - b.order);
  return [rows, unmatched];
}

export { MATCHER_RULES_VERSION };
