/**
 * DIAGNOSTIC part 2 — fresh-process Vercel simulation. MUST run in its own
 * process: loadTaxonomy caches after the first successful call, so the
 * missing-file condition has to be created BEFORE any call.
 * Run from web/: npx tsx scripts/diag-002-task1-vercel.ts
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "diag-002-vercel-"));
process.chdir(tmp); // cwd has NO data/ directory — the Vercel lambda shape

(async () => {
  const { loadTaxonomy } = await import("../src/engine/matcher2/softSkills");
  try {
    const t = loadTaxonomy();
    console.log("loadTaxonomy unexpectedly OK — records:", t.length);
  } catch (exc) {
    console.log("REAL underlying error:");
    console.log("  ", exc instanceof Error ? exc.message : String(exc));
    console.log("route.ts:118-122 maps TaxonomyError -> MATCH_ERR_ZERO_SKILLS,");
    console.log('so the user sees: "I couldn\'t extract any skills from this text. Nothing was analyzed."');
  }
  process.chdir(__dirname); // leave the tmp dir before cleanup (EBUSY)
  rmSync(tmp, { recursive: true, force: true });
})();
