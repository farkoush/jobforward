/**
 * Connection diagnostic (§15 FR-46, owner tool): `npm run check:connection`
 * — measures the ACTUAL provider round-trip from this machine and validates
 * the effective chain IDs against the live list. Uses a LAST-WINS .env.local
 * loader (mirrors Next.js env semantics — the dev server takes the LAST
 * occurrence of a variable, unlike check:models' first-wins loader).
 * Operator-facing output: English, technical detail allowed (log context).
 */

import { readFileSync } from "node:fs";

// Duplicate guard (2026-11-07 incident): a duplicated variable silently
// changes which value wins (Next.js takes the LAST) — hard-fail with the
// offending names instead of measuring the wrong configuration.
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
    `check:connection FAILED — .env.local defines these variables MORE THAN ONCE (Next.js takes the LAST occurrence): ${duplicated
      .map(([name, count]) => `${name}×${count}`)
      .join(", ")} — keep ONE definition per variable (docs/llm-gateway-runbook.md, "Env file hygiene")`
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const base = process.env.NVIDIA_BASE_URL;
  const key = process.env.NVIDIA_API_KEY;
  if (!base || !key) {
    console.error(
      "check:connection FAILED — NVIDIA_BASE_URL / NVIDIA_API_KEY not set"
    );
    process.exit(1);
  }
  const started = Date.now();
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    });
    const elapsed = Date.now() - started;
    if (!response.ok) {
      console.error(
        `check:connection FAILED — GET /models returned ${response.status} after ${elapsed} ms`
      );
      process.exit(1);
    }
    const body = (await response.json()) as { data?: Array<{ id?: string }> };
    const ids = (body.data ?? []).map((x) => x.id ?? "").filter(Boolean);
    console.log(
      `check:connection OK — GET /models ${response.status} in ${elapsed} ms (${ids.length} models listed)`
    );
    if (elapsed > 8000) {
      console.warn(
        "check:connection SLOW — over 8 s; expect a long Checking… state (network/proxy?)"
      );
    }
    let servable = true;
    for (const [name, value] of [
      ["GEN_MODEL", process.env.GEN_MODEL],
      ["FAST_MODEL", process.env.FAST_MODEL],
    ] as const) {
      if (!value) continue;
      const inList = ids.includes(value);
      if (!inList) servable = false;
      console.log(
        `  ${name} "${value}": ${inList ? "in the provider list" : "NOT in the provider list — it will be pruned (P20)"}`
      );
    }
    if (!servable) {
      console.error(
        "check:connection VERDICT: the effective chain is NOT servable — fix the model IDs in .env.local (remember: Next.js takes the LAST occurrence of a variable)"
      );
      process.exit(1);
    }
    // §16 FR-60: the per-model 1-token live smoke — list membership is not
    // servability; this answers "is EVERY configured model actually usable?"
    const { runLiveSmoke, printSmokeTable } = await import("./live-smoke");
    const rows = await runLiveSmoke();
    printSmokeTable(rows);
    if (rows.some((row) => !row.ok)) {
      console.error("check:connection VERDICT: at least one configured model FAILED the live smoke");
      process.exit(1);
    }
  } catch (exc) {
    const elapsed = Date.now() - started;
    console.error(
      `check:connection FAILED — provider unreachable after ${elapsed} ms: ${
        exc instanceof Error ? exc.message : exc
      }`
    );
    process.exit(1);
  }
}

void main();
