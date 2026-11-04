/**
 * Deterministic five-part extraction — verbatim port of
 * src/jobforward/flow/parts.py (rubric-3.1.0).
 *
 * Splits a bullet's own words into the framework parts (user_need,
 * product_feature, action, result, metric):
 *  - every part is a VERBATIM substring of the bullet text or empty —
 *    extraction never paraphrases, never invents (Principle 1);
 *  - an undetectable part stays empty (part_present false), never guessed;
 *  - the marker lists below are part of the versioned heuristic: any change
 *    that alters extracted output is a rubric change (constitution P4).
 *
 * rubric-3.1.0 extraction rules (research/intention, specs/001-experience-improvement-flow/few-shot/parser-prompt
 * Problems 2/4): research/mapping verbs are need signals, never action verbs;
 * an infinitive purpose clause ("to uncover friction in …") is the result
 * part (a vague result), carved from the need clause or taken from a clause
 * that fills neither the action nor a metric — no two parts share words.
 */

import { BulletParts } from "../types";

const CLAUSE_SPLIT = /[,;]|\bso\b|\bbecause\b/i;

// --- Need: specific-need signals (people + problem statements) plus the
// problem-discovery verbs (rubric-3.1.0: research/mapping verbs included;
// specs/001-experience-improvement-flow/few-shot/parser-prompt Problem 2) ---
const NEED_MARKER =
  /\b(users?|customers?|clients?|employers?|candidates?|job seekers?|people|could not|couldn't|can't|cannot|unable to|struggl(?:ed|e|ing)|complain(?:ed|ts)?|frustrat(?:ed|ing)|confus(?:ed|ing)|too (?:hard|difficult|slow|complex)|hard to|difficult to|no way to|had no|problems?|issues?|pain point|needed|needs to|wanted|looking for|missing|lacked|lack of|dropped off|churn(ed)?|analyzed|researched|identified|noticed|found|benchmarked|mapped|surveyed|audited|compared|evaluated)\b/i;

// --- Feature: named product surfaces (rubric-3.1.0: "flow" added — the
// parser prompt's Problem 1 lists a flow as a product component) ---
const FEATURE_MARKER =
  /\b(page|feature|app|application|module|platform|dashboard|workflow|tool|website|site|system|component|api|screen|tab|panel|report|service|funnel|checkout|onboarding|search|flows?)\b/gi;

// --- Action: superset of the Phase-9 verb list (extraction only; scoring
// still uses the checklist's own lists). rubric-3.1.0: the problem-discovery
// verbs (analyzed, researched) moved to the need list — research never fills
// the action part (specs/001-experience-improvement-flow/few-shot/parser-prompt Problem 2). ---
const ACTION_VERB =
  /\b(led|built|designed|created|managed|launched|ran|owned|organized|coordinated|improved|developed|delivered|wrote|planned|tested|prototyped|automated|negotiated|rebuilt|redesigned|implemented|introduced|shipped|migrated|established|spearheaded)\b/i;

// --- Metric: a number together with a measurement word ---
const NUMBER = /\d+(?:[.,]\d+)?%?|\b\d+\+/g;
const MEASURE =
  /(%|percent|grew|growth|increased|increase|reduced|reduction|decreased|dropped|drop|doubled|tripled|halved|conversion|retention|activation|adoption|revenue|visits|sessions|signups|sign-ups|churn|clicks|downloads|x faster|from \d+ to \d+)/i;

// --- Result: outcome connectors; the outcome is the text AFTER them ---
const RESULT_CONNECTOR =
  /(which resulted in|resulted in|resulting in|as a result,?|so that|which led to|led to|leading to|enabling|enabled|which increased|which reduced|which improved|came back|returned to|adopted by|used by|went up|went down)/i;

