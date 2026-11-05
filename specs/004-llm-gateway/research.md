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
