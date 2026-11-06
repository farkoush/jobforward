/**
 * Phase 18 (spec §13, clarified 2026-11-06) — paste-first entry with a
 * drag-and-drop review. WEB-ONLY input shaping: the parser SEGMENTS the
 * paste (the unchanged splitBullets) and auto-places ONLY the first
 * non-marker line into Title — it NEVER attributes organization, dates, or
 * domain (the owner rejected automatic attribution; research D36).
 * matchDatePattern fills the structured YYYY-MM fields only from
 * month-precision text the USER dragged into the Dates section (P1 — a
 * month is never invented; a bare year / year-only range / prose date
 * becomes the legacy free-text dates value instead). No Python twin, no
 * parity coupling (the D24 web-only helper pattern).
 */

import { splitBullets, SplitCandidate } from "./entry_split";

export interface PastedExperience {
  /** The draggable segments — EXACTLY the splitBullets output (P1). */
  segments: SplitCandidate[];
  /** Index into segments of the first-line Title auto-placement, or null
   * when the paste starts with a -/• marker (nothing auto-places). */
  autoTitleIndex: number | null;
}

// The -/• list marker at the start of a line (mirrors entry_split's rule).
const FIRST_LINE_MARKER = /^\s*[-•]/;

export function parsePastedExperience(pasted: string): PastedExperience {
  const segments = splitBullets(pasted);
  const firstLine =
    pasted
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "";
  const autoTitleIndex =
    firstLine && !FIRST_LINE_MARKER.test(firstLine) && segments.length > 0
      ? 0
      : null;
  return { segments, autoTitleIndex };
}

// --- Drop-time date matcher (spec §13.1: pinned MONTH-PRECISION grammar) ---

export interface DatePatternMatch {
  startDate: string | null;
  endDate: string | null;
  ongoing: boolean;
}

const MONTH_TOKEN = /^\d{4}-(0[1-9]|1[0-2])$/;
const PRESENT_TOKEN = /^(present|current)$/i;
// "to", an en/em dash (spaces optional), or a SPACED hyphen — a bare hyphen
// is part of the YYYY-MM token itself and never splits it.
const RANGE_SEPARATOR = /\s+to\s+|\s*[–—]\s*|\s+-\s+/;

/** Match dragged Dates-section text against the pinned grammar. Returns null
 * when nothing month-precision matches — the text then becomes the legacy
 * free-text dates value (a month is never invented, P1). */
export function matchDatePattern(text: string): DatePatternMatch | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (PRESENT_TOKEN.test(trimmed)) {
    return { startDate: null, endDate: null, ongoing: true };
  }
  if (MONTH_TOKEN.test(trimmed)) {
    return { startDate: trimmed, endDate: null, ongoing: false };
  }
  const parts = trimmed.split(RANGE_SEPARATOR);
  if (parts.length === 2) {
    const a = parts[0].trim();
    const b = parts[1].trim();
    if (MONTH_TOKEN.test(a) && MONTH_TOKEN.test(b)) {
      return { startDate: a, endDate: b, ongoing: false };
    }
    if (MONTH_TOKEN.test(a) && PRESENT_TOKEN.test(b)) {
      return { startDate: a, endDate: null, ongoing: true };
    }
  }
  return null;
}
