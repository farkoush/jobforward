# Implementation Plan: LLM Gateway — Centralized Model Access with Fallback and Usage Control

**Branch**: `004-llm-gateway` | **Date**: 2026-11-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-llm-gateway/spec.md`

## Summary

A single server-side gateway module becomes the only component that talks to an LLM
provider (constitution P12). Default path is free (NVIDIA, OpenAI-compatible, env-only
key); BYOK (OpenRouter only) is optional, per-request, never persisted. The gateway
provides per-category model chains (GEN/FAST) with automatic fallback, a typed result
contract (never throws to the UI), UTC-day usage limits (per-user daily per category,
global daily, per-minute caps, global 30-rpm provider limiter with a short queue),
structured redacted logging, and a shared-password entry gate with a signed httpOnly
persistent anonymous cookie. User input is persisted before sending and survives every
failure mode. Platform: Vercel serverless, ~10 usability testers.

## Technical Context

**Language/Version**: TypeScript (strict mode, P17) on the existing Next.js App Router
web edition (`web/`).

**Primary Dependencies**: zod 3.24.1 (already present) for env/config validation;
NEW `vitest` (dev, testing); NEW `@vercel/kv` (Upstash REST — serverless-safe
counter store). No other new runtime dependencies (cookie signing uses `node:crypto`).

**Storage**: Vercel KV (REST) for usage counters in deployment; pluggable adapter with
an in-memory implementation for local dev and tests (`web/src/lib/llm/rate-store.ts`).

**Testing**: Vitest with fake timers and mocked `fetch` (`web/tests/llm/*.test.ts`,
script `test:llm`). Existing `test:engine` (tsx --test) and `test:byok` stay untouched
and green.

**Target Platform**: Vercel serverless functions (Fluid Compute + plan verification is
a pre-implementation task per the product owner); local dev on port 3100.

**Project Type**: Web application (existing `web/` Next.js edition; terminal edition
frozen and untouched).

**Performance Goals**: FAST ≤ 20 s overall deadline (10 s/attempt); GEN ≤ 60 s overall
deadline (30 s/attempt); zero platform-timeout (504) endings.

**Constraints**: All limits/model config env-only (P13); no key/secret ever in
client-side code, logs, or documents (P14 + FR-29); Persian user-facing error messages
(P16); standing gates green (test:engine, test:byok, tsc, build).

**Scale/Scope**: ~10 concurrent usability testers; one BYOK provider (OpenRouter);
one free provider (NVIDIA).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| P1 user-data honesty | PASS | No content fabrication; gateway returns only provider output; empty/invalid responses are failures, never guessed |
| P2 user decides | PASS | BYOK switch-back and Retry always user-initiated |
| P3 score independent of JD | PASS | Gateway is scoring-path agnostic; no JD input touches ratings |
| P4 transparent scoring | PASS | Deterministic scoring unchanged; model only returns 0/1/2 ratings as today |
| P8 data local | PASS | Draft stays in browser; logs contain no user content (FR-09), so platform log capture carries metadata only |
| P9/P15 test-first | PASS (resolved) | v1 tests MUST cover all five failure classes (429 with/without Retry-After, 5xx, timeout, empty, malformed) — one harness covers them; "complete automated testing of all scenarios" (out of scope) refers to exhaustive end-to-end automation, not these five classes |
| P10/P16 language | PASS | UI text English B1; error/limit messages Persian (pinned `ERR_*`/message strings, TS-only — terminal frozen, no py parity required) |
| P12 gateway-only | PASS | All provider calls live in `web/src/lib/llm/`; the only existing call site (`scoreWithByok` in `page.tsx`) migrates to `/api/llm/fast`; grep gate added to review checklist |
| P13 env-only config | PASS | zod schema validates `NVIDIA_API_KEY`, `NVIDIA_BASE_URL`, `GEN_MODEL`, `GEN_FALLBACKS`, `FAST_MODEL`, `FAST_FALLBACKS`, limit/timeout vars; fail-fast at startup; `.env.example` documents names (example model value `moonshotai/kimi-k3` is config data, not code) |
| P14 key secrecy | PASS (note) | NVIDIA key server-side only; BYOK key read from `x-byok-key` header per request, never stored/logged/displayed (FR-29). Constitution amendment recording the bounded BYOK exception is still pending product-owner sign-off (non-blocking here; recorded in spec) |
| P17 TS strict | PASS | All new code strict; `tsc` gate stays |
| Standing gates | PASS | `test:engine`, `test:byok`, `tsc`, `build` untouched and green; legacy `byok/` lib kept intact so `test:byok` still passes |
| Spec deviations (product decision 2026-11-06) | RECORDED | FR-33 (404-cooldown cache) and FR-35 (per-IP cap on the main path) are deferred to the next version per the product owner's out-of-scope list; spec updated with deferral notes. v1: 404 → straight to next fallback; no per-IP cap on main path (login attempts still limited 5/min/IP) |

## Project Structure

### Documentation (this feature)

```text
specs/004-llm-gateway/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── llm-api.md       # Route + result + stream contracts
└── tasks.md             # Phase 2 output ($speckit-tasks — NOT created here)
```

### Source Code (repository root: `web/`)

```text
web/src/lib/llm/                  # NEW — the gateway module (P12: only provider callers)
├── config.ts                     # zod env schema; fail-fast startup validation
├── types.ts                      # GatewayResult, category, source, stream events, reasons
├── errors.ts                     # failure taxonomy → retryable | not-found | fatal
├── client.ts                     # OpenAI-compatible fetch client (NVIDIA free / OpenRouter BYOK);
│                                 # AbortController per attempt, first-token 20s, inter-chunk 15s,
│                                 # streaming + one-shot
├── fallback.ts                   # chain walk: ≤2 attempts/model, backoff+jitter, Retry-After,
│                                 # overall-deadline gate (no new attempts after deadline)
├── limits.ts                     # UTC-day per-category quotas (user+global), per-minute caps,
│                                 # 30-rpm global limiter with ~5s queue, max input / max_tokens
├── rate-store.ts                 # counter storage adapter: interface + in-memory + Vercel KV
├── request-log.ts                # structured request log (FR-08 fields + source) with redaction
├── tasks.ts                      # task name → GEN|FAST map (default FAST)
├── gate.ts                       # signed httpOnly cookie sessions, constant-time password check,
│                                 # 5/min/IP login limiter, 30-day TTL
└── gateway.ts                    # orchestrator: auth → limits → route (free|byok) → chain →
                                  # typed result; never throws to the UI

web/src/app/api/llm/gen/route.ts  # NEW — POST, maxDuration = 90, NDJSON stream
web/src/app/api/llm/fast/route.ts # NEW — POST, maxDuration = 40, JSON
web/src/app/api/gate/route.ts     # MODIFIED — sets signed httpOnly cookie (was: returns token)
web/src/app/error.tsx             # NEW — top-level error guard (never clears draft/state)

web/src/lib/serverAuth.ts         # MODIFIED — cookie-session verification (accepts legacy token
                                  # header during transition); constant-time password check kept
web/src/app/page.tsx              # MODIFIED — scoreWithByok → gateway /api/llm/fast call
                                  # (task "scoring_ratings"); BYOK key sent per-request via
                                  # x-byok-key header, never persisted
web/src/components/ByokSettings.tsx  # MODIFIED — advanced settings narrowed to OpenRouter
                                     # key (memory-only) + model choice
web/src/components/ModelBanner.tsx   # MODIFIED — shows source (free | byok)
web/package.json                  # MODIFIED — add vitest + @vercel/kv, script test:llm
web/.env.example                  # NEW — every env var documented, no real values

web/tests/llm/                    # NEW — vitest suites (fake timers, mocked fetch)
├── gateway.test.ts               # all-models-fail, free/byok routing, quota/limiter behavior
├── fallback.test.ts              # 429 (with/without Retry-After), 5xx, timeout, empty,
│                                 # malformed, 404-skip, deadline stop, 2-attempts/model
├── limits.test.ts                # UTC day buckets, per-category quotas, queue/busy, BYOK exempt
├── request-log.test.ts           # required fields present; prompt/keys/password never appear
└── gate.test.ts                  # cookie set/verify, wrong password, 5/min/IP limiter
```

**Structure Decision**: the gateway lives entirely inside the existing `web/` Next.js
edition as a self-contained `src/lib/llm/` module + three API routes; the frozen
`terminal/` edition and the legacy `src/lib/byok/` library (still needed by
`test:byok`) are not modified except where listed above.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Two LLM API routes (gen/fast) instead of one | Vercel `maxDuration` is per-route; GEN needs 90 s and FAST 40 s | A single route would have to take the larger timeout for every request, wasting the FAST budget and weakening the no-504 guarantee |
| Pluggable rate-store adapter | Production counters need Vercel KV (serverless has no shared memory); local dev/tests need zero infra | KV-only would make local dev and tests require a cloud dependency; memory-only would break on serverless |

## Amendment: §13 Gateway Operational Additions (2026-11-06, owner brief)

Owner added two small items with complete requirements inline (plan-first; recorded
as spec §13 FR-37/FR-38; tasks T046–T051 appended).

### Design + FILE LIST

- NEW `web/src/lib/llm/validate-models.ts` — shared validation: GET
  {NVIDIA_BASE_URL}/models (Bearer, from env), compare the four chain env vars;
  warn per missing ID naming the env var; error when a category retains no valid
  model; skip-with-warning when /models is unreachable. Never halts the app.
- NEW `web/src/instrumentation.ts` — Next.js startup hook (nodejs runtime only);
  skipped when LLM_MOCK=true.
- NEW `web/scripts/check-models.ts` — CLI form (`npm run check:models`, tsx) with
  a tiny built-in .env.local loader (no new dependencies).
- MOD `web/src/lib/llm/config.ts` — LLM_MOCK parsed; mockEnabled() forces false
  when NODE_ENV=production (one warning when the flag is set there).
- MOD `web/src/lib/llm/client.ts` — mock transport: with mock enabled the attempt
  functions receive synthetic Responses (429 with Retry-After, 500, 403 HTML,
  empty content, abort-honoring hanging body for timeout) or fixed success
  text/chunks — real taxonomy/limits/logging stay in the loop.
- MOD `web/src/lib/llm/gateway.ts` + `web/src/app/api/llm/{fast,gen}/route.ts` —
  dev-only header `x-mock-error` read ONLY when mockEnabled(); ignored otherwise
  and always in production.
- MOD `web/.env.example` (LLM_MOCK), `web/package.json` (check:models script).
- NEW `web/tests/llm/mock-mode.test.ts` (TDD-first) + validate-models tests.
- MOD `specs/004 spec.md (§13)`, `tasks.md (T046–T051)`.

Constitution: P12 (provider calls stay in lib/llm), P13 (URL/key from env),
P15 (error paths exercised through the mock), P16 (operator logs are English B1 —
server-side, not UI text). No rubric / matcher-rules / pinned-string impact.

## Amendment: §14 Audit Remediation (2026-11-07, owner audit brief)

Six-item audit: per-item status assessed in-session (1 partial / 2 absent / 3 absent /
4 partial / 5 partial / 6 partial), gaps fixed, tests written. Contracts unchanged:
typed results, fatal 400/401/403, 404 -> straight fallback, no hardcoded names/keys.

### Design + FILE LIST

- MOD `web/src/lib/llm/validate-models.ts` — validation returns PRUNED per-run
  chains ({GEN,FAST}): missing-from-list and forbidden-pattern IDs excluded with
  loud warnings; oversize heuristic (largest NNNb token, unknown tolerated) warns
  on FAST-chain IDs >= MODEL_SIZE_WARN_PARAMS (default 200B) — warn-only; applied
  chains stored via applyValidatedChains()/getAppliedChains(); skip (fetch
  failure) clears the override so raw env chains are used.
- MOD `web/src/lib/llm/config.ts` — new env: FORBIDDEN_MODEL_PATTERNS (default
  embed,safety-guard,content-safety,reward,parse), MODEL_SIZE_WARN_PARAMS (200),
  REASONING_MODEL_PATTERNS (default gpt-oss,reasoning), REASONING_MAX_TOKENS_FAST
  (4000), MAX_PROVIDER_CALLS_PER_REQUEST (4); helper maxTokensFor(category, model).
- MOD `web/src/lib/llm/types.ts` — new pinned reason RATE_LIMITED.
- MOD `web/src/lib/llm/messages.ts` — RATE_LIMITED message (English B1) +
  RETRYABLE_REASONS.
- MOD `web/src/lib/llm/client.ts` — ClassifiedFailure.kind (timeout |
  empty_response | malformed | network) so the per-attempt log can distinguish
  empty_response.
- MOD `web/src/lib/llm/fallback.ts` — per-attempt warn prints kind;
  maxProviderCalls option (cap -> outcome rate_limited when the last failure was a
  429); Retry-After honored BEFORE moving to the next model.
- MOD `web/src/lib/llm/gateway.ts` + `web/src/app/api/llm/{fast,gen}/route.ts` —
  effective chains (applied-validated override, else env); empty pruned category ->
  typed CONFIG_ERROR; fast success + gen done events carry modelUsed /
  usedFallback / fallbackDepth; RATE_LIMITED mapping with retryAfter.
- MOD `web/src/lib/llm/request-log.ts` — fallbackDepth field.
- MOD `web/src/app/page.tsx` — small non-intrusive fallback notice (English B1)
  on the score screen when usedFallback.
- NEW `web/scripts/probe-rate-limit.ts` — dev-only, slow, report-only (not part
  of automated tests).
- NEW/MOD tests: validate-models pruning/forbidden/oversize/skip; gateway
  transparency (usedFallback/depth both ways); fallback cap + Retry-After-before-
  next-model; maxTokensFor; error-paths gains RATE_LIMITED (message guard covers it
  automatically via the reasons iteration).
- MOD `specs/004 spec.md (§14)`, `tasks.md (T052–T060)`.

Constitution: P12/P13 unchanged (provider calls and URL/key stay in lib/llm/env);
P15 (every new path tested); P16 (operator logs + UI notice English B1);
P18 (input preserved on rate_limited). No rubric / matcher-rules impact.
