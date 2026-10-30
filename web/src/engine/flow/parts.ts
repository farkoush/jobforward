/**
 * Deterministic five-part extraction — verbatim port of
 * src/jobforward/flow/parts.py (rubric-3.0.0).
 *
 * Splits a bullet's own words into the framework parts (user_need,
 * product_feature, action, result, metric):
 *  - every part is a VERBATIM substring of the bullet text or empty —
 *    extraction never paraphrases, never invents (Principle 1);
 *  - an undetectable part stays empty (part_present false), never guessed;
 *  - the marker lists below are part of the versioned heuristic: any change
 *    that alters extracted output is a rubric change (constitution P4).
 */

import { BulletParts } from "../types";

const CLAUSE_SPLIT = /[,;]|\bso\b|\bbecause\b/i;

// --- Need: specific-need signals (people + problem statements) ---
const NEED_MARKER =
  /\b(users?|customers?|clients?|employers?|candidates?|job seekers?|people|could not|couldn't|can't|cannot|unable to|struggl(?:ed|e|ing)|complain(?:ed|ts)?|frustrat(?:ed|ing)|confus(?:ed|ing)|too (?:hard|difficult|slow|complex)|hard to|difficult to|no way to|problems?|issues?|pain point|needed|needs to|wanted|looking for|missing|lacked|lack of|dropped off|churn(ed)?)\b/i;

// --- Feature: named product surfaces ---
const FEATURE_MARKER =
  /\b(page|feature|app|application|module|platform|dashboard|workflow|tool|website|site|system|component|api|screen|tab|panel|report|service|funnel|checkout|onboarding|search)\b/i;

// --- Action: superset of the Phase-9 verb list (extraction only) ---
const ACTION_VERB =
  /\b(led|built|designed|created|managed|launched|ran|owned|organized|coordinated|analyzed|improved|developed|delivered|wrote|planned|tested|researched|prototyped|automated|negotiated|rebuilt|redesigned|implemented|introduced|shipped|migrated|established|spearheaded)\b/i;

// --- Metric: a number together with a measurement word ---
const NUMBER = /\d+(?:[.,]\d+)?%?|\b\d+\+/g;
const MEASURE =
  /(%|percent|grew|growth|increased|increase|reduced|reduction|decreased|dropped|drop|doubled|tripled|halved|conversion|retention|activation|adoption|revenue|visits|sessions|signups|sign-ups|churn|clicks|downloads|x faster|from \d+ to \d+)/i;

// --- Result: outcome connectors; the outcome is the text AFTER them ---
const RESULT_CONNECTOR =
  /(which resulted in|resulted in|resulting in|as a result,?|so that|which led to|led to|leading to|enabling|enabled|which increased|which reduced|which improved|came back|returned to|adopted by|used by|went up|went down)/i;

// Feature window: up to this many words before the marker are included.
const FEATURE_WINDOW_WORDS = 2;

function clauses(text: string): string[] {
  return text
    .split(CLAUSE_SPLIT)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0);
}

function findMetric(parts: string[]): string {
  for (const clause of parts) {
    if (clause.match(NUMBER) && MEASURE.test(clause)) return clause;
  }
  return "";
}

function findNeed(parts: string[]): string {
  for (const clause of parts) {
    if (NEED_MARKER.test(clause)) return clause;
  }
  return "";
}

function findAction(parts: string[]): string {
  for (const clause of parts) {
    if (ACTION_VERB.test(clause)) return clause;
  }
  return "";
}

function findResult(parts: string[]): string {
  for (const clause of parts) {
    const match = RESULT_CONNECTOR.exec(clause);
    if (match) {
      const after = clause.slice(match.index + match[0].length).trim();
      if (after) return after;
      return clause;
    }
  }
  return "";
}

function findFeature(text: string, parts: string[]): string {
  /** A feature marker with up to 2 preceding words, verbatim substring. */
  const match = FEATURE_MARKER.exec(text);
  if (!match) return "";
  const before = text.slice(0, match.index).replace(/\s+$/, "");
  if (!before) return text.slice(match.index, match.index + match[0].length).trim();
  let windowWords = before.split(" ").slice(-FEATURE_WINDOW_WORDS);
  // A leading action verb or pronoun in the window is the sentence's action,
  // not part of the feature name ("Built a dashboard" -> "a dashboard").
  const fullActionVerb = new RegExp(`^(?:${ACTION_VERB.source.slice(2)})$`, "i");
  while (
    windowWords.length > 0 &&
    (fullActionVerb.test(windowWords[0]) ||
      ["i", "we", "my", "our"].includes(windowWords[0].toLowerCase()))
  ) {
    windowWords = windowWords.slice(1);
  }
  return [...windowWords, text.slice(match.index, match.index + match[0].length)]
    .join(" ")
    .trim();
}

/** Extract the five framework parts from one bullet (deterministic). */
export function extractParts(text: string): BulletParts {
  const parts = clauses(text);
  return {
    user_need: findNeed(parts),
    product_feature: findFeature(text, parts),
    action: findAction(parts),
    result: findResult(parts),
    metric: findMetric(parts),
  };
}
