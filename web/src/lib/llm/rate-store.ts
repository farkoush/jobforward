/**
 * Counter storage adapter (research R2). Production counters live in Vercel
 * KV (Upstash REST — serverless-safe); local dev and tests use an in-memory
 * adapter. Selection is by env presence, so local dev needs zero cloud
 * infrastructure.
 */

export interface RateStore {
  /** Increment the counter at `key`; returns the count inside the window. */
  incr(key: string, windowMs: number): Promise<number>;
  /** Read-only count inside the window (used by the busy-queue poll). */
  count(key: string, windowMs: number): Promise<number>;
}

class MemoryStore implements RateStore {
  private hits = new Map<string, number[]>();

  async incr(key: string, windowMs: number): Promise<number> {
    const now = Date.now();
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    list.push(now);
    this.hits.set(key, list);
    // Opportunistic pruning so the dev-process map cannot grow unbounded.
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) {
        if (v.every((t) => now - t >= windowMs)) this.hits.delete(k);
      }
    }
    return list.length;
  }

  async count(key: string, windowMs: number): Promise<number> {
    const now = Date.now();
    return (this.hits.get(key) ?? []).filter((t) => now - t < windowMs).length;
  }
}

class KvStore implements RateStore {
  async incr(key: string, windowMs: number): Promise<number> {
    const { kv } = await import("@vercel/kv");
    const count = await kv.incr(key);
    if (count === 1) {
      await kv.pexpire(key, windowMs);
    }
    return count;
  }

  async count(key: string, windowMs: number): Promise<number> {
    const { kv } = await import("@vercel/kv");
    const value = await kv.get<number>(key);
    return typeof value === "number" ? value : 0;
  }
}

let memorySingleton: MemoryStore | null = null;

export function getRateStore(): RateStore {
  const { KV_REST_API_URL, KV_REST_API_TOKEN } = process.env;
  if (KV_REST_API_URL && KV_REST_API_TOKEN) {
    return new KvStore();
  }
  if (!memorySingleton) memorySingleton = new MemoryStore();
  return memorySingleton;
}

/** Test hook: drop memoized in-memory state. */
export function resetRateStoreForTests(): void {
  memorySingleton = null;
}
