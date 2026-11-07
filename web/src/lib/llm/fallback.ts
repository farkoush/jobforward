/**
 * Fallback chain (FR-02/03/04, FR-34): walk the category's model chain —
 * primary first, then fallbacks in the configured order — returning the
 * first success. Policy per model: max 2 attempts (default), exponential
 * backoff with jitter, honoring provider Retry-After; a 404 (not-found)
 * skips straight to the next model; a fatal error (400/401/403) stops the
 * whole chain. NO new attempt starts after the overall deadline. The
 * `onProviderCall` hook counts every actual provider call for the global
 * per-minute limiter (FR-31).
 */

import { bodyExcerpt, type ClassifiedFailure } from "./errors";
import type { CompletionUsage } from "./client";
import type { Source } from "./types";

export interface AttemptOutcome {
  ok: boolean;
  text?: string;
  usage?: CompletionUsage;
  /** Present when !ok: the classified provider failure. */
  failure?: ClassifiedFailure;
}

export type AttemptFn = (model: string, attempt: number) => Promise<AttemptOutcome>;

export type ChainResult =
  | {
      ok: true;
      model: string;
      text: string;
      usage: CompletionUsage;
      attemptsMade: number;
    }
  | {
      ok: false;
      /** exhausted = every model/attempt failed; fatal = a 400/401/403 stopped
       * the chain; rate_limited = persistent 429s hit the provider-call cap or
       * the deadline (FR-44). */
      outcome: "exhausted" | "fatal" | "rate_limited";
      lastClass: ClassifiedFailure["cls"] | "none";
      lastStatus?: number;
      retryAfter?: number;
      attemptsMade: number;
      source: Source;
    };

export interface ChainOptions {
  models: string[];
  source: Source;
  /** Absolute epoch ms — no attempt may start after this. */
  deadlineAt: number;
  attempt: AttemptFn;
  /** Called right before each actual provider call (limiter hook, FR-31). */
  onProviderCall?: () => Promise<void>;
  maxAttemptsPerModel?: number;
  /** Provider-call cap per user request (FR-44, default 4): persistent 429s
   * reaching the cap (or the deadline) yield the rate_limited outcome. */
  maxProviderCalls?: number;
  /** Per-attempt collector for the request log's attempts detail. */
  onAttempt?: (info: {
    model: string;
    attempt: number;
    failure: ClassifiedFailure;
  }) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(cls: ClassifiedFailure, attempt: number): number {
  if (cls.retryAfter !== undefined && cls.retryAfter > 0) {
    return cls.retryAfter * 1000;
  }
  const base = Math.min(500 * 2 ** (attempt - 1), 4_000);
  return base + Math.floor(Math.random() * 250); // jitter
}

export async function runChain(options: ChainOptions): Promise<ChainResult> {
  const maxAttempts = options.maxAttemptsPerModel ?? 2;
  let attemptsMade = 0;
  let lastClass: ClassifiedFailure["cls"] | "none" = "none";
  let lastStatus: number | undefined;
  let lastRetryAfter: number | undefined;

  for (const [modelIndex, model] of options.models.entries()) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Deadline gate: no new attempt starts after the overall deadline.
      if (Date.now() >= options.deadlineAt) {
        return {
          ok: false,
          outcome: lastStatus === 429 ? "rate_limited" : "exhausted",
          lastClass,
          lastStatus,
          retryAfter: lastRetryAfter,
          attemptsMade,
          source: options.source,
        };
      }
      if (options.onProviderCall) await options.onProviderCall();
      attemptsMade += 1;
      const outcome = await options.attempt(model, attempt);
      if (outcome.ok) {
        return {
          ok: true,
          model,
          text: outcome.text ?? "",
          usage: outcome.usage ?? { in: null, out: null },
          attemptsMade,
        };
      }
      const failure = outcome.failure ?? { cls: "retryable" as const };
      lastClass = failure.cls;
      lastStatus = failure.status;
      lastRetryAfter = failure.retryAfter;
      // Operator-facing per-attempt visibility: without this line a chain
      // that 404s every model surfaces only as ALL_MODELS_FAILED in the
      // request log, hiding the cause (§13 lesson, 2026-11-06). The kind
      // (e.g. empty_response) is preferred when present (FR-42).
      // §16 FR-56: one line carrying model id, status, class, attempt
      // number, fallback flag and the truncated provider error body.
      const fallbackUsed = modelIndex > 0 || attempt > 1;
      console.warn(
        `[llm] attempt ${attemptsMade}: model=${model} attempt=${attempt} status=${
          failure.status ?? "-"
        } class=${failure.kind ?? failure.cls} fallback=${
          fallbackUsed ? "yes" : "no"
        }${failure.body ? ` body="${bodyExcerpt(failure.body)}"` : ""}`
      );
      options.onAttempt?.({ model, attempt, failure });
      if (failure.cls === "fatal") {
        return {
          ok: false,
          outcome: "fatal",
          lastClass: failure.cls,
          lastStatus: failure.status,
          attemptsMade,
          source: options.source,
        };
      }
      if (failure.cls === "not_found") {
        break; // skip straight to the next model (single attempt)
      }
      // Provider-call cap (FR-44): persistent 429s that reach the cap stop
      // the chain with the typed rate_limited outcome — never an unbounded
      // loop.
      if (
        options.maxProviderCalls &&
        attemptsMade >= options.maxProviderCalls &&
        lastStatus === 429
      ) {
        return {
          ok: false,
          outcome: "rate_limited",
          lastClass,
          lastStatus,
          retryAfter: lastRetryAfter,
          attemptsMade,
          source: options.source,
        };
      }
      const wait = backoffMs(failure, attempt);
      if (Date.now() + wait >= options.deadlineAt) {
        // The wait would eat the deadline — nothing more can start in time.
        break;
      }
      await sleep(wait);
    }
  }

  return {
    ok: false,
    outcome: lastStatus === 429 ? "rate_limited" : "exhausted",
    lastClass,
    lastStatus,
    retryAfter: lastRetryAfter,
    attemptsMade,
    source: options.source,
  };
}
