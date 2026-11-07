---

description: "Task list for 004-llm-gateway — LLM Gateway with fallback, limits, and usage control"
---

# Tasks: 004-llm-gateway — LLM Gateway

**Input**: Design documents from `/specs/004-llm-gateway/`
(plan.md, spec.md, research.md, data-model.md, contracts/llm-api.md, quickstart.md)

**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, contracts/ ✓

**Tests**: explicitly requested (constitution P15 + plan §8). Engine-side suites are
written first and must FAIL before their implementation lands.

**Organization**: grouped by user story (spec.md has US1 P1; US2/US3/US4 P2).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on incomplete tasks)
- **[Story]**: US1–US4 per spec.md user stories
- All paths are relative to the repo root; the web edition lives under `web/`
- Terminal edition (`terminal/`) and legacy `web/src/lib/byok/` (needed by
  `test:byok`) are NOT modified except where a task says so explicitly

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: dependencies, test runner, and configuration documentation

- [x] T001 Add devDependencies `vitest` and `@vercel/kv` plus script `"test:llm": "vitest run tests/llm"` to web/package.json (existing scripts and deps untouched)
- [x] T002 [P] Create web/vitest.config.ts — include `tests/llm/**/*.test.ts`, node environment, globals for fake timers
- [x] T003 [P] Create web/.env.example documenting every gateway variable with placeholders (no real values): `NVIDIA_API_KEY`, `NVIDIA_BASE_URL`, `GEN_MODEL` (example value `moonshotai/kimi-k3`), `GEN_FALLBACKS`, `FAST_MODEL`, `FAST_FALLBACKS`, `GATE_PASSWORD`, `GATE_COOKIE_SECRET`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, and limit/timeout overrides (`DAILY_GEN_PER_USER`, `DAILY_FAST_PER_USER`, `DAILY_GEN_GLOBAL`, `DAILY_FAST_GLOBAL`, `USER_PER_MINUTE`, `BYOK_PER_MINUTE`, `PROVIDER_RPM_LIMIT`, `BUSY_QUEUE_MS`, `MAX_INPUT_CHARS`, `MAX_OUTPUT_TOKENS_GEN`, `MAX_OUTPUT_TOKENS_FAST`, `ATTEMPT_TIMEOUT_MS_GEN`, `DEADLINE_MS_GEN`, `ATTEMPT_TIMEOUT_MS_FAST`, `DEADLINE_MS_FAST`, `FIRST_TOKEN_TIMEOUT_MS`, `CHUNK_SILENCE_TIMEOUT_MS`, `GATE_COOKIE_TTL_DAYS`) per plan.md Technical Context and data-model.md GatewayConfig
- [ ] T004 Verify Vercel Fluid Compute is enabled and the project plan supports route `maxDuration` 90/40 (research.md R9); if unavailable, record the constraint as a comment at the top of web/src/lib/llm/config.ts when it is created in T007

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: gateway types, config, error taxonomy, counter store, and the entry
gate — no user-story work may begin before this phase is complete

**⚠ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 [P] Create web/src/lib/llm/types.ts per contracts/llm-api.md: `Category = "GEN"|"FAST"`, `Source = "free"|"byok"`, `GatewayResult {ok, reason, retryable, retryAfter?, source}`, pinned reason codes (`QUOTA_USER`, `QUOTA_GLOBAL`, `MINUTE_LIMIT`, `SERVICE_BUSY`, `INPUT_TOO_LONG`, `INVALID_INPUT`, `INVALID_TASK`, `CONFIG_ERROR`, `ALL_MODELS_FAILED`, `BYOK_FAILED`, `BYOK_LIMIT`, `NETWORK`, `UNAUTHORIZED`), and `StreamEvent` (`chunk`/`done`/`error`) — strict TypeScript, no `any`
- [x] T006 [P] Create web/src/lib/llm/errors.ts per data-model.md failure taxonomy: classify provider outcomes into retryable (429, 500/502/503/504, timeout, empty response, malformed JSON — honoring `Retry-After` when present), not-found (404 for a model name → straight to next fallback), and fatal (400, 401, 403 → no retry, no fallback, config vs input error distinction per FR-05)
- [x] T007 Create web/src/lib/llm/config.ts — single zod schema parsing all env vars from T003 at first server import; fail fast with a clear named-variable startup error; defaults match spec numbers (15/50 per-user daily, 250/600 global daily, 3/min user, 10/min BYOK, 30 rpm provider limiter, ~5 s busy queue, 8000 chars input, 2000/500 max output tokens, 30 s/60 s GEN and 10 s/20 s FAST budgets, 20 s first-token, 15 s chunk silence, 30-day cookie TTL, 5/min/IP login limit)
- [x] T008 [P] Create web/src/lib/llm/tasks.ts — the ONLY task→category mapping (task name → `FAST` default; `scoring_ratings` → FAST; unknown task names rejected as `INVALID_TASK`); the rest of the app passes only task names
- [x] T009 Create web/src/lib/llm/rate-store.ts — storage adapter interface (atomic increment + TTL window reads) with an in-memory implementation (local dev/tests) and a `@vercel/kv` implementation (production), selected by env presence per research.md R2
- [x] T010 Create web/src/lib/llm/gate.ts — HMAC-SHA256 signed anonymous identity cookie (`id.expiry.hmac`, httpOnly, Secure, SameSite=Lax, ~30-day TTL, secret `GATE_COOKIE_SECRET`), constant-time password verification reusing `web/src/lib/serverAuth.ts` `checkPassword` (env `GATE_PASSWORD` only), and a 5-failed-attempts/minute/IP login limiter using IP from server platform request metadata only (never client-sent values) per FR-36
- [x] T011 Migrate web/src/app/api/gate/route.ts to set the signed httpOnly cookie on success (`{"ok":true}` body; 401 `WRONG_PASSWORD` on failure; 429-shaped identical body after limit) and extend `isAuthorized`/`sessionIdOf` in web/src/lib/serverAuth.ts to accept the cookie first with the legacy token header as transition fallback so the seven existing routes (entry, log, matcher, overlap, rewrite, score) keep passing their tests unchanged
- [x] T012 [P] Create web/tests/llm/gate.test.ts — cookie set/verify/expire, wrong password → 401 without cookie, 5/min/IP limiter, rotation of `GATE_COOKIE_SECRET` invalidates all cookies; write FIRST, expect FAIL before T010/T011

