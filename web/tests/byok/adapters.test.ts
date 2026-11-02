import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGeminiRequest, parseGeminiResponse } from "../../src/lib/byok/adapters/gemini";
import {
  buildOpenAIRequest,
  parseOpenAIModelList,
  parseOpenAIResponse,
} from "../../src/lib/byok/adapters/openaiCompatible";
import {
  buildOllamaRequest,
  isEmbeddingModel,
  parseOllamaResponse,
  parseOllamaTags,
} from "../../src/lib/byok/adapters/ollama";
import {
  filterGeminiModels,
  filterOllamaModels,
  filterOpenRouterModels,
} from "../../src/lib/byok/filters";
import type { ChatRequest } from "../../src/lib/byok/types";

const req: ChatRequest = {
  model: "test-model",
  messages: [
    { role: "system", content: "system rules" },
    { role: "user", content: "user content" },
  ],
  maxOutputTokens: 1024,
  temperature: 0,
};

test("gemini adapter: key only in header, never in the URL", () => {
  const { url, init } = buildGeminiRequest(
    "https://generativelanguage.googleapis.com/v1beta",
    "AIzaSyA1234567890abcdefghijklmnopqrstuv",
    req
  );
  assert.ok(url.includes(":generateContent"));
  assert.ok(!url.includes("key="));
  assert.ok(!url.includes("AIza"));
  const headers = init.headers as Record<string, string>;
  assert.equal(headers["x-goog-api-key"], "AIzaSyA1234567890abcdefghijklmnopqrstuv");
  const body = JSON.parse(String(init.body));
  assert.equal(body.generationConfig.maxOutputTokens, 1024);
  assert.ok(body.systemInstruction);
});

test("gemini parser: returns text, throws on empty", () => {
  const ok = parseGeminiResponse({ candidates: [{ content: { parts: [{ text: "hi" }] } }] });
  assert.equal(ok.text, "hi");
  assert.throws(() => parseGeminiResponse({ candidates: [] }));
});

test("openai-compatible adapter: Bearer header, no key in URL", () => {
  const { url, init } = buildOpenAIRequest(
    "https://openrouter.ai/api/v1",
    "sk-or-v1-0123456789abcdef0123456789abcdef",
    req
  );
  assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
  assert.ok(!url.includes("sk-or-v1"));
  const headers = init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer sk-or-v1-0123456789abcdef0123456789abcdef");
  const body = JSON.parse(String(init.body));
  assert.equal(body.max_tokens, 1024);
});

test("openai-compatible parser: text, model list, malformed", () => {
  assert.equal(parseOpenAIResponse({ choices: [{ message: { content: "x" } }] }).text, "x");
  assert.throws(() => parseOpenAIResponse({}));
  assert.deepEqual(
    parseOpenAIModelList({ data: [{ id: "a:free" }, { id: "b" }, {}] }),
    ["a:free", "b"]
  );
});

test("ollama adapter: no Authorization header, native endpoints", () => {
  const { url, init } = buildOllamaRequest("http://localhost:11434", req);
  assert.equal(url, "http://localhost:11434/api/chat");
  const headers = init.headers as Record<string, string>;
  assert.ok(!("Authorization" in headers));
  const body = JSON.parse(String(init.body));
  assert.equal(body.stream, false);
  assert.equal(body.options.num_predict, 1024);
});

test("ollama parser: text, tags, embedding filter", () => {
  assert.equal(parseOllamaResponse({ message: { content: "y" } }).text, "y");
  assert.throws(() => parseOllamaResponse({}));
  const tags = parseOllamaTags({
    models: [{ name: "llama3:8b", size: 4_000_000_000 }, { name: "nomic-embed-text", size: 1 }],
  });
  assert.equal(tags.length, 2);
  assert.equal(isEmbeddingModel("nomic-embed-text"), true);
  assert.equal(isEmbeddingModel("llama3:8b"), false);
});

test("model list filters: :free / generateContent / tags", () => {
  assert.deepEqual(
    filterOpenRouterModels(["a:free", "b:paid", "c:free"], false).map((m) => m.id),
    ["a:free", "c:free"]
  );
  assert.equal(filterOpenRouterModels(["a:free", "b:paid"], true).length, 2);
  const gemini = filterGeminiModels([
    { name: "models/gemini-2.0-flash", supportedGenerationMethods: ["generateContent"], displayName: "Flash" },
    { name: "models/embed-1", supportedGenerationMethods: ["embedContent"] },
  ]);
  assert.deepEqual(gemini, [{ id: "gemini-2.0-flash", label: "Flash" }]);
  const ollama = filterOllamaModels([
    { name: "llama3:8b", sizeBytes: 4_000_000_000 },
    { name: "nomic-embed-text", sizeBytes: 1 },
  ]);
  assert.equal(ollama.length, 1);
  assert.match(ollama[0].label ?? "", /MB/);
});
