/**
 * DIAGNOSTIC script — spec 002 Task 1 (owner prompt zcode-prompt-jd-matcher.md,
 * 2026-11-16). READ-ONLY reproduction: no production file is modified.
 * Runs the DEPLOYED (v1 deterministic) matcher pipeline stage by stage on
 * specs/002-jd-matcher/sample-job-ad.txt, then simulates the Vercel runtime
 * condition (data/ missing from the serverless bundle) to expose the real
 * error that the route masks as MATCH_ERR_ZERO_SKILLS.
 *
 * Run: cd web && npx tsx scripts/diag-002-task1.ts
 */

import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanPosting, languageRatio } from "../src/engine/matcher2/posting";
import { looksLikePosting } from "../src/engine/matcher2/hardSkills";
import {
  TaxonomyError,
  loadTaxonomy,
  matchSoftSkills,
} from "../src/engine/matcher2/softSkills";
import { extractHardSkills } from "../src/engine/matcher2/hardSkills";

const AD_PATH = join(process.cwd(), "..", "specs", "002-jd-matcher", "sample-job-ad.txt");

console.log("=== STAGE 0: input gates (deterministic, unchanged) ===");
const raw = readFileSync(AD_PATH, "utf-8");
const cleaned = cleanPosting(raw);
console.log("words:", cleaned.word_count);
console.log("language_ok:", cleaned.language_ok, "| arabic ratio:", languageRatio(cleaned.cleaned_text).toFixed(4));
console.log("looksLikePosting:", looksLikePosting(cleaned.cleaned_text));
console.log("cleaning counts: script=%d style=%d tags=%d", cleaned.script_blocks_removed, cleaned.style_blocks_removed, cleaned.html_tags_removed);

console.log("\n=== STAGE 1: taxonomy load (LOCAL cwd=web — file present) ===");
let taxonomy;
try {
  taxonomy = loadTaxonomy();
  console.log("loadTaxonomy OK — records:", taxonomy.length);
} catch (exc) {
  console.log("loadTaxonomy FAILED:", exc instanceof Error ? exc.message : exc);
}

console.log("\n=== STAGE 2: hard pass ===");
let hardRows: unknown[] = [];
let dropped = 0;
if (taxonomy) {
  const [rows, dropCount] = extractHardSkills(cleaned.cleaned_text);
  hardRows = rows;
  dropped = dropCount;
  console.log("hard rows:", hardRows.length, "| dropped:", dropped);
  for (const r of (hardRows as Array<{ name: string; type: string; priority: string }>).slice(0, 8)) {
    console.log("  hard:", r.name, "|", r.type, "|", r.priority);
  }
}

console.log("\n=== STAGE 3: soft pass ===");
if (taxonomy) {
  const [softRows, unmatched] = matchSoftSkills(cleaned.cleaned_text, taxonomy);
  console.log("soft rows:", softRows.length, "| unmatched:", unmatched.length);
  for (const r of (softRows as Array<{ label_en: string; certainty: string; priority: string }>).slice(0, 8)) {
    console.log("  soft:", r.label_en, "|", r.certainty, "|", r.priority);
  }
  const total = hardRows.length + softRows.length;
  console.log("TOTAL skills (v1 deterministic, local):", total);
  console.log(total === 0 ? ">>> LOCAL REPRODUCES ZERO SKILLS" : ">>> LOCAL pipeline is healthy — the loss is NOT in extraction");
}

console.log("\n=== STAGE 4: Vercel simulation (data/ absent from the lambda bundle) ===");
const tmp = mkdtempSync(join(tmpdir(), "diag-002-"));
const prevCwd = process.cwd();
try {
  process.chdir(tmp); // cwd has NO data/ directory — the Vercel runtime shape
  try {
    loadTaxonomy();
    console.log("loadTaxonomy unexpectedly OK");
  } catch (exc) {
    const real = exc instanceof Error ? exc.message : String(exc);
    console.log("REAL error:", real);
    console.log(
      "route.ts:118 maps TaxonomyError -> MATCH_ERR_ZERO_SKILLS => user sees: \"I couldn't extract any skills from this text. Nothing was analyzed.\""
    );
  }
} finally {
  process.chdir(prevCwd);
  rmSync(tmp, { recursive: true, force: true });
}

console.log("\n=== STAGE 5: v2 check (current tree — NOT deployed, uncommitted) ===");
const gates = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { runMatcherInputGates } = require("../src/engine/matcher2/v2/inputGates");
    return runMatcherInputGates(raw);
  } catch (exc) {
    return { ok: false, note: String(exc) };
  }
})();
console.log("v2 input gates pass:", gates.ok === true);
console.log("v2 status in git: UNCOMMITTED -> the Vercel deploy runs the v1 /api/matcher route");
