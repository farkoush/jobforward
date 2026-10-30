/**
 * Incremental re-analysis — verbatim port of src/jobforward/flow/incremental.py.
 * Constitution Principle 5 + FR-012: only new or edited bullets are
 * re-analyzed; unchanged bullets keep their previous ratings,
 * rubric_version, AND status label.
 */

import { Bullet } from "../types";

/** A bullet is re-analyzed iff it is new (never analyzed) or edited. */
export function needsReanalysis(bullet: Bullet): boolean {
  return bullet.status === "new" || bullet.status === "edited";
}

export function selectForReanalysis(bullets: Bullet[]): Bullet[] {
  return bullets.filter((b) => needsReanalysis(b));
}

export function unchangedBullets(bullets: Bullet[]): Bullet[] {
  return bullets.filter((b) => !needsReanalysis(b));
}
