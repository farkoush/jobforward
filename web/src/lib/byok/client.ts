"use client";

/**
 * BYOK client — everything here runs in the browser; the key NEVER reaches
 * our server, logs, analytics, or any URL (BYOK §1/§4). All provider
 * requests go browser → provider directly.
 *
 * Storage: session-only by default (sessionStorage). "Remember me" is
 * opt-in, off by default, and stores the key under a namespaced
 * localStorage key with a Clear button. Masks are the only display form.
 */

import { z } from "zod";
import {
  BYOK_MAX_INPUT_CHARS,
  BYOK_MAX_OUTPUT_TOKENS,
  BYOK_MAX_RETRIES,
  BYOK_TIMEOUT_MS,
  PROVIDERS,
} from "./providers.config";
import { buildGeminiRequest, parseGeminiResponse } from "./adapters/gemini";
import {
  buildOpenAIRequest,
  parseOpenAIModelList,
  parseOpenAIResponse,
} from "./adapters/openaiCompatible";
import {
  buildOllamaRequest,
  isEmbeddingModel,
  parseOllamaResponse,
  parseOllamaTags,
} from "./adapters/ollama";
import { normalizeError } from "./normalizeError";
import { redact } from "./redact";
import type {
  ChatMessage,
  ChatRequest,
  KeyStatus,
  NormalizedError,
  ProviderId,
} from "./types";
import { filterGeminiModels, filterOllamaModels, filterOpenRouterModels } from "./filters";
import type { FilteredModel } from "./filters";

const REMEMBER_KEY = "jobforward.byok.remembered";
const MASKED_DISPLAY = (key: string) =>
  key.length > 12 ? `${key.slice(0, 4)}…${key.slice(-4)}` : "…";

// --- Key state (session-only unless Remember me) ---

let memoryKey: string | null = null;

export interface StoredByokState {
  providerId: ProviderId;
  hasKey: boolean;
  keyMask: string | null;
  model: string | null;
  useForScoring: boolean;
  ollamaOrigin: string | null;
  privacyAccepted: boolean;
}

let state: StoredByokState = {
  providerId: "ollama",
  hasKey: false,
  keyMask: null,
  model: null,
  useForScoring: false,
  ollamaOrigin: null,
  privacyAccepted: false,
};

const listeners = new Set<() => void>();

export function getByokState(): StoredByokState {
  return { ...state };
}

export function onByokChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(): void {
  for (const fn of listeners) fn();
}

