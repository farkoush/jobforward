/**
 * Matcher v3 validator tests (T055, P9 — spec 002 v3, data-model
 * invariants V1–V9 + contract §4). The fixtures double as the regression
 * fixtures of quickstart scenario 8 (T043): hand-written valid/invalid v3
 * JSON documents checked against the validator — the web flow has NO
 * byte-goldens (FR-022 superseded on web). Covers the condition-ب V5
 * precedence and the condition-ج V9 normalization bound.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  orderBucketForDisplay,
  validateMatcherAnalysisV2,
} from "../../../src/engine/matcher2/v2/validate";
import { MATCHER_RULES_V2 } from "../../../src/engine/matcher2/v2/rulesVersion";
import {
  POSTING_A,
  POSTING_B,
  validDocA,
  validDocB,
  invalidDocB,
  stakeholderManagementDoc,
  fabricatedLeadershipDoc,
  withPatch,
} from "./fixtures";

function contractChecks(input: unknown, posting = POSTING_A): string[] {
  const result = validateMatcherAnalysisV2(input, posting);
  assert.equal(result.ok, false, `expected contract failure, got ${JSON.stringify(result)}`);
  if (result.ok || result.reason !== "contract") {
    assert.fail(`expected reason "contract", got ${JSON.stringify(result)}`);
  }
  return result.ok === false && result.reason === "contract" ? result.failedChecks : [];
}

test("valid document passes and is stamped with the rules version", () => {
  const result = validateMatcherAnalysisV2(validDocA(), POSTING_A);
  assert.equal(result.ok, true, JSON.stringify(result));
  if (result.ok) {
    assert.equal(result.analysis.rules_version, MATCHER_RULES_V2);
    assert.equal(result.analysis.rules_version, "matcher-rules-2.1.0");
    assert.equal(result.analysis.summary.role_nature, "managerial");
  }
});

test("V1 — every evidence sentence must appear verbatim (whitespace-normalized)", () => {
  const checks = contractChecks(
    withPatch(validDocA(), (d) => {
      (d.must as Array<{ evidence: string[] }>)[0].evidence = [
        "Experience with Postgres is required.",
      ];
    })
  );
  assert.ok(
    checks.some((c) => c.includes("must[0].evidence")),
    `no V1 check in ${JSON.stringify(checks)}`
  );
});

test("V1 — evidence must have at least one sentence; red-flag evidence is checked too", () => {
  const checks = contractChecks(
    withPatch(validDocA(), (d) => {
      (d.preferred as Array<{ evidence: string[] }>)[0].evidence = [];
    })
  );
  assert.ok(checks.some((c) => c.includes("preferred[0].evidence")));

  const red = contractChecks(
    withPatch(validDocA(), (d) => {
      (d.red_flags as Array<{ evidence: string[] }>)[0].evidence = [
        "Nobody said anything about energy.",
      ];
    })
  );
  assert.ok(red.some((c) => c.includes("red_flags[0].evidence")));
});

test("V2 — a name may not appear in two buckets or with two types", () => {
  const buckets = contractChecks(
    withPatch(validDocA(), (d) => {
      (d.bonus as Array<{ name: string }>)[0].name = "work in teams";
    })
  );
  assert.ok(buckets.some((c) => c.includes("two buckets") && c.includes("work in teams")));

  const types = contractChecks(
    withPatch(validDocA(), (d) => {
      (d.must as Array<{ name: string }>)[1].name = "SQL";
    })
  );
  assert.ok(types.some((c) => c.includes("two types") && c.includes("SQL")));
});

test("V3 — a soft item in must requires high confidence (no trait anywhere)", () => {
  const checks = contractChecks(
    withPatch(validDocA(), (d) => {
      (d.must as Array<{ confidence: string }>)[1].confidence = "medium";
    })
  );
  assert.ok(checks.some((c) => c.includes("must[1]")));
});

test("V4 — field rules incl. in_taxonomy/ad_wording (v3)", () => {
  const cat = contractChecks(
    withPatch(validDocA(), (d) => {
      (d.preferred as Array<{ category: string | null }>)[0].category = "tool";
    })
  );
  assert.ok(cat.some((c) => c.includes("preferred[0].category")));

  const conf = contractChecks(
    withPatch(validDocA(), (d) => {
      (d.must as Array<{ confidence: string | null }>)[0].confidence = "high";
    })
  );
  assert.ok(conf.some((c) => c.includes("must[0].confidence")));

  const src = contractChecks(
    withPatch(validDocA(), (d) => {
      (d.must as Array<{ source: string }>)[0].source = "implied";
    })
  );
  assert.ok(src.some((c) => c.includes("must[0].source")));

  const inTax = contractChecks(
    withPatch(validDocA(), (d) => {
      (d.must as Array<{ in_taxonomy: boolean | null }>)[0].in_taxonomy = true;
    })
  );
  assert.ok(inTax.some((c) => c.includes("must[0].in_taxonomy")));

  const adw = contractChecks(
    withPatch(validDocA(), (d) => {
      (d.preferred as Array<{ ad_wording: string | null }>)[0].ad_wording =
        "We offer a collaborative environment.";
    })
  );
  assert.ok(adw.some((c) => c.includes("preferred[0].ad_wording")));
});

test("V5 precedence (1) — exact label_en wins and canonicalizes (condition ب)", () => {
  const fixed = withPatch(validDocA(), (d) => {
    (d.preferred as Array<{ name: string; in_taxonomy: boolean | null }>)[0].name =
      "Build Networks";
  });
  const result = validateMatcherAnalysisV2(fixed, POSTING_A);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.analysis.preferred[0].name, "build networks");
    assert.equal(result.analysis.preferred[0].in_taxonomy, true);
  }

  // "show commitment" is ALSO an alt of "meet commitments" — the exact
  // label_en match wins (no ambiguity).
  const showCommitment = withPatch(validDocA(), (d) => {
    (d.preferred as Array<Record<string, unknown>>)[0] = {
      type: "soft",
      name: "show commitment",
      category: null,
      evidence: ["We offer a collaborative environment."],
      source: "implied",
      confidence: "medium",
      in_taxonomy: true,
      ad_wording: null,
    };
  });
  const sc = validateMatcherAnalysisV2(showCommitment, POSTING_A);
  assert.equal(sc.ok, true);
});

test("V5 precedence (3) — a multi-record alt match is reported ambiguous with candidates", () => {
  for (const [name, candidate] of [
    ["demonstrate commitment", "meet commitments"],
    ["demonstrate enthusiasm", "show determination"],
    ["guide others", "lead others"],
  ] as const) {
    const checks = contractChecks(
      withPatch(validDocA(), (d) => {
        (d.preferred as Array<Record<string, unknown>>)[0] = {
          type: "soft",
          name,
          category: null,
          evidence: ["We offer a collaborative environment."],
          source: "implied",
          confidence: "medium",
          in_taxonomy: true,
          ad_wording: null,
        };
      })
    );
    assert.ok(
      checks.some((c) => c.includes("ambiguous") && c.includes(candidate)),
      `${name}: ${JSON.stringify(checks)}`
    );
  }
});

test("V5 precedence (4) — taxonomy match forces in_taxonomy true", () => {
  const checks = contractChecks(
    withPatch(validDocA(), (d) => {
      (d.preferred as Array<{ in_taxonomy: boolean | null }>)[0].in_taxonomy =
        false;
    })
  );
  assert.ok(checks.some((c) => c.includes("preferred[0].in_taxonomy")));
});

test("V9 — accepts stakeholder management (subject in witness + closed list + ad_wording verbatim)", () => {
  const result = validateMatcherAnalysisV2(stakeholderManagementDoc(), POSTING_A);
  assert.equal(result.ok, true, JSON.stringify(result));
  if (result.ok) {
    const row = result.analysis.must.find((i) => i.name === "stakeholder management");
    assert.ok(row);
    assert.equal(row.in_taxonomy, false);
    assert.equal(row.ad_wording, "Must have strong stakeholder management skills.");
  }
});

test("V9 — rejects the fabricated leadership skill (condition ج: absent concept)", () => {
  const checks = contractChecks(fabricatedLeadershipDoc());
  assert.ok(
    checks.some((c) => c.includes("leadership") && c.includes("witness")),
    JSON.stringify(checks)
  );
});

test("V9 — ad_wording must be present and verbatim in an evidence sentence", () => {
  const missing = contractChecks(
    withPatch(stakeholderManagementDoc(), (d) => {
      const rows = d.must as Array<Record<string, unknown>>;
      (rows[2] as { ad_wording: string | null }).ad_wording = null;
    })
  );
  assert.ok(missing.some((c) => c.includes("ad_wording")));

  const notVerbatim = contractChecks(
    withPatch(stakeholderManagementDoc(), (d) => {
      const rows = d.must as Array<Record<string, unknown>>;
      (rows[2] as { ad_wording: string }).ad_wording =
        "negotiation skills with different stakeholders";
    })
  );
  assert.ok(notVerbatim.some((c) => c.includes("ad_wording")));
});

test("V9 — an implied out-of-taxonomy soft skill is invalid (the model must drop it)", () => {
  const checks = contractChecks(
    withPatch(stakeholderManagementDoc(), (d) => {
      const rows = d.must as Array<Record<string, unknown>>;
      (rows[2] as { source: string }).source = "implied";
    })
  );
  assert.ok(
    checks.some((c) => c.includes("must[2]") && c.includes("explicit")),
    JSON.stringify(checks)
  );
});

test("V7 — summary fields must be present and non-empty", () => {
  const checks = contractChecks(
    withPatch(validDocA(), (d) => {
      (d.summary as { problem_solved: string }).problem_solved = "";
    })
  );
  assert.ok(checks.some((c) => c.includes("summary.problem_solved")));
});

test("V8 — all buckets empty is the zero-skills outcome, not a contract failure", () => {
  const empty = withPatch(validDocA(), (d) => {
    d.must = [];
    d.preferred = [];
    d.bonus = [];
  });
  const result = validateMatcherAnalysisV2(empty, POSTING_A);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "zero_skills");
});

test("parse failure and shape failure count as failed checks (contract §4)", () => {
  const parse = validateMatcherAnalysisV2("this is not json", POSTING_A);
  assert.equal(parse.ok, false);
  if (!parse.ok && parse.reason === "contract") {
    assert.ok(parse.failedChecks.some((c) => c.toLowerCase().includes("json")));
  } else {
    assert.fail("expected contract failure for non-JSON input");
  }

  const shape = contractChecks({ summary: {}, must: "no" });
  assert.ok(shape.length > 0);
});

test("T043 — posting B: valid fixture passes; invalid fixture fails naming must[1]", () => {
  const good = validateMatcherAnalysisV2(validDocB(), POSTING_B);
  assert.equal(good.ok, true, JSON.stringify(good));
  if (good.ok) assert.equal(good.analysis.summary.role_nature, "analytical");

  const bad = validateMatcherAnalysisV2(invalidDocB(), POSTING_B);
  assert.equal(bad.ok, false);
  if (!bad.ok && bad.reason === "contract") {
    assert.ok(bad.failedChecks.some((c) => c.includes("must[1]")));
    assert.ok(bad.failedChecks.some((c) => c.includes("ad_wording")));
  } else {
    assert.fail("expected contract failure for the invalid B fixture");
  }
});

test("orderBucketForDisplay — hard before soft, explicit before implied, stable otherwise", () => {
  const items = [
    { type: "soft", source: "implied", name: "build networks", category: null, evidence: ["We offer a collaborative environment."], confidence: "medium", in_taxonomy: true, ad_wording: null },
    { type: "hard", source: "explicit", name: "data visualization", category: "tool", evidence: ["Familiarity with data visualization tools is a plus."], confidence: null, in_taxonomy: null, ad_wording: null },
  ] as unknown as Parameters<typeof orderBucketForDisplay>[0];
  const ordered = orderBucketForDisplay(items);
  assert.equal(ordered[0].name, "data visualization");
  assert.equal(ordered[1].name, "build networks");

  const twoSoft = [
    { type: "soft", source: "implied", name: "build networks", category: null, evidence: ["We offer a collaborative environment."], confidence: "medium", in_taxonomy: true, ad_wording: null },
    { type: "soft", source: "explicit", name: "work in teams", category: null, evidence: ["You will lead the payments team and work closely with design and engineering."], confidence: "high", in_taxonomy: true, ad_wording: null },
  ] as unknown as Parameters<typeof orderBucketForDisplay>[0];
  const orderedSoft = orderBucketForDisplay(twoSoft);
  assert.equal(orderedSoft[0].name, "work in teams");
  assert.equal(orderedSoft[1].name, "build networks");
});
