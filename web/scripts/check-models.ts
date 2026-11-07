/**
 * Model-ID check (§13 FR-37): `npm run check:models` — fetches the
 * provider's live model list and compares every configured chain ID.
 * Warnings for missing IDs, errors when a category retains no valid model,
 * skip-with-warning when /models is unreachable. Exit code 0 = no errors
 * (warnings/skips included), 1 = errors (or config incomplete).
 * Operator-facing output: English, technical detail allowed (log context).
 */

import { readFileSync } from "node:fs";

// Minimal .env.local loader (no dependencies): fills only unset variables so
// a real environment always wins. Duplicate guard (2026-11-07 incident):
// this loader is FIRST-wins while Next.js is LAST-wins — a duplicated
// variable silently splits the two semantics, so hard-fail instead.
const seen = new Map<string, number>();
try {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (match) {
      seen.set(match[1], (seen.get(match[1]) ?? 0) + 1);
      if (process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  }
} catch {
  // No .env.local — rely on the process environment as given.
}
const duplicated = [...seen.entries()].filter(([, count]) => count > 1);
if (duplicated.length > 0) {
  console.error(
    `check:models FAILED — .env.local defines these variables MORE THAN ONCE: ${duplicated
      .map(([name, count]) => `${name}×${count}`)
      .join(", ")} — keep ONE definition per variable (docs/llm-gateway-runbook.md, "Env file hygiene")`
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const { runValidationReporting } = await import("../src/lib/llm/validate-models");
  const ok = await runValidationReporting();
  if (!ok) {
    console.error("check:models FAILED — see the errors above");
    process.exit(1);
  }
  console.log("check:models OK");
}

void main();
