import { describe, expect, it } from "vitest";
import {
  autoCheckPolicy,
  loadStoredCheck,
  markCheckStarted,
  nextStatusAfterFailure,
  saveCheckResult,
  statusFromOutcome,
} from "@/lib/llm/connection-client";

/**
 * §15 FR-45/46/52 client orchestration — the owner-reported "Checking…
 * forever" regression: after a reload the session guard used to skip the
 * check WITHOUT restoring the saved status. These tests pin the pure logic:
 * once-per-session guard, saved-status restore, and the R14 failure mapping.
 */

function fakeStorage(initial?: Record<string, string>): Storage {
  const map = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => void map.clear(),
    key: (i) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
}

describe("§15 connection-check client logic", () => {
  it("runs the check on the first menu visit of the session only", () => {
    const storage = fakeStorage();
    expect(markCheckStarted(storage)).toBe(true); // first run → contact provider
    expect(markCheckStarted(storage)).toBe(false); // same session → no contact
  });

  it("restores the saved status after a reload instead of hanging on Checking", () => {
    const storage = fakeStorage();
    expect(markCheckStarted(storage)).toBe(true);
    saveCheckResult(storage, "available");
    // Simulated reload: same storage, fresh memory.
    expect(loadStoredCheck(storage)).toMatchObject({ status: "available" });
    // The guard says "no new contact" — and a saved status EXISTS to restore.
    expect(markCheckStarted(storage)).toBe(false);
    expect(loadStoredCheck(storage)).not.toBeNull();
  });

  it("never restores a stale/corrupt status — safe fallback to a real check", () => {
    const corrupt = fakeStorage({ "jbf-llm-check": "1", "jbf-llm-check-status": "{not json" });
    expect(loadStoredCheck(corrupt)).toBeNull();
    const wrongShape = fakeStorage({
      "jbf-llm-check": "1",
      "jbf-llm-check-status": JSON.stringify({ status: "checking", checkedAt: "x" }),
    });
    expect(loadStoredCheck(wrongShape)).toBeNull();
    const noStatus = fakeStorage({ "jbf-llm-check": "1" });
    expect(loadStoredCheck(noStatus)).toBeNull();
    const noFlag = fakeStorage();
    expect(loadStoredCheck(noFlag)).toBeNull();
  });

  it("maps failures per R14: first failure yellow, repeated failure red", () => {
    expect(nextStatusAfterFailure("checking")).toBe("needs_retry");
    expect(nextStatusAfterFailure("available")).toBe("needs_retry");
    expect(nextStatusAfterFailure("needs_retry")).toBe("unavailable");
    expect(nextStatusAfterFailure("unavailable")).toBe("unavailable");
  });

  it("maps check outcomes: available stays, unavailable fails, malformed fails", () => {
    expect(statusFromOutcome("available")).toBe("available");
    expect(statusFromOutcome("unavailable")).toBe("failed");
    expect(statusFromOutcome(undefined)).toBeNull();
    expect(statusFromOutcome("garbage")).toBeNull();
  });

  it("§16 FR-64B policy: restore ONLY a saved available status", () => {
    expect(autoCheckPolicy(null)).toBe("check");
    expect(autoCheckPolicy({ status: "available", checkedAt: "x" })).toBe("restore");
    expect(autoCheckPolicy({ status: "needs_retry", checkedAt: "x" })).toBe("check");
    expect(autoCheckPolicy({ status: "unavailable", checkedAt: "x" })).toBe("check");
  });

  it("owner journey end-to-end: yellow → red → fixed env → green, across reloads", () => {
    const storage = fakeStorage();
    // First visit: check runs, provider fails once → yellow, saved.
    expect(markCheckStarted(storage)).toBe(true);
    const first = nextStatusAfterFailure("checking");
    saveCheckResult(storage, first);
    expect(first).toBe("needs_retry");
    // Reload: a BAD saved status is NOT restored — the policy demands a
    // fresh check so the banner can recover by itself (FR-64B).
    expect(loadStoredCheck(storage)?.status).toBe("needs_retry");
    expect(autoCheckPolicy(loadStoredCheck(storage))).toBe("check");
    // Owner presses Check again: fails again → red, saved.
    const second = nextStatusAfterFailure("needs_retry");
    saveCheckResult(storage, second);
    expect(second).toBe("unavailable");
    // Owner fixes .env.local + restarts → the fresh check succeeds → green.
    saveCheckResult(storage, "available");
    expect(loadStoredCheck(storage)?.status).toBe("available");
    // ...and a LATER reload restores green with no provider contact.
    expect(autoCheckPolicy(loadStoredCheck(storage))).toBe("restore");
  });
});
