/**
 * Matcher v2 deterministic input gates (spec 002 v2 — the v1 input stage is
 * UNCHANGED and runs entirely in deterministic code BEFORE any model
 * contact). Web-only client-side port of the /api/matcher route's gate
 * order — the route goes dormant (S7), the gates must not change:
 *   language (>10% Persian/Arabic letters, paste stage)
 *   → word count < 100 (paste stage, params)
 *   → word count > 1500 (paste stage, params)
 *   → not-a-posting heuristic (review stage)
 * The cleaning counts ride on every outcome (review screen report).
 * Reuses the v1 engine functions — cleaning stays byte-identical to the
 * terminal.
 */

import {
  cleanPosting,
  type CleanedPosting,
} from "../posting";
import { looksLikePosting } from "../hardSkills";

export type MatcherInputGateResult =
  | { ok: true; cleaned: CleanedPosting }
  | { ok: false; stage: "paste"; error: "MATCH_ERR_PERSIAN"; cleaning: MatcherCleaning }
  | {
      ok: false;
      stage: "paste";
      error: "MATCH_ERR_TOO_SHORT" | "MATCH_ERR_TOO_LONG";
      params: { count: number; limit: number };
      cleaning: MatcherCleaning;
    }
  | { ok: false; stage: "review"; error: "MATCH_ERR_NOT_A_POSTING"; cleaning: MatcherCleaning };

export interface MatcherCleaning {
  script_blocks: number;
  style_blocks: number;
  html_tags: number;
  word_count: number;
}

export function cleaningOf(p: CleanedPosting): MatcherCleaning {
  return {
    script_blocks: p.script_blocks_removed,
    style_blocks: p.style_blocks_removed,
    html_tags: p.html_tags_removed,
    word_count: p.word_count,
  };
}

export function runMatcherInputGates(rawPosting: string): MatcherInputGateResult {
  const posting = cleanPosting(rawPosting);
  const cleaning = cleaningOf(posting);
  if (!posting.language_ok) {
    return { ok: false, stage: "paste", error: "MATCH_ERR_PERSIAN", cleaning };
  }
  if (posting.word_count < 100) {
    return {
      ok: false,
      stage: "paste",
      error: "MATCH_ERR_TOO_SHORT",
      params: { count: posting.word_count, limit: 100 },
      cleaning,
    };
  }
  if (posting.word_count > 1500) {
    return {
      ok: false,
      stage: "paste",
      error: "MATCH_ERR_TOO_LONG",
      params: { count: posting.word_count, limit: 1500 },
      cleaning,
    };
  }
  if (!looksLikePosting(posting.cleaned_text)) {
    return { ok: false, stage: "review", error: "MATCH_ERR_NOT_A_POSTING", cleaning };
  }
  return { ok: true, cleaned: posting };
}