function readRemembered(): { key: string; providerId: ProviderId } | null {
  try {
    const raw = window.localStorage.getItem(REMEMBER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { key: string; providerId: ProviderId };
    if (!parsed.key || !PROVIDERS[parsed.providerId]) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Restore a remembered key (only if the user opted in earlier). */
export function initByok(): void {
  if (typeof window === "undefined") return;
  const remembered = readRemembered();
  if (remembered) {
    memoryKey = remembered.key;
    state.hasKey = true;
    state.keyMask = MASKED_DISPLAY(remembered.key);
    state.providerId = remembered.providerId;
  }
  const raw = window.sessionStorage.getItem("jobforward.byok.model");
  if (raw) {
    try {
      const saved = JSON.parse(raw) as Partial<StoredByokState>;
      state.model = saved.model ?? state.model;
      state.useForScoring = saved.useForScoring ?? false;
      state.ollamaOrigin = saved.ollamaOrigin ?? state.ollamaOrigin;
      state.privacyAccepted = saved.privacyAccepted ?? false;
      if (state.hasKey === false && saved.providerId) state.providerId = saved.providerId;
    } catch {
      // ignore corrupt session state
    }
  }
  // Keyless providers (Ollama) need no key — the advanced path is available
  // as soon as a model is chosen.
  if (PROVIDERS[state.providerId]?.keyless) state.hasKey = true;
  emit();
}

export function setProvider(providerId: ProviderId): void {
  state.providerId = providerId;
  state.hasKey = memoryKey !== null || Boolean(PROVIDERS[providerId].keyless);
  state.keyMask = memoryKey ? MASKED_DISPLAY(memoryKey) : null;
  persistSessionBits();
  emit();
}

/**
 * Gateway-era accessor (004-llm-gateway, FR-29): exposes the in-memory key
 * so the page can send it per-request in the x-byok-key header. The key is
 * NEVER persisted by the caller — this only reads the memory slot.
 */
export function getRawKeyForGateway(): string | null {
  return memoryKey;
}

export function setKey(key: string, remember: boolean): void {
  memoryKey = key.trim();
  state.hasKey = true;
  state.keyMask = MASKED_DISPLAY(memoryKey);
  try {
    window.localStorage.removeItem(REMEMBER_KEY);
    if (remember) {
      // Opt-in only (off by default), namespaced, warning shown in the UI.
      window.localStorage.setItem(
        REMEMBER_KEY,
        JSON.stringify({ key: memoryKey, providerId: state.providerId })
      );
    }
  } catch {
    // storage unavailable — session memory still works
  }
  persistSessionBits();
  emit();
}

/** Clear the key everywhere: memory, storage, and any cache. */
export function clearKey(): void {
  memoryKey = null;
  state.hasKey = Boolean(PROVIDERS[state.providerId].keyless);
  state.keyMask = null;
  state.useForScoring = false;
  try {
    window.localStorage.removeItem(REMEMBER_KEY);
    window.sessionStorage.removeItem("jobforward.byok.model");
    modelListCache.clear();
  } catch {
    // ignore
  }
  emit();
}

export function setModel(model: string): void {
  state.model = model;
  persistSessionBits();
  emit();
}

export function setUseForScoring(use: boolean): void {
  state.useForScoring = use && state.hasKey && Boolean(state.model);
  persistSessionBits();
  emit();
}

export function setOllamaOrigin(origin: string | null): void {
  state.ollamaOrigin = origin;
  try {
    // The CSP middleware adds the user's Ollama origin to connect-src
    // narrowly, only for localhost addresses, via this cookie (BYOK §4).
    if (origin && isLocalhostOrigin(origin)) {
      document.cookie = `jf_ollama_origin=${encodeURIComponent(origin)}; path=/; samesite=strict`;
    } else {
      document.cookie = "jf_ollama_origin=; path=/; max-age=0";
    }
  } catch {
    // ignore
  }
  persistSessionBits();
  emit();
}

export function setPrivacyAccepted(): void {
  state.privacyAccepted = true;
  persistSessionBits();
  emit();
}

function persistSessionBits(): void {
  try {
    window.sessionStorage.setItem(
      "jobforward.byok.model",
      JSON.stringify({
        model: state.model,
        useForScoring: state.useForScoring,
        ollamaOrigin: state.ollamaOrigin,
        privacyAccepted: state.privacyAccepted,
        providerId: state.providerId,
      })
    );
  } catch {
    // ignore
  }
}

export function maskKey(key: string): string {
  return MASKED_DISPLAY(key);
}

// --- Guardrails (BYOK §5) ---

let inFlight = false;
export function isBusy(): boolean {
  return inFlight;
}

export function checkInputLimit(totalChars: number): NormalizedError | null {
  if (totalChars > BYOK_MAX_INPUT_CHARS) {
    return {
      code: "network",
      userMessage:
        "The text is too long to send to the model. Shorten the resume or posting.",
      retryable: false,
    };
  }
  return null;
}

// --- Low-level fetch with timeout + retry policy ---

async function fetchJson(
  url: string,
  init: RequestInit,
  providerId: ProviderId
): Promise<{ status: number; body: unknown; headers: Record<string, string> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BYOK_TIMEOUT_MS);
  const outerSignal = init.signal as AbortSignal | undefined;
  const onAbort = () => controller.abort();
  outerSignal?.addEventListener("abort", onAbort);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const headers: Record<string, string> = {};
    response.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });
    let body: unknown = null;
    const text = await response.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    if (!response.ok) {
      const err = normalizeError(providerId, { status: response.status, body: text, headers });
      const enriched = new Error(err.code) as Error & { normalized?: NormalizedError };
      enriched.normalized = { ...err };
      throw enriched;
    }
    return { status: response.status, body, headers };
  } catch (exc) {
    const caught = exc as Error & { normalized?: NormalizedError };
    if (caught.normalized) throw caught;
    if ((exc as { name?: string })?.name === "AbortError") {
      const err: NormalizedError = {
        code: outerSignal?.aborted ? "aborted" : "timeout",
        userMessage:
          outerSignal?.aborted
            ? "The request was cancelled."
            : "The request took too long and was stopped.",
        retryable: false,
      };
      const enriched = new Error(err.code) as Error & { normalized?: NormalizedError };
      enriched.normalized = err;
      throw enriched;
    }
    const err = normalizeError(providerId, exc as Error);
    const enriched = new Error(err.code) as Error & { normalized?: NormalizedError };
    enriched.normalized = err;
    throw enriched;
  } finally {
    clearTimeout(timer);
    outerSignal?.removeEventListener("abort", onAbort);
  }
}

