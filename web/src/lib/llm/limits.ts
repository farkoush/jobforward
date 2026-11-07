/**
 * Usage limits (FR-10/11/12/19/27/30/31): UTC-day per-category quotas for
 * each quota identity and globally, per-minute caps, and the global
 * provider-per-minute limiter that counts EVERY actual provider call
 * (including retries and fallbacks). Counters live behind the RateStore
 * adapter (Vercel KV in production, in-memory locally).
 *
 * Counting semantics (FR-10, confirmed 2026-11-06): one user task = one
 * daily-quota unit once it reaches its first provider call; internal retries
 * and fallback attempts consume NO daily quota — only the per-minute
 * provider limiter.
 */

import { getLlmCoreConfig } from "./config";
import { getRateStore } from "./rate-store";
import type { Category, GatewayReason, Source } from "./types";

export class BusyError extends Error {
  constructor() {
    super("provider per-minute limiter is full");
    this.name = "BusyError";
  }
}

export type LimitDecision =
  | { allowed: true }
  | { allowed: false; reason: GatewayReason };

function utcDayKey(): string {
  return new Date().toISOString().slice(0, 10); // UTC calendar day (FR-19)
}

function minuteBucket(): number {
  return Math.floor(Date.now() / 60_000);
}

/** Milliseconds until the next UTC midnight (daily counter window). */
function msToUtcMidnight(): number {
  const now = new Date();
  const midnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1
  );
  return Math.max(1_000, midnight - now.getTime());
}

const MINUTE_WINDOW_MS = 65_000;

export interface LimitContext {
  identity: string;
  source: Source;
  category: Category;
}

/**
 * Pre-call rejection (FR-13): checks and increments all per-request counters
 * BEFORE any provider call. Rejected requests consume nothing on the
 * provider limiter; their daily counters simply carry forward (the window
 * expires at 00:00 UTC anyway).
 */
export async function checkRequestLimits(ctx: LimitContext): Promise<LimitDecision> {
  const cfg = getLlmCoreConfig();
  const store = getRateStore();
  const dayWindow = msToUtcMidnight();
  const day = utcDayKey();
  const byok = ctx.source === "byok";

  // Per-user daily per category (FR-10)
  const userDaily = await store.incr(
    `llm:u:${ctx.identity}:${day}:${ctx.category}`,
    dayWindow
  );
  const userDailyLimit =
    ctx.category === "GEN" ? cfg.DAILY_GEN_PER_USER : cfg.DAILY_FAST_PER_USER;
  if (userDaily > userDailyLimit) {
    return { allowed: false, reason: "QUOTA_USER" };
  }

  // BYOK requests never consume the free daily quotas (FR-27) — the global
  // free quota below is the operator's NVIDIA-key protection.
  if (byok) {
    const byokMinute = await store.incr(
      `llm:bm:${ctx.identity}:${minuteBucket()}`,
      MINUTE_WINDOW_MS
    );
    if (byokMinute > cfg.BYOK_PER_MINUTE) {
      return { allowed: false, reason: "BYOK_LIMIT" };
    }
    return { allowed: true };
  }

  // Global daily per category (FR-11)
  const globalDaily = await store.incr(`llm:g:${day}:${ctx.category}`, dayWindow);
  const globalDailyLimit =
    ctx.category === "GEN" ? cfg.DAILY_GEN_GLOBAL : cfg.DAILY_FAST_GLOBAL;
  if (globalDaily > globalDailyLimit) {
    return { allowed: false, reason: "QUOTA_GLOBAL" };
  }

  // Per-user per-minute cap on the free path (FR-30)
  const userMinute = await store.incr(
    `llm:m:${ctx.identity}:${minuteBucket()}`,
    MINUTE_WINDOW_MS
  );
  if (userMinute > cfg.USER_PER_MINUTE) {
    return { allowed: false, reason: "MINUTE_LIMIT" };
  }

  return { allowed: true };
}

/**
 * The global provider-per-minute limiter (FR-31): EVERY actual provider call
 * — including retries and fallback attempts — passes through here. When the
 * limiter is full, the caller waits in a short queue (BUSY_QUEUE_MS default
 * ~5 s, counting against its overall deadline); if no slot frees in time the
 * request is rejected with SERVICE_BUSY.
 */
export async function acquireProviderSlot(): Promise<void> {
  const cfg = getLlmCoreConfig();
  const store = getRateStore();
  const deadline = Date.now() + cfg.BUSY_QUEUE_MS;
  for (;;) {
    const bucket = minuteBucket();
    const key = `llm:prov:${bucket}`;
    const count = await store.count(key, MINUTE_WINDOW_MS);
    if (count < cfg.PROVIDER_RPM_LIMIT) {
      const after = await store.incr(key, MINUTE_WINDOW_MS);
      if (after <= cfg.PROVIDER_RPM_LIMIT) return; // slot acquired
      // Lost a race — fall through to the wait loop.
    }
    if (Date.now() >= deadline) throw new BusyError();
    const nextBucketAt = (bucket + 1) * 60_000;
    await sleep(Math.min(250, Math.max(10, nextBucketAt - Date.now())));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
