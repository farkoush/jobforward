/**
 * Next.js instrumentation hook (§13 FR-37): runs once at server startup
 * (nodejs runtime only). Validates the configured model IDs against the
 * provider's live list and logs warnings/errors — the app is never halted;
 * affected requests fail with the gateway's typed CONFIG_ERROR path.
 * Skipped entirely under LLM_MOCK=true (no provider is contacted in mock
 * mode).
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.LLM_MOCK === "true") {
    console.warn("[llm] LLM_MOCK=true — gateway runs in mock mode; skipping model validation");
    return;
  }
  try {
    const { runValidationReporting } = await import("./lib/llm/validate-models");
    const ok = await runValidationReporting();
    if (!ok) {
      console.error(
        "[llm] model validation reported errors — the app keeps running, but affected requests will fail with typed errors"
      );
    }
  } catch (exc) {
    console.warn(
      "[llm] startup model validation could not run:",
      exc instanceof Error ? exc.message : exc
    );
  }
}
