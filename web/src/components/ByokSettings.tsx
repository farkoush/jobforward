"use client";

/**
 * BYOK settings — narrowed for the gateway era (004-llm-gateway, FR-27/28/29):
 * exactly ONE provider (OpenRouter), the key lives in MEMORY for this session
 * only (never localStorage — FR-29), and this screen makes NO browser→provider
 * calls (P12): the key is exercised per-request through the server gateway,
 * which reports a dedicated failure if the key does not work; returning to the
 * free path then requires explicit user confirmation (FR-28).
 */

import { useEffect, useState } from "react";
import { PROVIDERS } from "@/lib/byok/providers.config";
import {
  clearKey,
  getByokState,
  initByok,
  onByokChange,
  setKey,
  setModel,
  setProvider,
  setUseForScoring,
} from "@/lib/byok/client";

export function ByokSettings({
  onBack,
  failureMode = false,
  onSaved,
}: {
  onBack: () => void;
  /** §15 FR-51: true when this visit came from a no-way-forward failure —
   * saving then enables use-for-analysis (failure path ONLY) and returns
   * the user to the origin stage with a one-tap retry ask. */
  failureMode?: boolean;
  onSaved?: () => void;
}) {
  const [state, setState] = useState(getByokState());
  const [keyInput, setKeyInput] = useState("");
  const [saved, setSaved] = useState(false);
  const [modelText, setModelText] = useState("");
  // §16 FR-63: the DISPLAYED provider is Google AI Studio (others hidden,
  // not deleted).
  const provider = PROVIDERS.google_ai_studio;

  useEffect(() => {
    initByok();
    setProvider("openrouter");
    const off = onByokChange(() => setState(getByokState()));
    setState(getByokState());
    return () => {
      off();
    };
  }, []);

  function saveKey() {
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    setKey(trimmed, false); // memory-only — FR-29 forbids browser storage
    if (failureMode) {
      // §15 FR-51 (failure path only): the save enables use-for-analysis and
      // returns the user to the origin stage for the one-tap retry ask.
      // Menu-initiated visits never touch the preference.
      setUseForScoring(true);
      onSaved?.();
      return;
    }
    setSaved(true);
    setKeyInput("");
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Model settings (advanced)</h1>
      <p className="mb-6 text-neutral-700">
        Optional. Everything works without this. With your own OpenRouter key,
        bullet scores are produced by your chosen model. The key is used for
        your requests through our server gateway and is kept in this browser&apos;s
        memory only — never saved, never logged.
      </p>

      <section className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">1) Your Google AI Studio key</h2>
        <p className="mb-2 text-[15px] text-neutral-700">{provider.keyFormatHint}</p>
        <input
          className="text-input mb-2"
          type="password"
          autoComplete="off"
          placeholder="Paste your key"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
        />
        <div className="flex flex-wrap gap-3">
          <button className="btn-primary" onClick={saveKey} disabled={!keyInput.trim()}>
            Save key (this session only)
          </button>
          <button
            className="btn-secondary"
            onClick={() => {
              clearKey();
              setKeyInput("");
              setSaved(false);
            }}
          >
            Clear key
          </button>
        </div>
        {state.hasKey && state.keyMask && (
          <p className="mt-2 text-sm text-neutral-600">
            Key in memory: {state.keyMask} — not stored on this computer.
          </p>
        )}
        {saved && state.hasKey && (
          <p className="mt-2 text-sm text-green-800">
            Key saved for this session. It is checked the first time you use it.
          </p>
        )}
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">2) Choose a model</h2>
        <p className="mb-2 text-[15px] text-neutral-700">
          Type the exact model name, e.g.{" "}
          <span className="font-mono text-[14px]">meta-llama/llama-3.3-70b-instruct:free</span>
        </p>
        <div className="flex gap-2">
          <input
            className="text-input"
            value={modelText}
            onChange={(e) => setModelText(e.target.value)}
            placeholder="provider/model-name"
            autoComplete="off"
          />
          <button
            className="btn-secondary"
            onClick={() => modelText.trim() && setModel(modelText.trim())}
          >
            Use
          </button>
        </div>
        {state.model && (
          <p className="mt-2 font-medium">Active model: {state.model}</p>
        )}
        <p className="mt-2 text-sm text-neutral-600">{provider.freeTierNote}</p>
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">3) Use for scoring</h2>
        <label className="flex items-center gap-2 text-[16px]">
          <input
            type="checkbox"
            checked={state.useForScoring}
            disabled={!state.hasKey || !state.model}
            onChange={(e) => setUseForScoring(e.target.checked)}
          />
          Use my model for bullet scores (off = free gateway path)
        </label>
        <p className="mt-1 text-sm text-neutral-600">
          When on and your key fails, nothing switches automatically — you
          decide whether to continue with the free path.
        </p>
      </section>

      <button className="btn-primary" onClick={onBack}>
        Back
      </button>
    </div>
  );
}
