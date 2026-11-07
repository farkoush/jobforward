"use client";

/**
 * §15 FR-52/53 — the persistent model banner: the active answering source
 * plus the connection state as a color tint + text label (§11 rule 1: NO
 * icons/emoji), and in-place source switching. Shown on EVERY screen from
 * the menu onward; purely informational — it never gates navigation
 * (FR-52). Supersedes the analysis-only amber disclosure banner.
 */

import { useEffect, useState } from "react";
import {
  getByokState,
  onByokChange,
  setUseForScoring,
  type StoredByokState,
} from "@/lib/byok/client";
import {
  ACTION_CHECK_AGAIN,
  ACTION_MODEL_SETTINGS,
  ACTION_USE_FREE_SERVICE,
  ACTION_USE_MY_OWN_KEY,
  ACTION_USE_YOUR_KEY,
  BANNER_FREE_SERVICE,
  BANNER_YOUR_KEY,
  STATUS_AVAILABLE,
  STATUS_CHECKING,
  STATUS_NEEDS_RETRY,
  STATUS_UNAVAILABLE,
} from "@/lib/llm/messages";

import type { ConnStatus } from "@/lib/llm/connection-client";

export type { ConnStatus };

const STATUS_LABEL: Record<ConnStatus, string> = {
  checking: STATUS_CHECKING,
  available: STATUS_AVAILABLE,
  needs_retry: STATUS_NEEDS_RETRY,
  unavailable: STATUS_UNAVAILABLE,
};

/** Warm-theme tints (Phase 14 palette): green available, amber needs-retry,
 * warm orange-red unavailable (never brand red), neutral while checking. */
const TINT: Record<ConnStatus, string> = {
  checking: "border-neutral-400 bg-neutral-100 text-neutral-700",
  available: "border-emerald-700 bg-emerald-50 text-emerald-900",
  needs_retry: "border-amber-600 bg-amber-50 text-amber-900",
  unavailable: "border-[#C33C00] bg-[#C33C00]/5 text-[#7a2400]",
};

export function ModelBanner({
  visible,
  status,
  checkBusy = false,
  onCheckAgain,
  onOpenSettings,
  onQuickByok,
}: {
  visible: boolean;
  status: ConnStatus;
  checkBusy?: boolean;
  onCheckAgain: () => void;
  onOpenSettings: () => void;
  /** §16 FR-61: opens the quick BYOK modal from the header on ANY page. */
  onQuickByok: () => void;
}) {
  const [state, setState] = useState<StoredByokState | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setState(getByokState());
    const off = onByokChange(() => setState(getByokState()));
    return () => {
      off();
    };
  }, []);

  if (!visible || state === null) return null;

  const usingKey = state.useForScoring && state.hasKey && Boolean(state.model);
  const sourceLabel = usingKey
    ? `${BANNER_YOUR_KEY}: ${state.model}`
    : BANNER_FREE_SERVICE;
  // §15 FR-52: the needs-retry and unavailable states carry their "Check
  // again" action DIRECTLY on the banner — the user never has to hunt for
  // it (owner feedback 2026-11-07: a banner without the retry action was
  // confusing).
  const showCheckAgain =
    (status === "needs_retry" || status === "unavailable") && !checkBusy;

  function pick(useKey: boolean) {
    setOpen(false);
    setUseForScoring(useKey); // effective for the NEXT analysis action; no reload
  }

  return (
    <div
      className={`relative mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 px-4 py-3 ${TINT[status]}`}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex-1 text-left"
      >
        <span className="font-medium">{sourceLabel}</span>
        <span className="ml-3 text-[14px]">
          {checkBusy ? STATUS_CHECKING : STATUS_LABEL[status]}
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-2">
        {showCheckAgain && (
          <button
            type="button"
            className="btn-secondary !border-current !px-3 !py-1.5 text-[14px]"
            onClick={onCheckAgain}
          >
            {ACTION_CHECK_AGAIN}
          </button>
        )}
        {/* §16 FR-61: the direct BYOK entry — visible on every page while
            the free path is the active source. */}
        {!usingKey && (
          <button
            type="button"
            className="btn-secondary !border-current !px-3 !py-1.5 text-[14px]"
            onClick={onQuickByok}
          >
            {ACTION_USE_MY_OWN_KEY}
          </button>
        )}
      </div>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-64 rounded-lg border-2 border-neutral-300 bg-card p-2">
          <button
            className="btn-secondary w-full"
            disabled={!state.hasKey || !state.model}
            onClick={() => pick(true)}
          >
            {ACTION_USE_YOUR_KEY}
          </button>
          <button
            className="btn-secondary mt-2 w-full"
            disabled={!usingKey}
            onClick={() => pick(false)}
          >
            {ACTION_USE_FREE_SERVICE}
          </button>
          <button
            className="btn-secondary mt-2 w-full"
            onClick={() => {
              setOpen(false);
              onOpenSettings();
            }}
          >
            {ACTION_MODEL_SETTINGS}
          </button>
        </div>
      )}
    </div>
  );
}
