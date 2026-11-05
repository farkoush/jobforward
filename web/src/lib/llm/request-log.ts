/**
 * Structured request log (FR-08/09, US4): one entry per gateway request —
 * timestamp, category, the model that actually responded, fallback usage,
 * source, token counts, response time, final status. PROMPT CONTENT, API
 * KEYS (NVIDIA + BYOK), and the GATE PASSWORD must never appear (FR-09):
 * entries are built exclusively from typed fields, and a redaction guard
 * re-scans every string against known key patterns as a second line of
 * defense.
 */

import type { Category, GatewayReason, Source } from "./types";

export type FinalStatus =
  | "succeeded"
  | "failed_after_all_models"
  | "rejected_config"
  | "rejected_input"
  | "rejected_limit";

export interface RequestLogEntry {
  timestamp: string;
  category: Category | null;
  model: string | null;
  fallbackUsed: boolean;
  source: Source;
  inputTokens: number | null;
  outputTokens: number | null;
  responseTimeMs: number;
  finalStatus: FinalStatus;
  reason?: GatewayReason;
}

const KEY_PATTERNS: RegExp[] = [
  /sk-or-[A-Za-z0-9]/, // OpenRouter
  /nvapi-[A-Za-z0-9]/, // NVIDIA
  /AIza[A-Za-z0-9]/, // Google-style keys
  /\bsk-[A-Za-z0-9]{8,}/, // generic OpenAI-style keys
];

function redactStrings(value: string): string {
  let out = value;
  for (const pattern of KEY_PATTERNS) {
    if (pattern.test(out)) out = "[REDACTED]";
  }
  return out;
}

export function buildRequestLogEntry(fields: {
  category: Category | null;
  model: string | null;
  fallbackUsed: boolean;
  source: Source;
  inputTokens: number | null;
  outputTokens: number | null;
  responseTimeMs: number;
  finalStatus: FinalStatus;
  reason?: GatewayReason;
}): RequestLogEntry {
  const entry: RequestLogEntry = {
    timestamp: new Date().toISOString(),
    category: fields.category,
    model: fields.model === null ? null : redactStrings(fields.model),
    fallbackUsed: fields.fallbackUsed,
    source: fields.source,
    inputTokens: fields.inputTokens, // null when unreported — never guessed (FR-08)
    outputTokens: fields.outputTokens,
    responseTimeMs: Math.max(0, Math.round(fields.responseTimeMs)),
    finalStatus: fields.finalStatus,
  };
  if (fields.reason) entry.reason = redactStrings(fields.reason) as GatewayReason;
  return entry;
}

/** Server-side structured output only; never ships off-device content. */
export function writeRequestLog(entry: RequestLogEntry): void {
  console.log(JSON.stringify(entry));
}

export function statusForReason(reason: GatewayReason): FinalStatus {
  switch (reason) {
    case "CONFIG_ERROR":
      return "rejected_config";
    case "INVALID_TASK":
    case "INVALID_INPUT":
    case "INPUT_TOO_LONG":
      return "rejected_input";
    case "QUOTA_USER":
    case "QUOTA_GLOBAL":
    case "MINUTE_LIMIT":
    case "SERVICE_BUSY":
    case "BYOK_LIMIT":
      return "rejected_limit";
    default:
      return "failed_after_all_models";
  }
}
