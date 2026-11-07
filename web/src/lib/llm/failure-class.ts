/**
 * §15 FR-48 failure-class taxonomy — the SINGLE source the UI consults to
 * decide messages, guidance, and available actions (FR-49/50/51). Pure map,
 * no side effects, no imports beyond the pinned reason type.
 *
 * Classes (owner decisions, clarify 2026-11-07):
 * - TRANSIENT: wait-and-retry; Retry stays primary, own-key offered beside.
 * - NO_WAY_FORWARD: the free path cannot continue for this user — own-key
 *   transfer with an advance explanation; ALL_MODELS_FAILED is classified
 *   here WITH the Retry button kept visible (the gateway already tried
 *   every model before showing it).
 * - BROWSER_UNREACHABLE: the browser-to-platform link failed — the ONLY
 *   class whose guidance may mention a VPN (it cannot help server-side
 *   AI failures, FR-49).
 * - OWN_KEY: the user's own key path failed — fix-key advice with the
 *   free-path option visible; never trapped between two dead ends.
 *
 * INPUT_TOO_LONG / INVALID_INPUT / INVALID_TASK / UNAUTHORIZED keep their
 * own handling (no class redirect).
 */

import type { GatewayReason } from "./types";

export type FailureClass =
  | "TRANSIENT"
  | "NO_WAY_FORWARD"
  | "BROWSER_UNREACHABLE"
  | "OWN_KEY";

export const FAILURE_CLASSES: readonly FailureClass[] = [
  "TRANSIENT",
  "NO_WAY_FORWARD",
  "BROWSER_UNREACHABLE",
  "OWN_KEY",
] as const;

const CLASS_BY_REASON: Partial<Record<GatewayReason, FailureClass>> = {
  SERVICE_BUSY: "TRANSIENT",
  MINUTE_LIMIT: "TRANSIENT",
  RATE_LIMITED: "TRANSIENT",
  // Retryable once the user shortens the input — the guidance box shows the
  // INPUT_TOO_LONG message with Retry (the only user-fixable "transient").
  INPUT_TOO_LONG: "TRANSIENT",

  QUOTA_USER: "NO_WAY_FORWARD",
  QUOTA_GLOBAL: "NO_WAY_FORWARD",
  ALL_MODELS_FAILED: "NO_WAY_FORWARD",
  CONFIG_ERROR: "NO_WAY_FORWARD",

  NETWORK: "BROWSER_UNREACHABLE",

  BYOK_FAILED: "OWN_KEY",
  BYOK_LIMIT: "OWN_KEY",
};

/** The class for a reason, or null when the reason keeps its own handling. */
export function failureClass(reason: GatewayReason): FailureClass | null {
  return CLASS_BY_REASON[reason] ?? null;
}
