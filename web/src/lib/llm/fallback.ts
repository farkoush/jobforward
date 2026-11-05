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

import type { ClassifiedFailure } from "./errors";
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
      /** exhausted = every model/attempt failed; fatal = a 400/401/403 stopped the chain. */
      outcome: "exhausted" | "fatal";
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

  for (const model of options.models) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Deadline gate: no new attempt starts after the overall deadline.
      if (Date.now() >= options.deadlineAt) {
        return {
          ok: false,
          outcome: "exhausted",
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
    outcome: "exhausted",
    lastClass,
    lastStatus,
    retryAfter: lastRetryAfter,
    attemptsMade,
    source: options.source,
  };
}
