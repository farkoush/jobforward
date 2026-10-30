/**
 * Hard-skill extraction, step 1-a of the matcher v1 (002 T013).
 * Verbatim port of src/jobforward/matcher2/hard_skills.py — deterministic,
 * rules-versioned (matcher-rules-1.0.0):
 * - section detection: recognized headings set the section priority
 *   (Responsibilities / Requirements / Required Tools -> must; Preferred
 *   Qualifications -> should); any heading-looking line ends the section
 * - item extraction: bullet markers are stripped; when the posting has no
 *   recognized heading, non-empty non-heading lines are items
 * - priority cascade: explicit word on the item > section heading > must
 *   "(default)" (FR-010; an explicit word always overrides the section)
 * - alternative tools ("A, B, or C") merge into one row typed hard_tool
 * - same normalized skill merges into one row with the highest priority
 * - evidence: first <= 12 words of the item, verified verbatim in the
 *   cleaned text; a row without verbatim evidence (or empty name) is
 *   dropped and counted (FR-012)
 */

import { MATCHER_RULES_VERSION } from "./rulesVersion";
import { pySplit } from "./posting";

// --- Fixed vocabulary (spec FR-010; NEVER reorder the cascade) ---
export const MUST_HEADINGS = ["responsibilities", "requirements", "required tools"];
export const SHOULD_HEADINGS = ["preferred qualifications"];
export const MUST_WORDS = ["must", "required", "mandatory", "essential", "at least", "minimum"];
export const SHOULD_WORDS = ["preferred", "desirable", "ideally"];
export const NICE_WORDS = ["plus", "nice to have", "bonus", "advantage"];

export const PRIORITY_RANK: Record<string, number> = { must: 0, should: 1, nice: 2 };

export const BULLET_MARKERS = ["- ", "• ", "* ", "· "];
export const EVIDENCE_MAX_WORDS = 12;

// Boilerplate reduced from item text to form the skill name (rules-versioned).
const BOILERPLATE_PREFIXES = [
  /(?:(?:at\s+least|minimum(?:\s+of)?)\s+)?\d+\+?\s*(?:years?|months?)\s+of\s+(?:experience|work)(?:\s+(?:in|with|on|for))?\s*/i,
  /(?:proven|strong|solid|good|hands-on|relevant|previous)\s+/i,
  /(?:experience|expertise)\s+(?:of|with|in|working\s+(?:in|on|with))\b\s*/i,
  /familiarity\s+with\b\s*/i,
  /(?:strong\s+)?knowledge\s+of\b\s*/i,
  /ability\s+to\b\s*/i,
  /nice\s+to\s+have[:\s]+/i,
];
const TRAILING_PRIORITY_PHRASE =
  /\s*(?:is|would\s+be)?\s*(?:a|an)?\s*(?:plus|bonus|advantage|nice\s+to\s+have)\s*[.!]?\s*$/i;
const ONE_OF_SPLIT = /,?\s+or\s+/i;

export interface HardSkillRow {
  name: string;
  type: string; // "hard" | "hard_tool"
  priority: string; // "must" | "should" | "nice"
  default_priority: boolean;
  evidence: string;
  order: number;
  is_one_of: boolean;
  alternatives: string[] | null;
}

interface Item {
  text: string;
  order: number;
  section: string | null; // "must" | "should" | null when outside a section
}

function headingOf(line: string): string | null {
  const stripped = line.trim().replace(/:+$/, "").trim().toLowerCase();
  if (MUST_HEADINGS.includes(stripped)) return "must";
  if (SHOULD_HEADINGS.includes(stripped)) return "should";
  return null;
}

// Python: r"^[^:]{1,40}:\s" — matches the FIRST 1..40 non-colon chars, then
// ": ". In JS, `^[^:]{1,40}:\s` with a greedy {1,40} matches from the start;
// Python's regex engine also tries leftmost-longest in that char class the
// same way, so a plain anchored test is equivalent for membership purposes.
const LABEL_LINE = /^[^:]{1,40}:\s/;

export function isHeadingLike(line: string): boolean {
  const text = line.trim();
  if (!text || BULLET_MARKERS.some((m) => text.startsWith(m))) return false;
  if (text.endsWith(":") && pySplit(text).length <= 6) return true;
  return (
    LABEL_LINE.test(text) && pySplit(text.split(":")[0]).length <= 5
  );
}

function stripBullet(line: string): string {
  for (const marker of BULLET_MARKERS) {
    if (line.startsWith(marker)) return line.slice(marker.length).trim();
  }
  return line.trim();
}

