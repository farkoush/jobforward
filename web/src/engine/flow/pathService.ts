/**
 * Entry recording, validation, and mutation services — port of the
 * validation logic in terminal/src/jobforward/flow/path_service.py: the
 * English-input boundary (VR-8), verbatim bullet storage, and copy-text
 * assembly. Persistence in the web prototype is client-side (localStorage),
 * so the repository layer is replaced by the session store; every validation
 * rule is identical EXCEPT the one Phase 18 divergence (spec §13, owner
 * decision 2026-11-06): the 1–6 bullet upper cap is REMOVED on the web —
 * the terminal's frozen VR-1 stays untouched in path_service.py.
 */

import {
  Bullet,
  ExperienceEntry,
  ExperienceEntryType,
  isDraft,
} from "../types";

// Scripts that are NOT English (FR-017). The posting path never calls this
// check (FR-021 exemption).
const NON_ENGLISH_RANGES: Array<[number, number]> = [
  [0x0370, 0x03ff], // Greek
  [0x0400, 0x04ff], // Cyrillic
  [0x0590, 0x05ff], // Hebrew
  [0x0600, 0x06ff], // Arabic (incl. Persian)
  [0x0750, 0x077f], // Arabic supplement
  [0x0900, 0x0dff], // Indic scripts
  [0x3000, 0x9fff], // CJK
  [0xac00, 0xd7af], // Hangul
];
// Latin letters beyond ASCII are English-compatible (é, ü, ñ …).
const ALLOWED_HIGH_RANGES: Array<[number, number]> = [
  [0x00c0, 0x024f], // Latin-1 supplement + Latin extended
  [0x2000, 0x206f], // general punctuation (— … “ ”)
];

export function containsNonEnglish(text: string): boolean {
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code < 0x80) continue;
    if (ALLOWED_HIGH_RANGES.some(([lo, hi]) => code >= lo && code <= hi)) continue;
    if (NON_ENGLISH_RANGES.some(([lo, hi]) => code >= lo && code <= hi)) return true;
    // Any other high codepoint (emoji, symbols) is suspicious but is not
    // another language script — allow it to keep verbatim storage intact.
  }
  return false;
}

/** Return an error id if the bullet/answer text is not English. */
export function validateEnglishBullet(text: string): string | null {
  if (containsNonEnglish(text)) return "ERR_NON_ENGLISH_INPUT";
  return null;
}

export interface EntryResult {
  entry: ExperienceEntry | null;
  error: string | null;
  is_draft: boolean;
}

let nextEntryIdCounter = 1;

/** Create an experience entry object after terminal validations (US1).
 * Returns { entry, error } — never throws for validation failures.
 * Phase 13 (spec §4.2): optional `context` fields (company / dates /
 * product_domain) are stored + displayed only — the VR-8 English boundary
 * covers them (analyze F1: P10 applies to ALL user input).
 * Phase 18 (spec §13, clarified 2026-11-06): the 1–6 upper cap is REMOVED
 * on the web (0 bullets still routes to the caller's draft path); the
 * structured dates (start_date / end_date / ongoing) pass through; and
 * `existingId` re-stamps the entry with a previous id so a Back-and-
 * reconfirm UPDATES the same stored entry instead of duplicating it. */
export function addEntry(
  entryType: ExperienceEntryType,
  title: string,
  bullets: string[],
  nextEntryId?: () => number,
  context?: {
    company?: string | null;
    dates?: string | null;
    product_domain?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    ongoing?: boolean;
  },
  existingId?: number
): EntryResult {
  // Phase 18: the VR-1 upper cap (bullets.length > 6) no longer applies on
  // the web — the terminal keeps its frozen VR-1 in path_service.py.
  // English-only boundary (VR-8): bullets and the title must be English.
  for (const text of [title, ...bullets]) {
    if (containsNonEnglish(text)) {
      return { entry: null, error: "ERR_NON_ENGLISH_INPUT", is_draft: false };
    }
  }
  // VR-8 for the Phase 13 context fields (analyze F1).
  for (const text of [
    context?.company ?? "",
    context?.dates ?? "",
    context?.product_domain ?? "",
  ]) {
    if (text && containsNonEnglish(text)) {
      return { entry: null, error: "ERR_NON_ENGLISH_INPUT", is_draft: false };
    }
  }
  const id =
    existingId ?? (nextEntryId ? nextEntryId() : nextEntryIdCounter++);
  const entry: ExperienceEntry = {
    id,
    type: entryType,
    title: title.trim(),
    bullets: bullets.map((b, i) => newBullet(i + 1, b)),
    draft_reason: null,
    source: "manual",
    entry_score: null,
    rubric_version: null,
    deleted: false,
    company: context?.company?.trim() || null,
    dates: context?.dates?.trim() || null,
    product_domain: context?.product_domain?.trim() || null,
    start_date: context?.start_date?.trim() || null,
    end_date: context?.ongoing ? null : context?.end_date?.trim() || null,
    ongoing: context?.ongoing ?? false,
  };
  return { entry, error: null, is_draft: isDraft(entry) };
}

export function newBullet(id: number, text: string): Bullet {
  return {
    id,
    text,
    status: "new",
    ratings: null,
    rubric_version: null,
    history: [],
    questions: [],
    proposals: [],
    merge_warned: false,
    user_need: null,
    product_feature: null,
    action: null,
    result: null,
    metric: null,
    part_present: null,
  };
}

/** Direct user edit = explicit consent; flips only that bullet to 'edited'
 * for re-analysis. Returns an error id or null. */
export function editBulletText(
  entry: ExperienceEntry,
  bulletId: number,
  text: string
): string | null {
  if (containsNonEnglish(text)) return "ERR_NON_ENGLISH_INPUT";
  const bullet = findBullet(entry, bulletId);
  if (!bullet) return "ERR_INVALID_CHOICE";
  bullet.text = text;
  bullet.status = "edited";
  return null;
}

/** Remove a bullet after confirmation. An entry dropping to 0 bullets
 * reverts to draft (FR-020). */
export function deleteBullet(entry: ExperienceEntry, bulletId: number): boolean {
  const index = entry.bullets.findIndex((b) => b.id === bulletId);
  if (index === -1) return false;
  entry.bullets.splice(index, 1);
  if (entry.bullets.length === 0) entry.draft_reason = "no_bullets";
  return true;
}

/** The final text for clipboard use (spec §8): one bullet per line prefixed
 * with "- "; unimproved bullets keep their exact wording. */
export function copyText(entry: ExperienceEntry): string {
  const lines = [entry.title];
  for (const b of entry.bullets) lines.push(`- ${b.text}`);
  return lines.join("\n");
}

export function findBullet(entry: ExperienceEntry, bulletId: number): Bullet | null {
  return entry.bullets.find((b) => b.id === bulletId) ?? null;
}
