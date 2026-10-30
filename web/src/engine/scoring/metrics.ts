/**
 * Deterministic scoring engine — verbatim port of src/jobforward/scoring/metrics.py.
 * All arithmetic is deterministic and lives here — never in an evaluator
 * adapter (constitution Principle 4).
 *
 * Formulas (FR-007/FR-008):
 *   dimension_score = sum of bullet scores in that dimension / (2 x bullet_count) x 100
 *   entry_score     = equal-weighted mean of the 3 dimension scores
 *   overall_score   = simple mean of the eligible entries' scores
 */

import { Ratings } from "../types";

export const NUM_DIMENSIONS = 3;
export const MAX_RATING = 2;

export function dimensionScore(sumPoints: number, bulletCount: number): number {
  if (bulletCount <= 0) throw new Error("bullet_count must be > 0");
  return (sumPoints / (2 * bulletCount)) * 100;
}

export function entryScore(dimensionScores: number[]): number {
  if (dimensionScores.length === 0) return 0;
  return dimensionScores.reduce((a, b) => a + b, 0) / dimensionScores.length;
}

/** Exact entry score from a list of per-bullet Ratings (reference fixture:
 * role_action_clarity (2,2), result (2,1), context (2,1) -> 250/3). */
export function entryScoreFromRatings(ratings: Ratings[]): number {
  if (ratings.length === 0) return 0;
  const n = ratings.length;
  const sums = {
    context: ratings.reduce((acc, r) => acc + r.context, 0),
    role_action_clarity: ratings.reduce((acc, r) => acc + r.role_action_clarity, 0),
    result: ratings.reduce((acc, r) => acc + r.result, 0),
  };
  const total = Object.values(sums).reduce(
    (acc, s) => acc + (s / (2 * n)) * 100,
    0
  );
  return total / NUM_DIMENSIONS;
}

export function overallScore(entryScores: number[]): number {
  if (entryScores.length === 0) return 0;
  return entryScores.reduce((a, b) => a + b, 0) / entryScores.length;
}
