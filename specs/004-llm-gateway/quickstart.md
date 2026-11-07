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

## §15 manual scenarios (owner walkthrough; dev on port 3100)

- **M15-1 cold entry, provider unreachable** (remove NVIDIA_API_KEY from
  .env.local, restart): open the site — page renders promptly (no multi-second
  stall, SC-012), gate works, request log shows ZERO provider calls for page
  load + gate submit (SC-011).
- **M15-2 menu check green**: on "What would you like to do today?" the check
  fires once; banner turns green with "Free service"; navigating never waits.
- **M15-3 provider blocked** (restore the key but block the host): banner
  yellow (needs-retry) after the first failed check, red after the second;
  "Check again" re-runs; navigation still instant.
- **M15-4 gate config failure** (unset GATE_COOKIE_SECRET, restart): the gate
  shows "The service is not available right now. Please try again later." —
  the word "AI" appears nowhere (SC-016); the server log names the variable.
- **M15-5 no-way-forward journey** (set DAILY_FAST_PER_USER=0, score a
  bullet): explanation box → (auto/Tap) LLM settings → save an OpenRouter key
  → return to the same stage with text intact → "Retry with your own key?" →
  confirm scores with the key (SC-014).
- **M15-6 BYOK with broken free config** (no NVIDIA_* envs, valid own key):
  scoring with the key SUCCEEDS (FR-55, SC-015); without a key the typed
  CONFIG_ERROR + guidance appear — no crash, no empty body.
- **M15-7 banner switching**: switch to "Your key" and back from the banner;
  the next scoring action uses the chosen source; no reload, no input loss.

## §16 manual scenarios (owner walkthrough)

- **M16-1 failure line:** force a 401 (bad key in a BYOK attempt) — the dev
  terminal shows one line with attempt number, model, status 401, cla
  terminal shows one line with attempt number, model, status 401, class,
  fallback flag, truncated body; the browser console (dev) shows the
  sanitized summary; NO key or resume text anywhere (SC-020/021).
- **M16-2 startup echo:** restart dev — the terminal lists GEN/FAST chains
  (ids only); with a planted duplicate in .env.local the startup warns with
  line numbers (SC-022; remove the duplicate afterwards).
- **M16-3 test:live:** npm run test:live prints one OK/FAIL row per
  configured model with status (SC-023).
- **M16-4 check:connection smoke:** npm run check:connection = timings +
  list report + the same per-model table.
- **M16-5 quick BYOK from anywhere:** open the gate screen → header shows
  "Default free" → click → quick modal → paste key + model → Save → header
  flips to "My key" without leaving the page (SC-024); the full settings
  page still works as before.
- **M16-6 resend with default:** with My key active, force BYOK_FAILED —
  the box shows the error + "Resend with the default free combo"; clicking
  retries the SAME request on the free path; nothing switched automatically
  (SC-025, SC-008).

- **M16-7 auto-recovery (FR-64B):** while the banner is yellow/red (provider
  blocked), get the network back and simply RELOAD — the menu check runs by
  itself and the banner turns green with no manual click; while the banner
  is green, a reload restores it with no provider request at all.
