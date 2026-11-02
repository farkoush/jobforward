/**
 * Live smoke test (BYOK §9.4) — runs only when a local Ollama answers on
 * GET /api/tags; otherwise the whole file is skipped. Never prints a key
 * (Ollama is keyless anyway). Proves the full model path:
 * prompt -> Ollama -> parse -> terminal-schema validation -> shared check.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOllamaRequest, parseOllamaResponse } from "../../src/lib/byok/adapters/ollama";
import { BYOK_RATINGS_SCHEMA } from "../../src/lib/byok/client";
import { validateResponse } from "../../src/engine/scoring/evaluator";
import { BYOK_EVALUATOR_SYSTEM_PROMPT, buildEvaluatorUserPrompt } from "../../src/lib/byok/prompts";

const OLLAMA = process.env.BYOK_TEST_OLLAMA_URL ?? "http://localhost:11434";
const MODEL = process.env.BYOK_TEST_OLLAMA_MODEL ?? "qwen3:8b";

async function ollamaUp(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${OLLAMA}/api/tags`, { signal: controller.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

test("live ollama rates bullets per the terminal contract", { skip: process.env.BYOK_SKIP_LIVE === "1" }, async () => {
  if (!(await ollamaUp())) {
    console.log("skip: Ollama not running at", OLLAMA);
    return;
  }
  const texts = ["Built a dashboard to track weekly signups"];
  const chatReq = {
    model: MODEL,
    messages: [
      { role: "system" as const, content: BYOK_EVALUATOR_SYSTEM_PROMPT },
      { role: "user" as const, content: buildEvaluatorUserPrompt(texts) },
    ],
    maxOutputTokens: 1024,
    temperature: 0,
  };
  const { url, init } = buildOllamaRequest(OLLAMA, chatReq);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 120_000);
  const res = await fetch(url, { ...init, signal: controller.signal });
  clearTimeout(t);
  assert.equal(res.status, 200);
  const parsed = parseOllamaResponse(await res.json());
  const cleaned = parsed.text.replace(/^```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  const raw = JSON.parse(cleaned); // must be valid JSON, no prose
  const checked = BYOK_RATINGS_SCHEMA.parse(raw);
  // shared validity check: one rating per bullet, order, values already 0|1|2
  validateResponse(
    checked.ratings.map((r, i) => ({ ...r, bullet_index: i })),
    texts.length
  );
  console.log("live ratings:", JSON.stringify(checked.ratings));
});
