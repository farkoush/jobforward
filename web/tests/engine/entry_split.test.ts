/**
 * Phase 13 (spec §4.2) — deterministic entry splitting tests (TDD: written
 * BEFORE the implementation). The split never rewrites text (P1): every
 * candidate is a verbatim line from the paste, modulo the stripped -/• list
 * marker and single-space re-joining of wrap continuations.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { splitBullets } from "../../src/engine/flow/entry_split";

test("marker lines become candidates with the marker stripped", () => {
  const out = splitBullets("- Built a dashboard\n• Improved the checkout page");
  assert.equal(out.length, 2);
  assert.equal(out[0].text, "Built a dashboard");
  assert.equal(out[0].flagged, false);
  assert.equal(out[1].text, "Improved the checkout page");
  assert.equal(out[1].flagged, false);
});

test("wrap continuations join the previous candidate with a single space", () => {
  const out = splitBullets(
    "- Led the onboarding redesign\n  work across teams and tools"
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].text, "Led the onboarding redesign work across teams and tools");
});

test("responsibility-style lines are flagged; action-bearing lines are not", () => {
  const out = splitBullets(
    "- Built a dashboard\nResponsible for weekly meetings"
  );
  assert.equal(out.length, 2);
  assert.equal(out[1].text, "Responsible for weekly meetings");
  assert.equal(out[1].flagged, true);
  assert.equal(out[0].flagged, false);
});

test("a flagged line with a list marker is still flagged", () => {
  const out = splitBullets("- Responsible for weekly meetings");
  assert.equal(out.length, 1);
  assert.equal(out[0].flagged, true);
});

test("leading unmarked text becomes its own candidate", () => {
  const out = splitBullets("Growth highlights\n- Built a dashboard");
  assert.equal(out.length, 2);
  assert.equal(out[0].text, "Growth highlights");
  assert.equal(out[0].flagged, false);
  assert.equal(out[1].text, "Built a dashboard");
});

test("an action-bearing unmarked line joins the previous candidate (not flagged)", () => {
  const out = splitBullets("- Led the beta program\nRan 12 user interviews");
  assert.equal(out.length, 1);
  assert.equal(out[0].text, "Led the beta program Ran 12 user interviews");
  assert.equal(out[0].flagged, false);
});

test("'and also' sets the split suggestion", () => {
  const out = splitBullets(
    "- Built the search page and also redesigned the filters"
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].splitSuggested, true);
  assert.equal(out[0].flagged, false);
});

test("plain lines do not set the split suggestion", () => {
  const out = splitBullets("- Built a dashboard");
  assert.equal(out[0].splitSuggested, false);
});

test("CRLF endings and empty lines are handled", () => {
  const out = splitBullets("- Built a dashboard\r\n\r\n• Shipped the export flow\r\n");
  assert.equal(out.length, 2);
  assert.equal(out[0].text, "Built a dashboard");
  assert.equal(out[1].text, "Shipped the export flow");
});

test("more than 6 candidates still split (the cap is the UI's job)", () => {
  const paste = Array.from(
    { length: 8 },
    (_, i) => `- Built feature number ${i + 1}`
  ).join("\n");
  const out = splitBullets(paste);
  assert.equal(out.length, 8);
});

test("candidates are never empty after the marker strip", () => {
  const out = splitBullets("-\n- Built a dashboard\n•");
  assert.equal(out.length, 1);
  assert.equal(out[0].text, "Built a dashboard");
});
