/**
 * Server helpers: shared-password access gate + per-session rate limit.
 * The password lives only in the server environment; the browser never sees
 * it. The gate token is a salted SHA-256 of the password so the raw
 * password is never stored client-side either.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";

const SALT = "jobforward-gate-v1";

function gatePassword(): string {
  const value = process.env.GATE_PASSWORD;
  if (!value) {
    throw new Error("GATE_PASSWORD is not set; refusing to serve without the access gate");
  }
  return value;
}

export function expectedToken(): string {
  return createHash("sha256").update(SALT + gatePassword()).digest("hex");
}

export function tokenFor(password: string): string {
  return createHash("sha256").update(SALT + password).digest("hex");
}

export function checkPassword(password: string): boolean {
  const a = Buffer.from(tokenFor(password));
  const b = Buffer.from(expectedToken());
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Every API route (except /api/gate) requires the x-gate-token header. */
export function isAuthorized(request: NextRequest): boolean {
  const token = request.headers.get("x-gate-token") ?? "";
  const a = Buffer.from(token);
  const b = Buffer.from(expectedToken());
  return a.length === b.length && timingSafeEqual(a, b);
}

// --- Rate limit: 30 requests/min per session id (sliding window, memory) ---
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;
const hits = new Map<string, number[]>();

export function rateLimited(sessionId: string): boolean {
  const now = Date.now();
  const list = (hits.get(sessionId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_REQUESTS) {
    hits.set(sessionId, list);
    return true;
  }
  list.push(now);
  hits.set(sessionId, list);
  return false;
}

export function sessionIdOf(request: NextRequest): string {
  return request.headers.get("x-session-id") ?? "anonymous";
}