**Checkpoint**: foundation ready — typed result contract, env config, gate, and
counter store all exist and are unit-tested

---

## Phase 3: User Story 1 — Reliable request routing with automatic fallback (Priority: P1) — MVP

**Goal**: every model request goes through the gateway; GEN/FAST chains with
primary → ordered fallbacks; the first success is returned; BYOK is an optional
per-request path that never auto-falls back to free

**Independent Test**: force the primary model to fail (mocked fetch) → the request
still returns a usable response, the result/log names the responding fallback model,
and `source` is reported correctly

### Tests for User Story 1 (write FIRST — must FAIL before implementation)

- [x] T013 [P] [US1] Create web/tests/llm/fallback.test.ts with mocked fetch + fake timers covering ALL five failure classes (429 with and without `Retry-After`, 5xx, timeout, empty response, malformed JSON), 404 → straight to next fallback, max 2 attempts per model with backoff+jitter, no new attempt after the overall deadline, first success returned
- [x] T014 [P] [US1] Create web/tests/llm/gateway.test.ts — free path uses env config and reports `source:"free"`; `x-byok-key` switches to the BYOK path (`source:"byok"`, OpenRouter baseUrl from web/src/lib/byok/providers.config.ts, chain length 1); BYOK failure NEVER falls back to the free path (SC-008, FR-28); gateway never throws — every input yields a typed `GatewayResult`

### Implementation for User Story 1

- [x] T015 [US1] Create web/src/lib/llm/client.ts — OpenAI-compatible fetch client for NVIDIA (free) and OpenRouter (BYOK): per-attempt `AbortController`, 20 s first-token timeout, 15 s inter-chunk silence timeout, streaming and one-shot modes, max_tokens from config per category (FR-32, FR-12)
- [x] T016 [US1] Create web/src/lib/llm/fallback.ts — chain walk (primary → fallbacks in configured order): ≤2 attempts per model, exponential backoff with jitter, honor `Retry-After`, deadline-gated (no attempt starts after the deadline), returns the first success with the responding model named (FR-02/03/04, FR-34)
- [x] T017 [US1] Create web/src/lib/llm/gateway.ts — orchestrator: verify gate cookie → task lookup (T008) → input length check → limits (T030, initially pass-through) → route free/byok → chain walk → typed result; catches everything, never throws to the UI (FR-23)
- [x] T018 [US1] Create web/src/app/api/llm/fast/route.ts — POST, `export const maxDuration = 40`, JSON contract per contracts/llm-api.md (`{"ok":true,text,model,source,usage,ms}` or typed failure, 401 `UNAUTHORIZED` without gate cookie)
- [x] T019 [US1] Create web/src/app/api/llm/gen/route.ts — POST, `export const maxDuration = 90`, NDJSON stream (`chunk`* → `done`|`error`); fallback/retry only before the first chunk; mid-stream cut ends with a typed error event preserving received text (FR-32)
- [x] T020 [US1] Wire the BYOK path in web/src/lib/llm/gateway.ts — read `x-byok-key` header once per request, use OpenRouter via the config imported from web/src/lib/byok/providers.config.ts (single provider, FR-27), chain length 1, dedicated `BYOK_FAILED`/`BYOK_LIMIT` results, never auto-switch to free (FR-28)
- [x] T021 [US1] Migrate `scoreWithByok` in web/src/app/page.tsx to `POST /api/llm/fast` with task `scoring_ratings` — remove the browser→provider scoring call; the BYOK key, when the user supplied one, is sent per-request in the `x-byok-key` header and never persisted (FR-29, P12)
- [x] T022 [P] [US1] Narrow web/src/components/ByokSettings.tsx to advanced settings: OpenRouter key held in memory only (never localStorage), model choice, and explicit confirmation flow for returning to the free path after BYOK failure (FR-27/28)

