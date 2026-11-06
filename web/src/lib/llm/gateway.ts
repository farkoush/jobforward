/**
 * The gateway orchestrator (FR-23, P12): the single server-side entry point
 * for model work. Every request — free or BYOK — flows through here and ends
 * in a typed result or typed stream events; the gateway NEVER throws to the
 * UI. Route selection: free = NVIDIA chain from env config; BYOK = the
 * user's OpenRouter key and model, chain length 1, never auto-falling back
 * to the free path (FR-28).
 */

import {
  budgetFor,
  ConfigError,
  getLlmConfig,
  maxTokensFor,
  mockEnabled,
} from "./config";
import { getAppliedChains } from "./validate-models";
import { PROVIDERS } from "@/lib/byok/providers.config";
import type { MockScenario, MockTransportScenario } from "./client";
import { categoryForTask } from "./tasks";
import {
  buildRequestLogEntry,
  statusForReason,
  writeRequestLog,
} from "./request-log";
import {
  acquireProviderSlot,
  BusyError,
  checkRequestLimits,
} from "./limits";
import { runChain } from "./fallback";
import {
  completeOnce,
  MidStreamError,
  streamCompletion,
  StreamAttemptError,
  type ChatMessage,
  type CompletionUsage,
} from "./client";
import {
  failure,
  type Category,
  type GatewayFailure,
  type GatewayOutcome,
  type Source,
  type StreamEvent,
} from "./types";

// Single BYOK provider (FR-27): the URL is the provider registry's declared
// endpoint (providers.config) — a public endpoint, not a secret; keys stay
// env-only/user-request-only (P13/P14).
const OPENROUTER_BASE_URL = PROVIDERS.openrouter.baseUrl;

export interface GatewayRequest {
  task: string;
  input: string;
  /** Optional system prompt (e.g. the pinned scoring evaluator prompt). */
  system?: string;
}

export interface GatewayCallOptions {
  /** Quota identity — the anonymous cookie id (FR-18). */
  identity: string;
  /** Per-request BYOK key (FR-29): present → BYOK path. Never stored. */
  byokKey?: string | null;
  /** The user's chosen model on the BYOK provider (advanced settings). */
  byokModel?: string | null;
  /** Dev-only simulated failure (FR-38); honored only when mock is enabled. */
  mockError?: MockScenario | null;
}

function messagesFor(req: GatewayRequest): ChatMessage[] {
  const messages: ChatMessage[] = [];
  if (req.system) messages.push({ role: "system", content: req.system });
  messages.push({ role: "user", content: req.input });
  return messages;
}

function exhaustedReason(source: Source): GatewayFailure["reason"] {
  return source === "byok" ? "BYOK_FAILED" : "ALL_MODELS_FAILED";
}

/** Map a finished chain to the typed failure the contract carries. */
function chainFailure(result: {
  outcome: "exhausted" | "fatal" | "rate_limited";
  lastClass: "retryable" | "not_found" | "fatal" | "none";
  lastStatus?: number;
  retryAfter?: number;
  source: Source;
}): GatewayFailure {
  if (result.outcome === "rate_limited") {
    // Persistent 429s across the chain reached the per-request call cap (or
    // the deadline) — typed RATE_LIMITED with retryAfter (FR-44).
    return failure("RATE_LIMITED", {
      retryable: true,
      retryAfter: result.retryAfter,
      source: result.source,
    });
  }
  if (result.outcome === "fatal") {
    return failure(result.source === "byok" ? "BYOK_FAILED" : "CONFIG_ERROR", {
      retryable: false,
      source: result.source,
    });
  }
  return failure(exhaustedReason(result.source), {
    retryable: result.lastClass === "retryable",
    retryAfter: result.retryAfter,
    source: result.source,
  });
}

interface Preflight {
  ok: true;
  category: Category;
  source: Source;
  chain: string[];
  baseUrl: string;
  apiKey: string;
  deadlineAt: number;
}
type PreflightFailure = { ok: false; failure: GatewayFailure };

