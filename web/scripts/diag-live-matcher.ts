/**
 * DIAG (T063 loop): run the matcher_analysis gateway call server-side with
 * the EXACT v3 prompts on the reconstructed EX-J001 ad, print the RAW model
 * text and the validator's failed checks. Owner-authorized retest loop.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
// Load the operator env (a standalone tsx process does not get Next env loading).
for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
}
// DIAG-ONLY override (this process's env — .env.local is never touched):
// run the chain bolt-first because lightning-30b is flapping 200<->403 at
// the NVIDIA edge while the smoke showed bolt healthy.
process.env.GEN_MODEL = "nvidia/nemotron-3.5-bolt-e4b";
process.env.GEN_FALLBACKS =
  "nvidia/nemotron-3.5-lightning-30b-a3b,mistralai/mistral-large-4-1t-a52b";
import { cleanPosting } from "../src/engine/matcher2/posting";
import {
  buildMatcherSystemPrompt,
  buildMatcherUserPrompt,
  buildMatcherFewShotBlock,
  selectFewShotExamples,
} from "../src/lib/byok/prompts";
import { taxonomyTableLines } from "../src/engine/matcher2/v2/taxonomy";
import {
  finalFewShotExamples,
  derivePostingFeatures,
} from "../src/engine/matcher2/v2/fewshotIndex";
import { validateMatcherAnalysisV2 } from "../src/engine/matcher2/v2/validate";
import { runGenGateway } from "../src/lib/llm/gateway";

const ex = JSON.parse(
  readFileSync(
    join(process.cwd(), "..", "specs", "002-jd-matcher", "few-shot", "EX-J001.json"),
    "utf8"
  )
) as {
  format_features: { headings: string[] };
  sentences: Array<{ section: string; text: string }>;
};
const H: Record<string, string> = {
  about: "About the Role",
  duties: "Key Responsibilities",
  requirements: "Requirements",
  preferred: "Preferred Qualifications",
  details: "Job Details",
};
const parts: string[] = [];
let cur = "";
for (const s of ex.sentences) {
  if (s.section !== cur) {
    cur = s.section;
    parts.push(H[s.section] ?? s.section);
  }
  parts.push(`- ${s.text}`);
}
const ad = parts.join("\n");
const cleaned = cleanPosting(ad).cleaned_text;

const block = buildMatcherFewShotBlock(
  selectFewShotExamples(finalFewShotExamples(), derivePostingFeatures(cleaned))
);
const system = buildMatcherSystemPrompt(taxonomyTableLines(), block);
const input = buildMatcherUserPrompt(cleaned);

function stripFences(text: string): string {
  return text
    .replace(/^```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

async function oneAttempt(retryChecks?: string[]): Promise<string> {
  const text = retryChecks
    ? `${input}\n\nYour previous answer was rejected. Fix exactly these problems: ${retryChecks.join("; ")} and return the corrected JSON document only.`
    : input;
  let out = "";
  for await (const ev of runGenGateway(
    { task: "matcher_analysis", input: text, system },
    { identity: "diag-live-matcher" }
  )) {
    if (ev.type === "chunk") out += ev.text;
    else if (ev.type === "error") {
      console.log("GATEWAY ERROR:", ev.reason);
      return "";
    } else if (ev.type === "done") {
      console.log("done | model:", ev.modelUsed, "| fallback:", ev.usedFallback, "| ms:", ev.ms);
    }
  }
  return out;
}

async function main() {
  const t1 = await oneAttempt();
  const c1 = stripFences(t1);
  const v1 = validateMatcherAnalysisV2(c1, cleaned);
  if (v1.ok) {
    console.log("ATTEMPT 1 VALID");
    console.log(
      JSON.stringify(
        {
          summary: v1.analysis.summary,
          counts: {
            must: v1.analysis.must.length,
            preferred: v1.analysis.preferred.length,
            bonus: v1.analysis.bonus.length,
            red_flags: v1.analysis.red_flags.length,
          },
          must_names: v1.analysis.must.map(
            (i) =>
              `${i.type}:${i.name}${i.in_taxonomy === false ? " (out-of-taxonomy)" : ""}`
          ),
          preferred_names: v1.analysis.preferred.map((i) => `${i.type}:${i.name}`),
          bonus_names: v1.analysis.bonus.map((i) => `${i.type}:${i.name}`),
        },
        null,
        1
      )
    );
    return;
  }
  console.log(
    "ATTEMPT 1 result:",
    v1.reason === "contract" ? JSON.stringify(v1.failedChecks) : v1.reason
  );
  if (v1.reason === "zero_skills") return;
  console.log("--- retrying once with the check list ---");
  const t2 = await oneAttempt(v1.reason === "contract" ? v1.failedChecks : []);
  const c2 = stripFences(t2);
  const v2 = validateMatcherAnalysisV2(c2, cleaned);
  if (v2.ok) {
    console.log("ATTEMPT 2 VALID");
    console.log(
      JSON.stringify(
        {
          counts: {
            must: v2.analysis.must.length,
            preferred: v2.analysis.preferred.length,
            bonus: v2.analysis.bonus.length,
            red_flags: v2.analysis.red_flags.length,
          },
          must_names: v2.analysis.must.map(
            (i) =>
              `${i.type}:${i.name}${i.in_taxonomy === false ? " (out-of-taxonomy)" : ""}`
          ),
        },
        null,
        1
      )
    );
  } else {
    console.log(
      "ATTEMPT 2 result:",
      v2.reason === "contract" ? JSON.stringify(v2.failedChecks) : v2.reason
    );
  }
  console.log("--- RAW attempt 1 (first 1200 chars) ---");
  console.log(c1.slice(0, 1200));
}
void main();