**Checkpoint**: User Story 1 is independently functional — free-path scoring through
the gateway with fallback; BYOK opt-in works per-request; `test:llm` green

---

## Phase 4: User Story 2 — Clear end-state when every model fails (Priority: P2)

**Goal**: all-fail produces a Persian message + Retry, the app never crashes, and
the user's input survives every failure mode and reload

**Independent Test**: force every model of a category to fail → Persian message +
Retry appear, app usable, Retry resends the same input without retyping, draft
survives reload

### Implementation for User Story 2

- [x] T023 [P] [US2] Create web/src/lib/llm/messages.ts — pinned map from every `ERR_*` reason code to a simple Persian message with zero technical detail (P16, FR-15); TS-only strings (terminal frozen — no py+ts lockstep applies)
- [x] T024 [US2] Build the all-fail end-state in web/src/app/page.tsx (+ a small component if cleaner): show the mapped Persian message for `ALL_MODELS_FAILED` and a Retry button styled per spec-001 §11 warm theme (no emoji, warm red-orange for errors, 18 px body, vendored fonts)
- [x] T025 [P] [US2] Create web/src/lib/draft.ts — debounced localStorage persistence of the in-progress input BEFORE any gateway call, cleared ONLY after a fully successful response, recovered on load; the BYOK key is never written next to the draft (FR-20/22, FR-24)
- [x] T026 [US2] Wire Retry in web/src/app/page.tsx — resend the exact same input without retyping, starting from the primary model, subject to the same limits (FR-07); wire the draft recovery from T025 into the page lifecycle
- [ ] T027 [US2] Implement the single "continue" action for a mid-stream GEN cut in web/src/app/page.tsx — one button that resumes generation from the preserved partial text, appending to the already-displayed content; the continuation is a new request subject to the same limits (FR-21/32)
- [x] T028 [P] [US2] Create web/tests/llm/draft.test.ts — input unchanged after every failure mode and after simulated reload; draft cleared only after full success; no key ever co-located with the draft (SC-006)
- [x] T029 [US2] Create web/src/app/error.tsx — top-level React error guard that renders a Persian fallback message and NEVER clears user state or the draft (FR-23)

**Checkpoint**: Users 1 AND 2 work independently — total failure is graceful,
Persian, retryable, and lossless

---

## Phase 5: User Story 3 — Usage limits enforced before any provider call (Priority: P2)

**Goal**: UTC-day per-category quotas (per-user and global), per-minute caps, the
global provider limiter with a short queue, and clear Persian limit messages with
the optional "use my own key" action

**Independent Test**: configure tiny env limits → exceed one → further requests are
rejected before any provider call with a Persian message naming the limit and its
UTC reset time

### Implementation for User Story 3

- [x] T030 [US3] Create web/src/lib/llm/limits.ts — counters over the T009 adapter keyed to the quota identity + UTC calendar day (FR-19): per-user daily per category (defaults 15 GEN / 50 FAST), global daily per category (250 GEN / 600 FAST), per-user per-minute (3/min free path), BYOK per-minute (10/min), max input ~8000 chars and max_tokens 2000/500 enforcement (FR-10/11/12/27/30); one task = one daily unit — internal retries/fallbacks never consume daily quota
- [x] T031 [US3] Integrate limits into web/src/lib/llm/gateway.ts — reject before any provider call with the matching reason code; global 30-rpm provider limiter counting EVERY actual provider call including retries and fallbacks; full limiter → ~5 s queue whose wait counts against the overall deadline, then typed `SERVICE_BUSY` (FR-13/31)
- [x] T032 [US3] Render limit outcomes in web/src/app/page.tsx — Persian message via T023 naming the limit and its UTC reset time, and for free-daily quotas the optional "use my own key" action routing to the advanced settings (FR-13/27); input always preserved
- [x] T033 [P] [US3] Create web/tests/llm/limits.test.ts — UTC rollover, per-category independence, BYOK consumes no free quota, BYOK 10/min cap, queue-then-busy behavior, rejected-before-call consumes nothing, task-based daily counting (SC-003)

**Checkpoint**: Stories 1–3 all work — reliable routing with airtight, pre-call
limit enforcement

---

## Phase 6: User Story 4 — Privacy-safe request logging (Priority: P2)

**Goal**: every request logged with the full FR-08 field set and zero sensitive
content

**Independent Test**: run success/fallback/failure mixes → every request has a
complete log entry; an automated scan finds no prompt content, keys, or password

### Implementation for User Story 4

