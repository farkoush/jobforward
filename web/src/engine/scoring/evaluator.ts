/**
 * Shared validity check — verbatim port of the schema-validation part of
 * src/jobforward/scoring/evaluator.py (FR-014). The prototype's evaluator is
 * the deterministic local adapter, but every rating response still passes
 * through this check before use, mirroring the terminal's code path.
 */

import { Ratings, assertRatings } from "../types";
import { BulletRating } from "./local";

export const DIMENSIONS = ["context", "role_action_clarity", "result"] as const;
const VALID_RATINGS = [0, 1, 2];

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
