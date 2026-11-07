/**
 * §16 FR-59/60 — shared live smoke: ONE 1-token chat completion per
 * configured chain model with the REAL environment. Manual operator tool
 * (consumes ~1 token per model); never part of the automated suites.
 */

import { completeOnce } from "../src/lib/llm/client";
import { getLlmConfig } from "../src/lib/llm/config";

export interface SmokeRow {
  model: string;
  ok: boolean;
  status?: number;
  cls?: string;
  body?: string;
}

/** Ping every configured model once (GEN + FAST chains, in order). */
export async function runLiveSmoke(): Promise<SmokeRow[]> {
  const cfg = getLlmConfig();
  const models = [...new Set([...cfg.genChain, ...cfg.fastChain])];
  const rows: SmokeRow[] = [];
  for (const model of models) {
    const outcome = await completeOnce({
      baseUrl: cfg.NVIDIA_BASE_URL,
      apiKey: cfg.NVIDIA_API_KEY,
      model,
      messages: [{ role: "user", content: "ping" }],
      maxOutputTokens: 1,
      stream: false,
      abortAt: Date.now() + 20_000,
      firstTokenTimeoutMs: 20_000,
      chunkSilenceTimeoutMs: 15_000,
      mockScenario: null,
    });
    rows.push(
      outcome.ok
        ? { model, ok: true }
        : {
            model,
            ok: false,
            status: outcome.failure.status,
            cls: outcome.failure.kind ?? outcome.failure.cls,
            body: outcome.failure.body,
          }
    );
  }
  return rows;
}

export function printSmokeTable(rows: SmokeRow[]): void {
  console.log(`live smoke — ${rows.length} configured models (1 token each):`);
  for (const row of rows) {
    if (row.ok) {
      console.log(`  OK    ${row.model}`);
    } else {
      console.log(
        `  FAIL  ${row.model}  status=${row.status ?? "-"}  class=${row.cls ?? "-"}${
          row.body ? `  body="${row.body}"` : ""
        }`
      );
    }
  }
}
