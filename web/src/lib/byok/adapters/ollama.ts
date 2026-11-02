/**
 * Ollama (local, keyless) adapter. No Authorization header is ever sent.
 * Native API: GET /api/tags for installed models, POST /api/chat for chat.
 * The server address is user-editable but only localhost/127.0.0.1/[::1]
 * are accepted without an explicit warning (checked by the caller).
 */

import type { ChatRequest, ChatResult } from "../types";

export function buildOllamaRequest(
  baseUrl: string,
  req: ChatRequest
): { url: string; init: RequestInit } {
  return {
    url: `${baseUrl}/api/chat`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: req.model,
        messages: req.messages,
        stream: false,
        options: {
          num_predict: req.maxOutputTokens,
          temperature: req.temperature,
        },
      }),
      signal: req.signal,
    },
  };
}

export function parseOllamaResponse(body: unknown): ChatResult {
  const b = body as { message?: { content?: string } };
  const text = b.message?.content ?? "";
  if (!text.trim()) throw new Error("empty response");
  return { text };
}

export interface OllamaInstalledModel {
  name: string;
  sizeBytes: number;
}

export function parseOllamaTags(body: unknown): OllamaInstalledModel[] {
  const b = body as { models?: Array<{ name?: string; size?: number }> };
  return (b.models ?? [])
    .filter((m) => typeof m.name === "string" && m.name)
    .map((m) => ({ name: m.name as string, sizeBytes: m.size ?? 0 }));
}

/** Embedding-only models are excluded from the selectable list (BYOK §3). */
export function isEmbeddingModel(name: string): boolean {
  return /embed|bge-|e5-|gte-/i.test(name);
}
