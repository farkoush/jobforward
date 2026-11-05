/**
 * Task registry (plan §1): the ONLY place a task name is mapped to a
 * category. The rest of the app passes only the task name to the gateway —
 * never a category, never a model name (FR-01, P12).
 *
 * Policy: the default category for a NEW task is FAST; use GEN only where
 * there is an explicit, documented reason (heavy, high-quality generation of
 * user-visible text).
 */

import type { Category } from "./types";

const TASK_CATEGORIES: Record<string, Category> = {
  // FAST: lightweight 0/1/2 classification — the model rates bullets; all
  // arithmetic stays in the engine (deterministic scoring gates, P4).
  scoring_ratings: "FAST",
  // GEN (explicit reason): the model generates user-displayed text, streamed
  // progressively (FR-32) — heavy generation, not a quick classification.
  gen_display: "GEN",
};

/** Unknown task names are rejected by the gateway as INVALID_TASK. */
export function categoryForTask(task: string): Category | null {
  return Object.prototype.hasOwnProperty.call(TASK_CATEGORIES, task)
    ? TASK_CATEGORIES[task]
    : null;
}

export function knownTaskNames(): string[] {
  return Object.keys(TASK_CATEGORIES);
}
