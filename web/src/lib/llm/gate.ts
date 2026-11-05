/**
 * Entry gate (FR-36) + anonymous quota identity (FR-18): a single shared
 * password (server-side env only, constant-time compare) grants a signed,
 * httpOnly, persistent (~30-day) cookie carrying a random anonymous id — no
 * accounts, no registration, no user-side password change in this version.
 *
 * Cookie rotation: changing GATE_COOKIE_SECRET invalidates every existing
 * cookie immediately, so all testers re-enter the (new) password — the
 * documented leak response.
 *
 * IP extraction uses platform-set request metadata only (x-vercel-*), never
 * client-supplied values; in local dev there is no platform header, so every
 * request shares the "unknown" bucket (harmless locally).
 */

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { GATE_COOKIE_NAME } from "./types";
import { getRateStore } from "./rate-store";

export { GATE_COOKIE_NAME };

const MS_PER_DAY = 86_400_000;

/**
 * The gate needs only its own two variables, NOT the full gateway config —
 * legacy routes (deterministic engine) must keep working with just
 * GATE_PASSWORD/GATE_COOKIE_SECRET set, without demanding provider config.
 */
function cookieSecret(): string {
  const value = process.env.GATE_COOKIE_SECRET;
  if (!value) {
    throw new Error("GATE_COOKIE_SECRET is not set; cannot verify gate cookies");
  }
  return value;
}

function cookieTtlDays(): number {
  const parsed = Number(process.env.GATE_COOKIE_TTL_DAYS ?? "30");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

export function newAnonymousId(): string {
  return randomUUID();
}

export function signGateCookie(id: string, issuedAtMs: number = Date.now()): string {
  const expiry = issuedAtMs + cookieTtlDays() * MS_PER_DAY;
  const payload = `${id}.${expiry}`;
  const mac = createHmac("sha256", cookieSecret())
    .update(payload)
    .digest("hex");
  return `${payload}.${mac}`;
}

/** Returns the anonymous id for a valid, unexpired cookie — else null. */
export function verifyGateCookie(value: string | undefined | null): string | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [id, expiryStr, mac] = parts;
  if (!id || !expiryStr || !mac) return null;
  const expected = createHmac("sha256", cookieSecret())
    .update(`${id}.${expiryStr}`)
    .digest("hex");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(expiryStr) < Date.now()) return null;
  return id;
}

export function gateCookieHeader(value: string): string {
  const parts = [
    `${GATE_COOKIE_NAME}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor((cookieTtlDays() * MS_PER_DAY) / 1000)}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

/** IP for rate limiting: platform metadata only, never client-sent values. */
export function ipOf(request: {
  headers: { get(name: string): string | null };
}): string {
  const vercel = request.headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0].trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

/**
 * Failed-login limiter: 5 wrong attempts per minute per IP (FR-36). Returns
 * true when this attempt exceeds the limit.
 */
export async function loginLimited(ip: string): Promise<boolean> {
  const minute = Math.floor(Date.now() / 60_000);
  const count = await getRateStore().incr(
    `llm:gate-login:${ip}:${minute}`,
    65_000
  );
  return count > 5;
}
