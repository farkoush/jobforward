import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearGatewayEnv, setGatewayTestEnv } from "./helpers";
import { resetRateStoreForTests } from "@/lib/llm/rate-store";
import { resetLlmConfigForTests } from "@/lib/llm/config";

/**
 * Mock mode (FR-38, §13): LLM_MOCK=true routes every attempt through the
 * mock transport — NO provider fetch happens; a dev-only scenario (from
 * opts, threaded from the x-mock-error header) simulates 429 / 5xx /
 * timeout / 403-HTML / empty; production ignores the flag entirely.
 * Also covers model-ID validation (FR-37).
 */

type GatewayModule = typeof import("@/lib/llm/gateway");

function mockFetchCounter() {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) => {
      calls.push(String(url));
      return Response.json({
        choices: [{ message: { content: "REAL PROVIDER ANSWER" } }],
      });
    })
  );
  return calls;
}

const OLD_NODE_ENV = process.env.NODE_ENV;

describe("mock mode (FR-38)", () => {
  beforeEach(() => {
    setGatewayTestEnv();
    process.env.LLM_MOCK = "true";
    resetRateStoreForTests();
    resetLlmConfigForTests();
  });
  afterEach(() => {
    clearGatewayEnv();
    delete process.env.LLM_MOCK;
    // @types/node 22 declares NODE_ENV readonly — assign through a cast.
    (process.env as { NODE_ENV?: string }).NODE_ENV = OLD_NODE_ENV;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function gatewayModule(): Promise<GatewayModule> {
    return import("@/lib/llm/gateway");
  }

  it("mock success returns fixed text without any provider fetch", async () => {
    const calls = mockFetchCounter();
    const { runFastGateway } = await gatewayModule();
    const outcome = await runFastGateway(
      { task: "scoring_ratings", input: "x" },
      { identity: "anon-1" }
    );
    expect(calls).toEqual([]); // provider never contacted
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.text).toContain("Mock");
      expect(outcome.model).toBe("test-fast-primary");
      expect(outcome.source).toBe("free");
    }
  });

  it("429 scenario: retries then exhausts the chain — retryable ALL_MODELS_FAILED", async () => {
    const calls = mockFetchCounter();
    const { runFastGateway } = await gatewayModule();
    const outcome = await runFastGateway(
      { task: "scoring_ratings", input: "x" },
      { identity: "anon-1", mockError: "429" }
    );
    expect(calls).toEqual([]);
    // Persistent 429s hit the per-request provider-call cap (FR-44): the
    // typed RATE_LIMITED outcome replaces the old ALL_MODELS_FAILED here.
    expect(outcome).toMatchObject({
      ok: false,
      reason: "RATE_LIMITED",
      retryable: true,
      source: "free",
    });
  }, 15_000);

  it("403 HTML scenario: fatal — CONFIG_ERROR on the free path, no fallback", async () => {
    const calls = mockFetchCounter();
    const { runFastGateway } = await gatewayModule();
    const outcome = await runFastGateway(
      { task: "scoring_ratings", input: "x" },
      { identity: "anon-1", mockError: "403_html" }
    );
    expect(calls).toEqual([]);
    expect(outcome).toMatchObject({
      ok: false,
      reason: "CONFIG_ERROR",
      retryable: false,
    });
  });

  it("empty scenario: exhausted with a retryable failure", async () => {
    const calls = mockFetchCounter();
    const { runFastGateway } = await gatewayModule();
    const outcome = await runFastGateway(
      { task: "scoring_ratings", input: "x" },
      { identity: "anon-1", mockError: "empty" }
    );
    expect(calls).toEqual([]);
    expect(outcome).toMatchObject({ ok: false, reason: "ALL_MODELS_FAILED", retryable: true });
  }, 15_000);

  it("timeout scenario: abort-honoring hanging transport → exhausted", async () => {
    process.env.ATTEMPT_TIMEOUT_MS_FAST = "200";
    resetLlmConfigForTests();
    const calls = mockFetchCounter();
    const { runFastGateway } = await gatewayModule();
    const outcome = await runFastGateway(
      { task: "scoring_ratings", input: "x" },
      { identity: "anon-1", mockError: "timeout" }
    );
    expect(calls).toEqual([]);
    expect(outcome).toMatchObject({ ok: false, reason: "ALL_MODELS_FAILED", retryable: true });
  }, 15_000);

  it("production IGNORES LLM_MOCK — the real transport is used", async () => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
    resetLlmConfigForTests();
    const calls = mockFetchCounter(); // a REAL fetch would be attempted
    const { runFastGateway } = await gatewayModule();
    const outcome = await runFastGateway(
      { task: "scoring_ratings", input: "x" },
      { identity: "anon-1" }
    );
    expect(calls.length).toBe(1); // provider contacted — mock not honored
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.text).toBe("REAL PROVIDER ANSWER");
  });

  it("mock scenarios are ignored when the flag is off", async () => {
    delete process.env.LLM_MOCK;
    resetLlmConfigForTests();
    const calls = mockFetchCounter();
    const { runFastGateway } = await gatewayModule();
    const outcome = await runFastGateway(
      { task: "scoring_ratings", input: "x" },
      { identity: "anon-1", mockError: "429" } // header present, flag off
    );
    expect(calls.length).toBe(1);
    expect(outcome.ok).toBe(true);
  });
});

describe("model-ID validation (FR-37)", () => {
  beforeEach(() => {
    setGatewayTestEnv();
    process.env.LLM_MOCK = "true"; // keep startup/runtime paths mock-only
    resetRateStoreForTests();
    resetLlmConfigForTests();
  });
  afterEach(() => {
    clearGatewayEnv();
    delete process.env.LLM_MOCK;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function validateModule() {
    return import("@/lib/llm/validate-models");
  }

  it("warns naming the env var for an ID missing from the provider list", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      Response.json({ data: [{ id: "test-fast-primary" }, { id: "test-gen-primary" }] })
    ));
    const { validateConfiguredModels } = await validateModule();
    const cfg = (await import("@/lib/llm/config")).getLlmConfig();
    const result = await validateConfiguredModels(cfg);
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => w.includes("GEN_FALLBACKS") && w.includes("test-gen-fallback-1"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("FAST_FALLBACKS") && w.includes("test-fast-fallback-1"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("GEN_MODEL") && w.includes("test-gen-primary"))).toBe(false);
  });

  it("errors when a category retains no valid model", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: [] })));
    const { validateConfiguredModels } = await validateModule();
    const cfg = (await import("@/lib/llm/config")).getLlmConfig();
    const result = await validateConfiguredModels(cfg);
    expect(result.warnings.length).toBe(5);
    expect(result.errors.some((e) => e.includes("GEN"))).toBe(true);
    expect(result.errors.some((e) => e.includes("FAST"))).toBe(true);
  });

  it("skips with a warning when /models cannot be fetched", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({}, { status: 401 })));
    const { validateConfiguredModels } = await validateModule();
    const cfg = (await import("@/lib/llm/config")).getLlmConfig();
    const result = await validateConfiguredModels(cfg);
    expect(result.skipped).toBe(true);
    expect(result.warnings[0]).toContain("skipped");
    expect(result.errors).toEqual([]);
  });
});
