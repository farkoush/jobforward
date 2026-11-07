/**
 * §15 FR-45/46/52 — client-side connection-check orchestration (PURE, fully
 * testable): the once-per-tab-session guard, the saved-status store, and the
 * failure-state mapping (R14). No React, no fetch — the page wires them.
 *
 * BUG FIXED (owner report 2026-11-07, "Checking… forever"): the session
 * guard used to skip the check after a reload WITHOUT restoring the saved
 * status, so the banner stayed "Checking…" indefinitely. Now the saved
 * status is stored alongside the flag and restored on load — zero extra
 * provider contact, no stuck state.
 */

/** Canonical client status; ModelBanner re-exports this for its props. */
export type ConnStatus =
  | "checking"
  | "available"
  | "needs_retry"
  | "unavailable";

export type ResolvedStatus = Exclude<ConnStatus, "checking">;

const FLAG_KEY = "jbf-llm-check";
const STATUS_KEY = "jbf-llm-check-status";

export interface StoredCheck {
  status: ResolvedStatus;
  checkedAt: string;
}

/** True when THIS load should contact the provider (first run of the tab
 * session); false when the session already checked (caller restores). */
export function markCheckStarted(storage: Storage): boolean {
  if (storage.getItem(FLAG_KEY) === "1") return false;
  try {
    storage.setItem(FLAG_KEY, "1");
  } catch {
    // private mode etc. — the in-memory ref on the caller side still guards
  }
  return true;
}

/** The saved status for this tab session, or null (never checked, or corrupt). */
export function loadStoredCheck(storage: Storage): StoredCheck | null {
  if (storage.getItem(FLAG_KEY) !== "1") return null;
  const raw = storage.getItem(STATUS_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { status?: unknown; checkedAt?: unknown } | null;
    const valid: readonly string[] = ["available", "needs_retry", "unavailable"];
    if (
      value &&
      typeof value.status === "string" &&
      valid.includes(value.status) &&
      typeof value.checkedAt === "string"
    ) {
      return {
        status: value.status as ResolvedStatus,
        checkedAt: value.checkedAt,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Persist the latest resolved status so a reload can restore it without a
 * provider contact (keeps the once-per-session rule intact). */
export function saveCheckResult(
  storage: Storage,
  status: ResolvedStatus
): void {
  try {
    storage.setItem(
      STATUS_KEY,
      JSON.stringify({ status, checkedAt: new Date().toISOString() })
    );
  } catch {
    // storage full/blocked — the in-memory status still works this load
  }
}

/** §16 FR-64B auto-recovery policy: restore the saved status WITHOUT a
 * provider contact ONLY when it is "available"; a bad (or missing) saved
 * status demands a FRESH check so the banner recovers by itself when the
 * network returns. */
export function autoCheckPolicy(stored: StoredCheck | null): "restore" | "check" {
  return stored !== null && stored.status === "available" ? "restore" : "check";
}

/** R14 mapping: the FIRST failure → needs_retry (yellow); a failure while
 * already yellow/red → unavailable (red). */
export function nextStatusAfterFailure(
  prev: ConnStatus
): "needs_retry" | "unavailable" {
  return prev === "needs_retry" || prev === "unavailable"
    ? "unavailable"
    : "needs_retry";
}

/** Typed-outcome mapping for the check route's response. */
export function statusFromOutcome(
  state: unknown
): "available" | "failed" | null {
  if (state === "available") return "available";
  if (state === "unavailable") return "failed";
  return null; // malformed response — caller treats as failure
}
