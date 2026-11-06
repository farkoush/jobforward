import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearGatewayEnv, setGatewayTestEnv } from "./helpers";
import { resetRateStoreForTests } from "@/lib/llm/rate-store";
import { resetLlmConfigForTests, mockEnabled } from "@/lib/llm/config";
import { GATEWAY_MESSAGES } from "@/lib/llm/messages";
import { GATEWAY_REASONS, type GatewayReason } from "@/lib/llm/types";

type GatewayModule = typeof import("@/lib/llm/gateway");

/**
 * Error-path matrix (P15, §13): EVERY pinned gateway reason is covered —
 * (a) its message exists, is English B1 (constitution v4.0.0 P16: no
 * Persian, no technical detail), and (b) where a deterministic trigger
 * exists, the reason is reached END-TO-END through runFastGateway.
 */

type FastOptions = Parameters<GatewayModule["runFastGateway"]>[1];

const PERSIAN = /[\u0600-\u06FF]/;
const TECH_DETAIL = /\b(HTTP \d|stack trace|exception|undefined|null pointer)\b/i;

/**
 * LLM_MOCK=true for every test: no real provider is ever contacted, and a
 * scenario can be selected per request (FR-38).
 */
function enableMock(): void {
  process.env.LLM_MOCK = "true";
  resetLlmConfigForTests();
}

