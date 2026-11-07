# LLM Gateway Runbook — symptoms, causes, fixes

**Companion to constitution v4.1.0 (P19 diagnosability / P20 model servability /
P21 environment completeness).** Scope: the `web/` LLM gateway (spec 004).
Audience: the product owner / operator running usability tests.
Language: English (technical detail allowed — this is operator material, not UI).

## Diagnosis workflow (use IN THIS ORDER)

1. **Reproduce once.** The gateway writes one JSONL entry per request — with
   per-attempt detail — to `web/data/llm-requests.log.jsonl` (local, git-ignored,
   never contains prompt content or keys — FR-09/P14).
2. **Read the last entry** (the `[llm] attempt …` lines also appear in the
   TERMINAL running `npm run dev` — they do NOT appear in the browser console;
   browser DevTools only show the HTTP failure).
3. **Match the signature** against the table below and apply the fix.
4. If the entry alone is inconclusive, reproduce the exact provider call with a
   temporary script through the gateway itself (`runFastGateway` /
   `runGenGateway`) — never by hand-crafting fetch calls outside `lib/llm/`.

## Signature table — what you see → what it means → what to do

| Signature (log / UI) | Cause | Fix |
|---|---|---|
| `500` + client `SyntaxError: Unexpected end of JSON input` on any call | Operator-side throw on the request path (typically a missing env variable) — server returned an empty body | Fixed pattern: routes return typed JSON `{ok:false,error:"CONFIG_ERROR"}`; check the TERMINAL for the variable name, add it to `.env.local`, **restart dev** |
| Startup error naming a variable (e.g. `GATE_COOKIE_SECRET is not set`) | Required env variable missing | Add it to `.env.local` AND `.env.example` (P21), restart dev |
| `attempt … -> not_found (HTTP 404)` / `(HTTP 410)` | The model is NOT servable for this NVIDIA account (catalog listing ≠ serving; account/geo restrictions) | Pick a servable model: probe candidates (tiny 1-token calls) and update the chain env vars; `npm run check:models` only checks list membership — it CANNOT see account-level 404/410 |
| `attempt … -> empty_response` (HTTP 200, empty content) | Reasoning-style model spent its max_tokens thinking | Add the model name to `REASONING_MODEL_PATTERNS` (raises its FAST budget to `REASONING_MAX_TOKENS_FAST`, default 4000) and/or raise `ATTEMPT_TIMEOUT_MS_FAST`; or move it off the FAST chain |
| `attempt … -> timeout` repeatedly | Model slower than the per-attempt budget (10s FAST / 30s GEN) or the overall deadline (20s / 60s) | Use a faster model on FAST; or raise `ATTEMPT_TIMEOUT_MS_FAST` / `DEADLINE_MS_FAST` — watch the platform `maxDuration` backstop (90/40) |
| UI shows `RATE_LIMITED` / `reason:"RATE_LIMITED"` | Persistent 429s hit `MAX_PROVIDER_CALLS_PER_REQUEST` (default 4) or the deadline | Wait for the retry window; if it recurs, verify the provider cap scope with `npm run probe:rate-limit` |
| `reason:"SERVICE_BUSY"` | The gateway's own global provider limiter (`PROVIDER_RPM_LIMIT`, default 30/min) stayed full through the ~5s queue | Lower concurrency or raise `PROVIDER_RPM_LIMIT` within the key's real capacity |
| `reason:"QUOTA_USER"` / `"QUOTA_GLOBAL"` | Daily allowances exhausted (reset 00:00 UTC, shown in the UI message) | Expected behavior; raise the env limits only deliberately |
| UI: "Your key did not work…" (BYOK_FAILED) | The visitor's own key failed on their provider | Expected; the user explicitly confirms continuing on the free path (never automatic — FR-28) |
| Behavior did not change after editing `.env.local` | The dev process keeps the OLD configuration; Fast Refresh / browser reload is NOT an env reload | Full restart: Ctrl+C → `npm run dev` (P21) |
| Log file has `test-fast-primary` / instant successes among live entries | A vitest run wrote to the file — test runs are excluded since the `NODE_ENV=test` fix; old lines predate the fix | Ignore historical lines |

