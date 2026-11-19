/**
 * Matcher v3 SOFT_TAXONOMY tests (T051, P9 — spec 002 v3, research
 * R13/R15 + plan-approval condition ب): the 56-skill ESCO file with NO
 * soft/trait typing (R2 ARCHIVED), alt_labels exposed for the prompt, and
 * the matchSoftName precedence helper — exact label_en first, single alt
 * adopts, multi-alt = ambiguous (owner-verified cases), none = no match.
 * FAILS until taxonomy.ts implements the v3 shape + matchSoftName.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  SOFT_TAXONOMY,
  TAXONOMY_RECORD_COUNT,
  matchSoftName,
} from "../../../src/engine/matcher2/v2/taxonomy";

const RAW = JSON.parse(
  readFileSync(join(process.cwd(), "data", "soft-skills-taxonomy.json"), "utf8")
) as {
  skills: Array<{ label_en: string; group_code: string; alt_labels_en: string[] }>;
};

test("source file has exactly 56 records with the required keys", () => {
  assert.equal(RAW.skills.length, 56);
  for (const r of RAW.skills) {
    assert.ok(
      r.label_en && r.group_code && Array.isArray(r.alt_labels_en),
      `missing keys in ${JSON.stringify(r)}`
    );
  }
});

test("SOFT_TAXONOMY covers every label_en exactly once — no type field, alt labels exposed", () => {
  assert.equal(SOFT_TAXONOMY.length, TAXONOMY_RECORD_COUNT);
  assert.equal(TAXONOMY_RECORD_COUNT, 56);
  const labels = new Set(SOFT_TAXONOMY.map((s) => s.label_en));
  assert.equal(labels.size, 56, "duplicate taxonomy names");
  for (const raw of RAW.skills) {
    const entry = SOFT_TAXONOMY.find((s) => s.label_en === raw.label_en);
    assert.ok(entry, `label missing from SOFT_TAXONOMY: ${raw.label_en}`);
    assert.equal(entry.group_code, raw.group_code);
    assert.deepEqual(entry.alt_labels_en, raw.alt_labels_en);
    assert.equal(
      (entry as unknown as Record<string, unknown>).type,
      undefined,
      "R2 soft/trait typing must be gone (S9)"
    );
  }
});

test("matchSoftName precedence (1): exact label_en wins even when the name is also another record's alt", () => {
  const commitment = matchSoftName("show commitment");
  assert.equal(committee(commitment), "exact");
  assert.equal(entryLabel(commitment), "show commitment");

  const loyalty = matchSoftName("demonstrate loyalty");
  assert.equal(committee(loyalty), "exact");
  assert.equal(entryLabel(loyalty), "demonstrate loyalty");

  // Case-insensitive + trimmed.
  const trimmed = matchSoftName("  WORK IN TEAMS ");
  assert.equal(committee(trimmed), "exact");
  assert.equal(entryLabel(trimmed), "work in teams");
});

test("matchSoftName precedence (2): a single alt-label match adopts that record", () => {
  const single = matchSoftName("commit information to memory");
  assert.equal(committee(single), "single");
  assert.equal(entryLabel(single), "memorise information");
});

test("matchSoftName precedence (3): a multi-record alt match is AMBIGUOUS with candidates (condition ب)", () => {
  const cases: Array<[string, string[]]> = [
    ["demonstrate commitment", ["meet commitments", "show commitment"]],
    ["demonstrate enthusiasm", ["show commitment", "show determination"]],
    ["guide others", ["advise others", "lead others"]],
  ];
  for (const [name, expected] of cases) {
    const result = matchSoftName(name);
    assert.equal(committee(result), "ambiguous", `${name}: ${JSON.stringify(result)}`);
    if (result.kind === "ambiguous") {
      assert.deepEqual(result.candidates, expected);
    }
  }
});

test("matchSoftName precedence (4): an unknown name matches nothing", () => {
  assert.equal(matchSoftName("excellent communication").kind, "none");
  assert.equal(matchSoftName("stakeholder management").kind, "none");
});

function committee(result: ReturnType<typeof matchSoftName>): string {
  return result.kind;
}

function entryLabel(
  result: ReturnType<typeof matchSoftName>
): string | undefined {
  return result.kind === "exact" || result.kind === "single"
    ? result.entry.label_en
    : undefined;
}
