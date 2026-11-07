"use client";

/**
 * §15 FR-49 — the in-page guidance box: every AI failure at an analysis
 * stage shows this box AT the failing stage with class-matched advice and
 * actions. Single source: failure-class.ts (FR-48) + messages.ts. No
 * icons/emoji (§11 rule 1) — text and themed error styling only.
 */

import { failureClass } from "@/lib/llm/failure-class";
import {
  ACTION_MODEL_SETTINGS,
  GATEWAY_MESSAGES,
  GUIDANCE_BY_CLASS,
  RESEND_WITH_DEFAULT,
} from "@/lib/llm/messages";
import type { GatewayReason } from "@/lib/llm/types";

/** Transient failures where the user's own key is a real way out (FR-010):
 * provider-side rate limit and busy. MINUTE_LIMIT and INPUT_TOO_LONG keep
 * Retry only — the short wait or the shorter text IS the fix. */
const OWN_KEY_ALSO: ReadonlySet<GatewayReason> = new Set([
  "RATE_LIMITED",
  "SERVICE_BUSY",
]);

export function GuidanceBox({
  reason,
  showDowngradeOffer,
  onRetry,
  onOwnKey,
  onFreePath,
  onOpenSettings,
}: {
  reason: GatewayReason;
  showDowngradeOffer: boolean;
  onRetry: () => void;
  onOwnKey: () => void;
  onFreePath: () => void;
  onOpenSettings: () => void;
}) {
  const cls = failureClass(reason);
  const message = GATEWAY_MESSAGES[reason];
  return (
    <div role="alert" className="msg-error mb-6">
      <p>{message}</p>
      {cls && <p className="mt-2 text-[15px]">{GUIDANCE_BY_CLASS[cls]}</p>}
      <div className="mt-3 flex flex-wrap gap-3">
        {/* FR-008/clarify Q1: Retry stays visible even for a whole-chain
            failure — the gateway already tried every model before this. */}
        {cls !== null && (
          <button className="btn-primary" onClick={onRetry}>
            Retry
          </button>
        )}
        {cls === "TRANSIENT" && OWN_KEY_ALSO.has(reason) && (
          <button className="btn-secondary" onClick={onOwnKey}>
            Use my own key
          </button>
        )}
        {cls === "NO_WAY_FORWARD" && (
          <button className="btn-secondary" onClick={onOwnKey}>
            Use my own key
          </button>
        )}
        {cls === "OWN_KEY" && showDowngradeOffer && (
          <button className="btn-secondary" onClick={onFreePath}>
            {RESEND_WITH_DEFAULT}
          </button>
        )}
        {cls === "OWN_KEY" && (
          <button className="btn-secondary" onClick={onOpenSettings}>
            {ACTION_MODEL_SETTINGS}
          </button>
        )}
      </div>
    </div>
  );
}
