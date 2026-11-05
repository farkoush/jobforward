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
}

export type AttemptOutput =
  | { ok: true; text: string; usage: CompletionUsage }
  | { ok: false; failure: ClassifiedFailure };

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
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      return {
        ok: false,
        failure: classifyStatus(response.status, retryAfterFrom(response.headers, body)),
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
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok || !response.body) {
      const body: unknown = response.body
        ? await response.json().catch(() => null)
        : null;
      throw new StreamAttemptError(
        response.ok
          ? emptyResponseFailure()
          : classifyStatus(response.status, retryAfterFrom(response.headers, body))
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
