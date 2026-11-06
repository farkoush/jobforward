/**
 * Phase 18 (spec §13, clarified 2026-11-06) — paste-first entry with a
 * drag-and-drop review (TDD: written BEFORE the implementation). The parser
 * only SEGMENTS (the unchanged splitBullets) and auto-places the FIRST
 * non-marker line into Title — it never attributes organization, dates, or
 * domain (D36: the owner rejected automatic attribution). matchDatePattern
 * fills the structured dates ONLY from month-precision text the USER drags
 * into the Dates section (P1 — a month is never invented).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parsePastedExperience,
  matchDatePattern,
} from "../../src/engine/flow/entry_parse";
import { addEntry } from "../../src/engine/flow/pathService";
import { AddEntryRequestSchema } from "../../src/lib/schemas";

// --- parsePastedExperience: segmentation + first-line auto-Title ONLY ---

test("segments are exactly the splitBullets output — nothing dropped", () => {
  const out = parsePastedExperience(
    "Product Manager\nAcme\n2022-04 to 2024-08\n- Led the redesign\n- Cut onboarding time"
  );
  // splitBullets wrap-merges the marker-less header lines into one segment;
  // the parser changes NOTHING about that output (D36).
  assert.deepEqual(
    out.segments.map((s) => s.text),
    [
      "Product Manager Acme 2022-04 to 2024-08",
      "Led the redesign",
      "Cut onboarding time",
    ]
  );
});

test("the first non-marker line auto-places into Title; a marker-first paste does not", () => {
  const a = parsePastedExperience("Product Manager\n- Led the redesign");
  assert.equal(a.autoTitleIndex, 0);
  assert.equal(a.segments[0].text, "Product Manager");
  const b = parsePastedExperience("- Led the redesign\n- Cut the onboarding time");
  assert.equal(b.autoTitleIndex, null);
});

test("a single-line paste auto-places that line into Title", () => {
  const out = parsePastedExperience("Built the analytics dashboard");
  assert.equal(out.autoTitleIndex, 0);
  assert.equal(out.segments.length, 1);
});

test("the parser never attributes organization, dates, or domain", () => {
  const out = parsePastedExperience("Product Manager\nAcme\n2022-04 to 2024-08\n- Led the redesign");
  assert.deepEqual(Object.keys(out).sort(), ["autoTitleIndex", "segments"]);
});

// --- matchDatePattern: the pinned MONTH-PRECISION grammar (spec §13.1) ---

test("month-precision tokens fill the structured fields", () => {
  assert.deepEqual(matchDatePattern("2022-04"), {
    startDate: "2022-04",
    endDate: null,
    ongoing: false,
  });
  assert.deepEqual(matchDatePattern("2022-04 to 2024-08"), {
    startDate: "2022-04",
    endDate: "2024-08",
    ongoing: false,
  });
  assert.deepEqual(matchDatePattern("2022-04 – 2024-08"), {
    startDate: "2022-04",
    endDate: "2024-08",
    ongoing: false,
  });
  assert.deepEqual(matchDatePattern("2022-04–2024-08"), {
    startDate: "2022-04",
    endDate: "2024-08",
    ongoing: false,
  });
  assert.deepEqual(matchDatePattern("2022-04 - 2024-08"), {
    startDate: "2022-04",
    endDate: "2024-08",
    ongoing: false,
  });
  assert.deepEqual(matchDatePattern("2022-04 — present"), {
    startDate: "2022-04",
    endDate: null,
    ongoing: true,
  });
  assert.deepEqual(matchDatePattern("present"), {
    startDate: null,
    endDate: null,
    ongoing: true,
  });
  assert.deepEqual(matchDatePattern("Present"), {
    startDate: null,
    endDate: null,
    ongoing: true,
  });
});

test("non-month-precision text never invents a month (P1)", () => {
  assert.equal(matchDatePattern("2022"), null);
  assert.equal(matchDatePattern("2022-2024"), null);
  assert.equal(matchDatePattern("April 2022"), null);
  assert.equal(matchDatePattern("2022-13"), null);
  assert.equal(matchDatePattern("2022-4"), null);
  assert.equal(matchDatePattern("since the beginning"), null);
  assert.equal(matchDatePattern(""), null);
});

// --- addEntry: the web cap is removed; structured dates; update-in-place ---

test("the web 1-6 upper cap is REMOVED: 7 bullets are accepted", () => {
  const result = addEntry("job", "PM", ["a", "b", "c", "d", "e", "f", "g"]);
  assert.equal(result.error, null);
  assert.equal(result.entry?.bullets.length, 7);
});

test("structured dates pass through to the stored entry", () => {
  const result = addEntry("job", "PM", ["Did the work"], undefined, {
    company: "Acme",
    start_date: "2022-04",
    end_date: "2024-08",
    ongoing: false,
  });
  assert.equal(result.error, null);
  assert.equal(result.entry?.start_date, "2022-04");
  assert.equal(result.entry?.end_date, "2024-08");
  assert.equal(result.entry?.ongoing, false);
});

test("an existing entry id is REUSED (update-in-place — no duplicate)", () => {
  const updated = addEntry("job", "PM", ["Did the work"], () => 999, {}, 42);
  assert.equal(updated.error, null);
  assert.equal(updated.entry?.id, 42);
});

// --- AddEntryRequestSchema: YYYY-MM only, ongoing boolean, optional id ---

test("AddEntryRequestSchema validates the structured date fields", () => {
  const ok = AddEntryRequestSchema.safeParse({
    type: "job",
    title: "PM",
    bullets: ["x"],
    start_date: "2022-04",
    end_date: "2024-08",
    ongoing: true,
    entry_id: 42,
  });
  assert.equal(ok.success, true);
  for (const bad of ["2022-4", "2022-13", "April 2022", "2022"]) {
    const res = AddEntryRequestSchema.safeParse({
      type: "job",
      title: "PM",
      bullets: ["x"],
      start_date: bad,
    });
    assert.equal(res.success, false, bad);
  }
});
