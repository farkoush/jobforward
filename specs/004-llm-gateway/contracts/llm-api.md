# Contracts: 004-llm-gateway

**Date**: 2026-11-06 | **Consumers**: `web/src/app/page.tsx` (and future task callers)

Three server routes. All routes require a valid gate cookie (legacy token header
accepted during transition) except `/api/gate` itself. Every provider-touching
route returns the gateway's **typed result** — it never throws, and it always
answers before the platform's hard timeout (maxDuration 90/40; deadline 60/20).

## Shared types

```ts
type Source = "free" | "byok";
type Category = "GEN" | "FAST";

interface GatewayResult {
  ok: boolean;
  reason: string;            // pinned ERR_* code, e.g. "QUOTA_USER"
  retryable: boolean;
  retryAfter?: number;       // seconds, honored from provider Retry-After
  source: Source;
}

// pinned reason codes (P16: UI maps each to a Persian message, no tech detail)
// QUOTA_USER | QUOTA_GLOBAL | MINUTE_LIMIT | SERVICE_BUSY | INPUT_TOO_LONG
// INVALID_INPUT | INVALID_TASK | CONFIG_ERROR | ALL_MODELS_FAILED
// BYOK_FAILED | BYOK_LIMIT | NETWORK | UNAUTHORIZED
```

## POST /api/gate

Shared-password entry gate (FR-36). Body: `{ "password": string }`.

- `200` → `Set-Cookie: jf_gate=<id>.<expiry>.<hmac>; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000` + `{"ok":true}`
- `401` → `{"ok":false,"error":"WRONG_PASSWORD"}` (no cookie set)
- `429` → `{"ok":false,"error":"WRONG_PASSWORD"}` after >5 failed attempts/min/IP (identical body — never reveal rate-limit internals beyond the Persian message the UI shows)

The raw password is compared server-side only (constant-time) and never stored,
logged, or returned.

## POST /api/llm/fast  (maxDuration = 40)

One-shot JSON in/out. Body: `{ "task": string, "input": string, "context"?: object }`.

- `200` success → `{"ok":true, "text": string, "model": string, "source": Source, "usage":{"in":number|null,"out":number|null}, "ms": number}`
- `200` typed failure → `{ …GatewayResult }` (e.g. `ALL_MODELS_FAILED`, `QUOTA_USER`, `BYOK_FAILED`) — HTTP stays 200; the reason code carries meaning
- `401` → `{"ok":false,"reason":"UNAUTHORIZED"}` (no valid gate cookie)

Budget: 10 s/attempt, 20 s overall deadline. FAST and any structured (JSON) output
never streams (FR-32).

## POST /api/llm/gen  (maxDuration = 90)

Streaming NDJSON while generating display text. Body: `{ "task": string, "input": string, "context"?: object }`.

Response is `text/event-stream`-style NDJSON (one JSON object per line):

```jsonc
{"type":"chunk","text":"partial display text"}   // 0..n lines, only after the final model was chosen
{"type":"done","model":"…","source":"free","usage":{"in":1,"out":2},"ms":1234}
{"type":"error","reason":"ALL_MODELS_FAILED","retryable":true,"source":"free"}
```

Rules (FR-32): fallback/retry happens **only before the first chunk** — once a
chunk is emitted the model is fixed; a mid-stream cut ends the stream after
`{"type":"error",…}` with `reason` describing the cut, and the client keeps the
received text and offers the single "continue" action. Budget: 30 s/attempt,
60 s overall deadline; first-token timeout 20 s; inter-chunk silence timeout 15 s.

## Header: `x-byok-key` (optional, both LLM routes)

Presence switches the request to the BYOK path (OpenRouter, chain length 1). The
key is read once per request, used for that call only, and never logged, stored, or
echoed (FR-29). BYOK requests consume no free quotas; they honor the 10/min
anti-spam cap. BYOK failure → typed result with `reason: BYOK_FAILED` (or
`BYOK_LIMIT`) and `source:"byok"`; **no automatic fallback to the free path** (FR-28).

## Client obligations (draft preservation, FR-20/21/22)

Before calling either route the client saves the input durably (debounced
localStorage); it clears the draft only after a fully successful response; on any
typed failure or stream cut it preserves the input and offers Retry/continue
without retyping; on reload it restores the draft. The BYOK key is never written
next to the draft. The top-level error guard (`web/src/app/error.tsx`) never clears
user state.

## POST /api/llm/check  (maxDuration = 30) — §15 FR-45/46/52

Content-free connection check. The ONLY new provider contact outside analysis
stages (owner-approved exception; no user data is sent or returned). The
client fires it once per session from the menu screen and on explicit
"Check again".

Request: empty JSON body `{}`; auth via the gate cookie (`isAuthorized`),
else `401 { ok:false, error:"UNAUTHORIZED" }`.

Response — ALWAYS typed JSON, never HTML, never model names or keys:

```json
{
  "ok": true,
  "state": "available" | "unavailable",
  "configOk": true,
  "chains": { "GEN": 2, "FAST": 2 },
  "checkedAt": "2026-11-07T10:00:00.000Z"
}
```

- `state:"available"` — the provider answered `/models` and at least one
  valid ID remains in each category's pruned chain (applied chains updated).
- `state:"unavailable"` with `configOk:false` — free-path env config failed
  to load (ConfigError); the named cause goes to the server log only (P19).
- `state:"unavailable"` with `configOk:true` — the provider was unreachable
  or every ID was pruned; raw env chains remain in effect for analysis
  calls (§14 skip behavior).
- `chains` carries valid-ID COUNTS only (diagnostic without disclosure).
- LLM_MOCK=true (dev-only): the mock transport answers; state available.

Client consumption: success → banner green; failure → yellow
(needs-retry), red after two consecutive failures or a NO_WAY_FORWARD
analysis error (R14). The response never blocks navigation (FR-52).

## UI contract: failure classes → guidance (§15 FR-48/49, single source)

`lib/llm/failure-class.ts` is the only mapping the UI may consult:
TRANSIENT → wait-and-retry guidance, Retry primary, own-key option beside;
NO_WAY_FORWARD → own-key path, transfer with advance explanation
(Continue + 5 s auto-advance), origin remembered, one-tap "Retry with your
own key?" after save; BROWSER_UNREACHABLE → check-internet/VPN advice (the
ONLY place VPN wording may appear); OWN_KEY → fix-key advice with the
free-path option visible. Gate failures (FR-47) show
`GATE_SERVICE_UNAVAILABLE` — no AI wording, no technical detail.
