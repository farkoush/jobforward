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

## Amendment: §15 Error Honesty, Connection Check & LLM Settings Section (2026-11-07, owner brief; absorbs retired spec 005)

Spec §15 (FR-45..FR-55, SC-011..SC-019) plans as one coherent §15 task run
(T061+). Design goals: ZERO provider contact at page entry (the §13 startup
hook is removed — its only remaining caller is the new check route and the
operator CLI), BYOK servable with broken free-path config, one class map as
the single UI source, and an independent LLM settings section.

### Design + FILE LIST

**Server (gateway/lib):**

- DEL `web/src/instrumentation.ts` — the §13 startup validation hook is
  REMOVED from the page-entry path (FR-45). `web/scripts/check-models.ts`
  (`npm run check:models`) stays unchanged for operators.
- NEW `web/src/app/api/llm/check/route.ts` (maxDuration 30) — POST,
  `isAuthorized`, content-free. Runs the §13/§14 validation via
  `runConnectionCheck()` and returns typed client-safe JSON only (no model
  names, no keys, never HTML): `{ ok, state: "available" | "unavailable",
  configOk, chains: { GEN, FAST } (valid-ID counts), checkedAt }`.
- MOD `web/src/lib/llm/validate-models.ts` — add `runConnectionCheck()`:
  wraps `runValidationReporting()`, keeps a module-level per-instance cache
  `{ lastState, lastConfigOk, consecutiveFailures, checkedAt }` and reuses
  `applyValidatedChains()`; classify `ConfigError` as `configOk:false`
  (state unavailable). `getAppliedChains()` unchanged — the first analysis
  call consumes pruned chains exactly as §14 built it (no waiting: if the
  check has not run, requests proceed on raw env chains, spec-permitted).
- MOD `web/src/lib/llm/config.ts` — split the env schema: `coreSchema`
  (limits, timeouts, gate, mock, chain-policy — every field defaulted or
  gate-related) + `providerSchema` (NVIDIA_API_KEY/NVIDIA_BASE_URL/
  GEN_MODEL/GEN_FALLBACKS/FAST_MODEL/FAST_FALLBACKS). `getLlmConfig()` =
  both (free path, unchanged fail-fast); NEW `getLlmCoreConfig()` = core
  only — used by the BYOK request path (FR-55).
- MOD `web/src/lib/llm/gateway.ts` — `preflight()` loads `getLlmCoreConfig()`
  first; only `source === "free"` loads the provider part (ConfigError →
  typed CONFIG_ERROR as today). BYOK requests therefore succeed with
  missing/broken NVIDIA credentials (FR-55).
- MOD `web/src/lib/llm/limits.ts` — read the core config only (limits are
  core fields).
- NEW `web/src/lib/llm/failure-class.ts` — the §15 FR-48 map
  (GatewayReason → TRANSIENT | NO_WAY_FORWARD | BROWSER_UNREACHABLE |
  OWN_KEY; INVALID_INPUT/INVALID_TASK/UNAUTHORIZED excluded). Pure, tested,
  single source for all UI decisions.
- MOD `web/src/lib/llm/messages.ts` — NEW B1 strings (owner-review drafts):
  `GATE_SERVICE_UNAVAILABLE` "The service is not available right now.
  Please try again later."; `GUIDANCE_TRANSIENT` "The AI service is busy
  right now. Wait a moment, then try again."; `GUIDANCE_NO_WAY_FORWARD`
  "The free AI service can't continue right now. You can use your own API
  key instead."; `GUIDANCE_BROWSER_UNREACHABLE` "The connection to the
  service failed. Check your internet. If this site is blocked on your
  network, a VPN may help."; `GUIDANCE_OWN_KEY` "Your key did not work.
  Check your key and model in the settings, or go back to the free path.";
  `TRANSFER_EXPLANATION` "The free AI service can't continue for you right
  now. We'll take you to the LLM settings — you will come right back to
  this step."; `RETRY_ASK` "Retry with your own key?"; `BANNER_*` /
  `STATUS_*` labels ("Free service", "Your key", "Checking…", "Available",
  "Needs retry — check again", "Unavailable — use your own API key",
  "Check again", "Model settings"). No AI wording in the gate text (FR-47).

