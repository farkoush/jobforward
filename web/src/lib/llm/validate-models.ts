/**
 * Model-ID validation + chain policy (FR-37/39/40/41, §13/§14): compare the
 * configured chains against the provider's live model list, prune invalid and
 * forbidden (non-chat) IDs, warn on oversized FAST models, and expose the
 * PRUNED per-run chains to the gateway. Unreachable /models → skip with a
 * warning; the raw env chains are used as-is. NEVER halts the app.
 */

import type { LlmConfig } from "./config";
import type { Category } from "./types";

export interface ModelValidation {
  warnings: string[];
  errors: string[];
  /** True when /models could not be fetched (result indeterminate). */
  skipped: boolean;
  /** Pruned per-run chains (invalid/forbidden ids removed). */
  chains: { GEN: string[]; FAST: string[] };
}

/** GET {baseUrl}/models → the set of offered model IDs (OpenAI shape). */
export async function fetchProviderModelIds(
  baseUrl: string,
  apiKey: string,
  timeoutMs = 15_000
): Promise<Set<string>> {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`GET /models returned ${response.status}`);
  }
  const body = (await response.json()) as { data?: Array<{ id?: unknown }> };
  const ids = new Set<string>();
  for (const item of body.data ?? []) {
    if (typeof item.id === "string") ids.add(item.id);
  }
  return ids;
}

/**
 * Best-effort parameter size from a model NAME (e.g. "…-550b-a55b" → 550).
 * Unknown shapes return null — callers tolerate that without error.
 */
export function modelSizeB(modelId: string): number | null {
  const matches = modelId.matchAll(/(\d+(?:\.\d+)?)b/gi);
  let largest: number | null = null;
  for (const m of matches) {
    const value = Number(m[1]);
    if (Number.isFinite(value) && (largest === null || value > largest)) {
      largest = value;
    }
  }
  return largest;
}

export async function validateConfiguredModels(cfg: LlmConfig): Promise<ModelValidation> {
  const out: ModelValidation = {
    warnings: [],
    errors: [],
    skipped: false,
    chains: { GEN: [], FAST: [] },
  };
  const forbidden = cfg.FORBIDDEN_MODEL_PATTERNS.map((p) => p.toLowerCase());

  let ids: Set<string>;
  try {
    ids = await fetchProviderModelIds(cfg.NVIDIA_BASE_URL, cfg.NVIDIA_API_KEY);
  } catch (exc) {
    out.skipped = true;
    out.chains = { GEN: [...cfg.genChain], FAST: [...cfg.fastChain] };
    out.warnings.push(
      `Model validation skipped: could not fetch ${cfg.NVIDIA_BASE_URL}/models (${
        exc instanceof Error ? exc.message : String(exc)
      }); the configured env chains are used as-is`
    );
    return out;
  }

  const checks: Array<{ envName: string; category: Category; id: string }> = [
    ...cfg.genChain.map((id, index) => ({
      envName: index === 0 ? "GEN_MODEL" : `GEN_FALLBACKS[${index - 1}]`,
      category: "GEN" as const,
      id,
    })),
    ...cfg.fastChain.map((id, index) => ({
      envName: index === 0 ? "FAST_MODEL" : `FAST_FALLBACKS[${index - 1}]`,
      category: "FAST" as const,
      id,
    })),
  ];

  const validByCategory: Record<"GEN" | "FAST", number> = { GEN: 0, FAST: 0 };
  for (const check of checks) {
    const lower = check.id.toLowerCase();
    const forbiddenHit = forbidden.find((pattern) => lower.includes(pattern));
    if (forbiddenHit) {
      // Non-chat model (embed/safety/reward/parse…): NEVER called.
      out.warnings.push(
        `${check.envName}: model id "${check.id}" excluded from the chain (matches forbidden pattern "${forbiddenHit}")`
      );
      continue;
    }
    if (!ids.has(check.id)) {
      out.warnings.push(
        `${check.envName}: model id "${check.id}" was not found in the provider model list`
      );
      continue;
    }
    out.chains[check.category].push(check.id);
    validByCategory[check.category] += 1;
    if (check.category === "FAST") {
      const size = modelSizeB(check.id);
      if (size !== null && size >= cfg.MODEL_SIZE_WARN_PARAMS) {
        out.warnings.push(
          `${check.envName}: model id "${check.id}" looks large (~${size}B params) for the low-latency FAST chain`
        );
      }
    }
  }

  if (validByCategory.GEN === 0) {
    out.errors.push(
      "Category GEN has no valid models: every configured id (GEN_MODEL, GEN_FALLBACKS) is missing from the provider list or forbidden"
    );
  }
  if (validByCategory.FAST === 0) {
    out.errors.push(
      "Category FAST has no valid models: every configured id (FAST_MODEL, FAST_FALLBACKS) is missing from the provider list or forbidden"
    );
  }
  return out;
}

