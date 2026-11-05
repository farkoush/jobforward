import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearGatewayEnv, setGatewayTestEnv } from "./helpers";
import { resetRateStoreForTests } from "@/lib/llm/rate-store";
import { resetLlmConfigForTests } from "@/lib/llm/config";

/**
 * GEN streaming path (FR-32, SC-010, P15): fallback/retry happen ONLY before
 * the first chunk; a mid-stream cut ends with a typed error event while the
 * received text stays with the consumer; the done event carries model,
 * source, usage, ms; a first-token timeout moves to the next model.
 */

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

function sseChunk(delta: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`;
}

function sseDone(usage?: { prompt_tokens: number; completion_tokens: number }): string {
  return `data: ${JSON.stringify({
    choices: [{ delta: {} }],
    ...(usage ? { usage } : {}),
  })}\n\ndata: [DONE]\n\n`;
}

function sseResponse(parts: Array<string>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
}

/** One chunk, then a hard mid-stream failure AFTER it is consumed. */
function cuttingResponse(): Response {
  const encoder = new TextEncoder();
  let delivered = false;
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(sseChunk("partial ")));
        delivered = true;
        void delivered;
      },
      pull(controller) {
        // Second read: the chunk was consumed — now cut the stream.
        if (delivered) controller.error(new Error("connection reset"));
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } }
  );
}

/** A stream that never emits; it honors the fetch abort like a real body. */
function hangingResponse(signal: AbortSignal): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        const onAbort = () =>
          controller.error(new DOMException("Aborted", "AbortError"));
        if (signal.aborted) onAbort();
        else signal.addEventListener("abort", onAbort, { once: true });
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } }
  );
}

type GatewayModule = typeof import("@/lib/llm/gateway");

describe("GEN streaming (FR-32, SC-010)", () => {
  beforeEach(() => {
    setGatewayTestEnv();
    resetRateStoreForTests();
    resetLlmConfigForTests();
  });
  afterEach(() => {
    clearGatewayEnv();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function gatewayModule(): Promise<GatewayModule> {
    return import("@/lib/llm/gateway");
  }

  async function collect(
    gen: AsyncGenerator<import("@/lib/llm/types").StreamEvent, void, void>
  ): Promise<import("@/lib/llm/types").StreamEvent[]> {
    const events: import("@/lib/llm/types").StreamEvent[] = [];
    for await (const event of gen) events.push(event);
    return events;
  }

  it("streams chunks then a done event carrying model, source, usage and ms", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([sseChunk("Hello "), sseChunk("world"), sseDone({ prompt_tokens: 4, completion_tokens: 2 })])
      )
    );
    const { runGenGateway } = await gatewayModule();
    const events = await collect(
      runGenGateway({ task: "gen_display", input: "x" }, { identity: "anon-1" })
    );
    expect(events[0]).toEqual({ type: "chunk", text: "Hello " });
    expect(events[1]).toEqual({ type: "chunk", text: "world" });
    const done = events[events.length - 1];
    expect(done).toMatchObject({
      type: "done",
      model: "test-gen-primary",
      source: "free",
      usage: { in: 4, out: 2 },
    });
    expect((done as { ms: number }).ms).toBeGreaterThanOrEqual(0);
  });

  it("falls back to the next model when the primary errors before any chunk", async () => {
    const calledModels: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const model = JSON.parse(String(init?.body)).model as string;
      calledModels.push(model);
      if (model === "test-gen-primary") {
        return Response.json({ error: { message: "boom" } }, { status: 500 });
      }
      return sseResponse([sseChunk("from fallback"), sseDone()]);
    }));
    const { runGenGateway } = await gatewayModule();
    const events = await collect(
      runGenGateway({ task: "gen_display", input: "x" }, { identity: "anon-1" })
    );
    // Retryable 500 → 2 attempts on the primary, then the fallback (FR-34).
    expect(calledModels).toEqual([
      "test-gen-primary",
      "test-gen-primary",
      "test-gen-fallback-1",
    ]);
    expect(events.some((e) => e.type === "chunk" && e.text === "from fallback")).toBe(true);
    expect(events[events.length - 1]).toMatchObject({
      type: "done",
      model: "test-gen-fallback-1",
    });
  });

  it("NEVER switches models after the first chunk — a mid-stream cut ends typed", async () => {
    const calledModels: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const model = JSON.parse(String(init?.body)).model as string;
      calledModels.push(model);
      if (model === "test-gen-primary") return cuttingResponse();
      return sseResponse([sseChunk("should never happen"), sseDone()]);
    }));
    const { runGenGateway } = await gatewayModule();
    const events = await collect(
      runGenGateway({ task: "gen_display", input: "x" }, { identity: "anon-1" })
    );
    // Only the primary was contacted — no fallback after commitment.
    expect(calledModels).toEqual(["test-gen-primary"]);
    expect(events[0]).toEqual({ type: "chunk", text: "partial " });
    const last = events[events.length - 1];
    expect(last).toMatchObject({ type: "error", reason: "NETWORK", retryable: true });
    expect(events.some((e) => e.type === "done")).toBe(false);
  });

  it("a first-token timeout moves to the next model (reasoning models may be slow)", async () => {
    process.env.FIRST_TOKEN_TIMEOUT_MS = "80";
    resetLlmConfigForTests();
    const calledModels: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const model = JSON.parse(String(init?.body)).model as string;
      calledModels.push(model);
      if (model === "test-gen-primary") {
        return hangingResponse((init?.signal ?? new AbortController().signal) as AbortSignal);
      }
      return sseResponse([sseChunk("late but here"), sseDone()]);
    }));
    const { runGenGateway } = await gatewayModule();
    const events = await collect(
      runGenGateway({ task: "gen_display", input: "x" }, { identity: "anon-1" })
    );
    // 2 attempts on the silent primary (80 ms each), then the fallback.
    expect(calledModels).toEqual([
      "test-gen-primary",
      "test-gen-primary",
      "test-gen-fallback-1",
    ]);
    expect(events[events.length - 1]).toMatchObject({
      type: "done",
      model: "test-gen-fallback-1",
    });
  }, 10_000);

  it("the request log for a stream records the responding model and success", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () =>
      sseResponse([sseChunk("hi"), sseDone({ prompt_tokens: 1, completion_tokens: 1 })])
    ));
    const { runGenGateway } = await gatewayModule();
    await collect(runGenGateway({ task: "gen_display", input: "x" }, { identity: "anon-1" }));
    const entries = (logSpy.mock.calls as unknown as Array<[string]>)
      .map((c) => c[0])
      .filter((line) => typeof line === "string" && line.startsWith("{"))
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(entries[0]).toMatchObject({
      finalStatus: "succeeded",
      model: "test-gen-primary",
      fallbackUsed: false,
      category: "GEN",
    });
    logSpy.mockRestore();
  });
});