**Client (web/src):**

- NEW `web/src/components/GuidanceBox.tsx` — renders message + class-matched
  advice + action buttons from the class map (Retry / Continue to settings /
  Check connection / Fix key). Replaces the ad-hoc gatewayError block.
- MOD `web/src/components/ModelBanner.tsx` — persistent status banner
  (FR-53): active source label + connection color state as a
  background/border tint + text label (§11 rule 1 — NO icons/emoji; the
  amber static style is replaced by state tints); tap opens an in-place
  menu: Use your key (when a key is saved) / Use the free service / Model
  settings. Switching writes the byok preference (existing client lib) —
  effective for the next analysis action, no reload.
- NEW `web/src/components/settings/ConnectionStatusCard.tsx` — the FR-54
  status display + "Check again" (calls the check route; updates banner
  state; yellow after one failed check, red after two consecutive failures
  or a no-way-forward analysis error).
- MOD `web/src/components/ByokSettings.tsx` — unchanged core behavior;
  gains an optional "failure mode" (origin + pendingRetry): on save it
  enables use-for-analysis (failure path ONLY) and signals return-to-origin.
- NEW `web/src/components/settings/LlmSettingsSection.tsx` — the section
  shell (title, Back, status card + BYOK card). The page screen
  `byok_settings` is renamed `llm_settings` (menu item text becomes
  "LLM settings"); menu-initiated visits return to the menu as today.
- MOD `web/src/app/page.tsx` — (1) gate mapping: CONFIG_ERROR / non-JSON →
  `GATE_SERVICE_UNAVAILABLE` (FR-47); (2) menu screen mount fires the one
  content-free check per session (sessionStorage guard) and drives the
  status state; (3) banner rendered menu-onward; (4) guidance box wired
  through the class map; (5) no-way-forward at an analysis stage →
  `TRANSFER_EXPLANATION` box (Continue button + 5s auto-advance) → capture
  origin → `llm_settings` in failure mode → on return show `RETRY_ASK`
  once → confirm runs the recorded failed action (pendingRetry closure)
  with the own key; cancel leaves the stage intact (FR-50/51); (6) draft
  recovery untouched (P18).

**Tests (TDD-first where noted):**

- NEW `web/tests/llm/check-route.test.ts` — typed JSON always (200/401/500
  shapes), content-free response (no model names/keys — guard grep),
  config-error → `state:"unavailable", configOk:false`, provider-unreachable
  → unavailable, success → available + applies chains; mock mode honored.
- NEW `web/tests/llm/failure-class.test.ts` — the full FR-48 map incl.
  ALL_MODELS_FAILED → NO_WAY_FORWARD, MINUTE_LIMIT/SERVICE_BUSY/RATE_LIMITED
  → TRANSIENT, client NETWORK → BROWSER_UNREACHABLE, BYOK_* → OWN_KEY.
- NEW `web/tests/llm/config-split.test.ts` — getLlmCoreConfig() succeeds
  with NVIDIA_* / GEN_* / FAST_* envs REMOVED; getLlmConfig() still fails
  fast without them; BYOK preflight path succeeds with broken free config
  (FR-55) and no-key still yields typed CONFIG_ERROR.
- MOD `web/tests/llm/gateway.test.ts` — BYOK-with-broken-free-config
  scenario; guidance-relevant typed outcomes unchanged.
- MOD `web/tests/engine/*` (tsx suite) — banner label strings, gate message
  separation (no "AI" in gate text — theme/voice guard extends), class-map
  consumption in messages.
- No Python/terminal/parity impact (terminal untouched; PARITY stays green
  on the unchanged corpus).

