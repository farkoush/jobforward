/**
 * Parity harness (TS side): compute the same results as parity_python.py
 * with the ported TS engine and diff them field by field.
 */

import { spawnSync } from "node:child_process";
import { cleanPosting, languageRatio } from "../src/engine/matcher2/posting";
import { extractHardSkills, looksLikePosting } from "../src/engine/matcher2/hardSkills";
import { loadTaxonomy, matchSoftSkills } from "../src/engine/matcher2/softSkills";
import { buildReport } from "../src/engine/matcher2/report";
import { buildCoverage, extractParts } from "../src/engine/flow/parts";
import { localEvaluate } from "../src/engine/scoring/local";
import { DEFAULT_RUBRIC_VERSION } from "../src/engine/types";
import { assembleRewrite } from "../src/engine/flow/rewrite";
import { findOverlaps } from "../src/engine/scoring/overlap";
import { entryScoreFromRatings } from "../src/engine/scoring/metrics";

const POSTING = `Senior Product Manager - Growth

We are looking for a product manager to join our growth team.

Responsibilities:
- Own the onboarding funnel and improve conversion
- Must have 3+ years of experience in product management
- Run A/B tests and analyze the results
- Manage stakeholders across teams

Requirements:
- Experience with SQL and dashboards
- Strong communication skills
- Bonus: familiarity with Figma

Preferred Qualifications:
- Experience in a startup environment
- Ideally you have led a growth team before
`;

const BULLETS = [
  "Built a dashboard",
  "Improved performance of the app",
  "Led redesign of the onboarding funnel which resulted in 20% more signups",
  "Worked on user research because users were confused by the checkout",
  "Learned how data analysis works",
  "Grew conversion from 2% to 5% in 3 months by redesigning the pricing page",
];

const ANSWERS: Record<string, string> = {
  context: "users could not finish checkout",
  result: "more users finished checkout",
};

function fail(message: string) {
  console.error("FAIL:", message);
  process.exitCode = 1;
}

const py = spawnSync("python", ["scripts/parity_python.py"], {
  encoding: "utf-8",
  cwd: new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
  maxBuffer: 10 * 1024 * 1024,
  shell: true,
});
if (py.status !== 0) {
  console.error(py.stdout, py.stderr);
  throw new Error("python harness failed");
}
const expected = JSON.parse(py.stdout);
// Phase 16 (spec §12): optional-skip — without the terminal edition the
// gate reports the skip and exits 0; the web gates never fail because of it.
if (expected.parity === "skipped") {
  console.log("PARITY SKIPPED — terminal engine not present");
  process.exit(0);
}

// --- cleaning ---
const cleaned = cleanPosting(POSTING);
const cleaning = {
  cleaned_text: cleaned.cleaned_text,
  script_blocks_removed: cleaned.script_blocks_removed,
  style_blocks_removed: cleaned.style_blocks_removed,
  html_tags_removed: cleaned.html_tags_removed,
  word_count: cleaned.word_count,
  language_ok: cleaned.language_ok,
  ratio: languageRatio(cleaned.cleaned_text),
};
for (const key of Object.keys(cleaning) as Array<keyof typeof cleaning>) {
  if (JSON.stringify(cleaning[key]) !== JSON.stringify(expected.cleaning[key])) {
    fail(`cleaning.${key}: ts=${JSON.stringify(cleaning[key])} py=${JSON.stringify(expected.cleaning[key])}`);
  }
}

// --- looks_like_posting ---
if (looksLikePosting(cleaned.cleaned_text) !== expected.looks_like_posting) {
  fail("looks_like_posting mismatch");
}
if (looksLikePosting("Hello there friend. How are you today. I like cheese.") !== expected.looks_like_plain_text) {
  fail("looks_like_plain_text mismatch");
}

// --- hard skills ---
const taxonomy = loadTaxonomy();
const [hardRows, dropped] = extractHardSkills(cleaned.cleaned_text);
if (JSON.stringify(hardRows) !== JSON.stringify(expected.hard_rows)) {
  fail(
    `hard_rows mismatch:\n ts=${JSON.stringify(hardRows, null, 1)}\n py=${JSON.stringify(expected.hard_rows, null, 1)}`
  );
}
if (dropped !== expected.dropped) fail(`dropped: ts=${dropped} py=${expected.dropped}`);

