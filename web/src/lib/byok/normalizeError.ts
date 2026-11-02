/**
 * normalizeError (BYOK §6): map any provider response/error to a fixed
 * { code, userMessage, retryable, retryAfterSec? } shape. User messages are
 * B1 English with no technical details and never contain the key.
 */

import type { NormalizedError, ProviderId } from "./types";

const MESSAGES: Record<NormalizedError["code"], string> = {
  invalid_key: "The key is invalid or expired. Check it again or create a new key.",
  insufficient_credit: "Your account credit is insufficient.",
  rate_limited: "Too many requests. Please wait and try again.",
  quota_exhausted:
    "Today's free quota is used up. Try again tomorrow or with another model/provider.",
  model_unavailable: "This model is currently unavailable; choose another model.",
  cors_blocked: "Your browser or this provider doesn't allow a direct connection.",
  network: "Couldn't connect. Check your internet and any VPN/circumvention tool.",
  local_unreachable:
    "Ollama isn't reachable on your machine. Make sure it is running and the address is correct.",
  local_origin_blocked:
    "Ollama doesn't allow connections from this site. Set OLLAMA_ORIGINS as described in the guide.",
  local_model_missing:
    "This model isn't installed on your machine. Install it with ollama pull or choose another model.",
  bad_output: "The model returned no usable response; try again.",
  timeout: "The request took too long and was stopped.",
  aborted: "The request was cancelled.",
};

function message(code: NormalizedError["code"]): string {
  return MESSAGES[code];
}

interface HttpLike {
  status: number;
  body?: string;
  headers?: Record<string, string>;
}

function looksLikeKeyError(text: string): boolean {
  return /api[_ ]?key|invalid[_ ]key|unauthorized|api key not valid|authentication/i.test(text);
}

function looksLikeQuota(text: string): boolean {
  return /quota|daily limit|free[_ -]tier|allowance|credit/i.test(text);
}

export function normalizeError(
  providerId: ProviderId,
  input: HttpLike | Error | DOMException,
  context?: { model?: string }
): NormalizedError {
  const isLocal = providerId === "ollama";

  // Browser-level failures
  if (input instanceof DOMException || (input as { name?: string })?.name === "AbortError") {
    if ((input as { name?: string })?.name === "AbortError") {
      return { code: "aborted", userMessage: message("aborted"), retryable: false };
    }
  }
  if (input instanceof Error) {
    const name = (input as { name?: string }).name ?? "";
    const text = String((input as { message?: string }).message ?? "");
    if (name === "TypeError" || /failed to fetch|networkerror|load failed/i.test(text)) {
      if (isLocal) {
        // Distinguishing refused-connection from origin-block is not always
        // possible from the browser; surface the origin guidance, which is
        // the common cause from a non-localhost origin.
        return { code: "local_origin_blocked", userMessage: message("local_origin_blocked"), retryable: false };
      }
      // From the browser, a TypeError with no response is a preflight/CORS
      // block in the overwhelming majority of cases when the machine is
      // online; genuine outages surface as the same code for Ollama-free
      // setups. Recorded as a heuristic in docs/byok-cors-results.md.
      return { code: "cors_blocked", userMessage: message("cors_blocked"), retryable: false };
    }
  }

  const http = input as HttpLike;
  if (typeof http?.status === "number") {
    const body = http.body ?? "";
    const retryAfter = http.headers?.["retry-after"];
    const retryAfterSec = retryAfter ? Number(retryAfter) || undefined : undefined;

    if (http.status === 402) {
      return { code: "insufficient_credit", userMessage: message("insufficient_credit"), retryable: false };
    }
    if (http.status === 429) {
      // On OpenRouter a 429 may come from the upstream provider; do not
      // claim the user exceeded their own limit unless the body says so.
      if (looksLikeQuota(body)) {
        return { code: "quota_exhausted", userMessage: message("quota_exhausted"), retryable: false, retryAfterSec };
      }
      return { code: "rate_limited", userMessage: message("rate_limited"), retryable: false, retryAfterSec };
    }
    if (http.status === 404) {
      if (isLocal && context?.model) {
        return { code: "local_model_missing", userMessage: message("local_model_missing"), retryable: false };
      }
      if (context?.model) {
        return { code: "model_unavailable", userMessage: message("model_unavailable"), retryable: false };
      }
      return { code: "model_unavailable", userMessage: message("model_unavailable"), retryable: false };
    }
    if (http.status === 400 || http.status === 401 || http.status === 403) {
      if (looksLikeQuota(body) && http.status === 400) {
        return { code: "quota_exhausted", userMessage: message("quota_exhausted"), retryable: false };
      }
      return { code: "invalid_key", userMessage: message("invalid_key"), retryable: false };
    }
    if (http.status >= 500) {
      return {
        code: isLocal ? "local_unreachable" : "network",
        userMessage: message(isLocal ? "local_unreachable" : "network"),
        retryable: true,
      };
    }
    if (looksLikeKeyError(body)) {
      return { code: "invalid_key", userMessage: message("invalid_key"), retryable: false };
    }
    return { code: "bad_output", userMessage: message("bad_output"), retryable: true };
  }

  return {
    code: isLocal ? "local_unreachable" : "network",
    userMessage: message(isLocal ? "local_unreachable" : "network"),
    retryable: true,
  };
}
