/**
 * OpenAI-compatible provider client (research R4/R5): the ONLY module that
 * talks to a provider over the network (P12/FR-16). Serves the free path
 * (NVIDIA) and the BYOK path (OpenRouter) — both speak the same API shape.
 *
 * Timing guarantees (FR-32/34): each attempt is wrapped in an AbortController
 * that fires at min(per-attempt timeout, overall deadline); the first
 * streamed token must arrive within FIRST_TOKEN_TIMEOUT_MS and the silence
 * between chunks must not exceed CHUNK_SILENCE_TIMEOUT_MS. Retry/fallback
 * policy lives in fallback.ts — this module makes exactly one provider call.
 */

import {
  bodyExcerpt,
  classifyStatus,
  emptyResponseFailure,
  malformedFailure,
  networkFailure,
  retryAfterFrom,
  timeoutFailure,
  type ClassifiedFailure,
} from "./errors";

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface CompletionUsage {
  in: number | null;
  out: number | null;
}

export interface AttemptInput {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxOutputTokens: number;
  stream: boolean;
  /** Absolute epoch ms when THIS attempt must be aborted. */
  abortAt: number;
  firstTokenTimeoutMs: number;
  chunkSilenceTimeoutMs: number;
  /** Dev-only simulated outcome (FR-38); honored only when mock is enabled. */
  mockScenario?: MockTransportScenario | null;
}

export type AttemptOutput =
  | { ok: true; text: string; usage: CompletionUsage }
  | { ok: false; failure: ClassifiedFailure };

/** Dev-only simulated outcomes (FR-38). */
export const MOCK_SCENARIOS = ["429", "500", "timeout", "403_html", "empty"] as const;
export type MockScenario = (typeof MOCK_SCENARIOS)[number];
/** Transport scenario: a named failure, or the default fixed success. */
export type MockTransportScenario = MockScenario | "success";

export function parseMockScenario(value: string | null | undefined): MockScenario | null {
  return value && (MOCK_SCENARIOS as readonly string[]).includes(value)
    ? (value as MockScenario)
    : null;
}

/**
 * Synthetic provider responses for mock mode (FR-38). Real Response objects
 * so the actual parsing/classification path stays in the loop; the timeout
 * scenario rejects on the caller's abort signal exactly like a real stuck
 * connection.
 */
async function mockResponse(input: AttemptInput, signal: AbortSignal): Promise<Response> {
  const scenario = input.mockScenario as MockTransportScenario;
  if (scenario === "timeout") {
    return new Promise<Response>((_, reject) => {
      const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    });
  }
  if (scenario === "429") {
    return new Response(JSON.stringify({ error: { message: "mock rate limit" } }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": "1" },
    });
  }
  if (scenario === "500") {
    return new Response(JSON.stringify({ error: { message: "mock server error" } }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (scenario === "403_html") {
    return new Response(
      "<html><body>Your request was blocked (mock 403).</body></html>",
      { status: 403, headers: { "Content-Type": "text/html" } }
    );
  }
  if (scenario === "empty") {
    return Response.json({ choices: [{ message: { content: "" } }] });
  }
  // Fixed success.
  if (input.stream) {
    const sse =
      `data: ${JSON.stringify({ choices: [{ delta: { content: "Mock " } }] })}\n\n` +
      `data: ${JSON.stringify({ choices: [{ delta: { content: "stream response" } }] })}\n\n` +
      `data: ${JSON.stringify({
        choices: [{ delta: {} }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      })}\n\n` +
      "data: [DONE]\n\n";
    return new Response(sse, { headers: { "Content-Type": "text/event-stream" } });
  }
  return Response.json({
    choices: [{ message: { content: "Mock response (LLM_MOCK=true)" } }],
    usage: { prompt_tokens: 1, completion_tokens: 1 },
  });
}

function buildRequest(input: AttemptInput): { url: string; init: RequestInit } {
  return {
    url: `${input.baseUrl.replace(/\/$/, "")}/chat/completions`,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        max_tokens: input.maxOutputTokens,
        temperature: 0,
        stream: input.stream,
      }),
    },
  };
}

function usageOf(body: unknown): CompletionUsage {
  if (body && typeof body === "object" && "usage" in body) {
    const usage = (body as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } })
      .usage;
    return {
      in: typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : null,
      out:
        typeof usage?.completion_tokens === "number" ? usage.completion_tokens : null,
    };
  }
  return { in: null, out: null };
}

function textOf(body: unknown): string {
  if (body && typeof body === "object" && "choices" in body) {
    const content = (body as { choices?: Array<{ message?: { content?: unknown } }> })
      .choices?.[0]?.message?.content;
    if (typeof content === "string") return content;
  }
  return "";
}

function parseStreamDelta(json: string): { delta?: string; usage?: CompletionUsage } {
  const parsed = JSON.parse(json) as {
    choices?: Array<{ delta?: { content?: unknown } }>;
    usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
  };
  const delta = parsed.choices?.[0]?.delta?.content;
  const usage = parsed.usage;
  return {
    delta: typeof delta === "string" ? delta : undefined,
    usage: {
      in: usage && typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null,
      out:
        usage && typeof usage.completion_tokens === "number"
          ? usage.completion_tokens
          : null,
    },
  };
}

