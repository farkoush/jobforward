"use client";

/**
 * BYOK settings screen (BYOK §8): choose provider → key guide → key field →
 * Validate → model (allowlist from the live list) → Save for this session.
 * Ollama: server address + connection test + installed models +
 * OLLAMA_ORIGINS guide. Privacy notice before first use. English only.
 * The default deterministic path stays untouched (toggle off by default).
 */

import { useEffect, useState } from "react";
import {
  PROVIDERS,
  PROVIDER_ORDER,
} from "@/lib/byok/providers.config";
import {
  clearKey,
  getByokState,
  initByok,
  isLocalhostOrigin,
  listModels,
  maskKey,
  onByokChange,
  setKey,
  setModel,
  setOllamaOrigin,
  setPrivacyAccepted,
  setProvider,
  setUseForScoring,
  validateKey,
} from "@/lib/byok/client";
import type { FilteredModel } from "@/lib/byok/filters";
import type { KeyStatus, ProviderId } from "@/lib/byok/types";

const STATUS_TEXT: Record<KeyStatus, string> = {
  valid: "Key valid",
  invalid: "Key invalid",
  quota: "Quota problem (rate limit or free quota used up)",
  network: "Could not connect",
  cors_blocked: "Direct browser connection not allowed (CORS)",
  reachable: "Ollama detected",
  unreachable: "Ollama is not reachable",
  unverified: "Unverified",
};

