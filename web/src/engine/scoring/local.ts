/**
 * Local heuristic evaluator adapter — verbatim port of
 * src/jobforward/scoring/adapters/local.py (rubric-3.0.0).
 *
 * Deterministic, fully offline rule-based ratings per bullet on the THREE
 * dimensions (context, role_action_clarity, result). No LLM, no aggregate
 * math (that lives in metrics.ts). rubric-3.0.0 renames the second
 * dimension's semantics to Specific Action (stored key
 * role_action_clarity unchanged).
 */

import { BulletParts } from "../types";

// --- Context heuristics (raw-text fallback) ---
const SPECIFIC_CONTEXT =
  /\b(project|team|customer|client|user|launch|migration|redesign|problem|issue|goal|campaign|product)\b/i;
const GENERIC_CONTEXT =
  /\b(in an app|in the app|at (the )?company|in a company|at work)\b/i;

// --- Specific action (rubric-3.0.0) ---
const ACTION_VERB_ANY =
  /\b(led|built|designed|created|managed|launched|ran|owned|organized|coordinated|analyzed|improved|developed|delivered|wrote|planned|tested|researched|prototyped|automated|negotiated)\b/i;
const GENERIC_ACTION =
  /\b(worked|working)\s+(on|with)\b|\b(helped|helping)\s+with\b|\bresponsible for\b|\bin charge of\b|\binvolved in\b|\bpart of\b|\bassisted with\b|\btasked with\b|\bdid research\b|\bmade improvements\b|\bdid analysis\b/i;
const CONCRETE_OBJECT =
  /\b(dashboard|roadmap|survey|prototype|prd|spec|user stories|backlog|report|deck|presentation|pricing|onboarding|funnel|checkout|signup|retention|activation|churn|conversion|launch plan|test plan|database|query|sql|figma)\b|\ba\/b\s*tests?\b/i;
const QUANTIFIED_SCOPE =
  /\b(team|group)\s+of\s+\d+\b|\b\d+\s+(users?|customers?|people|interviews?|participants?|teams?|analysts?|weeks?|sprints?|sessions?)\b/i;

// --- Result heuristics ---
const QUANTIFIED = /(\d+(\.\d+)?\s*%|\b\d+(\.\d+)?\b)/;
const SPECIFIC_RESULT =
  /\b(which resulted|resulting in|so that|enabling|leading to|which increased|which reduced|adopted by|used by|raised|cut|grew|doubled|halved|coming back|came back|more users|returned)\b/i;
const VAGUE_RESULT =
  /\b(improved|reduced|increased|optimized|enhanced|better|faster)\b/i;
const OUTPUT_ONLY = /\b(built|created|made|produced|wrote|designed)\b/i;
const LEARNING = /\b(learned|learnt|understood how|studied how|explored how)\b/i;

// --- Context from framework parts (rubric-3.0.0, spec §3) ---
const SPECIFIC_NEED =
  /\b(users?|customers?|clients?|employers?|candidates?|job seekers?|people|could not|couldn't|can't|cannot|unable to|struggl(?:ed|e|ing)|complain(?:ed|ts)?|frustrat(?:ed|ing)|confus(?:ed|ing)|too (?:hard|difficult|slow|complex)|hard to|difficult to|no way to|problems?|issues?|pain point|needed|needs to|wanted|looking for|missing|lacked|lack of|dropped off|churn(ed)?)\b/i;
const GENERIC_NEED =
  /\b(better|improve|improvement|various|some|several|many|things|stuff|efficiency|productivity|processes)\b/i;

// A result that is only a number (optionally with a bare growth word) is not
// an outcome narrative: score 1 and ask what the number represents (spec §3).
const BARE_NUMBER_RESULT =
  /^\W*\d+(?:[.,]\d+)?\s*%?\s*x?\s*(?:percent|growth|increase|decrease|improvement|reduction|uplift|drop|decline)?\W*$/i;

/** 0: missing; 1: general ('in an app'); 2: specific situation. */
function rateContext(text: string): number {
  const lowered = text.toLowerCase();
  if (GENERIC_CONTEXT.test(lowered) && !SPECIFIC_CONTEXT.test(lowered)) return 1;
  if (SPECIFIC_CONTEXT.test(lowered)) return 2;
  return 0;
}

/** rubric-3.0.0 Context from the extracted parts (spec §3). */
function rateContextParts(need: string, feature: string): number {
  if (!need.trim()) return 0;
  if (GENERIC_NEED.test(need) && !SPECIFIC_NEED.test(need)) return 1;
  if (!feature.trim()) return 1;
  return 2;
}

/** rubric-3.0.0 checklist (checklists/specific-action.md). */
function rateSpecificAction(text: string): number {
  if (!text.trim()) return 0;
  const hasVerb = ACTION_VERB_ANY.test(text);
  const hasGeneric = GENERIC_ACTION.test(text);
  if (!hasVerb && !hasGeneric) return 0;
  const hasConcrete = CONCRETE_OBJECT.test(text) || QUANTIFIED_SCOPE.test(text);
  if (hasVerb && hasConcrete) return 2;
  return 1;
}

/** 2 = specific result; 1 = vague/output-only/learning or bare number; 0 = none. */
function rateResult(text: string): number {
  if (!text.trim()) return 0;
  if (QUANTIFIED.test(text) || SPECIFIC_RESULT.test(text)) return 2;
  if (LEARNING.test(text)) return 1;
  if (VAGUE_RESULT.test(text)) return 1;
  if (OUTPUT_ONLY.test(text)) return 1;
  return 0;
}

export interface BulletRating {
  bullet_index: number;
  context: number;
  role_action_clarity: number;
  result: number;
}

export interface RatingRequest {
  texts: string[];
  parts: BulletParts[] | null;
  rubric_version: string;
}

/**
 * Rate each bullet using rule-based heuristics. When the request carries
 * extracted framework parts, Context is scored from the need/feature parts
 * (rubric-3.0.0), the action from the action part, and the bare-number
 * Result rule applies. Without parts, the raw-text heuristics are used
 * unchanged. Ratings are validated against the shared validity check
 * (validateResponse in evaluator.ts) by the caller.
 */
export function localEvaluate(request: RatingRequest): BulletRating[] {
  const ratings: BulletRating[] = [];
  const parts = request.parts ?? [];
  for (let i = 0; i < request.texts.length; i++) {
    const text = request.texts[i];
    const part = i < parts.length ? parts[i] : undefined;
    let context: number;
    let actionText: string;
    let resultText: string;
    if (part) {
      context = rateContextParts(part.user_need, part.product_feature);
      actionText = part.action.trim() || text;
      resultText = part.result.trim() || text;
    } else {
      context = rateContext(text);
      actionText = text;
      resultText = text;
    }
    let result = rateResult(resultText);
    if (part) {
      const bareNumber =
        (part.result ? BARE_NUMBER_RESULT.exec(part.result) : null) ??
        (!part.result.trim() && part.metric ? BARE_NUMBER_RESULT.exec(part.metric) : null);
      if (bareNumber) result = Math.min(result, 1);
    }
    ratings.push({
      bullet_index: i,
      context,
      role_action_clarity: rateSpecificAction(actionText),
      result,
    });
  }
  return ratings;
}
