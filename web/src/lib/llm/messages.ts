/**
 * User-facing gateway messages (004-llm-gateway, FR-15): English B1, simple,
 * no technical detail — no status codes, model names, exception names, or
 * file paths ever appear.
 *
 * LANGUAGE NOTE (owner decision 2026-11-06): version 1 of the platform is
 * ENGLISH-ONLY — this supersedes the earlier Persian-error-message rule
 * (constitution P16) for v1; a Persian UI is deferred to a later version and
 * the constitution amendment recording the reversal is pending.
 */

import type { GatewayReason } from "./types";

export const GATEWAY_MESSAGES: Record<GatewayReason, string> = {
  QUOTA_USER:
    "You've used up your daily allowance for this type of request. Allowances reset every day at 00:00 UTC.",
  QUOTA_GLOBAL:
    "The service's daily allowance is used up right now. Allowances reset every day at 00:00 UTC.",
  MINUTE_LIMIT:
    "You sent several requests within one minute. This limit opens again in less than a minute.",
  SERVICE_BUSY:
    "The service is busy right now. Please try again in a moment.",
  INPUT_TOO_LONG:
    "Your text is too long. Please shorten it and try again.",
  INVALID_INPUT:
    "Your text could not be processed. Please try once more.",
  INVALID_TASK: "This request is not supported yet.",
  CONFIG_ERROR:
    "The AI service is unavailable right now. Please try again later.",
  ALL_MODELS_FAILED:
    "The AI service is temporarily unavailable. You can try again.",
  RATE_LIMITED:
    "The provider is rate limiting requests right now. Please wait a moment and try again.",
  BYOK_FAILED:
    "Your key did not work. You can try again, or continue with the free path — it's your choice.",
  BYOK_LIMIT:
    "You sent more requests this minute than allowed. It opens again in less than a minute.",
  NETWORK: "The connection failed. Please check your internet and try again.",
  UNAUTHORIZED: "Please sign in first.",
};

/** Reasons where an immediate Retry makes sense (button visibility). */
export const RETRYABLE_REASONS: ReadonlySet<GatewayReason> = new Set([
  "ALL_MODELS_FAILED",
  "RATE_LIMITED",
  "NETWORK",
  "SERVICE_BUSY",
  "MINUTE_LIMIT",
  "BYOK_FAILED",
]);
