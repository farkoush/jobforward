import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BYOK_RATINGS_SCHEMA,
  checkInputLimit,
} from "../../src/lib/byok/client";
import { BYOK_MAX_INPUT_CHARS } from "../../src/lib/byok/providers.config";

test("ratings schema rejects out-of-range values and wrong shapes", () => {
  const good = {
    rubric_version: "rubric-3.0.0",
    ratings: [{ bullet_index: 0, context: 2, role_action_clarity: 1, result: 0 }],
  };
  assert.equal(BYOK_RATINGS_SCHEMA.safeParse(good).success, true);
  const badValues = {
    rubric_version: "rubric-3.0.0",
    ratings: [{ bullet_index: 0, context: 5, role_action_clarity: 1, result: 0 }],
  };
  assert.equal(BYOK_RATINGS_SCHEMA.safeParse(badValues).success, false);
  const empty = { rubric_version: "x", ratings: [] };
  assert.equal(BYOK_RATINGS_SCHEMA.safeParse(empty).success, false);
  const injection = {
    rubric_version: "x",
    ratings: [{ bullet_index: 0, context: 2, role_action_clarity: 2, result: 2 }],
    extra: "<script>alert(1)</script>",
  };
  // Extra keys are stripped/ignored by zod — the dangerous content never
  // reaches the UI regardless (rendered as plain text only).
  const parsed = BYOK_RATINGS_SCHEMA.safeParse(injection);
  assert.equal(parsed.success, true);
});

test("input limit rejects oversized input before any request", () => {
  assert.equal(checkInputLimit(100), null);
  const over = checkInputLimit(BYOK_MAX_INPUT_CHARS + 1);
  assert.ok(over);
  assert.match(over!.userMessage, /too long/i);
});