// --- soft skills ---
const [softRows, unmatched] = matchSoftSkills(cleaned.cleaned_text, taxonomy);
if (JSON.stringify(softRows) !== JSON.stringify(expected.soft_rows)) {
  fail(
    `soft_rows mismatch:\n ts=${JSON.stringify(softRows, null, 1)}\n py=${JSON.stringify(expected.soft_rows, null, 1)}`
  );
}
if (JSON.stringify(unmatched) !== JSON.stringify(expected.unmatched)) {
  fail(`unmatched mismatch:\n ts=${JSON.stringify(unmatched)}\n py=${JSON.stringify(expected.unmatched)}`);
}
const report = buildReport(hardRows, softRows, unmatched, dropped);
if (JSON.stringify(report.hard_totals) !== JSON.stringify(expected.hard_totals)) {
  fail(`hard_totals: ts=${JSON.stringify(report.hard_totals)} py=${JSON.stringify(expected.hard_totals)}`);
}
if (report.soft_total !== expected.soft_total) fail("soft_total mismatch");
if (report.consistency_ok !== expected.consistency_ok) fail("consistency_ok mismatch");

// --- parts ---
const parts = BULLETS.map((b) => extractParts(b));
if (JSON.stringify(parts) !== JSON.stringify(expected.parts)) {
  fail(
    `parts mismatch:\n ts=${JSON.stringify(parts, null, 1)}\n py=${JSON.stringify(expected.parts, null, 1)}`
  );
}

// --- local ratings ---
const ratings = localEvaluate({ texts: BULLETS, parts, rubric_version: DEFAULT_RUBRIC_VERSION });
if (JSON.stringify(ratings.map(({ quotes: _q, ...rest }) => rest)) !== JSON.stringify(expected.ratings)) {
  fail(
    `ratings mismatch:\n ts=${JSON.stringify(ratings)}\n py=${JSON.stringify(expected.ratings)}`
  );
}
// §14.1 (amendment 2026-11-08): the deterministic adapter's quotes are its
// extraction results — the echo must match the Python engine exactly.
const quotesOf = (rs: { quotes?: unknown }[]) =>
  rs.map((r) => (r.quotes ?? null));
if (JSON.stringify(quotesOf(ratings)) !== JSON.stringify(expected.quotes)) {
  fail(
    `quotes mismatch:\n ts=${JSON.stringify(quotesOf(ratings), null, 1)}\n py=${JSON.stringify(expected.quotes, null, 1)}`
  );
}

// --- rewrite assembly ---
const rewrite = assembleRewrite(BULLETS[3], ANSWERS as never);
if (rewrite !== expected.rewrite) {
  fail(`rewrite mismatch:\n ts=${JSON.stringify(rewrite)}\n py=${JSON.stringify(expected.rewrite)}`);
}
let extraClaimsError = false;
try {
  assembleRewrite(BULLETS[3], { result: "clicks doubled 3x" } as never);
} catch {
  extraClaimsError = true;
}
if (extraClaimsError !== expected.extra_claims_error) fail("extra_claims_error mismatch");

// --- overlaps ---
const overlaps = findOverlaps(BULLETS);
if (JSON.stringify(overlaps) !== JSON.stringify(expected.overlaps)) {
  fail(`overlaps: ts=${JSON.stringify(overlaps)} py=${JSON.stringify(expected.overlaps)}`);
}

// --- reference fixture (PRD example: 250/3) ---
const fixture = entryScoreFromRatings([
  { context: 2, role_action_clarity: 2, result: 2 },
  { context: 1, role_action_clarity: 2, result: 1 },
]);
if (Math.abs(fixture - expected.entry_score_fixture) > 1e-9) {
  fail(`entry_score_fixture: ts=${fixture} py=${expected.entry_score_fixture}`);
}

// --- edge cases ---
const POSTING2 = `<html><head><style>.x{color:red}</style></head>
<body><script>var evil = 1;</script><p>Analytics Engineer</p>
<p>We use data tools every day. The team enjoys hard problems. Everyone helps.</p>
<ul><li>Knowledge of SQL is required</li>
<li>Experience with Python, Power BI, Metabase, or Grafana</li>
<li>Experience with dbt</li>
<li>Minimum 5 years of experience in analytics</li>
<li>Communication skills are a plus</li></ul>
<p>رشد و توسعه محصولات</p>
</body></html>
`;

const UNSTRUCTURED = `Growth PM needed for our fintech app.
Must own the activation funnel.
Required: 2 years of product experience.
Nice to have: SQL knowledge.
`;

const EDGE_BULLETS = [
  "20% growth",
  "I built a checkout page so that users could pay faster",
  "Ran the beta program; the team of 3 shipped 12 user interviews",
  "Owned pricing",
  "Benchmarked 7 local and international competitors and mapped Upwork " +
    "and Freelancer user journeys to uncover friction in hiring and " +
    "project-assignment flows.",
  "Researched why new hires quit within their first year",
  "I built the export button to reduce churn",
    "Hiring teams had no clear view of competitor strengths, so I redesigned the hiring and project-assignment flows, and users no longer face friction in hiring and project-assignment flows by 35%.",
  "Benchmarked 7 competitors and mapped Upwork journeys to \nuncover friction in hiring flows.",
  "I rebuilt the pricing page, and the rollout finished in two weeks",
];

