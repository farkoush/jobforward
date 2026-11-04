/**
 * Deterministic entry splitting (Phase 13, spec §4.2) — WEB-ONLY entry-flow
 * module; the five-part analysis logic (parts.ts) is untouched.
 *
 * Rules (spec §4.2, clarified 2026-11-04; research D16):
 *  - lines starting with "-" or "•" become candidates; the list marker
 *    itself is formatting and is stripped — SEGMENTATION, never rewriting
 *    (constitution P1): every candidate is a verbatim line from the paste,
 *    modulo marker strip and single-space re-joining of wrap continuations;
 *  - marker-less lines that do NOT match the flag rule are wrap
 *    continuations and join the previous candidate with a single space
 *    (leading text before the first bullet becomes its own candidate);
 *  - a line is FLAGGED "not an achievement" when it has NO action verb AND
 *    no parser signal (the existing marker lists, reused via
 *    lineHasParserSignal — single source of truth) AND opens with a
 *    responsibility-style phrase; the user then chooses keep or discard;
 *  - a line containing " and also " gets a SPLIT suggestion (the split
 *    point is at that connector); the user decides (constitution P2).
 */

import { ACTION_VERB, lineHasParserSignal } from "./parts";

export interface SplitCandidate {
  /** Verbatim line text (marker stripped; wrap joins use one space). */
  text: string;
  /** "Not an achievement" flag — the user chooses keep or discard. */
  flagged: boolean;
  /** The line contains " and also " — a split into two is suggested. */
  splitSuggested: boolean;
}

// The -/• list marker with its trailing whitespace (formatting, stripped).
const BULLET_MARKER = /^\s*[-•]\s*/;

// Responsibility-style openings (spec §4.2 example: "Responsible for
// weekly meetings").
const RESPONSIBILITY_OPEN =
  /^(responsibilities?|responsible|duties|tasked|in charge of)\b/i;

// Two achievements joined by "and also" (spec §4.2 step 4).
const AND_ALSO = /\band also\b/i;

function isFlagged(line: string): boolean {
  return (
    !ACTION_VERB.test(line) &&
    !lineHasParserSignal(line) &&
    RESPONSIBILITY_OPEN.test(line)
  );
}

function hasSplitSuggestion(text: string): boolean {
  return AND_ALSO.test(text);
}

/** Split a pasted experience into candidate bullets (deterministic). */
export function splitBullets(pasted: string): SplitCandidate[] {
  const lines = pasted
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const candidates: SplitCandidate[] = [];
  for (const raw of lines) {
    const marked = BULLET_MARKER.test(raw);
    const line = raw.replace(BULLET_MARKER, "");
    if (line.length === 0) continue; // a bare "-" or "•" carries no text
    const flagged = isFlagged(line);
    if (!marked && !flagged && candidates.length > 0) {
      // Wrap continuation: join the previous candidate with one space.
      const prev = candidates[candidates.length - 1];
      prev.text = `${prev.text} ${line}`;
      prev.splitSuggested = hasSplitSuggestion(prev.text);
      continue;
    }
    candidates.push({
      text: line,
      flagged,
      splitSuggested: hasSplitSuggestion(line),
    });
  }
  return candidates;
}