**Constitution check (§15):** P2 (retry is an explicit one-tap confirm);
P12 (the only new provider caller lives in lib/llm via the check route);
P13 (no new required env; nothing hardcoded); P14 (check response carries
no keys/model names — guard-tested); P15 (every new error path tested);
P16/P10 (B1 English UI texts — owner-review drafts pinned above); P18
(draft preserved through transfer/return; cancel restores the stage);
P19 (named causes stay in server logs); P21 (env unchanged — no new
variables; `check:models` unchanged); §11 (state colors = tints + text
labels, no icons/emoji; 18px body untouched).

**Expected gates:** `test:llm` (vitest) extended (≥ +15 tests), `test:engine`
green incl. extended guards, `tsc` clean, `next build` exit 0, `test:byok`
23/23 (BYOK_SKIP_LIVE=1), `scan:byok` passed, `pytest 213` from terminal/
(untouched), PARITY OK (optional-skip aware). Manual: quickstart §15
scenarios M15-1..M15-7.

**Tasks:** T061+ (see tasks.md §15 run). Open prior tasks T004/T027/T041
remain outside this run.

## Amendment: §16 Diagnostics, Live Smoke Test & BYOK Quick Access (2026-11-07, owner fix brief)

Owner brief with complete requirements inline (plan-first; spec §16
FR-56..FR-62 recorded the same day; tasks T082+). ALL additive — the owner's
standing rules: never edit/append `.env.local` (diff proposals only), never
remove built features without asking.

### Design + FILE LIST

**1) Failure logging (FR-56/57/58):**

- MOD `web/src/lib/llm/client.ts` — ClassifiedFailure gains a `body`
  excerpt (provider error body, truncated ~300 chars, already key/prompt-free
  because provider error bodies never echo requests; still passed through the
  existing redaction mindset — never include request content).
- MOD `web/src/lib/llm/fallback.ts` — the per-attempt terminal line now
  carries ALL FR-56 fields: `[llm] attempt N/M model=<id> status=<code|-> class=<kind|cls> fallback=<yes/no> body="<excerpt>"`; the final outcome
  summary line unchanged.
- MOD `web/src/app/page.tsx` — dev-only (NODE_ENV !== "production")
  `console.warn` of the sanitized failure summary from every gateway outcome
  (class, reason, model, attempts) — production browsers stay silent.
- NEW `web/src/instrumentation.ts` (re-added, provider-contact-free — §15
  FR-45 intact): logs the resolved GEN/FAST chains (ids only) at startup;
  in development ALSO reads `.env.local` and warns with LINE NUMBERS on any
  duplicated variable (complements the check:tools' hard-fail guard).

**2) Live smoke test (FR-59/60):**

- NEW `web/scripts/test-live.ts` + `package.json` script `test:live` —
  loads `.env.local` (last-wins, duplicate guard shared with
  check:connection), then for EVERY chain id (GEN primary+fallbacks,
  FAST primary+fallbacks) sends a 1-token chat completion
  (`max_tokens: 1`, tiny "ping" messages) and prints `OK/FAIL  <model>  <status>  <truncated body>`; exit 1 when any FAIL. Manual/live-key only —
  excluded from automated suites.
- MOD `web/scripts/check-connection.ts` — after the timings + list report,
  runs the SAME per-model 1-token smoke and appends the table (one command
  = network + servability).

**3) BYOK quick access (FR-61/62):**

- MOD `web/src/components/ModelBanner.tsx` — becomes the persistent header
  element on ALL screens (page.tsx drops the `screen !== "welcome"` /
  gate exclusions); source labels superseded to "Default free" / "My key"
  (owner-mandated); status tints, in-place switching, Check-again button
  unchanged.
- NEW `web/src/components/byok/ByokQuickModal.tsx` — small modal opened from
  the header: paste key + model + Save (memory-only per FR-29) + a link to
  the full LLM settings; opens over ANY screen without navigation (flow
  state untouched).
- MOD `web/src/app/page.tsx` — header renders the banner everywhere + the
  quick-modal state; menu item unchanged; dev-only console logging (above).
- MOD `web/src/lib/llm/messages.ts` — label supersession (BANNER_FREE_SERVICE
  → "Default free", BANNER_YOUR_KEY → "My key") + RESEND_WITH_DEFAULT
  ("Resend with the default free combo") for FR-62; guidance-guards extended.