const cleaned2 = cleanPosting(POSTING2);
const cleaning2 = {
  cleaned_text: cleaned2.cleaned_text,
  script_blocks_removed: cleaned2.script_blocks_removed,
  style_blocks_removed: cleaned2.style_blocks_removed,
  html_tags_removed: cleaned2.html_tags_removed,
  word_count: cleaned2.word_count,
  language_ok: cleaned2.language_ok,
};
if (JSON.stringify(cleaning2) !== JSON.stringify(expected.cleaning2)) {
  fail(
    `cleaning2 mismatch:\n ts=${JSON.stringify(cleaning2, null, 1)}\n py=${JSON.stringify(expected.cleaning2, null, 1)}`
  );
}
const [hard2, dropped2] = extractHardSkills(cleaned2.cleaned_text);
const [soft2, unmatched2] = matchSoftSkills(cleaned2.cleaned_text, loadTaxonomy());
if (JSON.stringify(hard2) !== JSON.stringify(expected.hard2)) {
  fail(`hard2 mismatch:\n ts=${JSON.stringify(hard2, null, 1)}\n py=${JSON.stringify(expected.hard2, null, 1)}`);
}
if (dropped2 !== expected.dropped2) fail(`dropped2: ts=${dropped2} py=${expected.dropped2}`);
if (JSON.stringify(soft2) !== JSON.stringify(expected.soft2)) {
  fail(`soft2 mismatch:\n ts=${JSON.stringify(soft2, null, 1)}\n py=${JSON.stringify(expected.soft2, null, 1)}`);
}
if (JSON.stringify(unmatched2) !== JSON.stringify(expected.unmatched2)) {
  fail(`unmatched2 mismatch:\n ts=${JSON.stringify(unmatched2)}\n py=${JSON.stringify(expected.unmatched2)}`);
}

const cleanedU = cleanPosting(UNSTRUCTURED);
const [hardU] = extractHardSkills(cleanedU.cleaned_text);
if (JSON.stringify(hardU) !== JSON.stringify(expected.hard_u)) {
  fail(`hard_u mismatch:\n ts=${JSON.stringify(hardU, null, 1)}\n py=${JSON.stringify(expected.hard_u, null, 1)}`);
}

const partsEdge = EDGE_BULLETS.map((b) => extractParts(b));
if (JSON.stringify(partsEdge) !== JSON.stringify(expected.parts_edge)) {
  fail(
    `parts_edge mismatch:\n ts=${JSON.stringify(partsEdge, null, 1)}\n py=${JSON.stringify(expected.parts_edge, null, 1)}`
  );
}
const ratingsEdge = localEvaluate({ texts: EDGE_BULLETS, parts: partsEdge, rubric_version: DEFAULT_RUBRIC_VERSION });
if (JSON.stringify(ratingsEdge.map(({ quotes: _q, ...rest }) => rest)) !== JSON.stringify(expected.ratings_edge)) {
  fail(
    `ratings_edge mismatch:\n ts=${JSON.stringify(ratingsEdge)}\n py=${JSON.stringify(expected.ratings_edge)}`
  );
}
if (JSON.stringify(quotesOf(ratingsEdge)) !== JSON.stringify(expected.quotes_edge)) {
  fail(
    `quotes_edge mismatch:\n ts=${JSON.stringify(quotesOf(ratingsEdge), null, 1)}\n py=${JSON.stringify(expected.quotes_edge, null, 1)}`
  );
}

// --- Phase 12 coverage record (spec §2.2): the TS twin must match the
// Python engine exactly — entries, order, quotations, statuses, reasons. ---
const coverageEdge = EDGE_BULLETS.map((b, i) =>
  buildCoverage(b, partsEdge[i], ratingsEdge[i])
);
if (JSON.stringify(coverageEdge) !== JSON.stringify(expected.coverage_edge)) {
  fail(
    `coverage_edge mismatch:\n ts=${JSON.stringify(coverageEdge, null, 1)}\n py=${JSON.stringify(expected.coverage_edge, null, 1)}`
  );
}

const rewrite2 = assembleRewrite(
  "Built a dashboard",
  { context: "candidates dropped off", action: "rebuilt the form" } as never
);
if (rewrite2 !== expected.rewrite2) {
  fail(`rewrite2 mismatch:\n ts=${JSON.stringify(rewrite2)}\n py=${JSON.stringify(expected.rewrite2)}`);
}

if (process.exitCode !== 1) console.log("PARITY OK — TS port matches the Python engine on all checked outputs");