- [x] T034 [US4] Create web/src/lib/llm/request-log.ts — one structured entry per request: timestamp, category, responding model, fallbackUsed, source, input/output tokens (`null` when the provider does not report — never guessed), response time, final status (FR-08); server-side structured output only
- [x] T035 [US4] Integrate request-log into web/src/lib/llm/gateway.ts — log EVERY outcome including rejections (config/input/limit) and all-fail; redaction guard asserts prompt content, `NVIDIA_API_KEY`, BYOK key, and `GATE_PASSWORD` can never enter an entry (FR-09)
- [x] T036 [P] [US4] Create web/tests/llm/request-log.test.ts — field completeness on every outcome, zero occurrences of prompt/key/password patterns, tokens `null` (not guessed) when unreported (SC-004)
- [x] T037 [P] [US4] Extend web/src/components/ModelBanner.tsx to show the answering source (`free` | `byok`) alongside the model announce, per spec-001 §11 warm theme

**Checkpoint**: all four stories functional — evidence layer makes SC-001..008
verifiable

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: governance audits, standing gates, and end-to-end validation

- [x] T038 P12 boundary audit — grep `web/src` for provider calls (fetch to `NVIDIA_BASE_URL`, `openrouter.ai`, `generativelanguage.googleapis.com`, etc.): zero occurrences outside web/src/lib/llm/ (client.ts is the only provider caller)
- [x] T039 P13 audit — grep `web/src/lib/llm/` (and the diff) for hardcoded model names, keys, or secrets: none may exist; everything reads from the T007 config
- [x] T040 Run all standing gates and fix any regressions: `npm run test:engine`, `npm run test:byok`, `npx tsc --noEmit`, `npm run build` (in web/) — all four MUST be green
- [ ] T041 Execute web/specs quickstart validation — run all nine manual scenarios in specs/004-llm-gateway/quickstart.md against `npm run dev` (port 3100) and record outcomes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately
- **Foundational (Phase 2)**: depends on Phase 1 — BLOCKS all user stories
- **US1 (Phase 3)**: depends on Phase 2 — MVP core
- **US2 (Phase 4)**: depends on Phase 3 (the end-state UI rides on gateway results)
- **US3 (Phase 5)**: depends on Phase 3 (limits hook into the orchestrator); independent of US2
- **US4 (Phase 6)**: depends on Phase 3 (logs every outcome the gateway produces)
- **Polish (Phase 7)**: depends on all desired stories being complete

### Within Each Story

- Tests first (marked so), then models/services, then routes, then integration
- `client.ts` → `fallback.ts` → `gateway.ts` → routes → page migration (US1 order)
- Checkpoint at the end of each story: validate independently before moving on

### Parallel Opportunities

- Phase 1: T001–T003 all [P]
- Phase 2: T005, T006, T008, T012 are [P]; T007/T009/T010/T011 are sequential-ish (config feeds everything)
- Phase 3: T013+T014 (tests) in parallel, then T015→T016→T017; T022 [P]
- Phase 4/5/6: the [P] test/util tasks can run alongside their story's page work
- Stories 2/3/4 are mutually independent once Phase 3 lands

---

## Implementation Strategy

### MVP First (US1 only)

1. Phase 1 + Phase 2 (foundation — gate, config, store, types)
2. Phase 3 → **STOP and VALIDATE**: free-path scoring through the gateway with
   fallback works; `test:llm` green; BYOK opt-in functional
3. Demo-ready increment; US2–US4 layer on without rework

### Incremental Delivery

- US1 → reliable routing (MVP)
- US2 → graceful, lossless failure UX
- US3 → airtight usage control
- US4 → evidence/observability + audits + gates

## Notes

- Engine-side test tasks (T012/T013/T014/T028/T033/T036) are written FIRST and must
  FAIL before their implementation tasks complete (P15 / plan §8)
- Persian message strings are TS-only: the terminal edition is frozen and no shared
  strings are involved, so py+ts lockstep does NOT apply to `web/src/lib/llm/messages.ts`
- Standing gates (`test:engine`, `test:byok`, `tsc`, `build`) must stay green after
  every task; commit after each logical group

---

## Phase 8: Convergence

**Purpose:** remaining work found by /speckit-converge (2026-11-06) — gaps between
the implemented code and spec FR-13/FR-19/FR-32/FR-11 + P15 coverage. Appended
verbatim; existing tasks untouched.