/** Shared preflight: task lookup, config, input length, limits (FR-13). */
async function preflight(
  req: GatewayRequest,
  opts: GatewayCallOptions
): Promise<Preflight | PreflightFailure> {
  const category = categoryForTask(req.task);
  if (!category) return { ok: false, failure: failure("INVALID_TASK") };

  let cfg;
  try {
    cfg = getLlmConfig();
  } catch (exc) {
    if (exc instanceof ConfigError) {
      return { ok: false, failure: failure("CONFIG_ERROR") };
    }
    throw exc;
  }

  if (req.input.length > cfg.MAX_INPUT_CHARS) {
    return { ok: false, failure: failure("INPUT_TOO_LONG") };
  }

  const source: Source = opts.byokKey ? "byok" : "free";
  const limits = await checkRequestLimits({
    identity: opts.identity,
    source,
    category,
  });
  if (!limits.allowed) {
    return { ok: false, failure: failure(limits.reason, { source }) };
  }

  const budget = budgetFor(category);
  // Effective chain (§14 FR-39): the applied (validated + pruned) chains from
  // startup override the raw env chains; an empty pruned category yields the
  // typed CONFIG_ERROR result — never a request against known-invalid models.
  const applied = getAppliedChains();
  const rawChain = category === "GEN" ? cfg.genChain : cfg.fastChain;
  const chain =
    source === "byok"
      ? [opts.byokModel ?? ""].filter(Boolean)
      : (applied?.[category] ?? rawChain).filter(Boolean);
  if (chain.length === 0) {
    return {
      ok: false,
      failure: failure(source === "byok" ? "INVALID_INPUT" : "CONFIG_ERROR", { source }),
    };
  }

  return {
    ok: true,
    category,
    source,
    chain,
    baseUrl: source === "byok" ? OPENROUTER_BASE_URL : cfg.NVIDIA_BASE_URL,
    apiKey: source === "byok" ? (opts.byokKey as string) : cfg.NVIDIA_API_KEY,
    deadlineAt: Date.now() + budget.deadlineMs,
  };
}

function attemptInput(
  pre: Preflight & { ok: true },
  model: string,
  messages: ChatMessage[],
  opts: { attemptTimeoutMs: number; stream: boolean },
  mockError: MockScenario | null
) {
  const cfg = getLlmConfig();
  return {
    baseUrl: pre.baseUrl,
    apiKey: pre.apiKey,
    model,
    messages,
    // §14 FR-42: reasoning-style models on FAST get the higher budget.
    maxOutputTokens: maxTokensFor(pre.category, model),
    stream: opts.stream,
    abortAt: Math.min(Date.now() + opts.attemptTimeoutMs, pre.deadlineAt),
    firstTokenTimeoutMs: cfg.FIRST_TOKEN_TIMEOUT_MS,
    chunkSilenceTimeoutMs: cfg.CHUNK_SILENCE_TIMEOUT_MS,
    // Dev-only (FR-38): honored only when the mock switch is on (which is
    // itself forced off in production). No scenario → fixed success.
    mockScenario: mockEnabled()
      ? ((mockError ?? "success") as MockTransportScenario)
      : null,
  };
}

/** FAST / structured path: one-shot completion with the full chain policy. */
export async function runFastGateway(
  req: GatewayRequest,
  opts: GatewayCallOptions
): Promise<GatewayOutcome> {
  const started = Date.now();
  const inner = await runFastGatewayInner(req, opts);
  // US4: one structured, redacted log entry for EVERY outcome (FR-08/09).
  writeRequestLog(
    buildRequestLogEntry({
      category: inner.category,
      model: inner.outcome.ok ? inner.outcome.model : null,
      fallbackUsed: inner.fallbackUsed,
      fallbackDepth: inner.fallbackDepth,
      attempts: inner.attempts,
      source: inner.outcome.source,
      inputTokens: inner.outcome.ok ? inner.outcome.usage.in : null,
      outputTokens: inner.outcome.ok ? inner.outcome.usage.out : null,
      responseTimeMs: inner.outcome.ok ? inner.outcome.ms : Date.now() - started,
      finalStatus: inner.outcome.ok
        ? "succeeded"
        : statusForReason(inner.outcome.reason),
      reason: inner.outcome.ok ? undefined : inner.outcome.reason,
    })
  );
  return inner.outcome;
}

interface FastInnerResult {
  outcome: GatewayOutcome;
  category: Category | null;
  fallbackUsed: boolean;
  fallbackDepth: number | null;
  attempts: Array<{ model: string; result: string; status?: number }>;
}