- FR-62 resend: the existing GuidanceBox free-path button is RELABELED (no
  behavior change — it already resends the exact failed request via
  retryActionRef; §15's byokDowngradeOffer flow stays).

**Tests (TDD-first where new behavior is testable):**

- MOD `web/tests/llm/fallback.test.ts` — per-attempt terminal line carries
  model/status/class/attempt/fallback + body excerpt; redaction guard: no
  key material, no user text in any logged line.
- NEW `web/tests/llm/startup-echo.test.ts` — config echo lists chains, zero
  key material; duplicate detector returns line numbers.
- MOD `web/tests/llm/guidance-guards.test.ts` — label supersession + new
  strings icon-free.
- `test:live`/check-connection smoke: manual operator tools (like
  probe-rate-limit) — excluded from automated suites by design.

**Constitution check:** P12 (all logging server-side; browser dev logging
logs only typed outcomes); P13/P14 (no keys anywhere new — guard-tested);
P15 (new failure-path behaviors tested); P16 (B1 labels, owner-mandated);
P19 (this FR-set IS diagnosability deepened); P21 (no new REQUIRED env);
FR-45 preserved (startup echo does no provider fetch; test:live is an
operator command, not the app). Standing rules honored: `.env.local` never
touched (diff-only proposals); nothing removed — banner/labels superseded by
owner mandate, all §15 features intact.

**Expected gates:** `test:llm` extended (+~8), `test:engine` green, tsc,
`next build` exit 0, `test:byok`/`scan:byok`, `pytest 213` + PARITY
(untouched), PLUS manual: `npm run test:live` and `npm run check:connection`
with the real key (operator, optional quota cost ~1 token per chain model).

**Tasks:** T082+ (see tasks.md §16 run).

### §16 addendum (owner decision same day): FR-63 + approved cleanup S1

- FR-63: the DISPLAYED BYOK provider becomes Google AI Studio (OpenAI-compat
  gateway endpoint); other providers HIDDEN, not deleted.
- S1 cleanup approved and executed: DELETE `web/probe-phase18.tmp.ts`;
  root `.gitignore` += `/node_modules/` + unstage. Nothing else deleted
  (S3/S4 explicitly NOT approved).

**FILE LIST additions:**

- DEL `web/probe-phase18.tmp.ts`; MOD root `.gitignore` (+`/node_modules/`).
- MOD `web/src/lib/byok/providers.config.ts` — OPTIONAL field
  `gatewayBaseUrl?` on the type; `google_ai_studio` gains
  `https://generativelanguage.googleapis.com/v1beta/openai`. Other entries
  untouched.
- MOD `web/src/lib/llm/gateway.ts` — BYOK base URL reads the Google compat
  field (constant rename; OpenRouter entry stays in the registry, hidden).
- MOD `web/src/components/ByokSettings.tsx` + NEW `ByokQuickModal.tsx` —
  Google AI Studio key hints (AIza…, aistudio.google.com/apikey).
- MOD `web/tests/llm/gateway.test.ts` — BYOK URL expectations move to the
  Google compat endpoint.

### §16 addendum 2 (owner decision same day): FR-64 client resilience (A+B)

- **A:** page.tsx check fetch gains `signal: AbortSignal.timeout(20_000)`;
  an abort lands in the existing catch → needs-retry (R14 mapping).
- **B:** NEW pure helper `autoCheckPolicy(stored)` in
  `lib/llm/connection-client.ts` — "restore" only for a saved AVAILABLE
  status, else "check". page.tsx uses it instead of the unconditional
  restore; the per-page-load ref remains the throttle for auto-checks.
  markCheckStarted stays in the module (pure, tested) but the page no longer
  gates on it — the once-per-session rule is amended per FR-64B.
- Tests FIRST in tests/llm/connection-client.test.ts: autoCheckPolicy matrix
  + the amended owner journey (bad saved status → reload → fresh check →
  green WITHOUT a manual click). Files touched: page.tsx,
  connection-client.ts, its test — NOTHING else; nothing deleted.
