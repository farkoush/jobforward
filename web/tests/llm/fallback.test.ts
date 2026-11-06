import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearGatewayEnv, setGatewayTestEnv } from "./helpers";

/**
 * Fallback chain unit tests (US1): every failure class from the spec
 * (rate limit with/without Retry-After, server error, timeout, empty,
 * malformed), the 404 skip, the 2-attempts-per-model cap, the deadline gate,
 * and first-success-wins with the responding model named.
 */

type AttemptOutcome = import("@/lib/llm/fallback").AttemptOutcome;

function okOutcome(text = "model answer"): AttemptOutcome {
  return { ok: true, text, usage: { in: 11, out: 7 } };
}

function failOutcome(
  cls: "retryable" | "not_found" | "fatal",
  extra: { status?: number; retryAfter?: number; kind?: string } = {}
): AttemptOutcome {
  return { ok: false, failure: { cls, status: extra.status, retryAfter: extra.retryAfter } };
}

describe("fallback chain (FR-03/04, FR-34)", () => {
  beforeEach(() => {
    setGatewayTestEnv();
    vi.useFakeTimers();
  });
  afterEach(() => {
    clearGatewayEnv();
    vi.useRealTimers();
    vi.resetModules();
  });

  async function chainModule() {
    return import("@/lib/llm/fallback");
  }

  it("returns the first success and names the responding model", async () => {
    const { runChain } = await chainModule();
    const result = await runChain({
      models: ["primary", "fallback-1"],
      source: "free",
      deadlineAt: Date.now() + 60_000,
      attempt: async () => okOutcome("the answer"),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.model).toBe("primary");
      expect(result.text).toBe("the answer");
      expect(result.usage).toEqual({ in: 11, out: 7 });
    }
  });

  it("retries a 429 within the per-model cap, then moves to the next model", async () => {
    const { runChain } = await chainModule();
    const calls: Array<[string, number]> = [];
    const promise = runChain({
      models: ["primary", "fallback-1"],
      source: "free",
      deadlineAt: Date.now() + 60_000,
      attempt: async (model, attempt) => {
        calls.push([model, attempt]);
        if (model === "primary") return failOutcome("retryable", { status: 429 });
        return okOutcome("from fallback");
      },
    });
    await vi.advanceTimersByTimeAsync(15_000);
    const result = await promise;
    expect(calls).toEqual([
      ["primary", 1],
      ["primary", 2],
      ["fallback-1", 1],
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.model).toBe("fallback-1");
  });

  it("honors Retry-After seconds before retrying", async () => {
    const { runChain } = await chainModule();
    let attemptCount = 0;
    const startedAt = Date.now();
    const promise = runChain({
      models: ["primary", "fallback-1"],
      source: "free",
      deadlineAt: startedAt + 120_000,
      attempt: async () => {
        attemptCount += 1;
        if (attemptCount === 1) return failOutcome("retryable", { status: 429, retryAfter: 3 });
        return okOutcome();
      },
    });
    // Advance past the 3-second Retry-After wait.
    await vi.advanceTimersByTimeAsync(3_100);
    const result = await promise;
    expect(result.ok).toBe(true);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(3_000);
  });

  it("treats timeout, empty and malformed responses as retryable", async () => {
    const { runChain } = await chainModule();
    const kinds: Array<string | undefined> = ["timeout", "empty", "malformed"];
    let call = 0;
    const promise = runChain({
      models: ["primary", "fallback-1", "fallback-2"],
      source: "free",
      deadlineAt: Date.now() + 120_000,
      attempt: async () => {
        const kind = kinds[call];
        call += 1;
        if (kind) return failOutcome("retryable", { kind });
        return okOutcome("recovered");
      },
    });
    await vi.advanceTimersByTimeAsync(15_000);
    const result = await promise;
    expect(result.ok).toBe(true);
    // 2 attempts per model: primary×2 (timeout, empty), fallback-1×2 (malformed, ok)
    if (result.ok) expect(result.model).toBe("fallback-1");
  });

  it("treats a 404 model-not-found as skip-straight-to-next-fallback", async () => {
    const { runChain } = await chainModule();
    const calls: string[] = [];
    const result = await runChain({
      models: ["ghost-model", "fallback-1"],
      source: "free",
      deadlineAt: Date.now() + 60_000,
      attempt: async (model) => {
        calls.push(model);
        if (model === "ghost-model") return failOutcome("not_found", { status: 404 });
        return okOutcome("yes");
      },
    });
    // Single attempt for the 404 model — no retry on it.
    expect(calls).toEqual(["ghost-model", "fallback-1"]);
    expect(result.ok).toBe(true);
  });

  it("stops the whole chain on a fatal error (no retry, no fallback)", async () => {
    const { runChain } = await chainModule();
    const calls: string[] = [];
    const result = await runChain({
      models: ["primary", "fallback-1"],
      source: "free",
      deadlineAt: Date.now() + 60_000,
      attempt: async (model) => {
        calls.push(model);
        return failOutcome("fatal", { status: 401 });
      },
    });
    expect(calls).toEqual(["primary"]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.outcome).toBe("fatal");
      expect(result.lastStatus).toBe(401);
    }
  });

  it("starts no new attempt after the overall deadline", async () => {
    const { runChain } = await chainModule();
    const calls: string[] = [];
    const result = await runChain({
      models: ["primary", "fallback-1", "fallback-2"],
      source: "free",
      deadlineAt: Date.now() + 100,
      attempt: async (model) => {
        calls.push(model);
        // First attempt burns past the deadline.
        await vi.advanceTimersByTimeAsync(200);
        return failOutcome("retryable", { status: 500 });
      },
    });
    expect(calls).toEqual(["primary"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.outcome).toBe("exhausted");
  });

  it("rate_limited outcome at the provider-call cap on persistent 429s (FR-44)", async () => {
    const { runChain } = await chainModule();
    const calls: string[] = [];
    const promise = runChain({
      models: ["a", "b", "c"],
      source: "free",
      deadlineAt: Date.now() + 120_000,
      maxProviderCalls: 2,
      attempt: async (model) => {
        calls.push(model);
        return failOutcome("retryable", { status: 429, retryAfter: 2 });
      },
    });
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await promise;
    expect(calls).toEqual(["a", "a"]); // capped at 2 provider calls
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.outcome).toBe("rate_limited");
      expect(result.retryAfter).toBe(2);
    }
  });

  it("treats 410 Gone like 404 — one attempt, straight to the next model", async () => {
    const { runChain } = await chainModule();
    const calls: string[] = [];
    const result = await runChain({
      models: ["gone-model", "fallback-1"],
      source: "free",
      deadlineAt: Date.now() + 60_000,
      attempt: async (model) => {
        calls.push(model);
        if (model === "gone-model") return failOutcome("not_found", { status: 410 });
        return okOutcome("yes");
      },
    });
    expect(calls).toEqual(["gone-model", "fallback-1"]);
    expect(result.ok).toBe(true);
  });

  it("honors Retry-After BEFORE calling the next model (shared-limit assumption, FR-44)", async () => {
    const { runChain } = await chainModule();
    const calls: Array<[string, number, number]> = [];
    const startedAt = Date.now();
    const promise = runChain({
      models: ["a", "b"],
      source: "free",
      deadlineAt: startedAt + 120_000,
      attempt: async (model, attempt) => {
        calls.push([model, attempt, Date.now() - startedAt]);
        if (model === "a") return failOutcome("retryable", { status: 429, retryAfter: 2 });
        return okOutcome("ok");
      },
    });
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await promise;
    expect(calls.map(([m, a]) => [m, a])).toEqual([
      ["a", 1],
      ["a", 2],
      ["b", 1],
    ]);
    // 2s Retry-After after a1 AND after a2 (before the next model) — both
    // delays elapsed before "b" was called.
    const atB = calls[2][2];
    expect(atB).toBeGreaterThanOrEqual(4_000);
    expect(result.ok).toBe(true);
  });

  it("reports exhaustion when every model fails", async () => {
    const { runChain } = await chainModule();
    const promise = runChain({
      models: ["a", "b"],
      source: "free",
      deadlineAt: Date.now() + 120_000,
      attempt: async () => failOutcome("retryable", { status: 500 }),
    });
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await promise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.outcome).toBe("exhausted");
      expect(result.lastClass).toBe("retryable");
    }
  });
});
