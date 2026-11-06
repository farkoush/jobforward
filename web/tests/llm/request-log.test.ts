import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearGatewayEnv, setGatewayTestEnv } from "./helpers";
import { resetRateStoreForTests } from "@/lib/llm/rate-store";
import { resetLlmConfigForTests } from "@/lib/llm/config";

/**
 * Request logging (US4, FR-08/09): every outcome logged with all required
 * fields; prompt content, provider keys, BYOK keys, and the gate password
 * NEVER appear; token counts are null (never guessed) when unreported.
 */

function openAiCompletion(text: string) {
  return {
    choices: [{ message: { content: text } }],
    usage: { prompt_tokens: 5, completion_tokens: 3 },
  };
}

function capturedLogs(): Array<Record<string, unknown>> {
  return (vi.mocked(console.log).mock.calls as unknown as Array<[string]>)
    .map((call) => call[0])
    .filter((line) => typeof line === "string" && line.startsWith("{"))
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("request log (US4, SC-004)", () => {
  beforeEach(() => {
    setGatewayTestEnv();
    resetRateStoreForTests();
    resetLlmConfigForTests();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    clearGatewayEnv();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function gatewayModule() {
    return import("@/lib/llm/gateway");
  }

  it("logs a success with every required field", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(openAiCompletion("hi"))));
    const { runFastGateway } = await gatewayModule();
    await runFastGateway(
      { task: "scoring_ratings", input: "score this" },
      { identity: "anon-1" }
    );
    const entries = capturedLogs();
    expect(entries.length).toBe(1);
    const entry = entries[0];
    for (const field of [
      "timestamp",
      "category",
      "model",
      "fallbackUsed",
      "source",
      "inputTokens",
      "outputTokens",
      "responseTimeMs",
      "finalStatus",
    ]) {
      expect(entry).toHaveProperty(field);
    }
    expect(entry.finalStatus).toBe("succeeded");
    expect(entry.source).toBe("free");
    expect(entry.inputTokens).toBe(5);
  });

  it("logs a rejection (quota) with a limit status and no model", async () => {
    process.env.DAILY_FAST_PER_USER = "0";
    resetLlmConfigForTests();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(openAiCompletion("hi"))));
    const { runFastGateway } = await gatewayModule();
    await runFastGateway(
      { task: "scoring_ratings", input: "x" },
      { identity: "anon-1" }
    );
    const entries = capturedLogs();
    expect(entries.length).toBe(1);
    expect(entries[0].finalStatus).toBe("rejected_limit");
    expect(entries[0].model).toBeNull();
  });

  it("never logs prompt content, keys, or the password — even on failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(openAiCompletion("hi"))));
    const { runFastGateway } = await gatewayModule();
    const secretInput =
      "PROMPT-CONTENT-MARKER my resume text nvapi-SUPERSECRETKEY123 sk-or-ALSOSECRET99";
    await runFastGateway(
      { task: "scoring_ratings", input: secretInput },
      { identity: "anon-1", byokKey: "sk-or-BYOKSECRET", byokModel: "m" }
    );
    const allLogs = JSON.stringify(capturedLogs());
    expect(allLogs).not.toContain("PROMPT-CONTENT-MARKER");
    expect(allLogs).not.toContain("nvapi-SUPERSECRETKEY123");
    expect(allLogs).not.toContain("sk-or-ALSOSECRET99");
    expect(allLogs).not.toContain("sk-or-BYOKSECRET");
    expect(allLogs).not.toContain("test-pass-123");
  });

  it("records tokens as null (never guessed) when the provider omits usage", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      choices: [{ message: { content: "hi" } }],
    })));
    const { runFastGateway } = await gatewayModule();
    await runFastGateway(
      { task: "scoring_ratings", input: "x" },
      { identity: "anon-1" }
    );
    const entries = capturedLogs();
    expect(entries[0].inputTokens).toBeNull();
    expect(entries[0].outputTokens).toBeNull();
  });

  it("marks fallback usage when the responding model is not the chain head", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const model = JSON.parse(String(init?.body)).model as string;
      if (model === "test-fast-primary") {
        return Response.json({ error: { message: "not found" } }, { status: 404 });
      }
      return Response.json(openAiCompletion("ok"));
    }));
    const { runFastGateway } = await gatewayModule();
    await runFastGateway(
      { task: "scoring_ratings", input: "x" },
      { identity: "anon-1" }
    );
    const entries = capturedLogs();
    expect(entries[0].fallbackUsed).toBe(true);
    expect(entries[0].fallbackDepth).toBe(1);
    expect(entries[0].model).toBe("test-fast-fallback-1");
    expect(entries[0].finalStatus).toBe("succeeded");
  });
});
