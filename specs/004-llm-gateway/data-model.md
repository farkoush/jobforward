# Data Model: 004-llm-gateway

**Date**: 2026-11-06 | **Spec**: [spec.md](./spec.md) | **Contracts**: [llm-api.md](./contracts/llm-api.md)

All entities live in `web/src/lib/llm/` (server-side). No user content is ever
persisted by the gateway.

## Entities

### TaskCategory

`"GEN" | "FAST"` — the classification every model request carries (FR-01).

### TaskMapping (`tasks.ts`)

| Field | Type | Notes |
|---|---|---|
| task | `string` | application-level name, e.g. `scoring_ratings` |
| category | `TaskCategory` | default **FAST**; GEN only with an explicit reason |

Single source of truth: the rest of the app passes only the task name to the
gateway. Unknown task names are rejected as `INVALID_INPUT`.

### ModelChain (`config.ts` → per category)

| Field | Type | Source |
|---|---|---|
| primary | `string` | env `GEN_MODEL` / `FAST_MODEL` |
| fallbacks | `string[]` | env `GEN_FALLBACKS` / `FAST_FALLBACKS` (comma-separated, order = fallback order, FR-02/14) |
| baseUrl | `string` | env `NVIDIA_BASE_URL` (free path) / OpenRouter constant (BYOK, FR-27) |

### GatewayConfig (`config.ts`, zod-validated, fail-fast)

| Var | Purpose |
|---|---|
| `NVIDIA_API_KEY` / `NVIDIA_BASE_URL` | free-path provider (P13) |
| `GEN_MODEL` / `GEN_FALLBACKS` / `FAST_MODEL` / `FAST_FALLBACKS` | chains |
| `GATE_PASSWORD`, `GATE_COOKIE_SECRET` | entry gate (FR-36) |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | counter store (production) |
| limit/timeout vars | every limit and timeout in FR-10/11/12/27/30/31/32/34 is env-overridable; defaults match the spec numbers |

Missing/malformed → named startup error (server logs only; UI sees the typed
"service unavailable" result).

### QuotaIdentity (`gate.ts`)

| Field | Type | Notes |
|---|---|---|
| anonymousId | `string` | random, no PII |
| issuedAt / expiresAt | epoch ms | `Max-Age` ≈ 30 days |
| cookie | signed, httpOnly, Secure, SameSite=Lax | HMAC-SHA256 with `GATE_COOKIE_SECRET` (R3) |

Clearing the cookie starts a fresh identity (accepted residual risk, FR-18/36).

### UsageCounters (`limits.ts` + `rate-store.ts`)

Buckets, all keyed by UTC calendar day (FR-19):

| Counter | Key shape (conceptual) | Limit (default) |
|---|---|---|
| per-user daily per category | `identity + day + GEN/FAST` | 15 GEN / 50 FAST |
| global daily per category | `day + GEN/FAST` | 250 GEN / 600 FAST |
| per-user per-minute (free path) | `identity + minuteBucket` | 3 req/min |
| global provider per-minute (free path) | `minuteBucket` | 30 calls/min — counts **every actual provider call**, incl. retries and fallbacks (FR-31); full → ~5 s queue → busy |
| per-user per-minute (BYOK) | `identity + minuteBucket` | 10 req/min (FR-27) |
| login attempts | `ip + minuteBucket` | 5/min (FR-36) |

Counting semantics (FR-10): one user task = one daily-quota unit once it reaches its
first provider call; internal retries/fallbacks add no daily units.

### RequestOutcome / GatewayResult (`types.ts`)

| Field | Type | Notes |
|---|---|---|
| ok | `boolean` | |
| reason | `string` | pinned `ERR_*` code (R10) |
| retryable | `boolean` | |
| retryAfter? | `number` (seconds) | honored from provider `Retry-After` when present |
| source | `"free" \| "byok"` | which path answered (FR-27) |

`reason` values (pinned): `QUOTA_USER`, `QUOTA_GLOBAL`, `MINUTE_LIMIT`,
`SERVICE_BUSY`, `INPUT_TOO_LONG`, `INVALID_INPUT`, `INVALID_TASK`, `CONFIG_ERROR`,
`ALL_MODELS_FAILED`, `BYOK_FAILED`, `BYOK_LIMIT`, `NETWORK`, `UNAUTHORIZED`.
The UI maps each to a Persian message (P16); no technical detail is ever included.

### RequestLogEntry (`request-log.ts`, FR-08)

| Field | Notes |
|---|---|
| timestamp | ISO |
| category | GEN/FAST |
| model | model that actually responded |
| fallbackUsed | boolean |
| source | free/byok |
| inputTokens / outputTokens | from provider usage; `null` when unreported — never guessed |
| responseTimeMs | |
| finalStatus | succeeded / failed-after-all-models / rejected-config / rejected-input / rejected-limit |

**Never present**: prompt content, NVIDIA key, BYOK key, gate password, auth headers.

### StreamEvent (GEN only, R4)

`{"type":"chunk","text"}`* → `{"type":"done",…GatewayResult fields}` |
`{"type":"error",…GatewayResult fields}`. Fallback/retry happens only before the
first chunk (FR-32).

## Failure taxonomy (`errors.ts`)

| Class | Statuses | Gateway behavior |
|---|---|---|
| retryable | 429, 500/502/503/504, timeout, empty response, malformed JSON | ≤2 attempts per model (backoff + jitter, honor `Retry-After`), then next fallback |
| not-found | 404 for a model name | straight to next fallback (cooldown cache deferred to next version) |
| fatal | 400, 401, 403 | no retry, no fallback — typed error result (config vs input error per FR-05) |

Time budget (FR-34): per-attempt timeout (GEN 30 s / FAST 10 s), overall deadline
(GEN 60 s / FAST 20 s) — no new attempt starts after the deadline; the gateway
always returns its typed result before the platform's hard timeout.

## State transitions (request lifecycle)

```
auth(cookie) → task lookup → input length check → limits check (daily, minute)
  → [full minute limiter? queue ≤5s → proceed | SERVICE_BUSY]
  → chain walk (primary → fallbacks, ≤2 attempts each, deadline-gated)
  → streaming split (before/after first chunk) → typed result → request log
```

BYOK path: same lifecycle, chain length 1, no fallback into the free path (FR-28) —
failure yields a dedicated typed result; switching to free needs explicit user
confirmation.
