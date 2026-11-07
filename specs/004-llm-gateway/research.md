# Research: 004-llm-gateway

**Date**: 2026-11-06 | **Status**: all NEEDS CLARIFICATION items resolved

## R1. Test runner: Vitest vs the existing node:test/tsx setup

**Decision**: Vitest, as the product owner mandated ("Vitest + mock کردن fetch",
fake timers). New suites live in `web/tests/llm/` with script `test:llm`.

**Rationale**: mature fake-timer control (`vi.useFakeTimers`) matters for backoff,
deadlines, UTC-day rollover, and per-minute windows; per-suite mocking of global
`fetch` is first-class. The existing `test:engine`/`test:byok` runners remain
untouched, so no existing test breaks.

**Alternatives considered**: `tsx --test` with `node:test` `mock.timers` (keeps one
runner, but timer control is coarser and the product owner explicitly chose Vitest);
jest (heavier, ESM friction with this repo).

## R2. Counter storage for serverless

**Decision**: pluggable adapter (`web/src/lib/llm/rate-store.ts`) with two
implementations: in-memory (local dev, tests) and Vercel KV (`@vercel/kv`, Upstash
REST — safe for serverless, no connection pooling issues).

**Rationale**: serverless functions share no memory, so production counters must sit
behind a REST store; local dev and CI must not require cloud infra. The adapter keeps
the limits engine testable with fake timers and instant state.

**Alternatives considered**: raw Upstash SDK (same thing with more setup); Redis over
TCP (connection limits on serverless); Durable Objects (plan-gated, unnecessary for
10 users).

## R3. Signed anonymous cookie

**Decision**: `node:crypto` HMAC-SHA256 signed token embedded in an httpOnly,
SameSite=Lax, Secure, `Max-Age` ≈ 30-day cookie; value = `anonymousId.expiry.hmac`.
Signing secret + password come from env only; password compare stays
`timingSafeEqual` (already implemented in `web/src/lib/serverAuth.ts` and reused).

**Rationale**: zero new dependencies; invalidation on secret rotation is immediate
(all cookies fail verification → testers re-enter the shared password), exactly as
the spec requires (FR-36).

**Alternatives considered**: `jose`/JWT (extra dep, no benefit for one opaque id);
returning a bearer token to localStorage (current `/api/gate` behavior — rejected:
spec FR-18 requires an httpOnly cookie, and localStorage is fragile against XSS).

## R4. Streaming protocol for GEN

**Decision**: NDJSON over a plain `fetch` body stream — one JSON object per line:
`{"type":"chunk","text":"…"}`, then `{"type":"done",…}` or `{"type":"error",…}`.

**Rationale**: trivial to parse incrementally (`split("\n")`), no event-format
ambiguity, works with the same typed-result shape on both routes.

**Alternatives considered**: SSE (needs header+framing rules, overkill for one
client); plain text chunks (loses the typed end/error signal).

## R5. BYOK key transport

**Decision**: the user's OpenRouter key travels in the `x-byok-key` request header,
is read once per request inside the gateway, used for that single provider call, and
never written to any store, log, or error. The draft/localStorage never sees it
(FR-24/29).

**Rationale**: header keeps it out of request bodies (which get logged in some
debug paths) and out of any persistence; per-request lifetime matches FR-29 exactly.

**Alternatives considered**: cookie (persistence — violates FR-29); body field
(redaction burden, accidentally loggable).

## R6. Call-site inventory (P12 migration)

**Decision**: exactly one existing provider call site — `scoreWithByok()` in
`web/src/app/page.tsx` (browser→provider via the legacy `byok/` client). It migrates
to `POST /api/llm/fast` with task name `scoring_ratings` (FAST by default). GEN has
no caller in v1: the route, config, and `tasks.ts` mapping exist so future tasks
plug in by name. The legacy `byok/` library stays untouched and green for
`test:byok`; `ByokSettings.tsx` narrows to an OpenRouter key (memory-only) + model.

