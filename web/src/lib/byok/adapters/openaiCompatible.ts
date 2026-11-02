/**
 * Shared adapter for the OpenAI-compatible providers (OpenRouter, Groq,
 * Mistral): Bearer auth, /chat/completions, /models. The key is only ever
 * placed in the Authorization header — never in a URL.
 */

import type { ChatRequest, ChatResult } from "../types";

export function buildOpenAIRequest(
  baseUrl: string,
  apiKey: string,
  req: ChatRequest
): { url: string; init: RequestInit } {
  return {
    url: `${baseUrl}/chat/completions`,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: req.model,
        messages: req.messages,
        max_tokens: req.maxOutputTokens,
        temperature: req.temperature,
      }),
      signal: req.signal,
    },
  };
}

export function parseOpenAIResponse(body: unknown): ChatResult {
  const b = body as { choices?: Array<{ message?: { content?: string } }> };
  const text = b.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error("empty response");
  return { text };
}

export function parseOpenAIModelList(body: unknown): string[] {
  const b = body as { data?: Array<{ id?: string }> };
  return (b.data ?? []).map((m) => m.id ?? "").filter(Boolean);
}