- [x] T042 Show the UTC reset time in every limit-reached message per FR-13/FR-19 (partial) — turn the static strings in web/src/lib/llm/messages.ts into builder functions that take the reset time (from limits.ts secondsToUtcReset / next-UTC-midnight) for QUOTA_USER, QUOTA_GLOBAL, MINUTE_LIMIT, BYOK_LIMIT and SERVICE_BUSY; render it in web/src/app/page.tsx; keep Persian, simple, no tech detail (P16)
- [x] T043 Offer the optional use-my-own-key action when a FREE daily quota is reached per FR-13/FR-27 (partial) — in web/src/app/page.tsx, when gatewayReason is QUOTA_USER or QUOTA_GLOBAL render a button that opens the ByokSettings advanced screen (existing navigation), input untouched; the offer must NOT appear for non-quota reasons
- [x] T044 Create web/tests/llm/gen-stream.test.ts — automated coverage of the GEN streaming path per FR-32/SC-010/P15 (missing): fallback happens only before the first chunk (0 model switches after it), a mid-stream cut ends with a typed error event while received text is preserved, the done event carries model/source/usage/ms, first-token timeout moves to the next model, mocked NDJSON fetch streams with fake timers
- [x] T045 Extend web/tests/llm/limits.test.ts with the global daily quota path per FR-11 (partial): DAILY_FAST_GLOBAL exceeded -> QUOTA_GLOBAL rejection before any provider call, while a second identity still passes (global, not per-user)

---

## Phase 9: Amendment — Gateway Operational Additions (owner brief, 2026-11-06)

**Purpose:** two small additions per the owner's brief (spec §13: FR-37 model-ID
validation, FR-38 mock mode). Plan addendum carries the FILE LIST.

- [x] T046 Record the amendment: spec.md §13 (FR-37/FR-38), plan.md addendum with FILE LIST, this phase
- [x] T047 [P] Create web/tests/llm/mock-mode.test.ts FIRST (must FAIL): LLM_MOCK=true routes through the mock transport without any provider fetch — success text, 429 → ALL_MODELS_FAILED retryable, 403 HTML → fatal CONFIG_ERROR, empty → exhausted, timeout (ATTEMPT_TIMEOUT_MS_FAST=200, abort-honoring hanging body) → exhausted, production ignores LLM_MOCK (real fetch used); plus validate-models tests: missing ID warns naming the env var, empty category errors, /models unreachable skips with a warning
- [x] T048 Add LLM_MOCK to web/src/lib/llm/config.ts with a mockEnabled() helper (forced false when NODE_ENV=production, one warning when set there) and document it in web/.env.example
- [x] T049 Implement the mock transport in web/src/lib/llm/client.ts (synthetic Responses: 429 with Retry-After, 500, 403 HTML, empty content, abort-honoring hanging body, fixed success text / SSE chunks for stream:true) and wire the dev-only x-mock-error header through web/src/app/api/llm/fast/route.ts, web/src/app/api/llm/gen/route.ts and web/src/lib/llm/gateway.ts (honored only when mockEnabled())
- [x] T050 Create web/src/lib/llm/validate-models.ts (GET {NVIDIA_BASE_URL}/models, compare the four chain env vars, warn/error per FR-37, skip on fetch failure) + web/src/instrumentation.ts (startup hook, nodejs runtime, skipped under LLM_MOCK) + web/scripts/check-models.ts (npm run check:models, tiny .env.local loader) + package.json script
- [x] T051 Run gates: test:llm, tsc, build + live npm run check:models against the configured provider

---

## Phase 10: Amendment — §14 Audit Remediation (owner audit brief, 2026-11-07)

**Purpose:** six-item audit; per-item status assessed (see plan addendum), gaps
fixed, tests written. Contracts unchanged: typed results, fatal 400/401/403,
404 -> straight fallback, no hardcoded names/keys.

- [x] T052 Record the amendment: spec.md §14 (FR-39..FR-44), plan addendum with FILE LIST, this phase
- [x] T053 [P] Tests FIRST (must FAIL where behavior is new): validate-models pruning/forbidden/oversize/skip tests; gateway transparency tests (usedFallback/depth both ways); fallback cap + Retry-After-before-next-model tests; maxTokensFor tests; error-paths RATE_LIMITED case
- [x] T054 Implement chain pruning in web/src/lib/llm/validate-models.ts — validation returns pruned {GEN,FAST} chains (missing-from-list + forbidden-pattern IDs excluded with loud warnings naming the env var), oversize warning on FAST IDs (largest NNNb token >= MODEL_SIZE_WARN_PARAMS, unknown sizes tolerated), applied-chains store (apply/get/reset), skip clears the override (raw env chains as-is)
- [x] T055 Add env config in web/src/lib/llm/config.ts — FORBIDDEN_MODEL_PATTERNS (embed,safety-guard,content-safety,reward,parse), MODEL_SIZE_WARN_PARAMS (200), REASONING_MODEL_PATTERNS (gpt-oss,reasoning), REASONING_MAX_TOKENS_FAST (4000), MAX_PROVIDER_CALLS_PER_REQUEST (4) + maxTokensFor(category, model) helper + document all in web/.env.example
- [x] T056 Add ClassifiedFailure.kind (timeout | empty_response | malformed | network) in web/src/lib/llm/client.ts and print the kind in the per-attempt operator log (distinct empty_response marker)
- [x] T057 Implement in web/src/lib/llm/fallback.ts — maxProviderCalls option (cap -> outcome rate_limited when the last failure was a 429, with retryAfter), Retry-After honored BEFORE moving to the next model (deadline-aware)
- [x] T058 Wire in web/src/lib/llm/gateway.ts + web/src/app/api/llm/{fast,gen}/route.ts + web/src/lib/llm/types.ts + web/src/lib/llm/messages.ts + web/src/lib/llm/request-log.ts — effective chains (applied override else env; empty pruned category -> typed CONFIG_ERROR), RATE_LIMITED reason + message + retryAfter mapping, fast success and gen done events carry modelUsed/usedFallback/fallbackDepth, request log gains fallbackDepth
- [x] T059 Add the fallback notice in web/src/app/page.tsx (small non-intrusive English B1 badge when usedFallback=true, cleared on navigation) + NEW dev-only web/scripts/probe-rate-limit.ts (slow, report-only, per-model vs shared-limit probe)
- [x] T060 Run gates: test:llm, tsc, build + live npm run check:models