async function runFastGatewayInner(
  req: GatewayRequest,
  opts: GatewayCallOptions
): Promise<FastInnerResult> {
  const started = Date.now();
  const attempts: Array<{ model: string; result: string; status?: number }> = [];
  let pre: Preflight | PreflightFailure;
  try {
    pre = await preflight(req, opts);
  } catch (exc) {
    if (exc instanceof BusyError)
      return { outcome: failure("SERVICE_BUSY", { retryable: true }), category: null, fallbackUsed: false, fallbackDepth: null, attempts };
    return { outcome: failure("NETWORK", { retryable: true }), category: null, fallbackUsed: false, fallbackDepth: null, attempts };
  }
  if (!pre.ok) {
    return { outcome: pre.failure, category: null, fallbackUsed: false, fallbackDepth: null, attempts };
  }

  const budget = budgetFor(pre.category);
  const messages = messagesFor(req);
  try {
    const result = await runChain({
      models: pre.chain,
      source: pre.source,
      deadlineAt: pre.deadlineAt,
      onProviderCall: acquireProviderSlot,
      onAttempt: ({ model, attempt, failure }) =>
        attempts.push({
          model,
          result: failure.kind ?? failure.cls,
          status: failure.status,
        }),
      maxProviderCalls: getLlmConfig().MAX_PROVIDER_CALLS_PER_REQUEST,
      attempt: (model) =>
        completeOnce(
          attemptInput(
            pre,
            model,
            messages,
            {
              attemptTimeoutMs: budget.attemptTimeoutMs,
              stream: false,
            },
            opts.mockError ?? null
          )
        ),
    });
    if (result.ok) {
      return {
        outcome: {
          ok: true,
          text: result.text,
          model: result.model,
          modelUsed: result.model,
          usedFallback: result.model !== pre.chain[0],
          fallbackDepth: Math.max(0, pre.chain.indexOf(result.model)),
          source: pre.source,
          usage: result.usage,
          ms: Date.now() - started,
        },
        category: pre.category,
        fallbackUsed: result.model !== pre.chain[0],
        fallbackDepth: Math.max(0, pre.chain.indexOf(result.model)),
        attempts,
      };
    }
    return {
      outcome: chainFailure(result),
      category: pre.category,
      fallbackUsed: false,
      fallbackDepth: null,
      attempts,
    };
  } catch (exc) {
    if (exc instanceof BusyError)
      return {
        outcome: failure("SERVICE_BUSY", { retryable: true, source: pre.source }),
        category: pre.category,
        fallbackUsed: false,
        fallbackDepth: null,
        attempts,
      };
    return {
      outcome: failure("NETWORK", { retryable: true, source: pre.source }),
      category: pre.category,
      fallbackUsed: false,
      fallbackDepth: null,
      attempts,
    };
  }
}

/**
 * GEN path (US4): streams typed events and logs the final outcome after the
 * stream ends — every stream terminates in `done` or `error` (FR-23).
 */
export async function* runGenGateway(
  req: GatewayRequest,
  opts: GatewayCallOptions
): AsyncGenerator<StreamEvent, void, void> {
  const started = Date.now();
  const attempts: Array<{ model: string; result: string; status?: number }> = [];
  const category = categoryForTask(req.task);
  let source: Source = opts.byokKey ? "byok" : "free";
  let fallbackUsed = false;
  let last: StreamEvent | null = null;
  for await (const event of runGenGatewayInner(req, opts, attempts)) {
    if (event.type === "done") {
      source = event.source;
      let chainHead = "";
      try {
        chainHead = opts.byokKey
          ? (opts.byokModel ?? "")
          : getLlmConfig().genChain[0];
      } catch {
        chainHead = "";
      }
      fallbackUsed = event.model !== chainHead;
    } else if (event.type === "error") {
      source = event.source;
    }
    if (event.type !== "chunk") last = event;
    yield event;
  }
  const ok = last?.type === "done";
  writeRequestLog(
    buildRequestLogEntry({
      category,
      model: ok && last && last.type === "done" ? last.model : null,
      fallbackUsed,
      fallbackDepth:
        last && last.type === "done" ? last.fallbackDepth : null,
      attempts,
      source: last ? last.source : source,
      inputTokens: ok && last && last.type === "done" ? last.usage.in : null,
      outputTokens: ok && last && last.type === "done" ? last.usage.out : null,
      responseTimeMs: Date.now() - started,
      finalStatus: ok
        ? "succeeded"
        : last && last.type === "error"
          ? statusForReason(last.reason)
          : "failed_after_all_models",
      reason: last && last.type === "error" ? last.reason : undefined,
    })
  );
}

