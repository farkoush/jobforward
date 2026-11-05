/**
 * Shared test helpers for the LLM gateway suites. Not a test file (no .test
 * suffix) — vitest only collects *.test.ts.
 */

export function setGatewayTestEnv(): void {
  process.env.NVIDIA_API_KEY = "nvapi-test-key-not-real";
  process.env.NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
  process.env.GEN_MODEL = "test-gen-primary";
  process.env.GEN_FALLBACKS = "test-gen-fallback-1,test-gen-fallback-2";
  process.env.FAST_MODEL = "test-fast-primary";
  process.env.FAST_FALLBACKS = "test-fast-fallback-1";
  process.env.GATE_PASSWORD = "test-pass-123";
  process.env.GATE_COOKIE_SECRET = "test-cookie-secret";
  process.env.GATE_COOKIE_TTL_DAYS = "30";
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
}

export function clearGatewayEnv(): void {
  for (const key of [
    "NVIDIA_API_KEY",
    "NVIDIA_BASE_URL",
    "GEN_MODEL",
    "GEN_FALLBACKS",
    "FAST_MODEL",
    "FAST_FALLBACKS",
    "GATE_PASSWORD",
    "GATE_COOKIE_SECRET",
    "GATE_COOKIE_TTL_DAYS",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "DAILY_GEN_PER_USER",
    "DAILY_FAST_PER_USER",
    "DAILY_GEN_GLOBAL",
    "DAILY_FAST_GLOBAL",
    "USER_PER_MINUTE",
    "BYOK_PER_MINUTE",
    "PROVIDER_RPM_LIMIT",
    "BUSY_QUEUE_MS",
    "MAX_INPUT_CHARS",
  ]) {
    delete process.env[key];
  }
}
