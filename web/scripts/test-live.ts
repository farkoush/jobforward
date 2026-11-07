/**
 * §16 FR-59 — `npm run test:live`: a 1-token chat completion to EVERY
 * configured chain model using the real `.env.local`, printing OK/FAIL per
 * model with status and the truncated error body. Exit 1 when any model
 * FAILs. MANUAL operator tool (real key, ~1 token per model) — never part
 * of the automated suites. Loader: LAST-WINS (mirrors Next.js) + duplicate
 * guard.
 */

import { readFileSync } from "node:fs";

const seen = new Map<string, number>();
try {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (match) {
      seen.set(match[1], (seen.get(match[1]) ?? 0) + 1);
      process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
} catch {
  // No .env.local — rely on the process environment as given.
}
const duplicated = [...seen.entries()].filter(([, count]) => count > 1);
if (duplicated.length > 0) {
  console.error(
    `test:live FAILED — .env.local defines these variables MORE THAN ONCE: ${duplicated
      .map(([name, count]) => `${name}×${count}`)
      .join(", ")} — keep ONE definition per variable (docs/llm-gateway-runbook.md, "Env file hygiene")`
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const { runLiveSmoke, printSmokeTable } = await import("./live-smoke");
  const rows = await runLiveSmoke();
  printSmokeTable(rows);
  if (rows.some((row) => !row.ok)) {
    console.error("test:live FAILED — at least one configured model is not servable");
    process.exit(1);
  }
  console.log("test:live OK — every configured model answered");
}

void main();
