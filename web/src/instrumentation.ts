/**
 * §16 FR-58 — startup configuration echo (entry hook).
 *
 * Next.js compiles this file for BOTH runtimes (edge + nodejs), so ANY
 * static `node:*` import here breaks the edge bundle (UnhandledSchemeError,
 * 500 on every page — 2026-11-07 dev bug). The official pattern: guard on
 * NEXT_RUNTIME and dynamically import a RELATIVE node-only module.
 * The hook stays CONTACT-FREE (§15 FR-45): no provider fetch at startup.
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startupEcho } = await import("./instrumentation-node");
    await startupEcho();
  }
}
