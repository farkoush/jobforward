/**
 * Provider registry — the single source of truth for BYOK provider data
 * (BYOK §3). Adding a provider = one entry here (+ one adapter if its API
 * shape differs). Everything UI-related reads from this config.
 *
 * CORS status is recorded in docs/byok-cors-results.md. No provider is
 * declared "supported" without a real browser test; unverified providers
 * are shipped disabled with the documented reason (BYOK §3/§10).
 */

import type { ProviderConfig, ProviderId } from "./types";

export const BYOK_CONFIG_VERSION = "byok-config-1.0.0";

/** Fixed client-side output cap and input cap (BYOK §5). */
export const BYOK_MAX_OUTPUT_TOKENS = 1024;
export const BYOK_MAX_INPUT_CHARS = 24_000; // resume + posting combined
export const BYOK_TIMEOUT_MS = 60_000;
export const BYOK_MAX_RETRIES = 2;

export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  google_ai_studio: {
    id: "google_ai_studio",
    displayName: "Google AI Studio (Gemini)",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    // Header, NOT the ?key= query param — the query param leaks the key
    // into URLs and logs (BYOK §3).
    authHeader: "x-goog-api-key",
    listModelsEndpoint: "/models",
    chatEndpoint: "/models/{model}:generateContent",
    requestAdapter: "gemini",
    keyFormatHint: "Starts with AIza…",
    getKeyUrl: "https://aistudio.google.com/apikey",
    freeTierNote: "Free tier is available; limits change often.",
    dataUsageNote:
      "On the free tier, content may be used by Google to improve models. Check the current terms before sending personal data.",
    dataUsageCheckedAt: "2026-10-30 (unverified against live docs)",
    curatedModels: ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash"],
    enabled: true,
    // §16 FR-63: the ACTIVE BYOK provider for the server gateway — Google's
    // OpenAI-compatible layer (Bearer key). The native fields above belong
    // to the hidden legacy stack and stay untouched.
    gatewayBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
  },
  openrouter: {
    id: "openrouter",
    displayName: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    authHeader: "bearer",
    listModelsEndpoint: "/models",
    chatEndpoint: "/chat/completions",
    requestAdapter: "openai",
    keyFormatHint: "Starts with sk-or-…",
    getKeyUrl: "https://openrouter.ai/keys",
    freeTierNote: "Many models have a free variant (id ends with :free).",
    dataUsageNote:
      "Policy depends on the model and its upstream provider. Free models may log or train on content — check the model page.",
    dataUsageCheckedAt: "2026-10-30 (unverified against live docs)",
    curatedModels: [],
    enabled: true,
  },
  ollama: {
    id: "ollama",
    displayName: "Ollama (local)",
    baseUrl: "http://localhost:11434",
    authHeader: "none",
    listModelsEndpoint: "/api/tags",
    chatEndpoint: "/api/chat",
    requestAdapter: "ollama",
    keyFormatHint: "",
    getKeyUrl: "https://ollama.com/download",
    freeTierNote: "Free and local.",
    // Keyless local path: data never leaves the device when the address is
    // localhost — no cloud privacy warning is shown (BYOK §3/§7).
    dataUsageNote: "Your data stays on your device.",
    dataUsageCheckedAt: "2026-10-30 (n/a — local)",
    curatedModels: [],
    enabled: true,
    keyless: true,
  },
  groq: {
    id: "groq",
    displayName: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    authHeader: "bearer",
    listModelsEndpoint: "/models",
    chatEndpoint: "/chat/completions",
    requestAdapter: "openai",
    keyFormatHint: "Starts with gsk_…",
    getKeyUrl: "https://console.groq.com/keys",
    freeTierNote: "Free tier is available; limits change often.",
    dataUsageNote:
      "Policy depends on the model and its upstream provider. Check the current terms before sending personal data.",
    dataUsageCheckedAt: "2026-10-30 (unverified against live docs)",
    curatedModels: ["openai/gpt-oss-120b"],
    // Disabled until a real browser CORS test passes (BYOK §3/§10).
    enabled: false,
    disabledReason: "Not supported in the browser (CORS unverified) — see docs/byok-cors-results.md.",
  },
  mistral: {
    id: "mistral",
    displayName: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    authHeader: "bearer",
    listModelsEndpoint: "/models",
    chatEndpoint: "/chat/completions",
    requestAdapter: "openai",
    keyFormatHint: "",
    getKeyUrl: "https://console.mistral.ai/api-keys",
    freeTierNote: "Free experiment tiers change often.",
    dataUsageNote:
      "On free experiment tiers, content may be used to improve models. Check the current terms before sending personal data.",
    dataUsageCheckedAt: "2026-10-30 (unverified against live docs)",
    curatedModels: [],
    // Disabled until a real browser CORS test passes (BYOK §3/§10).
    enabled: false,
    disabledReason: "Not supported in the browser (CORS unverified) — see docs/byok-cors-results.md.",
  },
};

export const PROVIDER_ORDER: ProviderId[] = [
  "ollama",
  "google_ai_studio",
  "openrouter",
  "groq",
  "mistral",
];
