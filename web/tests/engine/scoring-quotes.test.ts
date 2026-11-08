/**
 * §14 (amendment 2026-11-08) — single-source scoring output tests: the
 * verbatim per-part quotes ride on every rating, the deterministic adapter
 * echoes its extraction results, and the model-path evidence invariants
 * (§14.2) reject incoherent output BEFORE any use.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { partsFromQuotes } from "../../src/engine/types";
import { localEvaluate } from "../../src/engine/scoring/local";
import {
  EvaluatorOutputError,
  validateRatingEvidence,
} from "../../src/engine/scoring/evaluator";
import { extractParts } from "../../src/engine/flow/parts";

const TEXT =
  "users could not finish checkout, so I simplified the checkout form and more users finished checkout";

const coherentQuotes = {
  user_need: "users could not finish checkout",
  product_feature: "the checkout form",
  action: "I simplified the checkout form",
  result: "more users finished checkout",
  metric: "",
};

const rating = (
  overrides: Partial<{
    context: number;
    role_action_clarity: number;
    result: number;
    quotes: typeof coherentQuotes | null;
  }> = {}
) => ({
  bullet_index: 0,
  context: 2,
  role_action_clarity: 2,
  result: 1,
  quotes: coherentQuotes,
  ...overrides,
});

test("localEvaluate: quotes are exactly its extraction results (§14.1 echo)", () => {
  const parts = extractParts(TEXT);
  const [r] = localEvaluate({
    texts: [TEXT],
    parts: [parts],
    rubric_version: "rubric-3.2.0",
  });
  assert.deepEqual(r.quotes, {
    user_need: parts.user_need,
    product_feature: parts.product_feature,
    action: parts.action,
    result: parts.result,
    metric: parts.metric,
  });
});

test("localEvaluate: legacy raw-text path (no parts) carries no quotes", () => {
  const [r] = localEvaluate({
    texts: ["Built a dashboard"],
    parts: null,
    rubric_version: "rubric-3.2.0",
  });
  assert.equal(r.quotes, null);
});

test("partsFromQuotes builds the five stored part fields (§14.3)", () => {
  const parts = partsFromQuotes(coherentQuotes);
  assert.deepEqual(parts, {
    user_need: "users could not finish checkout",
    product_feature: "the checkout form",
    action: "I simplified the checkout form",
    result: "more users finished checkout",
    metric: "",
  });
});

test("§14.2: coherent rating + verbatim quotes is accepted", () => {
  validateRatingEvidence(rating(), TEXT);
});

test("§14.2: full score without the required quote is rejected", () => {
  const cases = [
    rating({ quotes: { ...coherentQuotes, product_feature: "" } }), // context 2
    rating({ quotes: { ...coherentQuotes, user_need: "" } }), // context 2
    rating({ context: 1, quotes: { ...coherentQuotes, user_need: "" } }),
    rating({ quotes: { ...coherentQuotes, action: "" } }), // action 1
    rating({ result: 2, quotes: { ...coherentQuotes, result: "" } }),
  ];
  for (const r of cases) {
    assert.throws(() => validateRatingEvidence(r, TEXT), EvaluatorOutputError);
  }
});

test("§14.2: context 0 with a quoted need is rejected (self-contradiction)", () => {
  assert.throws(
    () => validateRatingEvidence(rating({ context: 0 }), TEXT),
    EvaluatorOutputError
  );
});

test("§14.2: a paraphrased quote is rejected", () => {
  assert.throws(
    () =>
      validateRatingEvidence(
        rating({ quotes: { ...coherentQuotes, user_need: "users were unable to check out" } }),
        TEXT
      ),
    EvaluatorOutputError
  );
});

test("§14.2: whitespace-only differences are still verbatim", () => {
  validateRatingEvidence(
    rating({
      role_action_clarity: 1,
      result: 0,
      quotes: {
        ...coherentQuotes,
        user_need: "users  could not\nfinish checkout",
        action: "I simplified the checkout form",
        result: "",
        metric: "",
      },
    }),
    "users could not finish checkout, so I simplified the checkout form"
  );
});

test("§14.1: the metric quote is free evidence but must be verbatim", () => {
  validateRatingEvidence(
    rating({
      context: 0,
      role_action_clarity: 0,
      result: 2,
      quotes: { ...coherentQuotes, user_need: "", metric: "25%" },
    }),
    `${TEXT} — signups grew by 25%`
  );
  assert.throws(
    () =>
      validateRatingEvidence(
        rating({
          context: 0,
          role_action_clarity: 0,
          result: 2,
          quotes: { ...coherentQuotes, user_need: "", metric: "by twenty five percent" },
        }),
        `${TEXT} — signups grew by 25%`
      ),
    EvaluatorOutputError
  );
});

test("§14.1: a rating without the quotes object is rejected", () => {
  assert.throws(
    () => validateRatingEvidence(rating({ quotes: null }), TEXT),
    EvaluatorOutputError
  );
});
