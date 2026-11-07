"use client";

/**
 * §16 FR-61 — the quick BYOK path: paste key + choose model, save, done —
 * one small panel opened from the header over ANY screen (no navigation;
 * flow state and drafts untouched). The displayed provider is Google AI
 * Studio (§16 FR-63 — others hidden, not deleted). The key lives in MEMORY
 * for this session only (FR-29) and is exercised per-request through the
 * server gateway (P12).
 */

import { useEffect, useState } from "react";
import {
  getByokState,
  initByok,
  onByokChange,
  setKey,
  setModel,
  setProvider,
  setUseForScoring,
} from "@/lib/byok/client";
import {
  BYOK_QUICK_CANCEL,
  BYOK_QUICK_FULL_SETTINGS,
  BYOK_QUICK_KEY_HINT,
  BYOK_QUICK_KEY_LABEL,
  BYOK_QUICK_MODEL_HINT,
  BYOK_QUICK_MODEL_LABEL,
  BYOK_QUICK_PROVIDER,
  BYOK_QUICK_SAVE,
  BYOK_QUICK_TITLE,
} from "@/lib/llm/messages";

export function ByokQuickModal({
  open,
  onClose,
  onOpenFullSettings,
}: {
  open: boolean;
  onClose: () => void;
  onOpenFullSettings: () => void;
}) {
  const [keyInput, setKeyInput] = useState("");
  const [modelText, setModelText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    initByok();
    setProvider("google_ai_studio"); // §16 FR-63: the displayed provider
    const state = getByokState();
    setModelText(state.model ?? "");
    setError(null);
  }, [open]);

  if (!open) return null;

  function save() {
    const key = keyInput.trim();
    const model = modelText.trim();
    if (!key || !model) {
      setError("Please paste your key and type a model name.");
      return;
    }
    setKey(key, false); // memory-only — FR-29 forbids browser storage
    setModel(model);
    setUseForScoring(true); // saving from the quick path switches the source
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="card w-full max-w-md p-5">
        <h2 className="mb-1 text-lg font-semibold">{BYOK_QUICK_TITLE}</h2>
        <p className="mb-4 text-[14px] text-neutral-700">{BYOK_QUICK_PROVIDER}</p>

        <label className="mb-3 block">
          <span className="mb-1 block text-[14px] font-medium text-neutral-800">
            {BYOK_QUICK_KEY_LABEL}
          </span>
          <input
            className="text-input"
            type="password"
            autoComplete="off"
            placeholder={BYOK_QUICK_KEY_HINT}
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            autoFocus
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-1 block text-[14px] font-medium text-neutral-800">
            {BYOK_QUICK_MODEL_LABEL}
          </span>
          <input
            className="text-input"
            value={modelText}
            onChange={(e) => setModelText(e.target.value)}
            placeholder={BYOK_QUICK_MODEL_HINT}
            autoComplete="off"
          />
        </label>

        {error && <p className="msg-error mb-3">{error}</p>}

        <div className="flex flex-wrap gap-3">
          <button className="btn-primary" onClick={save} disabled={!keyInput.trim() || !modelText.trim()}>
            {BYOK_QUICK_SAVE}
          </button>
          <button className="btn-secondary" onClick={onClose}>
            {BYOK_QUICK_CANCEL}
          </button>
        </div>
        <button
          className="mt-4 text-[14px] text-neutral-600 underline"
          onClick={() => {
            onClose();
            onOpenFullSettings();
          }}
        >
          {BYOK_QUICK_FULL_SETTINGS}
        </button>
      </div>
    </div>
  );
}
