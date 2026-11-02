import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Strict CSP for the whole app (BYOK §4): script-src uses a per-request
 * nonce + 'strict-dynamic' (Next.js App Router requires inline hydration
 * scripts; a nonce keeps this safe WITHOUT unsafe-inline/unsafe-eval).
 * connect-src is limited to 'self' plus the BYOK provider origins. The
 * user's Ollama origin is added narrowly from a cookie (never a wildcard),
 * and only when it is a localhost address.
 */

const PROVIDER_ORIGINS = [
  "https://generativelanguage.googleapis.com",
  "https://openrouter.ai",
  "https://api.groq.com",
  "https://api.mistral.ai",
];

function safeOllamaOrigin(cookieValue: string | undefined): string | null {
  if (!cookieValue) return null;
  try {
    const url = new URL(cookieValue);
    const host = url.hostname;
    const isLocal =
      host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
    if (!isLocal) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID()).replace(/[^a-zA-Z0-9]/g, "");
  const ollamaOrigin = safeOllamaOrigin(request.cookies.get("jf_ollama_origin")?.value);
  const connectSrc = ["'self'", ...PROVIDER_ORIGINS, ...(ollamaOrigin ? [ollamaOrigin] : [])];
  const isDev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'", // Next/Tailwind inject style tags
    `connect-src ${connectSrc.join(" ")}`,
    "img-src 'self' data:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }],
    },
  ],
};