## Tooling

- `npm run check:models` — validates chain IDs against the provider list,
  prunes forbidden (non-chat) patterns, warns on oversized FAST models. Exit 0
  with warnings is OK; exit 1 = a category has no valid model.
  **Limitation:** list membership ≠ servability (see table).
- `npm run check:connection` — measures the REAL provider round-trip from
  this machine (timings, list size) and flags every chain ID that is missing
  from the live list. Uses the SAME env semantics as Next.js (last
  occurrence wins). **Run this after ANY `.env.local` change.**
- `npm run probe:rate-limit` — dev-only, slow, report-only: determines whether
  the provider's ~40 rpm cap is per-model or shared.
- `web/data/llm-requests.log.jsonl` — the diagnostic source of truth for live
  failures (per-attempt detail; local only). NOTE: automated vitest runs
  append to it too — grep out `test-*` models when reading real attempts.

## Env file hygiene (rule — incident 2026-11-07, MANDATORY)

**Incident:** `.env.local` ended up with TWO conflicting chain blocks; the
second block (appended later) silently won because Next.js takes the LAST
occurrence of a duplicated variable. The operator's chosen chains were
ignored for days while `check:models` (first-wins loader) kept reporting OK
against the stale first block.

**The rules (apply to every env edit, assistant and operator alike):**

1. **ONE definition per variable.** Never append a new block or a second
   occurrence of an existing key — REPLACE the value in place.
2. **`.env.local` is owner-owned data.** The assistant must show the exact
   diff and get the owner's explicit choice (e.g. option A/B) BEFORE
   touching it; the owner's selected chain list is authoritative.
3. **Both loaders now hard-fail on duplicates.** `check:connection` and
   `check:models` exit 1 naming every duplicated variable (`NAME×count`).
   This failure means the env file is broken, not the tools.
4. **After ANY env change:** restart the dev server (env is read at process
   start), reload the browser, then run `npm run check:connection` — it must
   print OK with every chain ID "in the provider list" before any testing.

## Verified servable models for this NVIDIA account (as of 2026-11-07)

Models verified through the full gateway path: `nvidia/nemotron-3.5-bolt-e4b`
(fast, valid JSON — FAST primary), `google/diffusiongemma-26b-a4b-it` (slow
~9–12s — FAST last-resort), `nvidia/nemotron-3.5-lightning-30b-a3b` (reasoning —
GEN side; empty on FAST budgets), `nvidia/nemotron-3-ultra-550b-a55b`,
`mistralai/mistral-large-4-1t-a52b` (slow), `meta/llama-guard-4-12b` (safety
classifier — not a scoring model). Everything else probed returned 404/410.
**Re-probe before trusting this list** — provider availability changes.

## Current chain configuration (in the operator's `.env.local`)

```
GEN_MODEL=nvidia/nemotron-3.5-lightning-30b-a3b
GEN_FALLBACKS=mistralai/mistral-large-4-1t-a52b,nvidia/nemotron-3.5-bolt-e4b
FAST_MODEL=nvidia/nemotron-3.5-bolt-e4b
FAST_FALLBACKS=google/diffusiongemma-26b-a4b-it
```

## General solution method (apply to any new failure)

1. Reproduce through the gateway (temp script importing `runFastGateway` /
   `runGenGateway`) — never outside `web/src/lib/llm/` (P12).
2. Read the JSONL entry + per-attempt detail; classify by the signature table.
3. Fix the ROOT cause (env, model choice, budget) — never special-case a
   symptom in the UI.
4. Add a test for the failure class (P15) so it cannot regress.
5. If the failure revealed a NEW rule, amend the constitution (P11 flow) —
   like P19/P20/P21 were.
