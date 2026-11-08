/**
 * Shared validity check — verbatim port of the schema-validation part of
 * src/jobforward/scoring/evaluator.py (FR-014). The prototype's evaluator is
 * the deterministic local adapter, but every rating response still passes
 * through this check before use, mirroring the terminal's code path.
 */

import { Ratings, assertRatings, PART_NAMES } from "../types";
import { BulletRating } from "./local";

export const DIMENSIONS = ["context", "role_action_clarity", "result"] as const;
const VALID_RATINGS = [0, 1, 2];

/** Whitespace normalization shared with §2.1 and the coverage pass. */
function normalizeWs(text: string): string {
  return text.trim().split(/\s+/).join(" ");
}

/**
 * Spec §14.2 invariants: verbatim quotes + score-quote coherence.
 * Enforced on every MODEL-produced rating (the gateway/BYOK path) before
 * any use. The deterministic adapter's echoes are its own extraction
 * results and are not re-judged here (its scores are rubric-frozen).
 * Throws EvaluatorOutputError on any violation; the caller retries once,
 * then refuses (FR-014).
 */
export function validateRatingEvidence(rating: BulletRating, text: string): void {
  const quotes = rating.quotes;
  if (!quotes) {
    throw new EvaluatorOutputError("rating missing the quotes object (§14.1)");
  }
  const normalized = normalizeWs(text);
  for (const name of PART_NAMES) {
    const quote = normalizeWs(quotes[name]);
    if (quote && !normalized.includes(quote)) {
      throw new EvaluatorOutputError(
        `rating ${rating.bullet_index}.${name} quote is not verbatim`
      );
    }
  }
  const need = normalizeWs(quotes.user_need);
  const feature = normalizeWs(quotes.product_feature);
  const action = normalizeWs(quotes.action);
  const result = normalizeWs(quotes.result);
  const label = `rating ${rating.bullet_index}`;
  if (rating.context === 2 && (!need || !feature)) {
    throw new EvaluatorOutputError(
      `${label}: context 2 requires the need and feature quotes`
    );
  }
  if (rating.context === 1 && !need) {
    throw new EvaluatorOutputError(`${label}: context 1 requires the need quote`);
  }
  if (rating.context === 0 && need) {
    throw new EvaluatorOutputError(`${label}: context 0 forbids a need quote`);
  }
  if (rating.role_action_clarity >= 1 && !action) {
    throw new EvaluatorOutputError(
      `${label}: action ${rating.role_action_clarity} requires the action quote`
    );
  }
  if (rating.result >= 1 && !result) {
    throw new EvaluatorOutputError(
      `${label}: result ${rating.result} requires the result quote`
    );
  }
  // The metric quotation is free evidence: no score, no invariant (§14.1).
}

// Tokens that would indicate an adapter computed an aggregate score
// (constitution Principle 4: arithmetic never lives in an adapter).
const FORBIDDEN_NOTE_TOKENS = ["/", "%", "Overall", "Experience", "Score", "score"];

export class EvaluatorOutputError extends Error {}

export function validateResponse(
  ratings: BulletRating[],
  expectedBulletCount: number,
  notes: string | null = null
): void {
  if (ratings.length !== expectedBulletCount) {
    throw new EvaluatorOutputError(
      `Expected ${expectedBulletCount} ratings, got ${ratings.length}`
    );
  }
  for (let i = 0; i < ratings.length; i++) {
    if (ratings[i].bullet_index !== i) {
      throw new EvaluatorOutputError(
        `Rating ${i} has bullet_index ${ratings[i].bullet_index}, expected ${i}`
      );
    }
    for (const name of DIMENSIONS) {
      const value = ratings[i][name];
      if (!VALID_RATINGS.includes(value)) {
        throw new EvaluatorOutputError(
          `Rating ${i}.${name} = ${value} not in {0, 1, 2}`
        );
      }
    }
  }
  if (notes !== null) {
    if (FORBIDDEN_NOTE_TOKENS.some((token) => notes.includes(token))) {
      throw new EvaluatorOutputError("Adapter notes must not contain aggregated scores");
    }
  }
}

/** Convert validated BulletRatings into stored Ratings, re-checking the
 * dataclass invariant from models/entities.py. */
export function toRatings(r: BulletRating): Ratings {
  const out: Ratings = {
    context: r.context,
    role_action_clarity: r.role_action_clarity,
    result: r.result,
  };
  assertRatings(out);
  return out;
}
