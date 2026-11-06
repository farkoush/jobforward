/**
 * LLM gateway shared types (004-llm-gateway). The typed-result contract:
 * the gateway NEVER throws to the UI — every request ends in a GatewayOutcome
 * or a StreamEvent, and every reason code is pinned here so the UI can map
 * each one to a simple Persian message with no technical detail (P16).
 */

export const GATE_COOKIE_NAME = "jf_gate";

export type Category = "GEN" | "FAST";

export type Source = "free" | "byok";

/** Pinned failure reasons. Never add free-form error text to results. */
export const GATEWAY_REASONS = [
  "QUOTA_USER",
  "QUOTA_GLOBAL",
  "MINUTE_LIMIT",
  "SERVICE_BUSY",
  "INPUT_TOO_LONG",
  "INVALID_INPUT",
  "INVALID_TASK",
  "CONFIG_ERROR",
  "ALL_MODELS_FAILED",
  "RATE_LIMITED",
  "BYOK_FAILED",
  "BYOK_LIMIT",
  "NETWORK",
  "UNAUTHORIZED",
] as const;

export type GatewayReason = (typeof GATEWAY_REASONS)[number];

/** Typed failure — the only failure shape that ever leaves the gateway. */
export interface GatewayFailure {
  ok: false;
  reason: GatewayReason;
  retryable: boolean;
  retryAfter?: number;
  source: Source;
}

/** Typed success (one-shot / FAST). */
export interface GatewaySuccess {
  ok: true;
  text: string;
  model: string;
  /** Fallback transparency (FR-43): always present. */
  modelUsed: string;
  usedFallback: boolean;
  fallbackDepth: number;
  source: Source;
  usage: { in: number | null; out: number | null };
  ms: number;
}

export type GatewayOutcome = GatewaySuccess | GatewayFailure;

/** NDJSON stream events for the GEN route (research R4). */
export type StreamEvent =
  | { type: "chunk"; text: string }
  | {
      type: "done";
      model: string;
      modelUsed: string;
      usedFallback: boolean;
      fallbackDepth: number;
      source: Source;
      usage: { in: number | null; out: number | null };
      ms: number;
    }
  | {
      type: "error";
      reason: GatewayReason;
      retryable: boolean;
      retryAfter?: number;
      source: Source;
    };

export function failure(
  reason: GatewayReason,
  opts: { retryable?: boolean; retryAfter?: number; source?: Source } = {}
): GatewayFailure {
  const out: GatewayFailure = {
    ok: false,
    reason,
    retryable: opts.retryable ?? false,
    source: opts.source ?? "free",
  };
  if (opts.retryAfter !== undefined) out.retryAfter = opts.retryAfter;
  return out;
}
