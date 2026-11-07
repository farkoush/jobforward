import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearGatewayEnv, setGatewayTestEnv } from "./helpers";
import {
  ConfigError,
  getLlmConfig,
  getLlmCoreConfig,
  resetLlmConfigForTests,
} from "@/lib/llm/config";

/**
 * §15 FR-55 config split: the BYOK request path loads ONLY the core config
 * (limits/timeouts/gate/mock/chain-policy) and never requires the free-path
 * provider envs (the NVIDIA and GEN/FAST chain variables); getLlmConfig()
 * keeps its fail-fast behavior for the free path and the operator.
 */

function removeProviderEnvs(): void {
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
}

describe("§15 FR-55 config split", () => {
  beforeEach(() => {
    setGatewayTestEnv();
    resetLlmConfigForTests();
  });
  afterEach(() => {
    clearGatewayEnv();
    resetLlmConfigForTests();
    vi.resetModules();
  });

  it("core config loads WITHOUT any provider envs (BYOK path needs no NVIDIA config)", () => {
    removeProviderEnvs();
    const core = getLlmCoreConfig();
    expect(core.GATE_PASSWORD).toBe("test-pass-123");
    expect(core.GATE_COOKIE_SECRET).toBe("test-cookie-secret");
    expect(core.MAX_INPUT_CHARS).toBe(8000);
    expect(core.MAX_PROVIDER_CALLS_PER_REQUEST).toBe(4);
    expect(core.DAILY_FAST_PER_USER).toBe(50);
    expect(core.FIRST_TOKEN_TIMEOUT_MS).toBe(20_000);
    expect(core.REASONING_MAX_TOKENS_FAST).toBe(4000);
  });

  it("full config still FAILS FAST without provider envs (free path + operator)", () => {
    removeProviderEnvs();
    expect(() => getLlmConfig()).toThrow(ConfigError);
    try {
      getLlmConfig();
    } catch (exc) {
      expect(exc).toBeInstanceOf(ConfigError);
      expect((exc as ConfigError).message).toContain("NVIDIA_API_KEY");
    }
  });

  it("full config keeps the chains when provider envs are present", () => {
    const cfg = getLlmConfig();
    expect(cfg.genChain).toEqual([
      "test-gen-primary",
      "test-gen-fallback-1",
      "test-gen-fallback-2",
    ]);
    expect(cfg.fastChain).toEqual(["test-fast-primary", "test-fast-fallback-1"]);
  });

  it("core cache is separate: reset clears BOTH caches so new env values are read", () => {
    expect(getLlmCoreConfig().MAX_INPUT_CHARS).toBe(8000);
    process.env.MAX_INPUT_CHARS = "1234";
    // Without a reset the cached core value persists:
    expect(getLlmCoreConfig().MAX_INPUT_CHARS).toBe(8000);
    resetLlmConfigForTests();
    expect(getLlmCoreConfig().MAX_INPUT_CHARS).toBe(1234);
  });
});