## Phase 11: Amendment — §15 Error Honesty, Connection Check & LLM Settings (owner brief, 2026-11-07)

Spec §15 (FR-45..FR-55, SC-011..SC-019); design = plan.md §15 amendment
(FILE LIST, R11–R17, B1 draft texts). TDD-first where behavior is new.
Groups: A server (FR-45/46/55) → B messages/guidance (FR-47/49) →
C client components (FR-49/52/53/54) → D page wiring (FR-45..51) → E gates.

- [X] T061 Record the amendment: verify spec.md §15 (FR-45..FR-55) + plan addendum (FILE LIST, R11–R17, contracts POST /api/llm/check, quickstart M15-1..7) are in place; append this phase
- [X] T062 [P] Tests FIRST (must FAIL): web/tests/llm/config-split.test.ts — getLlmCoreConfig() succeeds with NVIDIA_*/GEN_*/FAST_* envs removed; getLlmConfig() still fails fast without them; BYOK-shaped preflight inputs succeed with broken free config; no-key path still yields typed CONFIG_ERROR (FR-55)
- [X] T063 Implement the config split in web/src/lib/llm/config.ts — coreSchema (limits/timeouts/gate/mock/chain-policy, unchanged defaults) + providerSchema (NVIDIA_API_KEY, NVIDIA_BASE_URL, GEN_MODEL, GEN_FALLBACKS, FAST_MODEL, FAST_FALLBACKS); getLlmConfig() = core+provider (fail-fast unchanged); NEW getLlmCoreConfig(); document in web/.env.example that no NEW env is required
- [X] T064 Implement preflight decoupling in web/src/lib/llm/gateway.ts — load getLlmCoreConfig() first; load the provider part ONLY when source === "free" (ConfigError → typed CONFIG_ERROR as today); BYOK requests (byokKey present) never require provider envs; align web/src/lib/llm/limits.ts to read the core config (limits are core fields) (FR-55)
- [X] T065 [P] Tests FIRST: web/tests/llm/failure-class.test.ts — the full FR-48 map: SERVICE_BUSY/MINUTE_LIMIT/RATE_LIMITED → TRANSIENT; QUOTA_USER/QUOTA_GLOBAL/ALL_MODELS_FAILED/CONFIG_ERROR → NO_WAY_FORWARD; client NETWORK → BROWSER_UNREACHABLE; BYOK_FAILED/BYOK_LIMIT → OWN_KEY; INVALID_INPUT/INVALID_TASK/UNAUTHORIZED → none; exhaustiveness over the GatewayReason union
- [X] T066 Implement web/src/lib/llm/failure-class.ts — pure single-source map (FailureClass union + failureClass(reason)) with class metadata the UI consumes; no side effects, no imports beyond types (FR-48)
- [X] T067 [P] Tests FIRST: web/tests/llm/check-route.test.ts — POST /api/llm/check always returns typed JSON (200/401/500 shapes); content-free guard (no model names/keys in the response — string scan); ConfigError → {state:"unavailable", configOk:false}; provider unreachable → unavailable (configOk:true); success → available + counts + applied chains updated; LLM_MOCK honored (FR-45/46)
- [X] T068 Implement runConnectionCheck() in web/src/lib/llm/validate-models.ts — wraps runValidationReporting(); module-level per-instance cache {lastState, lastConfigOk, consecutiveFailures, checkedAt}; ConfigError classified as configOk:false; reuses applyValidatedChains(); NEW web/src/app/api/llm/check/route.ts (maxDuration 30, isAuthorized, empty JSON body, response per contracts/llm-api.md §15 — no HTML, no model names, no keys) (FR-45/46/52)
- [X] T069 Delete web/src/instrumentation.ts — the §13 startup validation leaves the page-entry path (FR-45); verify web/scripts/check-models.ts (npm run check:models) still works and no imports break; the ONLY provider-contact triggers are now the check route + the operator CLI
- [X] T070 [P] Add B1 strings to web/src/lib/llm/messages.ts per plan.md drafts — GATE_SERVICE_UNAVAILABLE; GUIDANCE_TRANSIENT / GUIDANCE_NO_WAY_FORWARD / GUIDANCE_BROWSER_UNREACHABLE / GUIDANCE_OWN_KEY; TRANSFER_EXPLANATION; RETRY_ASK; BANNER_/STATUS_ labels ("Free service", "Your key", "Checking…", "Available", "Needs retry — check again", "Unavailable — use your own API key", "Check again", "Model settings"); owner-review note: texts are the plan's pinned drafts (FR-47/49/50/51/52/53)
- [X] T071 [P] Guard tests (extend the existing suites): gate text contains no "AI" wording anywhere (FR-47); every GatewayReason has a failure-class entry and the four classes have guidance strings (class/message consistency) (FR-48/49)
- [X] T072 Implement web/src/components/GuidanceBox.tsx — message + class-matched advice + action buttons from failure-class.ts (Retry / Continue to settings / Check connection / Fix key); B1 texts from messages.ts; no icons/emoji (§11) (FR-49)
- [X] T073 Rework web/src/components/ModelBanner.tsx into the persistent status banner — active source label ("Free service" / "Your key: model") + connection state tint (green/yellow/red/neutral, background+border+text ONLY — no icons/emoji, §11); tap opens the in-place menu: Use your key (when a key is saved) / Use the free service / Model settings; switching writes the byok preference (useForScoring via the client lib), effective next analysis action, no reload; free-path state reported even while the own key is selected (FR-53, R15)
- [X] T074 Implement web/src/components/settings/ConnectionStatusCard.tsx — status display + "Check again" button calling POST /api/llm/check; state machine per R14 (success → green; 1 failure → yellow; 2 consecutive failures or a NO_WAY_FORWARD analysis error → red); display-only, never blocks anything (FR-52)
- [X] T075 Implement web/src/components/settings/LlmSettingsSection.tsx — section shell (title, Back, two cards: ConnectionStatusCard + ByokSettings); reachable from menu ("LLM settings" item), banner, failure transfers; enter/leave never mutates flow state or drafts (FR-54, R17)
- [X] T076 MOD web/src/components/ByokSettings.tsx — add the optional failure mode (origin + pendingRetry props): on save with failure mode → enable the use-for-analysis preference (FAILURE PATH ONLY — menu-initiated visits never change it) and signal return-to-origin; cancel returns without the retry ask; standing contracts unchanged (OpenRouter-only, key memory-only) (FR-51/54)
- [X] T077 MOD web/src/app/page.tsx (part 1) — gate mapping: CONFIG_ERROR and non-JSON gate responses → GATE_SERVICE_UNAVAILABLE (wrong password unchanged); menu screen mount fires the content-free check ONCE per session (sessionStorage guard) and drives the connection status state; banner rendered menu-onward (replacing the analysis-only ModelBanner placements) (FR-45/46/47/53)
- [X] T078 MOD web/src/app/page.tsx (part 2) — wire GuidanceBox through failure-class.ts for every gateway failure at analysis stages; NO_WAY_FORWARD → TRANSFER_EXPLANATION box (Continue button + 5 s auto-advance, never silent) → capture originScreen → open llm_settings in failure mode → on save return to origin with input intact and show RETRY_ASK once → confirm runs the recorded failed action (pendingRetry closure) once with the own key; dismiss/cancel leaves the stage; rename screen byok_settings → llm_settings; menu-initiated visits keep onBack → menu; draft recovery untouched (FR-49/50/51, P18)
- [X] T079 MOD web/tests/llm/gateway.test.ts — add the BYOK-with-broken-free-config scenario (valid byokKey succeeds without NVIDIA envs; no-key yields typed CONFIG_ERROR); verify all existing typed outcomes unchanged (FR-55)
- [X] T080 Run ALL gates: test:llm (extended ≥ +15), test:engine green incl. extended guards, tsc clean, next build exit 0, test:byok 23/23 (BYOK_SKIP_LIVE=1), scan:byok passed, pytest 213 from terminal/ (untouched), PARITY OK (optional-skip aware); record results
- [ ] T081 Owner walkthrough: quickstart M15-1..M15-7 with real env/deploy (cold-entry zero-contact, green banner, yellow→red states, gate config message, full no-way-forward journey, BYOK-with-broken-free-config, banner switching); record evidence

