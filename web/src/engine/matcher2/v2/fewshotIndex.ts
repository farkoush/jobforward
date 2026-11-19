/**
 * Few-shot bank index (spec 002 v3, research R17 — owner ruling): the
 * examples are JSON files in specs/002-jd-matcher/few-shot/ and are
 * imported DIRECTLY — the bundler embeds them, there is no runtime file
 * read, no sync script, and no drift (the out-of-root import is enabled
 * by experimental.externalDir in web/next.config.ts, analyze I-1).
 *
 * Adding a NEW example = one file + one import line here. Flipping an
 * example to status "final" = a data edit only. The runtime filter
 * (status === "final" && split === "fewshot") guarantees drafts and eval
 * examples are NEVER put into a prompt; zero finals ⇒ an empty array ⇒ no
 * few-shot block (SC-010).
 */

import exJ001 from "../../../../../specs/002-jd-matcher/few-shot/EX-J001.json";
import {
  BULLET_MARKERS,
  isHeadingLike,
} from "../hardSkills";
import { pySplit } from "../posting";

export interface ParsedFewShotExample {
  id: string;
  status: "draft" | "final";
  split: "fewshot" | "eval";
  method_version: number;
  tag: string;
  format_features: {
    language: string;
    words: number;
    headings: string[];
    style: string;
    explicit_obligation_words: boolean;
  };
  sentences: Array<{
    id: string;
    section: string;
    signal: string;
    content: string;
    text: string;
  }>;
  why: string;
  rule: string;
  do_not_copy: string;
  near_miss: string | null;
}

const ALL_EXAMPLES: ParsedFewShotExample[] = [exJ001 as ParsedFewShotExample];

/** Only status "final" + split "fewshot" examples ever reach the prompt. */
export function finalFewShotExamples(): ParsedFewShotExample[] {
  return ALL_EXAMPLES.filter(
    (ex) => ex.status === "final" && ex.split === "fewshot"
  );
}

/** The current posting's format features for the R18 selection score —
 *  derived deterministically from the cleaned text (no model call). */
export interface PostingFeatures {
  headings: string[];
  words: number;
  style: string;
  language: string;
  explicit_obligation_words: boolean;
}

export function derivePostingFeatures(cleanedText: string): PostingFeatures {
  const lines = cleanedText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const isBullet = (line: string): boolean =>
    BULLET_MARKERS.some((m) => line.startsWith(m));
  const headings: string[] = [];
  for (const line of lines) {
    if (!isBullet(line) && isHeadingLike(line)) {
      headings.push(line.replace(/:\s*$/, "").trim());
    }
  }
  return {
    headings,
    words: pySplit(cleanedText).length,
    style: lines.some(isBullet) ? "bulleted" : "paragraphs",
    language: "en",
    explicit_obligation_words:
      /\b(must|required|mandatory|essential)\b/i.test(cleanedText),
  };
}
