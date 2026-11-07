/**
 * §16 FR-58 — the Node-only half of the startup echo (loaded ONLY under
 * NEXT_RUNTIME=nodejs; static `node:fs` is safe in this bundle).
 *
 * Prints the resolved GEN/FAST chain ids (never keys) and, in development,
 * warns WITH LINE NUMBERS when `.env.local` duplicates a variable (the
 * 2026-11-07 incident guard). CONTACT-FREE: §15 FR-45 intact.
 */

import { readFileSync } from "node:fs";
import { getLlmConfig } from "./lib/llm/config";
import { duplicatedEnvVars } from "./lib/llm/env-duplicates";

export async function startupEcho(): Promise<void> {
  // §16.1 incident guard: duplicated variables silently change which value
  // wins (Next.js takes the LAST) — warn with line numbers in dev.
  if (process.env.NODE_ENV !== "production") {
    try {
      for (const dup of duplicatedEnvVars(readFileSync(".env.local", "utf8"))) {
        console.warn(
          `[llm] .env.local defines ${dup.name} MORE THAN ONCE (lines ${dup.lines.join(", ")}) — Next.js takes the LAST occurrence; keep ONE definition per variable`
        );
      }
    } catch {
      // no .env.local readable (prod/other cwd) — nothing to warn about
    }
  }

  try {
    const cfg = getLlmConfig();
    console.log(
      `[llm] config: GEN=[${cfg.genChain.join(", ")}] FAST=[${cfg.fastChain.join(", ")}]`
    );
  } catch (exc) {
    console.error(
      `[llm] config incomplete: ${exc instanceof Error ? exc.message : exc}`
    );
  }
}
