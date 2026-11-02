/**
 * Model-list filters (BYOK §3). Model names change frequently — nothing is
 * hard-coded; the list always comes from the provider's live endpoint and
 * is filtered here.
 */

import type { ProviderId } from "./types";
import { isEmbeddingModel as ollamaIsEmbedding } from "./adapters/ollama";

export interface FilteredModel {
  id: string;
  label?: string;
  disabled?: boolean;
}

/** OpenRouter: only :free ids by default (optional "show paid" toggle). */
export function filterOpenRouterModels(ids: string[], showPaid: boolean): FilteredModel[] {
  return ids
    .filter((id) => showPaid || id.endsWith(":free"))
    .map((id) => ({ id }));
}

/** Gemini: only text models that support generateContent. */
export function filterGeminiModels(
  models: Array<{ name?: string; supportedGenerationMethods?: string[]; displayName?: string }>
): FilteredModel[] {
  return models
    .filter(
      (m) =>
        typeof m.name === "string" &&
        (m.supportedGenerationMethods ?? []).includes("generateContent")
    )
    .map((m) => ({ id: (m.name as string).replace(/^models\//, ""), label: m.displayName }));
}

/** Ollama: installed models except embedding-only ones (BYOK §3). */
export function filterOllamaModels(
  models: Array<{ name: string; sizeBytes: number; embedding?: boolean }>
): FilteredModel[] {
  return models
    .filter((m) => !m.embedding && !ollamaIsEmbedding(m.name))
    .map((m) => ({
      id: m.name,
      label: `${m.name}${m.sizeBytes ? ` (${Math.round(m.sizeBytes / 1024 / 1024)} MB)` : ""}`,
    }));
}


export type { ProviderId };