// --- Applied (validated) chains: the gateway uses these per-run when present. ---

let appliedChains: { GEN: string[]; FAST: string[] } | null = null;

export function applyValidatedChains(chains: { GEN: string[]; FAST: string[] }): void {
  appliedChains = { GEN: [...chains.GEN], FAST: [...chains.FAST] };
}

export function getAppliedChains(): { GEN: string[]; FAST: string[] } | null {
  return appliedChains;
}

export function resetAppliedChainsForTests(): void {
  appliedChains = null;
}

/**
 * Run the validation, apply the pruned chains for the running process, and
 * print warnings/errors. Returns false when errors were reported. Never
 * throws and never halts the caller.
 */
export async function runValidationReporting(
  log: Pick<Console, "warn" | "error"> = console
): Promise<boolean> {
  const { getLlmConfig, ConfigError } = await import("./config");
  let cfg: LlmConfig;
  try {
    cfg = getLlmConfig();
  } catch (exc) {
    if (exc instanceof ConfigError) {
      log.error(`[llm] ${exc.message}`);
      return false;
    }
    throw exc;
  }
  const result = await validateConfiguredModels(cfg);
  if (result.skipped) {
    resetAppliedChainsForTests();
  } else {
    applyValidatedChains(result.chains);
  }
  for (const warning of result.warnings) log.warn(`[llm] model check: ${warning}`);
  for (const error of result.errors) log.error(`[llm] model check: ${error}`);
  if (result.skipped) return true; // indeterminate is not a failure
  return result.errors.length === 0;
}

// --- §15 FR-45/46 connection check: typed, content-free, per-instance. ---

import { ConfigError, getLlmConfig, mockEnabled } from "./config";

export interface ConnectionCheckResult {
  state: "available" | "unavailable";
  configOk: boolean;
  /** Valid-ID COUNTS only — never the IDs themselves (P14, FR-52). */
  chains: { GEN: number; FAST: number };
  checkedAt: string;
  /** Client mapping (R14): 1 → needs-retry, 2+ → unavailable. */
  consecutiveFailures: number;
}

let lastCheck: ConnectionCheckResult | null = null;

export function resetConnectionCheckForTests(): void {
  lastCheck = null;
}

/**
 * The §15 connection check (the ONLY provider contact outside analysis
 * stages, owner-approved): runs the full validation, applies the pruned
 * chains, and returns a client-safe typed result — no model names, no keys,
 * never throws for expected failure modes. available = the provider answered
 * AND both categories retain at least one valid (non-forbidden) ID.
 */
export async function runConnectionCheck(
  log: Pick<Console, "warn" | "error"> = console
): Promise<ConnectionCheckResult> {
  const checkedAt = new Date().toISOString();
  // Mock mode (FR-38, dev-only): no provider is contacted; the mock answers.
  if (mockEnabled()) {
    lastCheck = {
      state: "available",
      configOk: true,
      chains: { GEN: 1, FAST: 1 },
      checkedAt,
      consecutiveFailures: 0,
    };
    return lastCheck;
  }

  let configOk = true;
  let result: ModelValidation | null = null;
  try {
    const cfg = getLlmConfig();
    result = await validateConfiguredModels(cfg);
  } catch (exc) {
    if (exc instanceof ConfigError) {
      configOk = false;
    } else {
      throw exc;
    }
  }

  if (result) {
    if (result.skipped) resetAppliedChainsForTests();
    else applyValidatedChains(result.chains);
    for (const warning of result.warnings) log.warn(`[llm] model check: ${warning}`);
    for (const error of result.errors) log.error(`[llm] model check: ${error}`);
  } else {
    // Broken free-path configuration: drop any stale applied override so the
    // free path fails typed instead of using remembered chains.
    resetAppliedChainsForTests();
    log.error("[llm] connection check: free-path configuration is incomplete");
  }

  const available = result !== null && !result.skipped && result.errors.length === 0;
  lastCheck = {
    state: available ? "available" : "unavailable",
    configOk,
    chains: result && !result.skipped
      ? // Indeterminate (skipped) reports zero — nothing was validated.
        { GEN: result.chains.GEN.length, FAST: result.chains.FAST.length }
      : { GEN: 0, FAST: 0 },
    checkedAt,
    consecutiveFailures: available ? 0 : (lastCheck?.consecutiveFailures ?? 0) + 1,
  };
  return lastCheck;
}