**Rationale**: smallest change that honors "all direct LLM calls move behind the
gateway" without freezing-gate or test-gate violations.

**Alternatives considered**: deleting the legacy byok client (breaks `test:byok`,
out of scope); keeping browser→provider calls for BYOK (violates P12/FR-16).

## R7. Gate migration (token → cookie)

**Decision**: `/api/gate` now sets the signed cookie and returns `{ok:true}` only;
`isAuthorized()` in `serverAuth.ts` accepts the new cookie first and the legacy
token header during transition, so the seven existing routes (entry, log, matcher,
overlap, rewrite, score) keep working unchanged while the client migrates.
Login attempts are limited to 5/minute per IP (server platform request metadata
only).

**Rationale**: no big-bang rewrite of every route; the security properties the spec
requires (httpOnly, signed, 30-day, rotation-invalidation) land immediately.

**Alternatives considered**: flipping all routes at once (wider blast radius, no
benefit at 10 users).

## R8. Config validation and fail-fast

**Decision**: one zod schema (`web/src/lib/llm/config.ts`) parses all gateway env
vars at first import on the server; a missing/malformed variable throws a clear
startup error naming the variable (server logs only — the UI sees the Persian
"service unavailable" message via the typed result). `.env.example` documents every
name with a placeholder; the intended GEN model value (`moonshotai/kimi-k3`) is
recorded there as configuration data, never in code.

**Rationale**: P13 requires env-only config; failing at startup with a named
variable beats mid-request discovery during a usability session.

**Alternatives considered**: lazy per-request validation (errors surface mid-flow);
default model values inside code (violates P13).

## R9. Fluid Compute / plan verification (pre-implementation)

**Decision**: before implementing routes, verify on the Vercel project that Fluid
Compute is enabled and the plan supports the intended `maxDuration` (90 s GEN /
40 s FAST). If Fluid Compute is unavailable, keep the same route-level
`maxDuration` values that the plan supports (they are hard requirements for the
no-504 acceptance criterion) and record the constraint in tasks.md.

**Rationale**: the product owner flagged this explicitly as a pre-implementation
check; the no-504 guarantee (SC-009) depends on it.

## R10. Persian error strings (P16)

**Decision**: pinned `ERR_*` reason codes live in `web/src/lib/llm/types.ts`; the
Persian user-facing strings map from them in the UI layer. Strings are TS-only —
the terminal edition is frozen and no shared strings are involved, so the py+ts
lockstep rule does not apply here.

**Rationale**: keeps the wire protocol language-neutral and the mapping testable;
consistent with the existing `ERR_*` convention in this codebase.

## R11. Validation trigger relocation (§15 FR-45/46)

Decision: DELETE the startup hook (`instrumentation.ts`); the ONLY remaining
triggers are (a) the new content-free check route `POST /api/llm/check`
(fired once per browser session from the menu screen + explicit re-checks)
and (b) the operator CLI `check:models` (unchanged).
Rationale: the owner rule "provider contact only at analysis stages" has one
recorded exception (the content-free check); a cold-start hook cannot know
whether a user is mid-entry, so it violates FR-45. The first analysis action
consumes whatever the check cached (`getAppliedChains()`); if the check has
not run, requests proceed on raw env chains — the spec explicitly permits
this ("short capped wait OR the raw env chains"), and no-wait adds zero
latency and no new state machine.
Alternatives: keep instrumentation with `waitUntil` backgrounding (rejected —
still a provider contact at page entry), block the first analysis on the
check (rejected — up to 15 s first-call stall), client-side per-screen
checks (rejected — provider hammering, no session singleton).

## R12. Config split for BYOK decoupling (§15 FR-55)

