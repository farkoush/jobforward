/**
 * Google AI Studio (Gemini) adapter — native generateContent endpoint with
 * the x-goog-api-key HEADER (never the ?key= query param, which leaks the
 * key into URLs). Plain fetch with minimal headers to keep the CORS
 * preflight simple (BYOK §3).
 */

import type { ChatRequest, ChatResult } from "../types";

export function geminiChatUrl(baseUrl: string, model: string): string {
  return `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`;
}

export function buildGeminiRequest(
  baseUrl: string,
  apiKey: string,
  req: ChatRequest
): { url: string; init: RequestInit } {
  const contents = req.messages.map((m) => ({
    role: m.role === "system" ? "user" : "model",
    parts: [{ text: m.content }],
  }));
  const system = req.messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  return {
    url: geminiChatUrl(baseUrl, req.model),
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents,
        generationConfig: {
          maxOutputTokens: req.maxOutputTokens,
          temperature: req.temperature,
        },
      }),
      signal: req.signal,
    },
  };
}

export function parseGeminiResponse(body: unknown): ChatResult {
  const b = body as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text =
    b.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) throw new Error("empty response");
  return { text };
}
