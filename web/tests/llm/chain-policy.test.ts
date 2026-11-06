import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearGatewayEnv, setGatewayTestEnv } from "./helpers";
import { resetLlmConfigForTests } from "@/lib/llm/config";

/**
 * Chain policy (§14: FR-39 pruning / FR-40 forbidden patterns / FR-41
 * oversize warning on FAST / skip resilience).
 */

describe("chain policy (§14)", () => {
  beforeEach(() => {
    setGatewayTestEnv();
    resetLlmConfigForTests();
  });
  afterEach(() => {
    clearGatewayEnv();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function validateModule() {
    return import("@/lib/llm/validate-models");
  }
  async function configModule() {
    return import("@/lib/llm/config");
  }
  function stubModelList(ids: string[]) {
    vi.stubGlobal("fetch", vi.fn(async () =>
      Response.json({ data: ids.map((id) => ({ id })) })
    ));
  }

  it("prunes missing and forbidden ids, keeps order, warns naming the env var", async () => {
    process.env.GEN_FALLBACKS =
      "nvidia/nemotron-3.5-embed-1b,test-gen-fallback-1,nvidia/nemotron-parse";
    process.env.FAST_MODEL = "nvidia/nemotron-4-340b-reward";
    resetLlmConfigForTests();
    stubModelList(["test-gen-primary", "test-gen-fallback-1", "test-fast-fallback-1"]);
    const { validateConfiguredModels } = await validateModule();
    const cfg = (await configModule()).getLlmConfig();
    const result = await validateConfiguredModels(cfg);
    // Forbidden + missing ids removed; valid ones keep their order.
    expect(result.chains.GEN).toEqual(["test-gen-primary", "test-gen-fallback-1"]);
    expect(result.chains.FAST).toEqual(["test-fast-fallback-1"]);
    expect(result.warnings.some((w) => w.includes("GEN_FALLBACKS[0]") && w.includes("nvidia/nemotron-3.5-embed-1b"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("GEN_FALLBACKS[2]") && w.includes("nvidia/nemotron-parse"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("FAST_MODEL") && w.includes("nvidia/nemotron-4-340b-reward"))).toBe(true);
    // Each category still has a valid model.
    expect(result.errors).toEqual([]);
  });

  it("excludes the brief's non-chat examples so they are NEVER called", async () => {
    process.env.GEN_MODEL = "nvidia/nemotron-3.5-embed-1b";
    process.env.GEN_FALLBACKS = "nvidia/nemotron-4-340b-reward,nvidia/nemotron-parse";
    process.env.FAST_MODEL = "test-fast-primary";
    process.env.FAST_FALLBACKS = "test-fast-fallback-1";
    resetLlmConfigForTests();
    stubModelList(["nvidia/nemotron-3.5-embed-1b", "nvidia/nemotron-4-340b-reward", "nvidia/nemotron-parse", "test-fast-primary", "test-fast-fallback-1"]);
    const { validateConfiguredModels } = await validateModule();
    const cfg = (await configModule()).getLlmConfig();
    const result = await validateConfiguredModels(cfg);
    // All GEN ids are forbidden → empty pruned GEN chain + a clear error.
    expect(result.chains.GEN).toEqual([]);
    expect(result.errors.some((e) => e.includes("GEN"))).toBe(true);
    expect(result.chains.FAST).toEqual(["test-fast-primary", "test-fast-fallback-1"]);
  });

  it("warns on an oversized FAST model but keeps it; unknown sizes tolerated", async () => {
    process.env.FAST_MODEL = "nvidia/nemotron-3-ultra-550b-a55b";
    process.env.FAST_FALLBACKS = "some/unknown-size-model";
    process.env.GEN_MODEL = "test-gen-primary";
    process.env.GEN_FALLBACKS = "test-gen-fallback-1";
    resetLlmConfigForTests();
    stubModelList([
      "nvidia/nemotron-3-ultra-550b-a55b",
      "some/unknown-size-model",
      "test-gen-primary",
      "test-gen-fallback-1",
    ]);
    const { validateConfiguredModels } = await validateModule();
    const cfg = (await configModule()).getLlmConfig();
    const result = await validateConfiguredModels(cfg);
    // Warning only — the model stays in the chain.
    expect(result.chains.FAST).toEqual([
      "nvidia/nemotron-3-ultra-550b-a55b",
      "some/unknown-size-model",
    ]);
    expect(result.warnings.some((w) => w.includes("FAST_MODEL") && w.includes("550b"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("unknown-size-model"))).toBe(false);
    expect(result.errors).toEqual([]);
  });

  it("skip: /models failure keeps the raw env chains and only warns", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response("<html>blocked</html>", { status: 403, headers: { "Content-Type": "text/html" } })
    ));
    const { validateConfiguredModels } = await validateModule();
    const cfg = (await configModule()).getLlmConfig();
    const result = await validateConfiguredModels(cfg);
    expect(result.skipped).toBe(true);
    expect(result.chains.GEN).toEqual(cfg.genChain);
    expect(result.chains.FAST).toEqual(cfg.fastChain);
    expect(result.warnings[0]).toContain("skipped");
  });

  it("applied-chains store round-trips and resets", async () => {
    const m = await validateModule();
    expect(m.getAppliedChains()).toBeNull();
    m.applyValidatedChains({ GEN: ["g1"], FAST: ["f1"] });
    expect(m.getAppliedChains()).toEqual({ GEN: ["g1"], FAST: ["f1"] });
    m.resetAppliedChainsForTests();
    expect(m.getAppliedChains()).toBeNull();
  });

  it("maxTokensFor applies the higher reasoning budget to matching FAST models", async () => {
    process.env.REASONING_MAX_TOKENS_FAST = "4000";
    resetLlmConfigForTests();
    const { maxTokensFor } = await configModule();
    expect(maxTokensFor("FAST", "openai/gpt-oss-120b")).toBe(4000);
    expect(maxTokensFor("FAST", "some/reasoning-tuned-model")).toBe(4000);
    expect(maxTokensFor("FAST", "nvidia/nemotron-3.5-bolt-e4b")).toBe(500);
    expect(maxTokensFor("GEN", "openai/gpt-oss-120b")).toBe(2000); // GEN unaffected
  });
});
  it("lightning counts as a reasoning model for the FAST budget (live-verified)", async () => {
    setGatewayTestEnv();
    process.env.REASONING_MODEL_PATTERNS = "gpt-oss,reasoning,lightning";
    resetLlmConfigForTests();
    const { maxTokensFor } = await import("@/lib/llm/config");
    expect(maxTokensFor("FAST", "nvidia/nemotron-3.5-lightning-30b-a3b")).toBe(4000);
  });