describe("error-path matrix — every gateway reason (P15)", () => {
  beforeEach(() => {
    setGatewayTestEnv();
    enableMock();
    resetRateStoreForTests();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    clearGatewayEnv();
    delete process.env.LLM_MOCK;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function gatewayModule(): Promise<GatewayModule> {
    return import("@/lib/llm/gateway");
  }

  async function fast(
    opts: FastOptions,
    req?: { task?: string; input?: string }
  ): Promise<{ reason?: GatewayReason; ok: boolean }> {
    const { runFastGateway } = await gatewayModule();
    const outcome = await runFastGateway(
      { task: req?.task ?? "scoring_ratings", input: req?.input ?? "x" },
      opts
    );
    return outcome.ok ? { ok: true } : { ok: false, reason: outcome.reason };
  }

  // --- (a) message guards: language + no technical detail, for ALL reasons ---

  it("every reason has a non-empty English B1 message with zero Persian", () => {
    for (const reason of GATEWAY_REASONS) {
      const message = GATEWAY_MESSAGES[reason];
      expect(message, `message for ${reason}`).toBeTruthy();
      expect(message.length).toBeGreaterThan(10);
      expect(message, `${reason} must be English (P16 v4.0.0)`).not.toMatch(PERSIAN);
      expect(message, `${reason} must be free of technical detail`).not.toMatch(TECH_DETAIL);
    }
  });

  it("RETRYABLE_REASONS only contains reasons that are actually retryable", async () => {
    const { RETRYABLE_REASONS } = await import("@/lib/llm/messages");
    // Sanity: quota/busy/limit reasons must NOT offer an immediate Retry.
    for (const reason of ["QUOTA_USER", "QUOTA_GLOBAL", "BYOK_LIMIT"] as const) {
      expect(RETRYABLE_REASONS.has(reason), reason).toBe(false);
    }
  });

  // --- (b) end-to-end triggers through runFastGateway ---

  it("QUOTA_USER — per-user daily quota exhausted (pre-call)", async () => {
    process.env.DAILY_FAST_PER_USER = "0";
    resetLlmConfigForTests();
    expect(await fast({ identity: "anon-1" })).toEqual({ ok: false, reason: "QUOTA_USER" });
  });

  it("QUOTA_GLOBAL — global daily quota exhausted (pre-call)", async () => {
    process.env.DAILY_FAST_GLOBAL = "0";
    resetLlmConfigForTests();
    expect(await fast({ identity: "anon-1" })).toEqual({ ok: false, reason: "QUOTA_GLOBAL" });
  });

  it("MINUTE_LIMIT — per-user per-minute cap (pre-call)", async () => {
    process.env.USER_PER_MINUTE = "0";
    resetLlmConfigForTests();
    expect(await fast({ identity: "anon-1" })).toEqual({ ok: false, reason: "MINUTE_LIMIT" });
  });

  it("BYOK_LIMIT — byok per-minute cap (pre-call)", async () => {
    process.env.BYOK_PER_MINUTE = "0";
    resetLlmConfigForTests();
    expect(
      await fast({ identity: "anon-1", byokKey: "sk-or-k", byokModel: "m" })
    ).toEqual({ ok: false, reason: "BYOK_LIMIT" });
  });

  it("SERVICE_BUSY — provider limiter full past the queue window", async () => {
    process.env.PROVIDER_RPM_LIMIT = "0";
    process.env.BUSY_QUEUE_MS = "100";
    resetLlmConfigForTests();
    expect(await fast({ identity: "anon-1" })).toEqual({
      ok: false,
      reason: "SERVICE_BUSY",
    });
  }, 10_000);

  it("INPUT_TOO_LONG — rejected before any provider call", async () => {
    process.env.MAX_INPUT_CHARS = "5";
    resetLlmConfigForTests();
    expect(await fast({ identity: "anon-1", }, { input: "x".repeat(6) })).toEqual({
      ok: false,
      reason: "INPUT_TOO_LONG",
    });
  });

  it("INVALID_TASK — unknown task name", async () => {
    expect(await fast({ identity: "anon-1" }, { task: "mystery" })).toEqual({
      ok: false,
      reason: "INVALID_TASK",
    });
  });

  it("INVALID_INPUT — byok request without a model", async () => {
    expect(
      await fast({ identity: "anon-1", byokKey: "sk-or-k", byokModel: null })
    ).toEqual({ ok: false, reason: "INVALID_INPUT" });
  });

  it("CONFIG_ERROR — gateway configuration incomplete", async () => {
    delete process.env.NVIDIA_API_KEY;
    delete process.env.GEN_MODEL;
    delete process.env.FAST_MODEL;
    resetLlmConfigForTests();
    expect(await fast({ identity: "anon-1" })).toEqual({
      ok: false,
      reason: "CONFIG_ERROR",
    });
  });

  it("ALL_MODELS_FAILED — every model fails (mock empty responses)", async () => {
    expect(
      await fast({ identity: "anon-1", mockError: "empty" })
    ).toEqual({ ok: false, reason: "ALL_MODELS_FAILED" });
  }, 15_000);

  it("BYOK_FAILED — fatal provider error on the byok path (mock 403 HTML)", async () => {
    expect(
      await fast({ identity: "anon-1", byokKey: "sk-or-k", byokModel: "m", mockError: "403_html" })
    ).toEqual({ ok: false, reason: "BYOK_FAILED" });
  });

  it("RATE_LIMITED — persistent 429s reach the per-request provider-call cap (FR-44)", async () => {
    process.env.MAX_PROVIDER_CALLS_PER_REQUEST = "1";
    resetLlmConfigForTests();
    const { runFastGateway } = await gatewayModule();
    const outcome = await runFastGateway(
      { task: "scoring_ratings", input: "x" },
      { identity: "anon-1", mockError: "429" }
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("RATE_LIMITED");
      expect(outcome.retryAfter).toBe(1); // honored from the mock's Retry-After
    }
  }, 15_000);

  it("NETWORK + UNAUTHORIZED — message-only coverage (no deterministic gateway trigger)", async () => {
    // NETWORK fires on an unexpected orchestrator throw; UNAUTHORIZED on the
    // route's 401 before the gateway runs. Both carry messages and follow
    // the same shape contract — asserted here at the message level.
    expect(GATEWAY_MESSAGES.NETWORK).toMatch(/connection/i);
    expect(GATEWAY_MESSAGES.UNAUTHORIZED).toMatch(/sign in/i);
    expect(mockEnabled()).toBe(true); // the suite itself runs under mock
  });
});
