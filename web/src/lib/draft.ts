/**
 * Draft preservation (FR-20/22, US2): the in-progress input is persisted to
 * localStorage (debounced) BEFORE any gateway call and is cleared ONLY after
 * a fully successful response; a reload recovers it. Scope-keyed so
 * different inputs never collide. API keys never touch this module — it
 * stores plain draft text only (FR-24).
 */

const PREFIX = "jobforward.draft.";
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function keyFor(scope: string): string {
  return `${PREFIX}${scope}`;
}

export function saveDraftDebounced(scope: string, text: string, delayMs = 400): void {
  if (typeof window === "undefined") return;
  const existing = timers.get(scope);
  if (existing) clearTimeout(existing);
  timers.set(
    scope,
    setTimeout(() => {
      timers.delete(scope);
      try {
        window.localStorage.setItem(
          keyFor(scope),
          JSON.stringify({ text, at: Date.now() })
        );
      } catch {
        // Storage full/blocked: the draft is best-effort; never break input.
      }
    }, delayMs)
  );
}

/** Restore a saved draft, or null when none exists. */
export function loadDraft(scope: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(keyFor(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { text?: unknown };
    return typeof parsed.text === "string" && parsed.text.length > 0
      ? parsed.text
      : null;
  } catch {
    return null;
  }
}

/** Clear after a fully successful response (FR-20). */
export function clearDraft(scope: string): void {
  if (typeof window === "undefined") return;
  const existing = timers.get(scope);
  if (existing) {
    clearTimeout(existing);
    timers.delete(scope);
  }
  try {
    window.localStorage.removeItem(keyFor(scope));
  } catch {
    // ignore — best-effort cleanup
  }
}
