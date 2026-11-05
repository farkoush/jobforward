/**
 * Failure taxonomy (data-model.md): every provider outcome lands in exactly
 * one class, and the class alone decides what the fallback chain does.
 *  - retryable: rate limit, server error, timeout, empty, malformed
 *  - not_found: the model name does not exist on the endpoint (404 class) —
 *    straight to the next fallback (the 10-minute cooldown cache is deferred
 *    to the next version by product decision 2026-11-06)
 *  - fatal: bad request / auth / forbidden — never retried, never fallen back
 */

export type FailureClass = "retryable" | "not_found" | "fatal";

export interface ClassifiedFailure {
  cls: FailureClass;
  /** Seconds to wait before retrying, when the provider sent Retry-After. */
  retryAfter?: number;
  status?: number;
}

/** Extract Retry-After (seconds) from response headers or an error body. */
export function retryAfterFrom(
  headers: Headers | null,
  body: unknown
): number | undefined {
  if (headers) {
    const raw = headers.get("retry-after");
    if (raw) {
      const asSeconds = Number(raw);
      if (Number.isFinite(asSeconds) && asSeconds >= 0) return asSeconds;
      const asDate = Date.parse(raw);
      if (!Number.isNaN(asDate)) {
        const seconds = Math.ceil((asDate - Date.now()) / 1000);
        if (seconds > 0) return seconds;
      }
    }
  }
  if (body && typeof body === "object" && "retry_after" in body) {
    const value = (body as { retry_after?: unknown }).retry_after;
    if (typeof value === "number" && value >= 0) return value;
  }
  return undefined;
}

export function classifyStatus(status: number, retryAfter?: number): ClassifiedFailure {
  if (status === 404) return { cls: "not_found", status };
  if (status === 400 || status === 401 || status === 403) {
    return { cls: "fatal", status };
  }
  // 429, 500, 502, 503, 504 and anything unexpected: retryable (FR-04).
  const out: ClassifiedFailure = { cls: "retryable", status };
  if (status === 429 && retryAfter !== undefined) out.retryAfter = retryAfter;
  return out;
}

/** Client-side failure constructors (timeout / empty / malformed / network). */
export function timeoutFailure(): ClassifiedFailure {
  return { cls: "retryable" };
}
export function emptyResponseFailure(): ClassifiedFailure {
  return { cls: "retryable" };
}
export function malformedFailure(): ClassifiedFailure {
  return { cls: "retryable" };
}
export function networkFailure(): ClassifiedFailure {
  return { cls: "retryable" };
}