## Phase 12: Amendment — §16 Diagnostics, Live Smoke Test & BYOK Quick Access (owner fix brief, 2026-11-07)

Spec §16 (FR-56..FR-63 + §16.1); design = plan.md §16 amendment + addendum
(FILE LIST, R18–R22). ALL additive; S1 cleanup approved+executed; S3/S4 NOT
approved (nothing else deleted).

- [X] T082 Record the amendment: spec §16 (FR-56..63, §16.1), plan FILE LIST + addendum, R18–R22, quickstart M16-1..6, this phase; S1 executed (tmp probe deleted, root node_modules unstaged + ignored)
- [X] T083 [P] Tests FIRST (must FAIL): web/tests/llm/fallback.test.ts — the per-attempt terminal line carries model id, HTTP status, error class, attempt number, fallback flag and a ≤300-char body excerpt; redaction guard: no key material and no user text in any logged line (FR-56)
- [X] T084 Implement FR-56 in web/src/lib/llm/client.ts (ClassifiedFailure gains the truncated provider error BODY excerpt) + web/src/lib/llm/fallback.ts (terminal line `[llm] attempt N/M model=… status=… class=… fallback=… body="…"`); JSONL contract unchanged
- [X] T085 Implement FR-57 in web/src/app/page.tsx — dev-only (non-production) console.warn of the sanitized failure summary (class, reason, model, attempts) on every gateway failure; production browsers stay silent
- [X] T086 Implement FR-58: NEW web/src/instrumentation.ts — CONTACT-FREE startup echo of the resolved GEN/FAST chains (ids only, ConfigError surfaced as the named message) + dev-only .env.local duplicate warning WITH line numbers; NEW web/tests/llm/startup-echo.test.ts (chains listed, zero key material, duplicate detector returns line numbers) — TDD-first
- [X] T087 Implement FR-59: NEW web/scripts/test-live.ts (`npm run test:live`) — per configured chain model (GEN+FAST primaries and fallbacks) a 1-token chat completion with the real .env.local (last-wins loader + duplicate guard), prints OK/FAIL per model with status + truncated error body, exit 1 on any FAIL; package.json script; MANUAL tool, excluded from automated suites
- [X] T088 Implement FR-60 in web/scripts/check-connection.ts — after timings + list report, run the same per-model 1-token smoke and append the table
- [X] T089 [P] Tests FIRST: web/tests/llm/guidance-guards.test.ts — label supersession (BANNER_FREE_SERVICE "Default free", BANNER_YOUR_KEY "My key") + RESEND_WITH_DEFAULT + quick-modal strings present and icon-free
- [X] T090 Implement FR-61 in web/src/lib/llm/messages.ts (label supersession + RESEND_WITH_DEFAULT "Resend with the default free combo" + BYOK_QUICK_* strings), web/src/components/ModelBanner.tsx (header element on ALL screens — page passes visible=true — plus a direct "Use my own API key" affordance when the key path is not active), NEW web/src/components/byok/ByokQuickModal.tsx (key + model + Save in one panel, memory-only FR-29, link to full settings), web/src/app/page.tsx (modal wiring; menu item unchanged)
- [X] T091 Implement FR-63: web/src/lib/byok/providers.config.ts (optional gatewayBaseUrl field; google_ai_studio = https://generativelanguage.googleapis.com/v1beta/openai; other entries untouched/hidden), web/src/lib/llm/gateway.ts (BYOK base reads the Google compat field), web/src/components/ByokSettings.tsx (Google hints: AIza…, aistudio.google.com/apikey), web/tests/llm/gateway.test.ts (BYOK URL expectations → Google compat endpoint)
- [X] T092 Implement FR-62 in web/src/components/GuidanceBox.tsx — the OWN_KEY free-path button relabeled to RESEND_WITH_DEFAULT (behavior unchanged: explicit per-request resend via retryActionRef, zero automatic fallback)
- [X] T093 Run ALL gates: test:llm (extended), test:engine green, tsc clean, next build exit 0, test:byok + scan:byok, pytest 213 from terminal/ (untouched), PARITY OK; record results
- [ ] T094 Operator + owner walkthrough: npm run test:live and npm run check:connection with the real key (1 token per chain model); quickstart M16-1..M16-6 (failure line, startup echo, test:live, smoke, quick BYOK from the gate screen, resend-with-default)

## Phase 12 addendum: FR-64 client resilience (owner "A+B", 2026-11-07 — client-side only, nothing deleted)

- [X] T095 Record FR-64 (spec + plan addendum 2 + quickstart M16-7) + this phase; tests FIRST in web/tests/llm/connection-client.test.ts — autoCheckPolicy matrix (available→restore; needs_retry/unavailable/null→check) + the amended journey (bad saved status → reload → fresh check → green without a manual click) — must FAIL before the helper exists
- [X] T096 Implement A+B: web/src/lib/llm/connection-client.ts gains autoCheckPolicy (restore ONLY a saved "available"; else check); web/src/app/page.tsx — the check fetch carries signal AbortSignal.timeout(20_000) (abort → existing catch → needs_retry) and the restore path uses autoCheckPolicy with the per-load ref as the throttle (markCheckStarted no longer gates the page; the function stays in the module, unused by the page, tests keep it as a pure util)
- [X] T097 Run gates: web/tests/llm (full), tsc, next build — record; NOTHING else changes (server untouched)
