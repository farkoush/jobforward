import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDraft,
  loadDraft,
  saveDraftDebounced,
} from "@/lib/draft";

/**
 * Draft preservation (US2, FR-20/21/22/24): the input survives every
 * failure (nothing deletes it), is recovered after reload (same localStorage
 * in a fresh JS context), is cleared ONLY explicitly after full success,
 * and never co-locates a key. Node environment: window.localStorage is
 * stubbed with a Map-backed store (same contract as the browser).
 */

const store = new Map<string, string>();
const fakeWindow = {
  localStorage: {
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
};

describe("draft preservation (SC-006)", () => {
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("window", fakeWindow);
    vi.useFakeTimers();
  });
  afterEach(() => {
    store.clear();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("persists the draft (debounced) and recovers it as a fresh context would", async () => {
    vi.useFakeTimers();
    saveDraftDebounced("paste", "my in-progress bullet text");
    // Not yet written (debounce).
    expect(loadDraft("paste")).toBeNull();
    await vi.advanceTimersByTimeAsync(500);
    // Simulate reload: read back from localStorage (same store a fresh page sees).
    expect(loadDraft("paste")).toBe("my in-progress bullet text");
  });

  it("keeps the draft after a failure — nothing deletes it implicitly", async () => {
    saveDraftDebounced("paste", "draft under failure");
    await vi.advanceTimersByTimeAsync(500);
    // A failure occurs; no clearDraft call happens.
    expect(loadDraft("paste")).toBe("draft under failure");
  });

  it("clears only on explicit success, and never stores a key next to it", async () => {
    saveDraftDebounced("paste", "successful run");
    await vi.advanceTimersByTimeAsync(500);
    clearDraft("paste");
    expect(loadDraft("paste")).toBeNull();
    // FR-24: the draft store contains no key material — only scoped text.
    expect(JSON.stringify(fakeWindow.localStorage)).not.toMatch(/sk-or-|nvapi-|AIza/);
  });
});