async function withRetry(
  fn: () => Promise<{ status: number; body: unknown; headers: Record<string, string> }>,
  providerId: ProviderId
): Promise<{ status: number; body: unknown; headers: Record<string, string> }> {
  // Retry ONLY network errors and 5xx, at most 2 times, with backoff.
  // Never auto-retry on 401/403/429 (BYOK §5).
  let lastError: (Error & { normalized?: NormalizedError }) | null = null;
  for (let attempt = 0; attempt <= BYOK_MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (exc) {
      lastError = exc as Error & { normalized?: NormalizedError };
      const code = lastError.normalized?.code;
      const retryable = lastError.normalized?.retryable === true;
      if (!retryable || attempt === BYOK_MAX_RETRIES) break;
      const waitSec =
        lastError.normalized?.retryAfterSec ??
        Math.min(30, 2 ** attempt); /* 1s, 2s */
      await new Promise((r) => setTimeout(r, waitSec * 1000));
      void providerId;
    }
  }
  throw lastError as Error;
}

function normalizeUnknown(exc: unknown, providerId: ProviderId): NormalizedError {
  return normalizeError(providerId, exc as Error);
}

// --- Public API: validate / list models / rate ---

export async function validateKey(
  providerId: ProviderId
): Promise<{ status: KeyStatus; error?: NormalizedError }> {
  const provider = PROVIDERS[providerId];
  const base = ollamaBase(providerId);
  try {
    if (provider.keyless) {
      const { status } = await withRetry(
        () => fetchJson(`${base}/api/tags`, { method: "GET" }, providerId),
        providerId
      );
      return { status: status === 200 ? "reachable" : "unreachable" };
    }
    const key = memoryKey;
    if (!key) return { status: "invalid" };
    const headers: Record<string, string> =
      provider.authHeader === "x-goog-api-key"
        ? { "x-goog-api-key": key }
        : { Authorization: `Bearer ${key}` };
    // Cheap validation: GET the model list, never a generation (BYOK §4).
    await withRetry(
      () => fetchJson(`${base}${provider.listModelsEndpoint}`, { method: "GET", headers }, providerId),
      providerId
    );
    return { status: "valid" };
  } catch (exc) {
    const err = (exc as Error & { normalized?: NormalizedError }).normalized;
    if (err?.code === "quota_exhausted" || err?.code === "rate_limited") {
      return { status: "quota", error: err };
    }
    if (err?.code === "cors_blocked" || err?.code === "network") {
      return { status: "cors_blocked", error: err };
    }
    if (err?.code === "local_unreachable") {
      return { status: "unreachable", error: err };
    }
    if (err?.code === "local_origin_blocked") {
      return { status: "cors_blocked", error: err };
    }
    return { status: "invalid", error: err };
  }
}

function ollamaBase(providerId: ProviderId): string {
  if (providerId !== "ollama") return PROVIDERS[providerId].baseUrl;
  const origin = state.ollamaOrigin?.trim();
  if (!origin) return PROVIDERS.ollama.baseUrl;
  // Accept only localhost / 127.0.0.1 / [::1] without a warning; other
  // addresses require explicit user confirmation in the UI (BYOK §4).
  return origin.replace(/\/+$/, "");
}

export function isLocalhostOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

const modelListCache = new Map<ProviderId, FilteredModel[]>();

export async function listModels(
  providerId: ProviderId,
  opts?: { showPaid?: boolean }
): Promise<FilteredModel[]> {
  const cached = modelListCache.get(providerId);
  if (cached) return cached;
  const provider = PROVIDERS[providerId];
  const base = ollamaBase(providerId);
  const result = await withRetry(
    () =>
      fetchJson(
        `${base}${provider.listModelsEndpoint}`,
        provider.keyless
          ? { method: "GET" }
          : {
              method: "GET",
              headers:
                provider.authHeader === "x-goog-api-key"
                  ? { "x-goog-api-key": memoryKey ?? "" }
                  : { Authorization: `Bearer ${memoryKey ?? ""}` },
            },
        providerId
      ),
    providerId
  );

  let models: FilteredModel[] = [];
  if (providerId === "openrouter") {
    models = filterOpenRouterModels(parseOpenAIModelList(result.body), opts?.showPaid ?? false);
  } else if (providerId === "google_ai_studio") {
    models = filterGeminiModels(
      (result.body as { models?: Array<{ name?: string; supportedGenerationMethods?: string[]; displayName?: string }> })
        .models ?? []
    );
  } else if (providerId === "ollama") {
    models = filterOllamaModels(
      parseOllamaTags(result.body)
        .filter((m) => !isEmbeddingModel(m.name))
        .map((m) => ({ name: m.name, sizeBytes: m.sizeBytes }))
    );
  } else {
    models = parseOpenAIModelList(result.body).map((id) => ({ id }));
  }
  modelListCache.set(providerId, models);
  return models;
}