/**
 * GEN streaming core (FR-32). Fallback/retry happen ONLY before the first
 * chunk; after commitment a mid-stream failure ends the stream with a typed
 * error event and the received text stays client-side.
 */
async function* runGenGatewayInner(
  req: GatewayRequest,
  opts: GatewayCallOptions,
  attempts: Array<{ model: string; result: string; status?: number }>
): AsyncGenerator<StreamEvent, void, void> {
  const started = Date.now();
  let pre: Preflight | PreflightFailure;
  try {
    pre = await preflight(req, opts);
  } catch (exc) {
    if (exc instanceof BusyError) {
      yield { type: "error", ...failure("SERVICE_BUSY", { retryable: true }) };
      return;
    }
    yield { type: "error", ...failure("NETWORK", { retryable: true }) };
    return;
  }
  if (!pre.ok) {
    yield { type: "error", ...pre.failure };
    return;
  }

  const budget = budgetFor(pre.category);
  const messages = messagesFor(req);
  const maxAttempts = 2;
  let lastFailure: { cls: "retryable" | "not_found" | "fatal" | "none"; retryAfter?: number } = {
    cls: "none",
  };

  for (const model of pre.chain) {
    let skipModel = false;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (Date.now() >= pre.deadlineAt) {
        yield {
          type: "error",
          ...failure(exhaustedReason(pre.source), {
            retryable: lastFailure.cls === "retryable",
            source: pre.source,
          }),
        };
        return;
      }
      try {
        await acquireProviderSlot();
      } catch (exc) {
        if (exc instanceof BusyError) {
          yield { type: "error", ...failure("SERVICE_BUSY", { retryable: true, source: pre.source }) };
          return;
        }
        throw exc;
      }
      let committed = false;
      let usage: CompletionUsage = { in: null, out: null };
      try {
        for await (const ev of streamCompletion(
          attemptInput(
            pre,
            model,
            messages,
            {
              attemptTimeoutMs: budget.attemptTimeoutMs,
              stream: true,
            },
            opts.mockError ?? null
          )
        )) {
          if (ev.kind === "delta") {
            committed = true;
            yield { type: "chunk", text: ev.text };
          } else {
            usage = ev.usage;
          }
        }
        yield {
          type: "done",
          model,
          modelUsed: model,
          usedFallback: model !== pre.chain[0],
          fallbackDepth: Math.max(0, pre.chain.indexOf(model)),
          source: pre.source,
          usage,
          ms: Date.now() - started,
        };
        return;
      } catch (exc) {
        if (committed && exc instanceof MidStreamError) {
          // Received text is preserved client-side; end with a typed error.
          yield { type: "error", ...failure("NETWORK", { retryable: true, source: pre.source }) };
          return;
        }
        const cls =
          exc instanceof StreamAttemptError
            ? exc.failure.cls
            : exc instanceof MidStreamError
              ? "retryable"
              : "retryable";
        lastFailure = { cls, retryAfter: exc instanceof StreamAttemptError ? exc.failure.retryAfter : undefined };
        attempts.push({
          model,
          result: exc instanceof StreamAttemptError && exc.failure.kind ? exc.failure.kind : cls,
          status: exc instanceof StreamAttemptError ? exc.failure.status : undefined,
        });
        // Operator-facing per-attempt visibility (same rationale as the
        // one-shot chain in fallback.ts).
        console.warn(
          `[llm] gen attempt: model=${model} attempt=${attempt} -> ${cls}${
            exc instanceof StreamAttemptError && exc.failure.status
              ? ` (HTTP ${exc.failure.status})`
              : ""
          }`
        );
        if (cls === "fatal") {
          yield {
            type: "error",
            ...failure(pre.source === "byok" ? "BYOK_FAILED" : "CONFIG_ERROR", {
              retryable: false,
              source: pre.source,
            }),
          };
          return;
        }
        if (cls === "not_found") {
          skipModel = true;
          break;
        }
        const wait = lastFailure.retryAfter
          ? lastFailure.retryAfter * 1000
          : Math.min(500 * 2 ** (attempt - 1), 4_000) + Math.floor(Math.random() * 250);
        if (Date.now() + wait >= pre.deadlineAt) {
          skipModel = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
    }
    void skipModel;
  }

  yield {
    type: "error",
    ...failure(exhaustedReason(pre.source), {
      retryable: lastFailure.cls === "retryable",
      retryAfter: lastFailure.retryAfter,
      source: pre.source,
    }),
  };
}