Decision: split `gatewayEnvSchema` into `coreSchema` (limits, timeouts, gate,
mock, chain-policy — all defaulted except the gate pair, which is guaranteed
present because the user passed the gate) + `providerSchema`
(NVIDIA_API_KEY/BASE_URL/GEN_*/FAST_*). `getLlmCoreConfig()` serves the BYOK
preflight path; `getLlmConfig()` (core+provider) stays the free-path and
operator path. Rationale: today `preflight()` loads the FULL config before
looking at `byokKey`, so broken NVIDIA envs dead-end BYOK users — exactly
the owner's live Vercel incident. With the split, BYOK needs nothing from
the provider block. Alternatives: make provider fields optional globally
(rejected — weakens free-path fail-fast, P13/P21), retry config load per
attempt (rejected — same coupling).

## R13. Failure-class map as the single UI source (§15 FR-48)

Decision: NEW pure module `lib/llm/failure-class.ts`:
TRANSIENT = {SERVICE_BUSY, MINUTE_LIMIT, RATE_LIMITED};
NO_WAY_FORWARD = {QUOTA_USER, QUOTA_GLOBAL, ALL_MODELS_FAILED, CONFIG_ERROR};
BROWSER_UNREACHABLE = {client-side NETWORK};
OWN_KEY = {BYOK_FAILED, BYOK_LIMIT};
INVALID_INPUT / INVALID_TASK / UNAUTHORIZED map to none (own handling).
ALL_MODELS_FAILED is NO_WAY_FORWARD with Retry kept visible (clarify Q1).
Rationale: one tested map prevents guidance/offer drift between screens;
the class decides message + advice + available actions (FR-49/50/51).

## R14. Status state machine (§15 FR-52)

Decision: client state `checking | available | needs_retry | unavailable`.
check success → available; one failed check → needs_retry (yellow);
TWO consecutive failed checks, or a NO_WAY_FORWARD analysis error →
unavailable (red). "Check again" re-runs and resets the consecutive counter
on success. The status NEVER gates navigation (pure display; no control is
disabled/delayed/hidden). Colors = background/border tints + text labels
(§11 rule 1: no icons/emoji). SC-017's "final state within a typical menu
visit" follows from the check's own timeout budget (15 s internal) — the
checking state makes any remaining wait self-explanatory.
Alternatives: red on first failure (rejected — one blip ≠ broken);
separate indicator component (rejected — banner carries it, FR-53).

## R15. Persistent banner upgrade (§15 FR-53)

Decision: rework `ModelBanner` from the current amber analysis-only note
into the menu-onward persistent banner: source label ("Free service" /
"Your key") + status tint + tap-to-open in-place menu (Use your key /
Use the free service / Model settings). Switching writes the existing byok
preference (`useForScoring`) via the client lib — effective for the next
analysis action; no reload; switching is never blocked by status. The
banner reports the FREE path's state even while the own key is selected.
Rationale: one element serves disclosure (existing BYOK §3/§5.1 duty),
status (FR-52), and switching (FR-53); reuses the byok client store and
`onByokChange`.

## R16. Transfer, origin, one-tap retry (§15 FR-50/51)

Decision: page.tsx keeps three in-memory session refs — `originScreen`,
`settingsMode: "menu" | "failure"`, `pendingRetry` (a closure re-running
the failed action with the same input). NO_WAY_FORWARD at an analysis
stage → TRANSFER_EXPLANATION box (Continue button; 5 s auto-advance,
whichever first — never silent) → origin captured → `llm_settings` in
failure mode → on SAVE: use-for-analysis enabled (failure path only),
return to origin, `RETRY_ASK` shown once → confirm runs `pendingRetry`
once with the own key; dismiss/cancel leaves the stage with input intact.
Menu-initiated visits keep `onBack → menu` and touch nothing.
Rationale: SPA state persists across `go()` navigation, so origin/restore
needs no storage layer; a closure is the safest way to re-run exactly the
failed action (P18 draft preservation is independent and unchanged).

## R17. LLM settings section independence (§15 FR-54)

