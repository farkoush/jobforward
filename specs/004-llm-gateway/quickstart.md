# Quickstart: 004-llm-gateway — validation guide

**Date**: 2026-11-06 | Full contracts: [contracts/llm-api.md](./contracts/llm-api.md) |
Entities: [data-model.md](./data-model.md)

## Prerequisites

1. `cd web && npm install` (adds `vitest`, `@vercel/kv` after tasks phase).
2. Create `web/.env.local` from `web/.env.example` and fill:
   `NVIDIA_API_KEY`, `NVIDIA_BASE_URL`, `GEN_MODEL`, `GEN_FALLBACKS`,
   `FAST_MODEL`, `FAST_FALLBACKS`, `GATE_PASSWORD`, `GATE_COOKIE_SECRET`.
   Missing values must fail fast at startup with a named-variable error.
   For local dev **omit** `KV_REST_API_URL`/`KV_REST_API_TOKEN` — the in-memory
   adapter activates automatically.

## Automated validation

```bash
cd web
npm run test:llm      # new vitest suites (fake timers, mocked fetch)
npm run test:engine   # standing gate — must stay green
npm run test:byok     # standing gate — legacy byok lib untouched, green
npx tsc --noEmit      # strict gate
npm run build         # build gate
```

`test:llm` covers the acceptance core: all-models-fail, 429 with/without
Retry-After, 5xx, timeout, empty/malformed response, UTC-day quotas, per-minute
limiter + busy queue, BYOK consumes no free quota, BYOK failure never falls back
to free, keys/password/prompt never appear in logs, draft preserved across error
and reload.

## Manual scenarios (dev on port 3100)

1. **Gate**: open the app → enter the shared password → reload → still authorized
   (cookie, no re-prompt). Wrong password → Persian input error, no cookie.
2. **FAST happy path (free)**: run a scoring action → result arrives with
   `source:"free"`; the request log line contains category/model/source/tokens/
   latency/status and **no** prompt content or key.
3. **Fallback**: set `FAST_FALLBACKS` to a bogus-but-configured chain and make the
   primary fail (or point `FAST_MODEL` at an unavailable name) → the answer still
   arrives; the log names the responding fallback model with `fallbackUsed: true`.
4. **All models fail**: point the whole chain at unavailable names → Persian error
   message + Retry button; the app stays usable; Retry resends the same input
   without retyping; the draft also survives a page reload.
5. **Limits**: set tiny env limits (e.g. `DAILY_GEN_PER_USER=1`) → the second GEN
   request is rejected before any provider call with a Persian message showing the
   UTC reset time and the optional "use my own key" action.
6. **Busy limiter**: set the global per-minute limiter to 1 and fire two requests
   within a minute → the second waits ~5 s then either proceeds or gets the
   Persian "service busy" message with the input intact.
7. **GEN streaming**: with a working `GEN_MODEL`, request a GEN task → text arrives
   progressively (NDJSON chunks); kill the network mid-stream → received text
   remains, single "continue" action appears and resumes from the partial text.
8. **BYOK (optional)**: in advanced settings enter an OpenRouter key (memory-only)
   → requests run with `source:"byok"`, consume no free quota; revoke/invalid key →
   dedicated Persian message, **no** automatic switch to free; only explicit
   confirmation returns to the free path.
9. **No 504**: with `GEN` chain timeouts configured at their defaults, no request
   ever ends in a platform timeout — the gateway's typed result always lands first.

## Notes

- Local runs without KV use the in-memory adapter: counters reset on server
  restart — expected in dev.
- 404-cooldown caching and the per-IP daily cap on the main path are **deferred to
  the next version** (product decision 2026-11-06); login attempts are still
  limited to 5/min/IP.
