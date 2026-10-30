/**
 * Storage adapter for test-instrumentation event logs (additive only).
 * Writes JSONL to data/events.log.jsonl; falls back to console-only when the
 * filesystem is read-only (e.g. serverless). Replaceable later behind the
 * same appendEvent() signature. The API key and the gate password are NEVER
 * logged — the adapter strips any field named like a secret.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const FORBIDDEN_KEYS = /^(api[_-]?key|password|token|authorization)$/i;

export interface LogEvent {
  session_id: string;
  step: string;
  timestamp: string;
  ms_since_last: number | null;
  choice: string | null;
  detail: Record<string, unknown> | null;
}

function sanitize(detail: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!detail) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (FORBIDDEN_KEYS.test(key)) continue;
    out[key] = value;
  }
  return out;
}

export function appendEvent(event: LogEvent): { file: string | null } {
  const clean: LogEvent = { ...event, detail: sanitize(event.detail) };
  const line = JSON.stringify(clean);
  try {
    const dir = path.join(process.cwd(), "data");
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "events.log.jsonl");
    appendFileSync(file, line + "\n", "utf-8");
    return { file };
  } catch {
    // Read-only filesystem: console fallback keeps the session usable.
    console.log("[event]", line);
    return { file: null };
  }
}
