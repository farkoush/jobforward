/**
 * Entry recording, validation, and mutation services — verbatim port of the
 * validation logic in src/jobforward/flow/path_service.py: the English-input
 * boundary (VR-8), the 6-bullet cap (VR-1/FR-002), verbatim bullet storage,
 * and copy-text assembly. Persistence in the web prototype is client-side
 * (localStorage), so the repository layer is replaced by the session store;
 * every validation rule is identical.
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
 * Returns { entry, error } — never throws for validation failures. */
export function addEntry(
  entryType: ExperienceEntryType,
  title: string,
  bullets: string[],
  nextEntryId?: () => number
): EntryResult {
  // VR-1: more than 6 bullets -> explicit rejection (FR-002)
  if (bullets.length > 6) {
    return { entry: null, error: "ERR_TOO_MANY_BULLETS", is_draft: false };
  }
  // English-only boundary (VR-8): bullets and the title must be English.
  for (const text of [title, ...bullets]) {
    if (containsNonEnglish(text)) {
      return { entry: null, error: "ERR_NON_ENGLISH_INPUT", is_draft: false };
    }
  }
  const id = nextEntryId ? nextEntryId() : nextEntryIdCounter++;
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
