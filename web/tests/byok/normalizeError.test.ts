import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeError } from "../../src/lib/byok/normalizeError";

function http(status: number, body = "", headers: Record<string, string> = {}) {
  return { status, body, headers };
}

test("maps 401/403 with key indication to invalid_key", () => {
  for (const status of [400, 401, 403]) {
    const e = normalizeError("openrouter", http(status, "API key invalid"));
    assert.equal(e.code, "invalid_key");
    assert.equal(e.retryable, false);
    assert.ok(!/sk-|AIza/.test(e.userMessage));
  }
});

test("maps 402 to insufficient_credit", () => {
  const e = normalizeError("groq", http(402));
  assert.equal(e.code, "insufficient_credit");
});

test("maps 429 without quota wording to rate_limited, keeps Retry-After", () => {
  const e = normalizeError("openrouter", http(429, "upstream busy", { "retry-after": "12" }));
  assert.equal(e.code, "rate_limited");
  assert.equal(e.retryAfterSec, 12);
  assert.ok(!/exceeded your limit/i.test(e.userMessage));
});

test("maps 429 with quota wording to quota_exhausted", () => {
  const e = normalizeError("openrouter", http(429, "daily free quota exhausted"));
  assert.equal(e.code, "quota_exhausted");
});

test("maps 404 model to model_unavailable", () => {
  const e = normalizeError("google_ai_studio", http(404, "not found"), { model: "gemini-x" });
  assert.equal(e.code, "model_unavailable");
});

test("maps fetch TypeError for cloud providers to cors_blocked", () => {
  const e = normalizeError("mistral", new TypeError("Failed to fetch"));
  assert.equal(e.code, "cors_blocked");
  assert.equal(e.retryable, false);
});

test("maps 5xx to retryable network", () => {
  const e = normalizeError("openrouter", http(503, "down"));
  assert.equal(e.code, "network");
  assert.equal(e.retryable, true);
});

test("maps Ollama failures to local_* codes", () => {
  const refused = normalizeError("ollama", new TypeError("Failed to fetch"));
  assert.equal(refused.code, "local_origin_blocked");
  const missing = normalizeError("ollama", http(404, "model not found"), { model: "llama3" });
  assert.equal(missing.code, "local_model_missing");
  const down = normalizeError("ollama", http(500, "boom"));
  assert.equal(down.code, "local_unreachable");
  assert.equal(down.retryable, true);
});

test("user messages never contain technical details or key patterns", () => {
  for (const e of [
    normalizeError("openrouter", http(401, "bad sk-or-v1-0123456789abcdef0123456789abcdef")),
    normalizeError("groq", http(429)),
    normalizeError("google_ai_studio", http(404)),
  ]) {
    assert.ok(e.userMessage.length > 0);
    assert.ok(!/sk-|gsk_|AIza/.test(e.userMessage));
    assert.ok(!/https?:\/\//.test(e.userMessage));
  }
});