/**
 * One-shot completion (FAST and structured outputs). Outcome is classified;
 * a non-OK HTTP status maps through the failure taxonomy, an unparseable
 * body is malformed, an empty text is empty, an abort is a timeout.
 */
export async function completeOnce(input: AttemptInput): Promise<AttemptOutput> {
  const { url, init } = buildRequest(input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, input.abortAt - Date.now()));
  try {
    const response = input.mockScenario
      ? await mockResponse(input, controller.signal)
      : await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      // §16 FR-56: keep the raw error body for the terminal-log excerpt.
      const raw = await response.text().catch(() => "");
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // non-JSON body — still excerpted below
      }
      return {
        ok: false,
        failure: {
          ...classifyStatus(response.status, retryAfterFrom(response.headers, parsed)),
          body: bodyExcerpt(raw),
        },
      };
    }
    const body: unknown = await response.json().catch(() => null);
    if (body === null) return { ok: false, failure: malformedFailure() };
    const text = textOf(body);
    if (!text.trim()) return { ok: false, failure: emptyResponseFailure() };
    return { ok: true, text, usage: usageOf(body) };
  } catch (exc) {
    if (exc instanceof DOMException && exc.name === "AbortError") {
      return { ok: false, failure: timeoutFailure() };
    }
    return { ok: false, failure: networkFailure() };
  } finally {
    clearTimeout(timer);
  }
}

/** A pre-commit stream failure: the chain may try the next model/attempt. */
export class StreamAttemptError extends Error {
  constructor(public readonly failure: ClassifiedFailure) {
    super("stream attempt failed");
    this.name = "StreamAttemptError";
  }
}

/** A post-commit (mid-stream) failure: received text is preserved (FR-32). */
export class MidStreamError extends Error {
  constructor(public readonly received: string) {
    super("stream interrupted midway");
    this.name = "MidStreamError";
  }
}

/**
 * Streaming completion (GEN display text). Yields text deltas; the caller
 * commits after the first delta (fallback may only happen before it). The
 * first token must arrive within firstTokenTimeoutMs, chunks within
 * chunkSilenceTimeoutMs of each other, everything within abortAt.
 */
export async function* streamCompletion(
  input: AttemptInput
): AsyncGenerator<
  { kind: "delta"; text: string } | { kind: "done"; usage: CompletionUsage },
  void,
  void
> {
  const { url, init } = buildRequest({ ...input, stream: true });
  const controller = new AbortController();
  const hardTimer = setTimeout(() => controller.abort(), Math.max(1, input.abortAt - Date.now()));
  const received: string[] = [];
  try {
    const response = input.mockScenario
      ? await mockResponse(input, controller.signal)
      : await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok || !response.body) {
      // §16 FR-56: keep the raw error body for the terminal-log excerpt.
      const raw = response.body ? await response.text().catch(() => "") : "";
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // non-JSON body — still excerpted below
      }
      throw new StreamAttemptError(
        response.ok
          ? emptyResponseFailure()
          : {
              ...classifyStatus(response.status, retryAfterFrom(response.headers, parsed)),
              body: bodyExcerpt(raw),
            }
      );
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let sawFirstToken = false;
    let phaseTimer = setTimeout(() => controller.abort(), input.firstTokenTimeoutMs);
    const usage: CompletionUsage = { in: null, out: null };
    try {
      for (;;) {
        let read: ReadableStreamReadResult<Uint8Array>;
        try {
          read = await reader.read();
        } catch {
          if (sawFirstToken) {
            // Mid-stream failure: received text is preserved for the caller.
            throw new MidStreamError(received.join(""));
          }
          throw new StreamAttemptError(timeoutFailure());
        }
        if (read.done) break;
        buffer += decoder.decode(read.value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line || line.startsWith(":") || !line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") {
            yield { kind: "done", usage };
            return;
          }
          let delta: string | undefined;
          try {
            const parsed = parseStreamDelta(data);
            delta = parsed.delta;
            if (parsed.usage) {
              if (parsed.usage.in !== null) usage.in = parsed.usage.in;
              if (parsed.usage.out !== null) usage.out = parsed.usage.out;
            }
          } catch {
            continue; // keep-alive or malformed comment line — ignored
          }
          if (delta) {
            if (!sawFirstToken) {
              sawFirstToken = true;
              clearTimeout(phaseTimer);
              phaseTimer = setTimeout(
                () => controller.abort(),
                input.chunkSilenceTimeoutMs
              );
            }
            received.push(delta);
            yield { kind: "delta", text: delta };
          }
        }
      }
      if (!sawFirstToken) throw new StreamAttemptError(emptyResponseFailure());
      yield { kind: "done", usage };
    } finally {
      clearTimeout(phaseTimer);
    }
  } catch (exc) {
    if (exc instanceof StreamAttemptError || exc instanceof MidStreamError) throw exc;
    if (exc instanceof DOMException && exc.name === "AbortError") {
      if (received.length > 0) throw new MidStreamError(received.join(""));
      throw new StreamAttemptError(timeoutFailure());
    }
    if (received.length > 0) throw new MidStreamError(received.join(""));
    throw new StreamAttemptError(networkFailure());
  } finally {
    clearTimeout(hardTimer);
  }
}
