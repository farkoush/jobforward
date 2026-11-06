/**
 * Dev-only rate-limit probe (§14 FR-44, report-only — NOT part of the
 * automated tests): determines whether the provider's ~40 rpm cap is
 * PER-MODEL or SHARED across models, by interleaving tiny calls between two
 * models and watching where 429s begin. Slow by design (delays between
 * calls); output is a report only.
 *
 * Run: npm run probe:rate-limit
 */

import { readFileSync } from "node:fs";

try {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
} catch {
  // No .env.local — rely on the process environment.
}

async function main(): Promise<void> {
  const { getLlmConfig } = await import("../src/lib/llm/config");
  const cfg = getLlmConfig();
  const modelA = cfg.FAST_MODEL;
  const modelB = cfg.FAST_FALLBACKS[0];
  if (!modelA || !modelB) {
    console.error("probe needs FAST_MODEL and at least one FAST_FALLBACKS entry");
    process.exit(1);
  }

  console.log(
    `probing rate-limit scope: A=${modelA} B=${modelB} — ${cfg.PROVIDER_RPM_LIMIT} gateway-limit is NOT applied here (raw provider behavior)\n`
  );

  async function tinyCall(model: string): Promise<{ status: number; ms: number }> {
    const started = Date.now();
    const res = await fetch(`${cfg.NVIDIA_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.NVIDIA_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "ok?" }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(12_000),
    });
    await res.text();
    return { status: res.status, ms: Date.now() - started };
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const ROUNDS = 25;
  const DELAY_MS = 400; // ~2.4 calls/s per model — under a 40 rpm single-model cap

  let a429 = 0;
  let b429 = 0;
  let b429WhileAOky = 0;
  const timeline: string[] = [];

  for (let round = 1; round <= ROUNDS; round++) {
    const a = await tinyCall(modelA);
    if (a.status === 429) a429 += 1;
    await sleep(DELAY_MS);
    const b = await tinyCall(modelB);
    if (b.status === 429) {
      b429 += 1;
      if (a.status !== 429) b429WhileAOky += 1;
    }
    timeline.push(`r${round}: A=${a.status} B=${b.status}`);
    await sleep(DELAY_MS);
  }

  console.log(timeline.join("\n"));
  console.log("\n=== report ===");
  console.log(`A 429s: ${a429}/${ROUNDS} | B 429s: ${b429}/${ROUNDS} | B 429 while A ok: ${b429WhileAOky}`);
  if (b429WhileAOky > 0) {
    console.log(
      "verdict: B hit 429 while A was fine → the cap looks SHARED across models (one pool)."
    );
  } else if (a429 === 0 && b429 === 0) {
    console.log(
      "verdict: no 429s observed — raise ROUNDS/DELAY_MS or the models are below the cap; inconclusive."
    );
  } else {
    console.log(
      "verdict: 429s occurred on both models around the same call count → looks per-model, or the shared pool was exhausted overall; compare the call counts at first 429."
    );
  }
}

void main();