export function ByokSettings({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState(getByokState());
  const [keyInput, setKeyInput] = useState("");
  const [remember, setRemember] = useState(false);
  const [validating, setValidating] = useState(false);
  const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [models, setModels] = useState<FilteredModel[] | null>(null);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [showPaid, setShowPaid] = useState(false);
  const [advancedModel, setAdvancedModel] = useState(false);
  const [advancedModelText, setAdvancedModelText] = useState("");
  const [ollamaAddress, setOllamaAddress] = useState(
    state.ollamaOrigin ?? "http://localhost:11434"
  );
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    initByok();
    const off = onByokChange(() => setState(getByokState()));
    setState(getByokState());
    return () => {
      off();
    };
  }, []);

  const provider = PROVIDERS[state.providerId];

  async function doValidate() {
    setValidating(true);
    setKeyStatus(null);
    setStatusError(null);
    setModels(null);
    setModelsError(null);
    if (!provider.keyless) {
      if (!keyInput.trim()) {
        setValidating(false);
        setKeyStatus("invalid");
        return;
      }
      setKey(keyInput.trim(), remember);
    } else {
      const addr = ollamaAddress.trim().replace(/\/+$/, "");
      if (!isLocalhostOrigin(addr)) {
        const ok = window.confirm(
          "Your data will be sent to that machine (it is not localhost). Continue?"
        );
        if (!ok) {
          setValidating(false);
          return;
        }
      }
      setOllamaOrigin(addr);
    }
    const result = await validateKey(state.providerId);
    setValidating(false);
    setKeyStatus(result.status);
    if (result.error) setStatusError(result.error.userMessage);
    if (result.status === "valid" || result.status === "reachable") {
      try {
        const list = await listModels(state.providerId, { showPaid });
        setModels(list);
      } catch (exc) {
        setModelsError(
          (exc as Error & { normalized?: { userMessage?: string } }).normalized
            ?.userMessage ?? "Could not load the model list."
        );
      }
    }
  }

  async function reloadModels() {
    setModelsError(null);
    try {
      setModels(await listModels(state.providerId, { showPaid }));
    } catch (exc) {
      setModelsError(
        (exc as Error & { normalized?: { userMessage?: string } }).normalized
          ?.userMessage ?? "Could not load the model list."
      );
    }
  }

  function chooseModel(id: string) {
    setModel(id);
  }

  const cloudProvider = !provider.keyless;
  const showPrivacyNotice = cloudProvider && !state.privacyAccepted;

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Model settings (advanced)</h1>
      <p className="mb-6 text-neutral-700">
        Optional. The tool works fully without this — your experience entries
        are analyzed by the built-in engine on the server. With your own API
        key, the bullet scores are produced by your chosen model instead,
        directly from your browser.
      </p>

      {showPrivacyNotice && (
        <div className="card mb-6 border-2 border-amber-600 bg-amber-50 text-[15px]">
          <p className="mb-2 font-semibold">Privacy notice — please read</p>
          <p className="mb-2">
            A resume contains personal information. If you turn this feature
            on, the text is sent directly from your browser to the provider
            you choose. It does not reach our server.
          </p>
          <p className="mb-2">{provider.dataUsageNote}</p>
          <p className="mb-3 text-neutral-600">
            Advice: create a separate key with a spending cap and delete it
            when you&apos;re done. Key guide:{" "}
            <a className="underline" href={provider.getKeyUrl} target="_blank" rel="noreferrer">
              {provider.getKeyUrl}
            </a>
          </p>
          <button className="btn-primary" onClick={() => setPrivacyAccepted()}>
            I understand — continue
          </button>
        </div>
      )}

      <section className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">1) Choose a provider</h2>
        <div className="flex flex-col gap-2">
          {PROVIDER_ORDER.map((id) => {
            const p = PROVIDERS[id];
            const active = state.providerId === id;
            return (
              <button
                key={id}
                className={active ? "btn-primary" : "btn-secondary"}
                disabled={!p.enabled}
                title={p.disabledReason ?? ""}
                onClick={() => {
                  setProvider(id);
                  setKeyStatus(null);
                  setModels(null);
                }}
              >
                {p.displayName}
                {p.keyless ? " — no key needed" : ""}
                {!p.enabled ? " — disabled" : ""}
                {active && id === "ollama" && keyStatus === "reachable" ? " — Detected" : ""}
              </button>
            );
          })}
        </div>
        {!provider.enabled && (
          <p className="mt-2 text-sm text-red-800">{provider.disabledReason}</p>
        )}
        {provider.keyless && (
          <p className="mt-2 text-sm text-neutral-600">
            Your data stays on your device.
          </p>
        )}
      </section>

      {provider.keyless ? (
        <section className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">2) Ollama server</h2>
          <label className="mb-1 block text-[15px] text-neutral-700" htmlFor="ollama-addr">
            Server address
          </label>
          <input
            id="ollama-addr"
            className="text-input mb-2"
            value={ollamaAddress}
            onChange={(e) => setOllamaAddress(e.target.value)}
            autoComplete="off"
          />
          <p className="mb-3 text-sm text-neutral-600">
            Only localhost / 127.0.0.1 / [::1] are accepted without a warning.
            Another address sends your data to that machine.
          </p>
          <button
            className="btn-secondary mb-3"
            onClick={() => void doValidate()}
            disabled={validating || !provider.enabled}
          >
            Test connection
          </button>
          <p className="mb-2">
            <button className="underline" onClick={() => setShowGuide((v) => !v)}>
              {showGuide ? "Hide" : "Show"} the OLLAMA_ORIGINS guide
            </button>
          </p>
          {showGuide && (
            <div className="card text-[15px]">
              <p className="mb-2">
                If this site is not on the same origin as Ollama, Ollama blocks
                the browser. Allow this site&apos;s exact origin (never use *):
              </p>
              <p className="mb-1 font-medium">Windows (PowerShell):</p>
              <pre className="mb-2 overflow-x-auto whitespace-pre-wrap bg-neutral-100 p-2 text-[13px]">{`$env:OLLAMA_ORIGINS="${typeof window !== "undefined" ? window.location.origin : "APP_ORIGIN"}"
ollama serve`}</pre>
              <p className="mb-1 font-medium">macOS / Linux:</p>
              <pre className="overflow-x-auto whitespace-pre-wrap bg-neutral-100 p-2 text-[13px]">{`OLLAMA_ORIGINS="${typeof window !== "undefined" ? window.location.origin : "APP_ORIGIN"}" ollama serve`}</pre>
              <p>Restart Ollama after changing the variable.</p>
            </div>
          )}
        </section>
      ) : (
        <section className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">2) Your API key</h2>
          <p className="mb-2 text-[15px] text-neutral-700">{provider.keyFormatHint}</p>
          <input
            className="text-input mb-2"
            type="password"
            autoComplete="off"
            placeholder="Paste your key"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
          />
          {state.hasKey && state.keyMask && (
            <p className="mb-2 text-sm text-neutral-600">Saved key: {state.keyMask}</p>
          )}
          <label className="mb-2 flex items-center gap-2 text-[15px]">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Remember me on this computer
          </label>
          {remember && (
            <p className="mb-2 text-sm text-red-800">
              Warning: the key will be stored in this browser. Do not do this
              on a shared computer.
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              className="btn-primary"
              onClick={() => void doValidate()}
              disabled={validating || !provider.enabled || showPrivacyNotice}
            >
              Validate
            </button>
            <button
              className="btn-secondary"
              onClick={() => {
                clearKey();
                setKeyInput("");
                setKeyStatus(null);
                setModels(null);
              }}
            >
              Clear key
            </button>
          </div>
        </section>
      )}

      {keyStatus && (
        <p className="mb-2 font-medium">
          {STATUS_TEXT[keyStatus]}
          {state.hasKey && state.keyMask && cloudProvider ? ` (${state.keyMask})` : ""}
        </p>
      )}
      {statusError && (
        <p role="alert" className="mb-4 text-red-800">
          {statusError}
        </p>
      )}

      {(keyStatus === "valid" || keyStatus === "reachable") && (
        <section className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">3) Choose a model</h2>
          {provider.curatedModels.length > 0 && (
            <>
              <p className="mb-2 text-[15px] text-neutral-700">Suggested:</p>
              <div className="mb-3 flex flex-wrap gap-2">
                {provider.curatedModels.map((m) => (
                  <button
                    key={m}
                    className={state.model === m ? "btn-primary !min-h-10 !py-2 text-[15px]" : "btn-secondary !min-h-10 !py-2 text-[15px]"}
                    onClick={() => chooseModel(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </>
          )}
          {models && (
            <>
              <p className="mb-2 text-[15px] text-neutral-700">
                From the provider&apos;s live list ({models.length}):
              </p>
              <select
                className="text-input mb-2"
                value={
                  models.some((m) => m.id === state.model) ? state.model ?? "" : ""
                }
                onChange={(e) => chooseModel(e.target.value)}
                size={1}
              >
                <option value="" disabled>
                  Choose a model…
                </option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label ?? m.id}
                  </option>
                ))}
              </select>
              {state.providerId === "openrouter" && (
                <label className="mb-2 flex items-center gap-2 text-[15px]">
                  <input
                    type="checkbox"
                    checked={showPaid}
                    onChange={(e) => {
                      setShowPaid(e.target.checked);
                      void reloadModels();
                    }}
                  />
                  Show paid models (only :free models are shown by default)
                </label>
              )}
            </>
          )}
          {modelsError && <p className="mb-2 text-red-800">{modelsError}</p>}
          <details className="mb-2 text-[15px]">
            <summary className="cursor-pointer">Advanced: type a model name</summary>
            <p className="mb-2 mt-2 text-sm text-red-800">
              Warning: the name is not checked against the provider&apos;s list
              and may not work.
            </p>
            <div className="flex gap-2">
              <input
                className="text-input"
                value={advancedModelText}
                onChange={(e) => setAdvancedModelText(e.target.value)}
                placeholder="provider/model-name"
              />
              <button
                className="btn-secondary"
                onClick={() => advancedModelText.trim() && chooseModel(advancedModelText.trim())}
              >
                Use
              </button>
            </div>
            {advancedModel && <p />}
          </details>
          {state.model && (
            <p className="mb-2 font-medium">Active model: {state.model}</p>
          )}
          <p className="mb-3 text-sm text-neutral-600">{provider.freeTierNote}</p>
        </section>
      )}

      <section className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">4) Use for scoring</h2>
        <label className="flex items-center gap-2 text-[16px]">
          <input
            type="checkbox"
            checked={state.useForScoring}
            disabled={!state.hasKey || !state.model || keyStatus === null}
            onChange={(e) => setUseForScoring(e.target.checked)}
          />
          Use my model for bullet scores (off = built-in engine)
        </label>
        <p className="mt-1 text-sm text-neutral-600">
          When on, bullet scores come from your model. The job-posting match
          and all totals are still computed by the built-in engine.
        </p>
      </section>

      <button className="btn-primary" onClick={onBack}>
        Back
      </button>
    </div>
  );
}
