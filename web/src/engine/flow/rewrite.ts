/**
 * Rewrite assembly from allowed sources ONLY — verbatim port of
 * src/jobforward/flow/rewrite.py.
 *
 * Constitution Principle 1 + FR-010: a proposal is built only from the words
 * and information of the original bullet and the user's answers. The final
 * assembled text MUST pass the no-extra-claims validator before any proposal
 * is shown (VR-6); a violation is a refused assembly, never a shown proposal
 * (zero tolerance).
 */

import { QuestionDimension } from "../types";

// Numbers are the zero-tolerance tokens: any number in the proposal must
// exist in the sources. Percentages and plain numbers are covered.
const NUMBER = /\d+(?:[.,]\d+)?%?/g;

// Structural glue labels used to join user segments into the framework
// sentence. Glue adds NO claim (no number, no impact verb, no new fact).
const GLUE: Record<QuestionDimension, string> = {
  context: "Context: ",
  feature: "Feature: ",
  role_action_clarity: "Action: ",
  result: "Result: ",
  metric: "Metric: ",
};

export class ExtraClaimError extends Error {}

function sourcesText(sources: string[]): string {
  return sources.join("\n");
}

function numbersIn(text: string): Set<string> {
  return new Set(text.match(NUMBER) ?? []);
}

/** Raise ExtraClaimError if the proposal contains any number (or
 * percentage) not present in the allowed sources (FR-010). */
export function validateNoExtraClaims(proposal: string, sources: string[]): void {
  const allowed = numbersIn(sourcesText(sources));
  for (const number of numbersIn(proposal)) {
    if (!allowed.has(number)) {
      throw new ExtraClaimError(
        `proposal contains number ${number} absent from the original bullet and the user's answers (FR-010)`
      );
    }
  }
}

const WORD_TOKEN = /[a-z0-9]+/g;

// Short linking words allowed by spec §7 plus the structural glue labels.
const CONNECTOR_TOKENS = new Set([
  "context", "feature", "action", "result", "metric",
  "and", "to", "with", "by", "for",
]);

function wordTokens(text: string): Set<string> {
  return new Set((text.toLowerCase().match(WORD_TOKEN) ?? []));
}

/** Raise ExtraClaimError if the proposal contains a keyword absent from the
 * allowed sources (spec §7 wording rules). */
export function validateWordingRules(proposal: string, sources: string[]): void {
  const allowed = wordTokens(sourcesText(sources));
  for (const token of wordTokens(proposal)) {
    if (!allowed.has(token) && !CONNECTOR_TOKENS.has(token)) {
      throw new ExtraClaimError(
        `proposal contains keyword ${token} absent from the original bullet and the user's answers (spec §7)`
      );
    }
  }
}

const QUESTION_ORDER_LABELED: QuestionDimension[] = [
  "context",
  "feature",
  "role_action_clarity",
  "result",
  "metric",
];

/**
 * Assemble the proposed rewrite from the original bullet + user answers.
 * The bullet's own text is kept verbatim as the base; each answered
 * dimension's answer is appended under the pattern's label (structure only).
 * Unanswered dimensions add nothing. The result is validated against the
 * no-extra-claims rule before being returned (VR-6).
 */
export function assembleRewrite(
  bulletText: string,
  answers: Partial<Record<QuestionDimension, string>>
): string {
  const parts = [bulletText];
  const sources = [bulletText];
  for (const dim of QUESTION_ORDER_LABELED) {
    const answer = answers[dim];
    if (answer) {
      parts.push(`${GLUE[dim]}${answer}`);
      sources.push(answer);
    }
  }
  const proposal = parts.join("\n");
  validateNoExtraClaims(proposal, sources);
  validateWordingRules(proposal, sources);
  return proposal;
}
