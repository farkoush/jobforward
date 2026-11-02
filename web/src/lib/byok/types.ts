/**
 * BYOK shared types — one common interface for all providers.
 * The key lives ONLY in the browser; no BYOK code runs on our server.
 */

export type ProviderId = "google_ai_studio" | "openrouter" | "ollama" | "groq" | "mistral";

export interface ProviderConfig {
  id: ProviderId;
  displayName: string;
  baseUrl: string;
  /** "x-goog-api-key" | "Authorization: Bearer" | "none" (Ollama) */
  authHeader: "x-goog-api-key" | "bearer" | "none";
  listModelsEndpoint: string;
  chatEndpoint: string;
  /** Which request/response adapter this provider uses. */
  requestAdapter: "gemini" | "openai" | "ollama";
  keyFormatHint: string;
  getKeyUrl: string;
  freeTierNote: string;
  dataUsageNote: string;
  /** Data-usage check date from the provider's official docs (BYOK §7). */
  dataUsageCheckedAt: string;
  curatedModels: string[];
  /** False = shown in the UI as disabled with this documented reason. */
  enabled: boolean;
  disabledReason?: string;
  /** Ollama: no key, editable server address, no cloud warning. */
  keyless?: boolean;
}

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  maxOutputTokens: number;
  temperature: number;
  signal?: AbortSignal;
}

export interface ChatResult {
  text: string;
}

/** Key validation result (BYOK §4); never a text generation. */
export type KeyStatus =
  | "valid"
  | "invalid"
  | "quota"
  | "network"
  | "cors_blocked"
  | "reachable"
  | "unreachable"
  | "unverified";

/** Normalized error shape (BYOK §6). */
export interface NormalizedError {
  code:
    | "invalid_key"
    | "insufficient_credit"
    | "rate_limited"
    | "quota_exhausted"
    | "model_unavailable"
    | "cors_blocked"
    | "network"
    | "local_unreachable"
    | "local_origin_blocked"
    | "local_model_missing"
    | "bad_output"
    | "timeout"
    | "aborted";
  userMessage: string;
  retryable: boolean;
  retryAfterSec?: number;
}
