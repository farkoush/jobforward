/**
 * Phase 15 (spec §5.2/§6.2) — pure display-helper tests (TDD: written
 * BEFORE the implementation). These helpers drive the five-cell status row
 * and the focused one-question loop. Presentation logic only (research
 * D24): nothing here is analysis; partStates mirrors the engine's
 * PartDisplayState rule — an EMPTY part is "missing" ALWAYS (never vague,
 * even at rating 0), "vague" requires non-empty words plus the vague flag.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { partStates, questionOrder, type DisplayRow } from "../../src/engine/flow/display";

const row = (key: string, words: string, vague = false): DisplayRow => ({
  key,
  words,
  vague,
});

test("partStates: empty parts are missing ALWAYS — even with the vague flag", () => {
  const states = partStates([
    row("user_need", "", true), // empty + vague flag -> still missing
    row("product_feature", "the saved items page"),
    row("action", "led the redesign", true),
    row("result", ""),
    row("metric", ""),
  ]);
  assert.equal(states["user_need"], "missing");
  assert.equal(states["product_feature"], "complete");
  assert.equal(states["action"], "vague");
  assert.equal(states["result"], "missing");
  assert.equal(states["metric"], "missing");
});

test("partStates: vague requires non-empty words", () => {
  const states = partStates([row("result", "to uncover friction", true)]);
  assert.equal(states["result"], "vague");
});

test("questionOrder: missing first, then vague, metric LAST", () => {
  const order = questionOrder([
    row("user_need", ""), // missing (part order position 1)
    row("product_feature", "the flows"), // complete — out
    row("action", "rebuilt things", true), // vague
    row("result", ""), // missing (part order position 4)
    row("metric", ""), // missing — but LAST
  ]);
  assert.deepEqual(order, ["user_need", "result", "action", "metric"]);
});

test("questionOrder: only an empty metric yields exactly [metric]", () => {
  const order = questionOrder([
    row("user_need", "users struggled"),
    row("product_feature", "the page"),
    row("action", "I rebuilt it"),
    row("result", "more users stayed"),
    row("metric", ""),
  ]);
  assert.deepEqual(order, ["metric"]);
});

test("questionOrder: a complete bullet yields [] (loop skipped)", () => {
  const order = questionOrder([
    row("user_need", "users struggled"),
    row("product_feature", "the page"),
    row("action", "I rebuilt it"),
    row("result", "more users stayed"),
    row("metric", "retention +15%"),
  ]);
  assert.deepEqual(order, []);
});

test("questionOrder: metric is last even when other parts are vague", () => {
  const order = questionOrder([
    row("user_need", "users", true), // vague
    row("product_feature", "the page"), // complete
    row("action", ""), // missing
    row("result", "stayed", true), // vague
    row("metric", ""), // missing -> still last
  ]);
  assert.deepEqual(order, ["action", "user_need", "result", "metric"]);
});
