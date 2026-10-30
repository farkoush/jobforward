"use client";

/**
 * Client event logger (additive test instrumentation). One event per user
 * step: step name, timestamp, time spent since the previous event, the
 * choice made, skipped questions, approve/edit decisions, errors. Sent
 * through the storage adapter (/api/log -> JSONL). Never logs secrets.
 */

import { apiPost, getSession } from "./client";

let lastStepAt: number | null = null;

export function logEvent(
  step: string,
  choice: string | null = null,
  detail: Record<string, unknown> | null = null
): void {
  const now = Date.now();
  const msSinceLast = lastStepAt === null ? null : now - lastStepAt;
  lastStepAt = now;
  const session = getSession();
  void apiPost("/api/log", {
    session_id: session?.sessionId ?? "anonymous",
    step,
    timestamp: new Date().toISOString(),
    ms_since_last: msSinceLast,
    choice,
    detail,
  });
}
