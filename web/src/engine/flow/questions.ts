/**
 * Per-bullet rewrite gate and follow-up questions — verbatim port of
 * src/jobforward/flow/questions.py (finalized five-part framework, FR-009):
 *  - analysis runs BEFORE any question;
 *  - for each bullet the gate "Do you want me to rewrite this bullet…?" is
 *    asked (default Yes); answering No -> no questions, no rewrite;
 *  - on accept: exactly one skippable question per missing/vague part, in
 *    the fixed order Need -> Feature -> Action -> Result -> Metric (0-5
 *    total). Conditions: Need/Action/Result when their dimension score is
 *    0 or 1; Feature/Metric when the field is empty;
 *  - a COMPLETE bullet (Context, Specific Action, Result all 2) gets NO
 *    questions — only a final confirmation;
 *  - at most ONE question round per bullet per improvement run;
 *  - >= 1 answered + others unanswered -> draft-or-approve branch.
 */

import {
  Bullet,
  GateDecision,
  QuestionDimension,
  QuestionRecord,
  Ratings,
} from "../types";
import {
  ASK_NEED,
  ASK_FEATURE,
  ASK_ACTION,
  ASK_RESULT,
  ASK_METRIC,
} from "../messages";

// Question order locked by the finalized spec §6.
export const QUESTION_ORDER: QuestionDimension[] = [
  "context",
  "feature",
  "role_action_clarity",
  "result",
  "metric",
];

export const QUESTION_TEXT: Record<QuestionDimension, string> = {
  context: ASK_NEED,
  feature: ASK_FEATURE,
  role_action_clarity: ASK_ACTION,
  result: ASK_RESULT,
  metric: ASK_METRIC,
};

// Hard cap: one round per bullet per improvement run (Clarification Q1).
const MAX_ROUND = 1;

/** A bullet is complete when all three dimensions score 2 (spec §6). */
export function isComplete(ratings: Ratings): boolean {
  return (
    ratings.context === 2 &&
    ratings.role_action_clarity === 2 &&
    ratings.result === 2
  );
}

function fieldEmpty(bullet: Bullet, dimension: QuestionDimension): boolean {
  const field =
    dimension === "feature"
      ? bullet.product_feature
      : dimension === "metric"
        ? bullet.metric
        : null;
  return !(field ?? "").trim();
}

/** The parts to ask about, in locked order (spec §6 conditions). */
export function questionsFor(bullet: Bullet, ratings: Ratings): QuestionDimension[] {
  if (isComplete(ratings)) return []; // complete bullets get a confirmation, never questions
  const asks: QuestionDimension[] = [];
  for (const dimension of QUESTION_ORDER) {
    if (dimension === "feature" || dimension === "metric") {
      if (fieldEmpty(bullet, dimension)) asks.push(dimension);
    } else {
      const score =
        dimension === "context"
          ? ratings.context
          : dimension === "role_action_clarity"
            ? ratings.role_action_clarity
            : ratings.result;
      if (score < 2) asks.push(dimension);
    }
  }
  return asks;
}

/** One round per bullet per run: a bullet asked in this run is skipped. */
export function gateAllowed(bullet: Bullet): boolean {
  if (bullet.status === "new" && bullet.questions.length === 0) return true;
  const maxRound = Math.max(0, ...bullet.questions.map((q) => q.round));
  return maxRound < MAX_ROUND;
}

/** The round number for this improvement run (1 on the first run). */
export function nextRound(bullet: Bullet): number {
  return Math.max(0, ...bullet.questions.map((q) => q.round)) + 1;
}

/** Build the question records for this round (0-5 questions). */
export function buildQuestions(
  bullet: Bullet,
  ratings: Ratings,
  gateAnswer: GateDecision,
  roundNumber?: number
): QuestionRecord[] {
  if (gateAnswer === "rejected") return [];
  const round = roundNumber ?? nextRound(bullet);
  return questionsFor(bullet, ratings).map((dimension) => ({
    dimension,
    text: QUESTION_TEXT[dimension],
    round,
    gate_answer: gateAnswer,
    answer: null,
    skipped: false,
    answered_at: null,
    skipped_at: null,
  }));
}

export function answeredAndSkipped(questions: QuestionRecord[]): [number, number] {
  const answered = questions.filter((q) => q.answer !== null).length;
  return [answered, questions.length - answered];
}

/** >= 1 answered AND >= 1 unanswered -> the draft-or-approve branch. */
export function hasPartialAnswers(questions: QuestionRecord[]): boolean {
  const [answered, other] = answeredAndSkipped(questions);
  return answered >= 1 && other >= 1;
}

/** No question answered -> no rewrite (FR-009). */
export function allSkipped(questions: QuestionRecord[]): boolean {
  return answeredAndSkipped(questions)[0] === 0;
}
