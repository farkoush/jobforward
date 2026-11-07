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

// ---------------------------------------------------------------------------
// §15 guidance & banner strings (FR-47/49/50/51/52/53). English B1, no
// technical detail (P16/P10), no emoji/icons (§11) — guard-tested in
// tests/llm/guidance-guards.test.ts. Owner-reviewed drafts from plan.md
// (§15 amendment); the gate text must NEVER mention AI (FR-47).
// ---------------------------------------------------------------------------

import type { FailureClass } from "./failure-class";

/** Gate-stage failure (FR-47): config problems sound like the SERVICE, not like AI. */
export const GATE_SERVICE_UNAVAILABLE =
  "The service is not available right now. Please try again later.";

/** Per-class guidance lines (FR-49) — shown inside the in-page GuidanceBox. */
export const GUIDANCE_BY_CLASS: Record<FailureClass, string> = {
  TRANSIENT: "The AI service is busy right now. Wait a moment, then try again.",
  NO_WAY_FORWARD:
    "The free AI service can't continue right now. You can use your own API key instead.",
  BROWSER_UNREACHABLE:
    "The connection to the service failed. Check your internet. If this site is blocked on your network, a VPN may help.",
  OWN_KEY:
    "Your key did not work. Check your key and model in the settings, or go back to the free path.",
};

/** Shown before the automatic transfer to the LLM settings (FR-50) — never silent. */
export const TRANSFER_EXPLANATION =
  "The free AI service can't continue for you right now. We'll take you to the LLM settings — you will come right back to this step.";

/** The one-tap ask after returning from a failure-initiated settings visit (FR-51). */
export const RETRY_ASK = "Retry with your own key?";

/** Banner/header labels (FR-53, superseded §16 FR-61 — owner wording). */
export const BANNER_FREE_SERVICE = "Default free";
export const BANNER_YOUR_KEY = "My key";

/** Connection status labels (FR-52) — text + color tint, never icons. */
export const STATUS_CHECKING = "Checking…";
export const STATUS_AVAILABLE = "Available";
export const STATUS_NEEDS_RETRY = "Needs retry — check again";
export const STATUS_UNAVAILABLE = "Unavailable — use your own API key";

/** Banner/settings actions. */
export const ACTION_CHECK_AGAIN = "Check again";
export const ACTION_MODEL_SETTINGS = "Model settings";
export const ACTION_USE_YOUR_KEY = "Use your key";
export const ACTION_USE_FREE_SERVICE = "Use the free service";
export const ACTION_CONTINUE_TO_SETTINGS = "Continue";
export const ACTION_RETRY_NOW = "Retry now";
export const ACTION_NOT_NOW = "Not now";

// ---------------------------------------------------------------------------
// §16 additions (FR-61/62/63): header label supersession (owner-mandated
// wording), the explicit resend-with-default label, and the quick BYOK
// modal (Google AI Studio display provider — FR-63; others hidden, not
// deleted). Guarded in tests/llm/guidance-guards.test.ts.
// ---------------------------------------------------------------------------

/** §16 FR-62: explicit per-request resend of the FAILED request on the
 * free path — never an automatic fallback (SC-008 unchanged). */
export const RESEND_WITH_DEFAULT = "Resend with the default free combo";

/** §16 FR-61: the quick BYOK modal (one small panel, any page). */
export const BYOK_QUICK_TITLE = "Use your own API key";
export const BYOK_QUICK_PROVIDER = "Google AI Studio";
export const BYOK_QUICK_KEY_LABEL = "Your Google AI Studio key";
export const BYOK_QUICK_KEY_HINT = "Starts with AIza… (aistudio.google.com/apikey)";
export const BYOK_QUICK_MODEL_LABEL = "Model";
export const BYOK_QUICK_MODEL_HINT = "e.g. gemini-2.0-flash";
export const BYOK_QUICK_SAVE = "Save and use my key";
export const BYOK_QUICK_CANCEL = "Cancel";
export const BYOK_QUICK_FULL_SETTINGS = "More options in LLM settings";
export const ACTION_USE_MY_OWN_KEY = "Use my own API key";
