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
