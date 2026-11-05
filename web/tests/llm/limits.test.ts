import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearGatewayEnv, setGatewayTestEnv } from "./helpers";
import { resetRateStoreForTests } from "@/lib/llm/rate-store";
import { resetLlmConfigForTests } from "@/lib/llm/config";

/**
 * Usage limits (US3, FR-10/11/12/19/27/30/31): UTC-day per-category quotas,
 * per-minute caps, BYOK consuming no free quota, rejection BEFORE any
 * provider call, task-based daily counting, and the busy queue.
 */

type GatewayModule = typeof import("@/lib/llm/gateway");
type LimitsModule = typeof import("@/lib/llm/limits");

function openAiCompletion(text: string) {
  return {
    choices: [{ message: { content: text } }],
    usage: { prompt_tokens: 1, completion_tokens: 1 },
  };
}

describe("usage limits (US3)", () => {
  beforeEach(() => {
    setGatewayTestEnv();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T10:00:00Z")); // fixed UTC moment
    resetRateStoreForTests();
    resetLlmConfigForTests();
  });
  afterEach(() => {
    clearGatewayEnv();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.resetModules();
  });

  async function modules(): Promise<[GatewayModule, LimitsModule]> {
    return [await import("@/lib/llm/gateway"), await import("@/lib/llm/limits")];
  }

  it("rejects a request over the per-user daily quota BEFORE calling the provider", async () => {
    process.env.DAILY_FAST_PER_USER = "2";
    resetLlmConfigForTests();
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      calls.push(String(url));
      return Response.json(openAiCompletion("ok"));
    }));
    const [gateway] = await modules();
    const req = { task: "scoring_ratings", input: "score" } as const;
    await runWithTimers(() => gateway.runFastGateway(req, { identity: "anon-1" }));
    await runWithTimers(() => gateway.runFastGateway(req, { identity: "anon-1" }));
    const third = await gateway.runFastGateway(req, { identity: "anon-1" });
    expect(third).toMatchObject({ ok: false, reason: "QUOTA_USER" });
    // Exactly 2 provider calls happened (the first two), never a third.
    expect(calls.length).toBe(2);
  });

  it("separates categories (15 GEN / 50 FAST are independent counters)", async () => {
    process.env.DAILY_FAST_PER_USER = "1";
    resetLlmConfigForTests();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(openAiCompletion("ok"))));
    const [gateway] = await modules();
    const fast = await gateway.runFastGateway(
      { task: "scoring_ratings", input: "x" },
      { identity: "anon-1" }
    );
    expect(fast.ok).toBe(true);
    // GEN quota untouched by FAST usage.
    const limits = (await import("@/lib/llm/limits")) as LimitsModule;
    const decision = await limits.checkRequestLimits({
      identity: "anon-1",
      source: "free",
      category: "GEN",
    });
    expect(decision.allowed).toBe(true);
    const fastAgain = await limits.checkRequestLimits({
      identity: "anon-1",
      source: "free",
      category: "FAST",
    });
    expect(fastAgain).toMatchObject({ allowed: false, reason: "QUOTA_USER" });
  });

  it("resets daily counters at 00:00 UTC (FR-19)", async () => {
    process.env.DAILY_FAST_PER_USER = "1";
    resetLlmConfigForTests();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(openAiCompletion("ok"))));
    const [gateway] = await modules();
    const req = { task: "scoring_ratings", input: "x" } as const;
    await runWithTimers(() => gateway.runFastGateway(req, { identity: "anon-1" }));
    const blocked = await gateway.runFastGateway(req, { identity: "anon-1" });
    expect(blocked).toMatchObject({ ok: false, reason: "QUOTA_USER" });
    // Cross UTC midnight.
    vi.setSystemTime(new Date("2026-11-07T00:00:30Z"));
    resetRateStoreForTests();
    const nextDay = await runWithTimers(() =>
      gateway.runFastGateway(req, { identity: "anon-1" })
    );
    expect(nextDay.ok).toBe(true);
  });

  it("BYOK requests consume no free daily quota and use their own 10/min cap", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(openAiCompletion("ok"))));
    const [gateway] = await modules();
    for (let i = 0; i < 20; i++) {
      const outcome = await runWithTimers(() =>
        gateway.runFastGateway(
          { task: "scoring_ratings", input: "x" },
          { identity: "anon-1", byokKey: "sk-or-user", byokModel: "m" }
        )
      );
      // 20 byok requests: none consume free quota; the 11th+ hit BYOK_LIMIT.
      if (i < 10) expect(outcome.ok).toBe(true);
      else expect(outcome).toMatchObject({ ok: false, reason: "BYOK_LIMIT" });
    }
    // Free quota counters stayed untouched: a free request still succeeds.
    const free = await runWithTimers(() =>
      gateway.runFastGateway(
        { task: "scoring_ratings", input: "x" },
        { identity: "anon-1" }
      )
    );
    expect(free.ok).toBe(true);
  });

  it("a task reaching its provider counts ONCE, retries never multiply quota", async () => {
    process.env.DAILY_FAST_PER_USER = "1";
    resetLlmConfigForTests();
    let call = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      call += 1;
      if (call === 1) return Response.json({ error: { message: "boom" } }, { status: 500 });
      return Response.json(openAiCompletion("ok"));
    }));
    const [gateway] = await modules();
    // Primary fails (500) → retry succeeds: ONE daily unit for the task.
    const outcome = await runWithTimers(() =>
      gateway.runFastGateway(
        { task: "scoring_ratings", input: "x" },
        { identity: "anon-1" }
      )
    );
    expect(outcome.ok).toBe(true);
    // Second task is over quota — the retry did not consume an extra unit.
    const second = await runWithTimers(() =>
      gateway.runFastGateway(
        { task: "scoring_ratings", input: "x" },
        { identity: "anon-1" }
      )
    );
    expect(second).toMatchObject({ ok: false, reason: "QUOTA_USER" });
    expect(call).toBe(2); // 1 fail + 1 retry (task 1); task 2 rejected pre-call
  });

  it("queues ~BUSY_QUEUE_MS when the provider limiter is full, then busy", async () => {
    process.env.PROVIDER_RPM_LIMIT = "1";
    process.env.BUSY_QUEUE_MS = "5000";
    resetLlmConfigForTests();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(openAiCompletion("ok"))));
    const [gateway] = await modules();
    const req = { task: "scoring_ratings", input: "x" } as const;
    await runWithTimers(() => gateway.runFastGateway(req, { identity: "a" }));
    const promise = gateway.runFastGateway(req, { identity: "b" });
    const pending = expect(promise).resolves.toMatchObject({
      ok: false,
      reason: "SERVICE_BUSY",
    });
    await vi.advanceTimersByTimeAsync(6_000);
    await pending;
  });

  it("enforces the GLOBAL daily quota across identities before any provider call (FR-11)", async () => {
    process.env.DAILY_FAST_GLOBAL = "1";
    resetLlmConfigForTests();
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      calls.push(String(url));
      return Response.json(openAiCompletion("ok"));
    }));
    const [gateway] = await modules();
    const req = { task: "scoring_ratings", input: "x" } as const;
    await runWithTimers(() => gateway.runFastGateway(req, { identity: "anon-A" }));
    // A different identity is still blocked: the global counter is shared.
    const second = await gateway.runFastGateway(req, { identity: "anon-B" });
    expect(second).toMatchObject({ ok: false, reason: "QUOTA_GLOBAL" });
    // Exactly one provider call happened — the rejection was pre-call.
    expect(calls.length).toBe(1);
  });

  it("over-long input is rejected before any provider call (FR-12)", async () => {
    process.env.MAX_INPUT_CHARS = "10";
    resetLlmConfigForTests();
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      calls.push(String(url));
      return Response.json(openAiCompletion("ok"));
    }));
    const [gateway] = await modules();
    const outcome = await gateway.runFastGateway(
      { task: "scoring_ratings", input: "x".repeat(11) },
      { identity: "anon-1" }
    );
    expect(outcome).toMatchObject({ ok: false, reason: "INPUT_TOO_LONG" });
    expect(calls).toEqual([]);
  });
});

/**
 * Advance fake timers ONLY while timers are actually pending (backoff /
 * queue sleeps), so the mocked clock never drifts across minute buckets on
 * calls that resolve without waiting. Idle microtask flushes let mocked
 * fetch chains schedule their next timer.
 */
async function runWithTimers<T>(fn: () => Promise<T>): Promise<T> {
  const promise = fn();
  let idle = 0;
  for (let i = 0; i < 2_000; i++) {
    if (vi.getTimerCount() === 0) {
      idle += 1;
      if (idle > 60) break; // promise settled — no timers left anywhere
      await Promise.resolve();
      continue;
    }
    idle = 0;
    await vi.advanceTimersByTimeAsync(100);
  }
  return promise;
}
