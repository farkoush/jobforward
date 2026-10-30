/**
 * Bullet overlap detection for the merge warning — verbatim port of
 * src/jobforward/scoring/overlap.py. FR-013: each bullet is compared with
 * all existing bullets in the same entry; the warning NEVER affects any
 * score, and no merge happens without the user's explicit confirmation.
 */

// Overlap threshold (rubric-2.0.0, carried unchanged): two bullets overlap
// when their normalized word sets share at least this Jaccard-like fraction.
export const OVERLAP_THRESHOLD = 0.6;
export const OVERLAP_RUBRIC_VERSION = "rubric-2.0.0";

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "with",
  "by", "at", "as", "is", "was", "were", "i", "my", "our", "we", "it",
  "that", "this", "which", "from",
]);

function tokens(text: string): Set<string> {
  const out = new Set<string>();
  const matches = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  for (const tok of matches) {
    if (!STOPWORDS.has(tok)) out.add(tok);
  }
  return out;
}

export function overlapScore(textA: string, textB: string): number {
  const setA = tokens(textA);
  const setB = tokens(textB);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection += 1;
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

export interface OverlapPair {
  bullet_a: number; // 1-based positions, as stored on the entry
  bullet_b: number;
  score: number;
}

export function findOverlaps(bulletTexts: string[]): OverlapPair[] {
  const pairs: OverlapPair[] = [];
  for (let i = 0; i < bulletTexts.length; i++) {
    for (let j = i + 1; j < bulletTexts.length; j++) {
      const score = overlapScore(bulletTexts[i], bulletTexts[j]);
      if (score >= OVERLAP_THRESHOLD) {
        pairs.push({ bullet_a: i + 1, bullet_b: j + 1, score });
      }
    }
  }
  return pairs;
}