// The model's rating output is validated against the TERMINAL's schema.
// Range check (0|1|2) is enforced at the boundary too; the shared
// validity check (validateResponse) re-checks order and count afterward.
const ratingValue = z
  .number()
  .int()
  .refine((v) => v === 0 || v === 1 || v === 2);

export const BYOK_RATINGS_SCHEMA = z.object({
  rubric_version: z.string(),
  ratings: z
    .array(
      z.object({
        bullet_index: z.number().int().nonnegative(),
        context: ratingValue,
        role_action_clarity: ratingValue,
        result: ratingValue,
      })
    )
    .min(1),
});

const ModelRatingsSchema = BYOK_RATINGS_SCHEMA;

export interface ModelRatingOutcome {
  ok: boolean;
  ratings?: Array<{
    bullet_index: number;
    context: number;
    role_action_clarity: number;
    result: number;
  }>;
  error?: NormalizedError;
  /** True when the model returned an unusable/invalid payload (FR-014 path). */
  invalidOutput?: boolean;
}

/**
 * Rate bullets with the user's model. Output is untrusted: parsed, zod-
 * validated against the terminal's evaluator schema, then re-checked by the
 * shared validity check by the caller. One internal retry on invalid output
 * (FR-014), then refusal — never broken output.
 */
export async function rateBulletsWithModel(
  bulletTexts: string[],
  buildMessages: (texts: string[]) => ChatMessage[],
  signal?: AbortSignal
): Promise<ModelRatingOutcome> {
  if (inFlight) {
    return {
      ok: false,
      error: { code: "aborted", userMessage: "A request is already running.", retryable: false },
    };
  }
  const providerId = state.providerId;
  const provider = PROVIDERS[providerId];
  const model = state.model;
  if (!model) {
    return {
      ok: false,
      error: { code: "model_unavailable", userMessage: "Choose a model first.", retryable: false },
    };
  }
  const limitError = checkInputLimit(bulletTexts.join("\n").length);
  if (limitError) return { ok: false, error: limitError, invalidOutput: false };

  inFlight = true;
  try {
    let lastInvalid = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const messages = buildMessages(bulletTexts);
        const chatReq: ChatRequest = {
          model,
          messages,
          maxOutputTokens: BYOK_MAX_OUTPUT_TOKENS,
          temperature: 0,
          signal,
        };
        let parsedText: string;
        if (provider.requestAdapter === "gemini") {
          const { url, init } = buildGeminiRequest(ollamaBase(providerId), memoryKey ?? "", chatReq);
          const res = await withRetry(() => fetchJson(url, init, providerId), providerId);
          parsedText = parseGeminiResponse(res.body).text;
        } else if (provider.requestAdapter === "ollama") {
          const { url, init } = buildOllamaRequest(ollamaBase(providerId), chatReq);
          const res = await withRetry(() => fetchJson(url, init, providerId), providerId);
          parsedText = parseOllamaResponse(res.body).text;
        } else {
          const { url, init } = buildOpenAIRequest(ollamaBase(providerId), memoryKey ?? "", chatReq);
          const res = await withRetry(() => fetchJson(url, init, providerId), providerId);
          parsedText = parseOpenAIResponse(res.body).text;
        }

        // Model output is untrusted: strip fences, parse JSON, validate.
        const cleaned = parsedText
          .replace(/^```(?:json)?/i, "")
          .replace(/```\s*$/, "")
          .trim();
        let raw: unknown;
        try {
          raw = JSON.parse(cleaned);
        } catch {
          lastInvalid = true;
          continue;
        }
        const checked = ModelRatingsSchema.safeParse(raw);
        if (!checked.success) {
          lastInvalid = true;
          continue;
        }
        return { ok: true, ratings: checked.data.ratings };
      } catch (exc) {
        const err = (exc as Error & { normalized?: NormalizedError }).normalized;
        if (err) return { ok: false, error: err };
        return { ok: false, invalidOutput: true, error: normalizeUnknown(exc, providerId) };
      }
    }
    return {
      ok: false,
      invalidOutput: true,
      error: { code: "bad_output", userMessage: "The model returned no usable response; try again.", retryable: true },
    };
  } finally {
    inFlight = false;
  }
}

/** Redacted preview for logs/UI: never a raw key. */
export function redactedDebug(): unknown {
  return redact({ ...state, key: memoryKey ? "[present]" : null });
}