export function explicitPriority(text: string): string | null {
  const lower = text.toLowerCase();
  const candidates: Array<[number, string]> = [];
  const groups: Array<[string[], string]> = [
    [MUST_WORDS, "must"],
    [SHOULD_WORDS, "should"],
    [NICE_WORDS, "nice"],
  ];
  for (const [words, priority] of groups) {
    for (const word of words) {
      const pattern = new RegExp(`(?<![a-z])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z])`, "i");
      const match = pattern.exec(lower);
      if (match) candidates.push([match.index, priority]);
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  return candidates[0][1];
}

function oneOfAlternatives(text: string): string[] | null {
  const parts = text.trim().replace(/[.!]+$/, "").split(ONE_OF_SPLIT);
  if (parts.length !== 2) return null;
  const left = parts[0].trim();
  const right = parts[1].trim();
  if (!left || !right) return null;
  const tokens = left
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t)
    .concat([right]);
  if (tokens.length < 2) return null;
  if (tokens.some((t) => pySplit(t).length > 3)) return null;
  return tokens;
}

function normalizeName(itemText: string): string {
  let name = itemText.trim().replace(/[.!?]+$/, "").trim();
  name = name.replace(TRAILING_PRIORITY_PHRASE, "").trim();
  let changed = true;
  while (changed) {
    changed = false;
    const lowered = name.toLowerCase();
    for (const pattern of BOILERPLATE_PREFIXES) {
      // Python re.match anchors at the start (case-insensitive here via the
      // lowered copy and the pattern's /i).
      const match = new RegExp(pattern.source, "i").exec(lowered);
      if (match && match.index === 0) {
        name = name.slice(match[0].length).trim();
        changed = true;
        break;
      }
    }
  }
  return name.replace(/^[\s\-–—:,]+|[\s\-–—:,]+$/g, "");
}

function evidenceOf(itemText: string): string {
  return pySplit(itemText).slice(0, EVIDENCE_MAX_WORDS).join(" ");
}

/** Drop rows whose evidence does not appear verbatim (FR-012). */
export function filterVerbatim(
  rows: HardSkillRow[],
  cleanedText: string
): [HardSkillRow[], number] {
  const kept: HardSkillRow[] = [];
  let dropped = 0;
  for (const row of rows) {
    if (row.evidence && cleanedText.includes(row.evidence)) kept.push(row);
    else dropped += 1;
  }
  return [kept, dropped];
}

function items(cleanedText: string): Item[] {
  const lines = cleanedText.split("\n");
  const recognized = lines.filter((ln) => headingOf(ln) !== null);
  const result: Item[] = [];
  if (recognized.length === 0) {
    // Unstructured posting: every non-empty non-heading line is an item.
    let order = 0;
    for (const line of lines) {
      if (!line.trim() || isHeadingLike(line)) continue;
      result.push({ text: stripBullet(line), order, section: null });
      order += 1;
    }
    return result;
  }

  let current: string | null = null;
  let order = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    const heading = headingOf(line);
    if (heading !== null) {
      current = heading;
      continue;
    }
    if (isHeadingLike(line)) {
      current = null; // unrecognized heading closes the section
      continue;
    }
    if (current === null) continue; // narrative outside sections is not an item
    result.push({ text: stripBullet(line), order, section: current });
    order += 1;
  }
  return result;
}

function rowFromItem(item: Item): HardSkillRow | null {
  const alternatives = oneOfAlternatives(item.text);
  const explicit = explicitPriority(item.text);
  let priority: string;
  let defaultPriority: boolean;
  if (item.section !== null) {
    priority = explicit ?? item.section;
    defaultPriority = explicit === null;
  } else {
    priority = explicit ?? "must";
    defaultPriority = explicit === null;
  }
  let name: string;
  let rowType: string;
  if (alternatives !== null) {
    name = "One of: " + alternatives.join(" / ");
    rowType = "hard_tool";
  } else {
    name = normalizeName(item.text);
    rowType = "hard";
  }
  if (!name) return null;
  return {
    name,
    type: rowType,
    priority,
    default_priority: defaultPriority,
    evidence: evidenceOf(item.text),
    order: item.order,
    is_one_of: alternatives !== null,
    alternatives,
  };
}

export function extractHardSkills(cleanedText: string): [HardSkillRow[], number] {
  /** Extract hard-skill rows in posting order; returns [rows, dropped]. */
  const candidateRows: HardSkillRow[] = [];
  let dropped = 0;
  for (const item of items(cleanedText)) {
    const row = rowFromItem(item);
    if (row === null) {
      dropped += 1; // boilerplate-only item yields no skill name
      continue;
    }
    candidateRows.push(row);
  }

  // Verbatim-evidence verification (defense in depth; FR-012).
  const [kept, verbatimDropped] = filterVerbatim(candidateRows, cleanedText);
  dropped += verbatimDropped;

  // Duplicate merge: same normalized name -> one row, highest priority.
  const merged = new Map<string, HardSkillRow>();
  for (const row of kept) {
    const key = row.name.toLowerCase().replace(/\s+/g, " ");
    const existing = merged.get(key);
    if (existing === undefined) {
      // The Python code mutates rows in place on merge; clone to keep rows
      // independent in the JS port.
      merged.set(key, { ...row });
    } else if (PRIORITY_RANK[row.priority] < PRIORITY_RANK[existing.priority]) {
      existing.priority = row.priority;
      existing.default_priority = false;
    }
  }
  const rows = [...merged.values()].sort((a, b) => a.order - b.order);
  return [rows, dropped];
}

/** Not-a-posting rule (matcher-rules-1.0.0; FR-019). */
export function looksLikePosting(cleanedText: string): boolean {
  const lines = cleanedText.split("\n");
  const headings = lines.filter((ln) => headingOf(ln) !== null).length;
  const listItems = lines.filter((ln) =>
    BULLET_MARKERS.some((m) => ln.trim().startsWith(m))
  ).length;
  const priorityWords = lines.filter(
    (ln) => explicitPriority(stripBullet(ln)) !== null
  ).length;
  return headings >= 1 || listItems >= 3 || priorityWords >= 1;
}

export { MATCHER_RULES_VERSION };