Decision: rename the screen `byok_settings` → `llm_settings`, wrapped in a
NEW section shell (`LlmSettingsSection`: title + Back + two cards —
`ConnectionStatusCard` with status + Check again, and the existing
`ByokSettings` card with key/model/use-for-analysis). Reachable from the
menu (item text "LLM settings"), the banner, and failure transfers.
Enter/leave never mutates flow state or drafts (verified: the screen is
React state-driven; only `restart()` clears, and it is not on this path).
Single BYOK provider and per-request key contracts unchanged (FR-27/29).
Rationale: the owner asked for BYOK as a standalone capability inside an
"LLM settings" section, not a flow-embedded detour; one screen with two
cards satisfies v1 — further splitting is deferrable without contract
change.

## R18. Failure-log line format (§16 FR-56)

Decision: ONE structured terminal line per failed attempt, printed where the
attempt result is already known (fallback.ts onAttempt), format
`[llm] attempt N/M model=<id> status=<code|-> class=<kind|cls> fallback=<yes/no> body="<≤300-char excerpt>"`. The JSONL request log (FR-08) stays the
machine-readable record; the terminal line is the human-readable twin.
Rationale: the owner diagnosed today's outage from scattered lines; one line
with all six fields removes the guesswork. Body excerpts come from the
provider's error response only — never the request — so no resume text can
leak; keys never appear (P14 guard-tested).

## R19. Startup echo without violating FR-45 (§16 FR-58)

Decision: re-introduce `instrumentation.ts` as a CONTACT-FREE hook — it only
reads the env config (already validated by zod) and prints the resolved
chains; in dev it additionally parses `.env.local` text for duplicated keys
WITH line numbers (the check-tools hard-fail on duplicates; the startup
warning catches it where the operator actually is). No fetch, so the §15
"no provider contact at page entry" rule holds. Alternatives: log on first
gateway use (rejected — "at startup" is the owner's wording and cold-start
logs are what operators read first); put the echo in middleware (rejected —
runs per request).

## R20. Live smoke design (§16 FR-59/60)

Decision: a 1-token chat completion per configured model (`max_tokens: 1`,
messages = a 3-word ping; ~1 token out) via the same client transport with
a 20 s timeout, printed as a table. check:connection appends the same table
after its network report. Rationale: GET /models only proves list
membership — today's incident proved models can 404/timeout per account
while the list endpoint works (P20 "listed ≠ servable"). Quota cost is
negligible (1 token × ~5 models per run). Excluded from automated suites
(real key, manual operator command — same treatment as probe-rate-limit).

## R21. Header-unified BYOK access (§16 FR-61/62)

Decision: the §15 banner IS the header element — shown on ALL screens now
(gate/welcome included), labels superseded to "Default free" / "My key"
(owner wording), and a NEW small quick-modal (key + model + save) opens from
it without navigation. The full LLM settings page stays (status card,
clear-key, details). FR-62's resend button relabels the existing §15
free-path action — the behavior (explicit per-request resend via
retryActionRef, zero automatic fallback, SC-008) is already implemented and
tested; only the wording gains the owner's clarity. Rationale: "not only a
separate settings page" + "restore the quick path" = one persistent entry
point everywhere + a 10-second setup flow; no screen navigation means flow
state and drafts stay untouched (P18).

## R22. Google AI Studio as the displayed BYOK provider (§16 FR-63)

Decision: the gateway BYOK path targets Google AI Studio's OpenAI-compatible
layer (`/v1beta/openai/chat/completions`, `Authorization: Bearer <key>`) —
NOT the native Gemini adapter (that adapter belongs to the hidden legacy
stack; reviving it would contradict "hide, don't rewrite"). A new optional
`gatewayBaseUrl` field on the registry entry carries the compat URL; all
other registry entries stay untouched (hidden, not deleted). Server-side
call → no CSP/CORS impact. Model ids are typed manually (e.g.
"gemini-2.0-flash") exactly as the OpenRouter flow did.
