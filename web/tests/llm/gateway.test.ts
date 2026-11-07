import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearGatewayEnv, setGatewayTestEnv } from "./helpers";

/**
 * Gateway orchestration tests (US1): free/byok routing, typed-result
 * never-throws contract, BYOK failure never falling back to the free path
 * (SC-008, FR-28), input/task validation.
 */

type FastRouteBody = Record<string, unknown>;

function openAiCompletion(text: string) {
  return {
    choices: [{ message: { content: text } }],
    usage: { prompt_tokens: 12, completion_tokens: 9 },
  };
}

/** Install a global fetch mock; returns the recorded calls. */
function mockFetch(
  handler: (url: string, init: RequestInit) => Response | Promise<Response>
) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init: RequestInit = {}) => {
      calls.push({ url: String(url), init });
      return handler(String(url), init);
    })
  );
  return calls;
}

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const BYOK_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

describe("gateway (US1, FR-16/23/26/27/28)", () => {
  beforeEach(() => {
    setGatewayTestEnv();
  });
  afterEach(() => {
    clearGatewayEnv();
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.doUnmock("@/lib/llm/validate-models");
    (async () => {
      const m = await import("@/lib/llm/validate-models");
      m.resetAppliedChainsForTests();
    })();
  });

  async function gatewayModule() {
    return import("@/lib/llm/gateway");
  }

  it("routes a FAST task through the free path and returns a typed success", async () => {
    const calls = mockFetch(() => Response.json(openAiCompletion("123")));
    const { runFastGateway } = await gatewayModule();
    const outcome = await runFastGateway(
      { task: "scoring_ratings", input: "score these", system: "system prompt" },
      { identity: "anon-1" }
    );
    expect(calls[0].url).toBe(NVIDIA_URL);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.model).toBe("test-fast-primary");
      expect(outcome.modelUsed).toBe("test-fast-primary");
      expect(outcome.usedFallback).toBe(false);
      expect(outcome.fallbackDepth).toBe(0);
      expect(outcome.source).toBe("free");
      expect(outcome.text).toBe("123");
      expect(outcome.usage).toEqual({ in: 12, out: 9 });
    }
  });

  it("falls back to the configured next model when the primary 404s", async () => {
    const seen: string[] = [];
    mockFetch((url, init) => {
      const model = JSON.parse(String(init.body)).model as string;
      seen.push(`${url}:${model}`);
      if (model === "test-fast-primary") {
        return Response.json({ error: { message: "not found" } }, { status: 404 });
      }
      return Response.json(openAiCompletion("fallback answered"));
    });
    const { runFastGateway } = await gatewayModule();
    const outcome = await runFastGateway(
      { task: "scoring_ratings", input: "score these" },
      { identity: "anon-1" }
    );
    expect(seen).toEqual([
      `${NVIDIA_URL}:test-fast-primary`,
      `${NVIDIA_URL}:test-fast-fallback-1`,
    ]);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      // FR-43 transparency: the fallback is visible to the caller.
      expect(outcome.modelUsed).toBe("test-fast-fallback-1");
      expect(outcome.usedFallback).toBe(true);
      expect(outcome.fallbackDepth).toBe(1);
    }
  });

  it("a category with no valid (pruned) models fails with typed CONFIG_ERROR", async () => {
    const { applyValidatedChains } = await import("@/lib/llm/validate-models");
    applyValidatedChains({ GEN: ["test-gen-primary"], FAST: [] });
    const calls = mockFetch(() => Response.json(openAiCompletion("x")));
    const { runFastGateway } = await gatewayModule();
    const outcome = await runFastGateway(
      { task: "scoring_ratings", input: "score these" },
      { identity: "anon-1" }
    );
    expect(outcome).toMatchObject({ ok: false, reason: "CONFIG_ERROR" });
    expect(calls).toEqual([]); // never called — no valid model exists
  });

  it("returns ALL_MODELS_FAILED when every model fails — never throws", async () => {
    mockFetch(() => Response.json({ error: { message: "boom" } }, { status: 500 }));
    const { runFastGateway } = await gatewayModule();
    const outcome = await runFastGateway(
      { task: "scoring_ratings", input: "score these" },
      { identity: "anon-1" }
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("ALL_MODELS_FAILED");
      expect(outcome.retryable).toBe(true);
      expect(outcome.source).toBe("free");
    }
  });

  it("uses the BYOK path with the per-request key and never touches NVIDIA", async () => {
    const calls = mockFetch(() => Response.json(openAiCompletion("byok answer")));
    const { runFastGateway } = await gatewayModule();
    const outcome = await runFastGateway(
      { task: "scoring_ratings", input: "score these" },
      { identity: "anon-1", byokKey: "sk-or-user-key", byokModel: "user-chosen-model" }
    );
    expect(calls.every((c) => c.url === BYOK_URL)).toBe(true);
    expect(
      calls.every(
        (c) =>
          (c.init.headers as Record<string, string>).Authorization ===
          "Bearer sk-or-user-key"
      )
    ).toBe(true);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.source).toBe("byok");
  });

  it("a BYOK failure is BYOK_FAILED and makes NO call to the free path (SC-008)", async () => {
    const calls = mockFetch(() => Response.json({ error: { message: "bad key" } }, { status: 401 }));
    const { runFastGateway } = await gatewayModule();
    const outcome = await runFastGateway(
      { task: "scoring_ratings", input: "score these" },
      { identity: "anon-1", byokKey: "sk-or-user-key", byokModel: "user-chosen-model" }
    );
    expect(calls.every((c) => c.url === BYOK_URL)).toBe(true);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("BYOK_FAILED");
      expect(outcome.source).toBe("byok");
    }
  });

  it("§15 FR-55: BYOK succeeds even with the free-path provider envs REMOVED", async () => {
    for (const key of [
      "NVIDIA_API_KEY",
      "NVIDIA_BASE_URL",
      "GEN_MODEL",
      "GEN_FALLBACKS",
      "FAST_MODEL",
      "FAST_FALLBACKS",
    ]) {
      delete process.env[key];
    }
    const { resetLlmConfigForTests } = await import("@/lib/llm/config");
    resetLlmConfigForTests();
    const calls = mockFetch(() => Response.json(openAiCompletion("byok answer")));
    const { runFastGateway } = await gatewayModule();
    const outcome = await runFastGateway(
      { task: "scoring_ratings", input: "score these" },
      { identity: "anon-1", byokKey: "sk-or-user-key", byokModel: "user-chosen-model" }
    );
    // Only OpenRouter was contacted — the broken NVIDIA config never blocked it.
    expect(calls.every((c) => c.url === BYOK_URL)).toBe(true);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.source).toBe("byok");
  });

  it("§15 FR-55: without a key, a broken free-path config yields typed CONFIG_ERROR (no crash, no empty body)", async () => {
    for (const key of [
      "NVIDIA_API_KEY",
      "NVIDIA_BASE_URL",
      "GEN_MODEL",
      "GEN_FALLBACKS",
      "FAST_MODEL",
      "FAST_FALLBACKS",
    ]) {
      delete process.env[key];
    }
    const { resetLlmConfigForTests } = await import("@/lib/llm/config");
    resetLlmConfigForTests();
    const calls = mockFetch(() => Response.json(openAiCompletion("nope")));
    const { runFastGateway } = await gatewayModule();
    const outcome = await runFastGateway(
      { task: "scoring_ratings", input: "score these" },
      { identity: "anon-1" }
    );
    expect(calls).toHaveLength(0); // no provider call against known-broken config
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("CONFIG_ERROR");
  });

  it("rejects unknown tasks and over-long input before any provider call", async () => {
    const calls = mockFetch(() => Response.json(openAiCompletion("x")));
    const { runFastGateway } = await gatewayModule();
    const badTask = await runFastGateway(
      { task: "mystery_task", input: "x" },
      { identity: "anon-1" }
    );
    expect(badTask).toMatchObject({ ok: false, reason: "INVALID_TASK" });
    const longInput = await runFastGateway(
      { task: "scoring_ratings", input: "x".repeat(8001) },
      { identity: "anon-1" }
    );
    expect(longInput).toMatchObject({ ok: false, reason: "INPUT_TOO_LONG" });
    expect(calls).toEqual([]);
  });

  it("a network failure still yields a typed result (never throws)", async () => {
    mockFetch(() => {
      throw new TypeError("fetch failed");
    });
    const { runFastGateway } = await gatewayModule();
    const outcome = await runFastGateway(
      { task: "scoring_ratings", input: "score these" },
      { identity: "anon-1" }
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.retryable).toBe(true);
  });
});
