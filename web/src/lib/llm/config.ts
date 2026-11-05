/**
 * Gateway configuration (P13): model names, base URLs, keys, and every limit
 * are read EXCLUSIVELY from environment variables and validated once with
 * zod. Nothing is hardcoded; a missing or malformed variable fails fast with
 * a clear named-variable error on first server-side use (build stays safe —
 * config is loaded lazily, not at module import).
 *
 * Fluid Compute / plan note (research R9, product owner instruction): route
 * maxDuration values (GEN 90 s, FAST 40 s) require Fluid Compute on the
 * Vercel plan; verified by the product owner before implementation (T004).
 */

import { z } from "zod";

// Limits may legitimately be 0 (block everything) in tests — min(0), not positive().
const int = (fallback: number) =>
  z.coerce.number().int().min(0).default(fallback);

const csv = (name: string) =>
  z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
    .refine((list) => list.length > 0, {
      message: `${name} must list at least one fallback model (comma-separated)`,
    });

const gatewayEnvSchema = z.object({
  // Free path provider (NVIDIA, OpenAI-compatible)
  NVIDIA_API_KEY: z
    .string()
    .min(1, "NVIDIA_API_KEY is required for the free path"),
  NVIDIA_BASE_URL: z.string().url("NVIDIA_BASE_URL must be a valid URL"),

  // Model chains (FR-02/14): primary + ordered fallbacks, env-only
  GEN_MODEL: z.string().min(1, "GEN_MODEL is required"),
  GEN_FALLBACKS: csv("GEN_FALLBACKS"),
  FAST_MODEL: z.string().min(1, "FAST_MODEL is required"),
  FAST_FALLBACKS: csv("FAST_FALLBACKS"),

  // Entry gate (FR-36)
  GATE_PASSWORD: z.string().min(1, "GATE_PASSWORD is required"),
  GATE_COOKIE_SECRET: z.string().min(1, "GATE_COOKIE_SECRET is required"),
  GATE_COOKIE_TTL_DAYS: int(30),

  // Usage limits (defaults = spec 004 numbers; every value env-overridable)
  DAILY_GEN_PER_USER: int(15),
  DAILY_FAST_PER_USER: int(50),
  DAILY_GEN_GLOBAL: int(250),
  DAILY_FAST_GLOBAL: int(600),
  USER_PER_MINUTE: int(3),
  BYOK_PER_MINUTE: int(10),
  PROVIDER_RPM_LIMIT: int(30),
  BUSY_QUEUE_MS: int(5000),
  MAX_INPUT_CHARS: int(8000),
  MAX_OUTPUT_TOKENS_GEN: int(2000),
  MAX_OUTPUT_TOKENS_FAST: int(500),

  // Time budgets in ms (FR-34/32)
  ATTEMPT_TIMEOUT_MS_GEN: int(30_000),
  DEADLINE_MS_GEN: int(60_000),
  ATTEMPT_TIMEOUT_MS_FAST: int(10_000),
  DEADLINE_MS_FAST: int(20_000),
  FIRST_TOKEN_TIMEOUT_MS: int(20_000),
  CHUNK_SILENCE_TIMEOUT_MS: int(15_000),

  // Counter store (production); absent in dev → in-memory adapter
  KV_REST_API_URL: z.string().optional(),
  KV_REST_API_TOKEN: z.string().optional(),
});

export type LlmConfig = z.infer<typeof gatewayEnvSchema> & {
  genChain: string[];
  fastChain: string[];
};

let cached: LlmConfig | null = null;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function getLlmConfig(): LlmConfig {
  if (cached) return cached;
  const parsed = gatewayEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((issue) => issue.message)
      .join("; ");
    throw new ConfigError(`Gateway configuration incomplete: ${missing}`);
  }
  const env = parsed.data;
  cached = {
    ...env,
    genChain: [env.GEN_MODEL, ...env.GEN_FALLBACKS],
    fastChain: [env.FAST_MODEL, ...env.FAST_FALLBACKS],
  };
  return cached;
}

/** Test hook: drop the memoized config so new env values are read. */
export function resetLlmConfigForTests(): void {
  cached = null;
}

export function budgetFor(category: "GEN" | "FAST"): {
  attemptTimeoutMs: number;
  deadlineMs: number;
  maxOutputTokens: number;
} {
  const cfg = getLlmConfig();
  return category === "GEN"
    ? {
        attemptTimeoutMs: cfg.ATTEMPT_TIMEOUT_MS_GEN,
        deadlineMs: cfg.DEADLINE_MS_GEN,
        maxOutputTokens: cfg.MAX_OUTPUT_TOKENS_GEN,
      }
    : {
        attemptTimeoutMs: cfg.ATTEMPT_TIMEOUT_MS_FAST,
        deadlineMs: cfg.DEADLINE_MS_FAST,
        maxOutputTokens: cfg.MAX_OUTPUT_TOKENS_FAST,
      };
}
