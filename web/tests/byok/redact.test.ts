import { test } from "node:test";
import assert from "node:assert/strict";
import { isLikelyKey, redact, redactString } from "../../src/lib/byok/redact";

test("redactString masks each provider's key shapes", () => {
  const google = "AIzaSyA1234567890abcdefghijklmnopqrstuv";
  const openrouter = "sk-or-v1-0123456789abcdef0123456789abcdef";
  const groq = "gsk_0123456789abcdefghijklmnop";
  for (const key of [google, openrouter, groq]) {
    const masked = redactString(`before ${key} after`);
    assert.ok(!masked.includes(key), `raw key leaked: ${key}`);
    assert.match(masked, /before .*….* after/);
  }
});

test("redactString masks long hex/base64 tokens", () => {
  const token = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
  const masked = redactString(`token=${token};`);
  assert.ok(!masked.includes(token));
});

test("redact masks nested objects and secret-named fields", () => {
  const out = redact({
    a: { b: ["sk-or-v1-0123456789abcdef0123456789abcdef"] },
    api_key: "AIzaSyA1234567890abcdefghijklmnopqrstuv",
    Authorization: "Bearer gsk_0123456789abcdefghijklmnop",
    note: "clean",
  }) as Record<string, unknown>;
  assert.equal(out.note, "clean");
  assert.equal(out.api_key, "…");
  assert.equal(out.Authorization, "…");
  const arr = ((out.a as { b: unknown[] }).b as string[])[0];
  assert.ok(!String(arr).includes("sk-or-v1-0123456789abcdef"));
});

test("redact handles Error messages", () => {
  const err = new Error("request failed with key AIzaSyA1234567890abcdefghijklmnopqrstuv");
  const out = String(redact(err));
  assert.ok(!out.includes("AIzaSyA1234567890abcdefghijklmnopqrstuv"));
});

test("isLikelyKey detects key-like strings", () => {
  assert.equal(isLikelyKey("AIzaSyA1234567890abcdefghijklmnopqrstuv"), true);
  assert.equal(isLikelyKey("short"), false);
});
