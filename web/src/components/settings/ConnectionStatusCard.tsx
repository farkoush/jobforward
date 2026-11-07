"use client";

/**
 * §15 FR-54 — the LLM settings section's connection status card: the
 * truthful 4-state display + an explicit "Check again" (calls the
 * content-free check route). Display-only; it never blocks anything
 * (FR-52) and never gates navigation.
 */

import type { ConnStatus } from "../ModelBanner";
import {
  ACTION_CHECK_AGAIN,
  STATUS_AVAILABLE,
  STATUS_CHECKING,
  STATUS_NEEDS_RETRY,
  STATUS_UNAVAILABLE,
} from "@/lib/llm/messages";

const LABEL: Record<ConnStatus, string> = {
  checking: STATUS_CHECKING,
  available: STATUS_AVAILABLE,
  needs_retry: STATUS_NEEDS_RETRY,
  unavailable: STATUS_UNAVAILABLE,
};

const TINT: Record<ConnStatus, string> = {
  checking: "text-neutral-700",
  available: "text-emerald-900",
  needs_retry: "text-amber-900",
  unavailable: "text-[#7a2400]",
};

export function ConnectionStatusCard({
  status,
  busy,
  onCheckAgain,
}: {
  status: ConnStatus;
  busy: boolean;
  onCheckAgain: () => void;
}) {
  return (
    <section className="card mb-6 p-4">
      <h2 className="mb-2 text-lg font-semibold">AI connection</h2>
      <p className={`text-[16px] font-medium ${TINT[status]}`}>{LABEL[status]}</p>
      <button className="btn-secondary mt-3" onClick={onCheckAgain} disabled={busy}>
        {ACTION_CHECK_AGAIN}
      </button>
    </section>
  );
}