// --- Result (rubric-3.1.0): an infinitive purpose clause ("to uncover …")
// is a vague result; the phrase is taken FROM the marker onward. The
// lookbehinds keep need-marker phrases that end in "to" ("no way to",
// "needed to", …) out of the intention match. A purpose phrase never comes
// from a clause that fills the action or a metric, so no two parts share
// words (specs/001-experience-improvement-flow/few-shot/parser-prompt Problems 2/4). ---
const INTENTION_MARKER =
  /(?<!\bno way )(?<!\bunable )(?<!\bhard )(?<!\bdifficult )(?<!\bneeds )(?<!\bneed )(?<!\bwanted )(?<!\bway )(?<!\bto )\bto (uncover|deliver|improve|make|help|enable|ensure|provide|support|reduce|increase|allow|show|learn|understand|explore|identify|validate|measure|avoid|prevent|solve|address)\b/i;

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
    const numberMatch = clause.match(NUMBER);
    if (numberMatch && MEASURE.test(clause)) return clause;
  }
  return "";
}

function findNeed(parts: string[]): { need: string; intentionFromNeed: string } {
  /** (need, intention_tail): a purpose clause inside the need clause is
   * carved off — it belongs to the result part (rubric-3.1.0). A clause
   * that also fills the action keeps its whole text (rubric-3.0.0
   * behavior) so no part is emptied by the carve. */
  for (const clause of parts) {
    if (NEED_MARKER.test(clause)) {
      if (!ACTION_VERB.test(clause)) {
        const match = INTENTION_MARKER.exec(clause);
        if (match) {
          return {
            need: clause.slice(0, match.index).trim(),
            intentionFromNeed: clause.slice(match.index).trim(),
          };
        }
      }
      return { need: clause, intentionFromNeed: "" };
    }
  }
  return { need: "", intentionFromNeed: "" };
}

function findAction(parts: string[]): string {
  for (const clause of parts) {
    if (ACTION_VERB.test(clause)) return clause;
  }
  return "";
}

function findResult(parts: string[], intentionFromNeed: string): string {
  for (const clause of parts) {
    const match = RESULT_CONNECTOR.exec(clause);
    if (match) {
      const after = clause.slice(match.index + match[0].length).trim();
      if (after) return after;
      return clause;
    }
  }
  // rubric-3.1.0: an intention phrase ("to uncover …") is a vague result —
  // either carved from the need clause, or a standalone intention clause
  // that fills neither the action nor a metric (no shared words).
  if (intentionFromNeed) return intentionFromNeed;
  for (const clause of parts) {
    if (ACTION_VERB.test(clause)) continue;
    const numberMatch = clause.match(NUMBER);
    if (numberMatch && MEASURE.test(clause)) continue;
    const match = INTENTION_MARKER.exec(clause);
    if (match) return clause.slice(match.index).trim();
  }
  return "";
}

function findFeature(text: string, intentionTail: string): string {
  /** A feature marker with up to 2 preceding words, verbatim substring.
   * Markers inside the intention tail ("to uncover … flows") are skipped:
   * a phrase inside a purpose clause is the result, not the feature
   * (specs/001-experience-improvement-flow/few-shot/parser-prompt Problem 1). */
  const tailStart = intentionTail ? text.indexOf(intentionTail) : -1;
  for (const match of text.matchAll(FEATURE_MARKER)) {
    if (tailStart >= 0 && match.index >= tailStart) continue;
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
    const fragment = [...windowWords, text.slice(match.index, match.index + match[0].length)]
      .join(" ")
      .trim();
    return fragment.replace(/^(and|or)\s+/i, "");
  }
  return "";
}

/** Extract the five framework parts from one bullet (deterministic). */
export function extractParts(text: string): BulletParts {
  // Whitespace is normalized first (newlines/tabs collapse to single
  // spaces): a pasted multi-line bullet must extract exactly like the
  // same words on one line (rubric-3.1.0).
  text = text.replace(/\s+/g, " ").trim();
  const parts = clauses(text);
  const { need, intentionFromNeed } = findNeed(parts);
  return {
    user_need: need,
    product_feature: findFeature(text, intentionFromNeed),
    action: findAction(parts),
    result: findResult(parts, intentionFromNeed),
    metric: findMetric(parts),
  };
}
