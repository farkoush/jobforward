"use client";

/**
 * §15 FR-54 — the independent LLM settings section shell: connection status
 * card + the BYOK card. Reachable from the menu, the banner, and failure
 * transfers; entering and leaving NEVER disturbs flow state or drafts.
 * Menu-initiated visits return to the menu; only failure-initiated visits
 * return to the origin stage (handled by the page through onBack).
 */

import type { ReactNode } from "react";
import { ConnectionStatusCard } from "./ConnectionStatusCard";
import type { ConnStatus } from "../ModelBanner";

export function LlmSettingsSection({
  onBack,
  status,
  checkBusy,
  onCheckAgain,
  children,
}: {
  onBack: () => void;
  status: ConnStatus;
  checkBusy: boolean;
  onCheckAgain: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">LLM settings</h1>
      <p className="mb-6 text-neutral-700">
        Optional. Everything works without your own key.
      </p>
      <ConnectionStatusCard status={status} busy={checkBusy} onCheckAgain={onCheckAgain} />
      {children}
      <button className="btn-primary" onClick={onBack}>
        Back
      </button>
    </div>
  );
}
