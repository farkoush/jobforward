# Feature Specification: LLM Gateway — Centralized Model Access with Fallback and Usage Control

**Feature Branch**: `004-llm-gateway`

**Created**: 2026-11-06

**Status**: Draft

**Input**: User description (verbatim):

> Feature: llm-gateway
>
> Goal: A centralized layer for all LLM requests that is reliable, controls usage, and automatically switches to fallback models if the primary model fails.
>
> Functional Requirements:
>
> - There are two categories of tasks: GEN (heavy, high-quality generation tasks) and FAST (lightweight, low-latency tasks). Each task must specify which category it belongs to.
> - Each category has one primary model and a list of fallback models. If the primary model fails, the system must try the fallback models in the specified order.
> - A failure is defined as: rate limit error, server error, timeout, empty response, or invalid response. Invalid API key errors and invalid input errors must not trigger fallback and must instead be reported as configuration or input errors.
> - If all models fail, the user must see a clear error message and a "Retry" button.
> - Every request must be logged with the following information: category (GEN/FAST), the model that actually responded, whether fallback was used, input/output token counts, response time, and final status. User prompt content and API keys must never be included in logs.
> - Daily request limits per user/session and maximum input/output lengths must be enforced. A global daily request limit must also apply across the entire application. Clear messages must be displayed when any limit is reached.
> - Current target audience: approximately 10 users during usability testing.
>
> Out of Scope:
>
> - Full authentication.
> - Payments and usage plans.
> - Cost dashboard.
>
> Acceptance Criteria:
>
> - When the primary model fails under simulated conditions, the user must still receive a response, and the logs must indicate that it came from a fallback model.
> - When all models fail, the user must see an appropriate Persian error message, and the application must not crash.
> - When a usage limit is reached, new requests must be rejected without making any calls to the provider.
>
> For this spec, it is better to define usage limits, fallback order, and retry policies as configurable settings, rather than as hardcoded values.

## Clarifications

### Session 2026-11-06

- Q: When the browser is closed and reopened, does the per-session daily quota
  continue or start fresh? → A: It continues — quota keyed to a persistent identity,
  never to a session cookie. [Superseded 2026-11-06: the identity is now the
  anonymous persistent cookie granted after the shared gateway password (FR-18/36);
  with a shared password there is nothing to re-attach to, so clearing cookies starts
  a fresh per-user quota — accepted residual risk. The quota day is now UTC. See the
  shared-password bullet below.]
- Q: When all models fail or a request is rejected at a limit, must the user's
  entered content be preserved so Retry works without retyping? → A: Yes. The input
  is persisted durably before it is sent (locally in the browser, saved as the user
  works; server-side persistence only if the app later gains accounts/storage) and is
  cleared only after a fully successful response. In every failure or rejection mode
  — all models failed, quota reached, rate limit, timeout, network interruption,
  interrupted response stream, invalid user key — the input stays untouched, any
  partially received stream content is preserved, and Retry resends the same input
  without retyping. Refreshing or closing and reopening the browser recovers the
  draft. The gateway never surfaces an unhandled crash to the interface: it always
  returns a structured outcome (success, failure reason, whether retry is possible,
  suggested wait before retry, source). The interface has a top-level error guard so
  no error can clear user state or the draft, and the user's API key is never stored
  together with the draft.
- Q: Can any part of the user's data depend on LLM success? → A: Never. User data
  (entries, bullets, answers, drafts, history) is saved and available independently
  of any model request outcome; an LLM failure must never cause data loss,
  corruption, or blocked access to already-saved data. Model outcomes affect only
  the model-dependent feature result, never the user's data.
- Q: Which path is the default, and what does it run on? → A: The free path is the
  default: the user works without entering any key, on the free model combo (the
  provider key held only server-side by the operator — NVIDIA). Every existing quota
  and limiter (per-user daily, global daily, maximum input/output lengths) applies
  to this path.
- Q: Is bringing one's own key required, and how is it constrained? → A: No — BYOK
  is optional and lives in a clearly separated "advanced settings" area. Requests
  made with the user's key do not consume the free daily quotas; they are subject to
  their own anti-spam cap per minute (configurable).
- Q: What does the user see when the free quota is exhausted? → A: A Persian message
  with the reset time (FR-19) and an optional "use my own key" action leading to the
  advanced settings (BYOK).
- Q: If the user's key fails, does the system silently fall back to the free path?
  → A: Never automatically. A failed user-key request (for example 401 or a
  provider-side rate limit) shows a dedicated Persian message; returning to the free
  path happens only after the user explicitly confirms.
- Q: Where may the user's key live? → A: It is used only for the request it was
  entered with — never stored in any log, database, or browser storage, never
  displayed, and never included in any error message.
- Q: How many BYOK providers are supported in this version? → A: Exactly one:
  OpenRouter (one key, OpenAI-compatible, already CORS-verified in the existing
  configuration). Additional providers are out of scope.
- Q: Does the input-preservation guarantee cover both paths? → A: Yes — the draft
  persistence, preservation, and recovery guarantees (FR-20/21/22) apply identically
  to the free path and the user-key path.
- Q: What are the concrete default limits? → A: Free path: 15 GEN and 50 FAST
  requests per user per day; 250 GEN and 600 FAST globally per day; 3 requests per
  minute per user; a global provider-per-minute limiter of 30 calls (~75% of the
  key's ~40 rpm capacity) that counts every actual provider call, including retries
  and fallback attempts. BYOK: 10 requests per minute per user (no free-quota
  consumption). Input ~8,000 characters; response ~2,000 tokens (GEN) and ~500
  (FAST). All values are env-configurable. Daily quotas count user-visible tasks;
  internal retries and fallback attempts count only against the per-minute provider
  limiter.
- Q: How are testers identified, and where is the day boundary? → A: [The invite-code
  part was superseded 2026-11-06 — see the shared-password bullet below.] The IP is
  read only from the server platform's request metadata (never client-sent values)
  and carries a separate, higher auxiliary cap. The quota day is defined in UTC —
  superseding the earlier Asia/Tehran choice.
- Q: After a mid-stream cut, is the continue/retry affordance one button or two? →
  A: One single button: "continue" — it resumes generation from the preserved
  partial text; the displayed text stays and the continuation appends to it. The
  continuation is a new request subject to the same limits (per-minute caps, daily
  quotas, provider limiter).
- Q: How do testers get access and identity in this version? → A: A single shared
  gateway password for all testers — a shared entry gate only, read only from
  server-side environment configuration (P13). Rotation = env change + redeploy; if
  leaked, the cookie-signing secret is rotated too so all previous sessions become
  invalid and every tester re-enters the password. No accounts, no registration, no
  user-side password change in this version; separate accounts are a next-version
  consideration. User identity is only the persistent anonymous cookie (FR-18/36);
  the per-user quota therefore travels with that cookie, and clearing it starts a
  fresh quota — accepted residual risk, backstopped by the global daily quotas, the
  per-minute provider limiter, and the auxiliary per-IP cap.
- Q: In what time window does the auxiliary per-IP cap apply? → A: Daily — sized by
  default at ~10× a single user's daily quota (configurable) so several testers
  behind one shared IP still fit, while cookie-clearing/incognito bypasses stay
  backstopped; per-minute bursts are handled by the provider limiter (FR-31).
- Q: What language do user-facing messages use? → A: English B1 — the owner
  decided on 2026-11-06 that version 1 supports ENGLISH ONLY, superseding the
  earlier Persian-error-message rule (FR-15 as amended; the constitution P16
  amendment is pending). The Retry / Continue with the free path / Use my own
  key buttons follow the same interface language.
- Q: How do streaming, fallback, and model unavailability interact? → A: GEN streams
  for text shown directly to the user; FAST and structured (JSON) outputs are
  one-shot. Fallback and retry happen only before the first streamed chunk. First-
  token timeout 20 seconds; inter-chunk silence timeout 15 seconds. A stream cut
  midway preserves the received text and offers continue/retry. A model answering a
  "not found" class error (e.g., 404 for a model name not yet on the endpoint) is
  marked unavailable for 10 minutes and goes straight to fallback.
- Q: What is the time budget per request? → A: GEN: 30 seconds per attempt, 60
  seconds overall deadline; FAST: 10 and 20 seconds. No new attempt starts after the
  deadline, and the gateway must always return its structured outcome before the
  hosting platform's hard request timeout (zero platform-timeout endings). The
  platform's function-time settings and compute mode are verified at planning.
- Q: When the global provider-per-minute limiter is full, are new requests rejected
  immediately or queued? → A: Queued briefly, with a time limit: a request waits up
  to ~5 seconds (configurable) for a free slot — the wait counts against its overall
  deadline — and is rejected with the "service busy" message (input
  preserved) only if no slot frees in time.

### Session 2026-11-07

(Decisions from the retired spec 005 clarify session — absorbed into §15.)

- Q: When the whole free chain fails (ALL_MODELS_FAILED) at an analysis stage,
  which behavior applies? → A: No-way-forward with Retry kept visible — the own-key
  path is offered prominently (automatic transfer when no key is saved), and the
  Retry button stays available next to it.
- Q: When and how does the provider connection check run, without slowing the first
  analysis? → A: A single content-free background check starts on the first screen
  after the gate ("What would you like to do today?"), runs once per session (plus
  explicit user-triggered re-checks), never blocks any navigation, and its result is
  consumed by the first analysis (with a short-cap fallback if the user gets there
  first). A visible status shows the truth at all times: checking, available
  (green), needs-retry, or unavailable with the own-key suggestion. Owner-approved
  exception to "provider contact only at analysis stages": this one connection
  check carries no user content.
- Q: After the user returns from the own-key settings to the stage where the failure
  happened, does the failed action retry automatically? → A: Yes, once — refined by
  the next answer: only after an explicit one-tap confirm.
- Q: Should the platform silently assume the saved key should be used for that
  retry? → A: No — on return the platform asks once, "Retry with your own key?";
  confirming runs the failed action once with the own key, dismissing leaves the
  user at the stage. The "use my key for analysis" preference is only auto-enabled
  along this failure path (menu-initiated settings visits never touch it).
- Owner decision (2026-11-07): the automatic transfer to the own-key settings is
  never a silent jump — a short explanation (why / where / promise of return) is
  shown first, and the transfer proceeds after a brief visible moment or a single
  tap, whichever comes first.
- Owner decision (2026-11-07): one persistent banner from the menu onward shows the
  active answering source, the connection state as a color (green / yellow / red),
  and switches the source in place.
- Owner decision (2026-11-07): the BYOK configuration becomes a fully independent
  "LLM settings" section with its own screens, reachable from everywhere.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reliable request routing with automatic fallback (Priority: P1)

Every model request in the application goes through one central gateway. Each request
declares its task category: **GEN** (heavy, high-quality generation, e.g., producing a
rewritten bullet) or **FAST** (lightweight, low-latency work, e.g., a quick check).
The gateway tries the category's primary model first; if that model fails, it works
through the category's fallback list in the configured order and returns the first
successful response. When a fallback succeeds, the user notices nothing — no action
is asked of them. The default experience is the free path, which needs no key at all
(FR-26); the optional user-key path is defined in FR-27–FR-29.

**Why this priority**: this is the reliability core of the feature. Without automatic
continuity from primary to fallback, every downstream behavior (clear failure
messages, limits, logging) has nothing reliable to attach to.

**Independent Test**: Can be fully tested by forcing the primary model to fail
(simulated) while a fallback works, then verifying the request still returns a usable
response and the log shows it came from the fallback model.

**Acceptance Scenarios**:

1. **Given** a category with a working primary model, **When** a task of that category
   runs, **Then** the response is produced by the primary model and the request log
   records that no fallback was used.
2. **Given** the primary model fails with a rate-limit error, server error, timeout,
   empty response, or invalid response, **When** the task runs, **Then** each fallback
   is tried in the configured order and the first success is returned; the log records
   that fallback was used and names the model that actually responded.
3. **Given** an invalid API key (configuration problem) or an invalid input (input
   problem), **When** the task runs, **Then** no fallback is attempted and the problem
   is reported as a configuration error or an input error respectively.

---

### User Story 2 - Clear end-state when every model fails (Priority: P2)

If the primary model and every fallback fail, the user is never left stranded: they
see one clear message (English B1) explaining that the service is temporarily unavailable,
together with a Retry button. The application does not crash, and the rest of the app
keeps working. The user's entered content is never lost; Retry starts the same task
again from the primary model onward without any retyping.

**Why this priority**: total failure is a realistic outcome during usability testing
windows (provider outages, exhausted quota). A silent hang or a crash here would
destroy tester trust; a clear message plus Retry keeps them in control.

**Independent Test**: Can be fully tested by forcing every model of a category to
fail, then verifying the error message and Retry button appear, the application
stays usable, and Retry re-attempts the task.

**Acceptance Scenarios**:

1. **Given** all models of the task's category fail, **When** the attempt ends,
   **Then** the user sees a clear error message (English B1) and a Retry button, and the
   application remains functional.
2. **Given** the all-failed state, **When** the user presses Retry, **Then** the same
   task is attempted again starting from the primary model, subject to the same usage
   limits.
3. **Given** any failure or rejection (all models failed or a limit reached), **When**
   the failure is shown, **Then** the user's entered content is unchanged on screen
   and still present after a page reload, and Retry resends it without retyping.

---

### User Story 3 - Usage limits enforced before any provider call (Priority: P2)

Daily request limits protect the shared setup during usability testing: a
**per-user daily limit** — keyed to each tester's anonymous persistent identity
(see FR-18) — and a
**global daily limit** across the entire application. Maximum input and output
lengths are enforced as well. When any limit is reached, a new request is refused
immediately — before contacting any provider — and the user sees a clear message
telling them which limit was reached and when it resets.

**Why this priority**: with one shared configuration serving ~10 testers, limits are
what prevent the service from silently dying mid-test. They must be airtight and
never waste a provider call once a limit is hit.

**Independent Test**: Can be fully tested by configuring a very small limit, exceeding
it, and verifying that further requests are refused without any provider call and
with a clear message.

**Acceptance Scenarios**:

1. **Given** a user's quota identity has reached its daily request limit, **When** the
   user starts a new request, **Then** it is rejected before any provider call and a
   clear message identifies the limit and its reset time.
2. **Given** the global daily limit has been reached, **When** any user starts a new
   request, **Then** it is rejected before any provider call with a clear
   message.
3. **Given** an input longer than the maximum allowed length, **When** the user
   submits it, **Then** it is rejected before any provider call with a clear
   message.
4. **Given** the free daily quota is exhausted, **When** the message is shown,
   **Then** it includes the reset time and an optional "use my own key" action;
   choosing it switches subsequent requests to the user's key, which do not consume
   the free quota.

---

### User Story 4 - Privacy-safe request logging (Priority: P2)

Every request is recorded in a local log with: timestamp, category (GEN/FAST), the
model that actually responded, whether fallback was used, input/output token counts,
response time, and final status. Logs never contain user prompt content or API keys.
These logs make the other stories verifiable (fallback provenance, pre-call
rejection) and keep the project's measurement practice intact.

**Why this priority**: logging is the evidence layer — the acceptance criteria for
fallback and limits are only provable through it, and the privacy rule (no prompt
content, no keys) is non-negotiable.

**Independent Test**: Can be fully tested by running a mix of successful, fallback,
and failed requests, then verifying every request has a complete log entry and an
automated scan finds no prompt content or keys anywhere in the logs.

**Acceptance Scenarios**:

1. **Given** any completed request (success, fallback success, or failure), **When**
   its log entry is inspected, **Then** all required fields are present and neither
   prompt content nor any key appears anywhere in the entry.

### Edge Cases

- What happens when the provider does not report token usage? The log records the
  count as unavailable — never a guessed number.
- What happens when a response exceeds the configured maximum output length? It is
  treated as an invalid response (a failure, so fallback may follow).
- What happens when configuration is missing or malformed (e.g., no key configured)?
  A configuration error is reported; no provider call and no fallback are made; the
  user sees the configuration-error message and the technical detail goes only to the
  local log for the operator.
- What happens when a category has no fallback models configured? The primary alone
  serves it; if the primary fails, the all-failed path (User Story 2) applies.
- What happens at day rollover? All daily counters reset together at 00:00 UTC (the
  fixed quota day, FR-19).
- What happens to requests already accepted before a limit was reached? They complete
  normally; only new requests are rejected.
- What if a tester clears cookies or browses incognito? Their anonymous identity —
  and its per-user quota — starts fresh: an accepted residual risk in this version;
  the global daily quotas, the per-minute provider limiter, and the auxiliary per-IP
  cap (FR-35) backstop it.
- What happens with a wrong gateway password? It is reported as a clear
  input error and no identity cookie is set (FR-36).
- What happens when the network drops or a response stream is interrupted midway?
  The input and any partially received content are preserved, and a single continue
  action resumes generation from the partial text (FR-32).
- What happens when the user's key hits its per-minute anti-spam cap? The request is
  rejected before any provider call with a clear message; the free quota is
  untouched.
- What happens when the global provider-per-minute limiter is full? The request
  waits briefly for a free slot; if none frees in time it is rejected with the busy
  message and the input is preserved (FR-31).
- What happens to already-saved user data (entries, bullets, drafts) when any LLM
  failure occurs? Nothing — it stays saved and accessible; model outcomes never
  touch user data (FR-25).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-01**: Every model request MUST declare exactly one task category: GEN (heavy,
  high-quality generation) or FAST (lightweight, low-latency).
- **FR-02**: Each category MUST have one primary model and an ordered list of
  fallback models, both configurable.
- **FR-03**: When the model in use fails, the system MUST try the next model in that
  category's configured fallback order and MUST return the first successful response.
  Fallback chains belong to the free path (FR-26); the user-key path has no fallback
  chain (FR-28).
- **FR-04**: A failure MUST be recognized as any of: rate-limit error, server error,
  timeout, empty response, or invalid response.
- **FR-05**: An invalid, missing, or malformed operator-side API key MUST be
  reported as a configuration error, and an invalid input MUST be reported as an
  input error; neither MUST trigger fallback. A failing user-supplied key follows
  FR-28 instead.
- **FR-06**: When all models of a category fail, the system MUST show the user a
  clear error message (English B1) and a Retry button, and MUST NOT crash.
- **FR-07**: Retry MUST re-attempt the same task beginning with the primary model,
  subject to the same usage limits.
- **FR-08**: Every request MUST be logged with: timestamp; category (GEN/FAST); the
  model that actually responded; whether fallback was used; input token count; output
  token count; response time; and final status (succeeded; failed after all models;
  rejected as configuration error; rejected as input error; rejected as limit).
- **FR-09**: Logs MUST NEVER contain user prompt content, API keys (including a
  user-supplied key), or authentication header values.
- **FR-10**: A per-user daily request limit MUST be enforced on new requests, per
  category (defaults: 15 GEN and 50 FAST per user per day), keyed to the user's quota
  identity (FR-18), never to the browser carrier alone. A daily quota unit is one
  user task: internal retries and fallback attempts within a task consume no extra
  daily quota — they count only against the per-minute provider limiter (FR-31).
- **FR-11**: A global daily request limit MUST be enforced across the entire
  application, per category (defaults: 250 GEN and 600 FAST per day).
- **FR-12**: Maximum input length and maximum response length MUST be enforced:
  over-length input is rejected before any provider call; an over-length response is
  treated as an invalid response. Defaults: input up to ~8,000 characters; response
  up to ~2,000 tokens for GEN and ~500 tokens for FAST. All values are configurable.
- **FR-13**: When any limit is reached, new requests MUST be rejected BEFORE any call
  to the provider, and the user MUST see a clear message identifying which limit was
  reached, when that limit resets (FR-19), and — for a free daily quota — an optional
  action to switch to the user's own key (FR-27).
- **FR-14**: The per-user daily limit, global daily limit, maximum input length,
  maximum output length, the BYOK per-minute cap, fallback order, and retry policy
  (attempts per model, timeout per attempt) MUST be configurable settings — never
  hardcoded.
- **FR-15**: All gateway user-facing error and limit messages MUST be in English
  B1, easy to understand, and free of technical details. (Owner decision
  2026-11-06: version 1 of the platform is ENGLISH-ONLY — this supersedes the
  earlier Persian rule recorded from constitution P16; a Persian UI is deferred
  to a later version and the constitution amendment is pending.)
- **FR-16**: The gateway MUST be the only component allowed to contact a model
  provider; no other component may connect directly (constitution P12).
- **FR-17**: Model names, base URLs, and API keys MUST be read exclusively from
  configuration (environment settings) and never hardcoded; API keys MUST never
  appear in client-side code, logs, specs, or plans (constitution P13/P14).
- **FR-18**: Usage limits MUST work without user accounts via a lightweight quota
  identity: a persistent pseudonymous browser identifier carried in a signed, httpOnly,
  long-lived (~30-day) cookie containing no sensitive data. Access is gated once by a
  single shared gateway password (FR-36); there are no individual codes, accounts, or
  registration in this version.
- **FR-19**: All daily counters MUST share one fixed quota-day definition: the
  calendar day in UTC (fixed timezone, no daylight saving), resetting at 00:00 UTC.
  The limit-reached message MUST show the reset time in UTC.
- **FR-20**: The user's in-progress input MUST be persisted durably before it is sent
  to the gateway (saved locally in the browser as the user works) and MUST be cleared
  only after a fully successful response.
- **FR-21**: In every failure or rejection mode — all models failed, any limit
  reached, rate limit, timeout, network interruption, interrupted response stream, or
  invalid key/configuration error — the user's input MUST remain intact on screen, any
  partially received stream content MUST be preserved, and a recovery action MUST be
  available without retyping — Retry for most modes, and for a stream cut midway the
  single continue action of FR-32. This guarantee covers both the free path and the
  user-key path.
- **FR-22**: Refreshing the page or closing and reopening the browser MUST recover
  the saved draft.
- **FR-23**: The gateway MUST never surface an unhandled crash to the user interface;
  it MUST always return a structured outcome stating success, the failure reason,
  whether retry is possible, the suggested wait before retrying, and the source of
  the response. The user interface MUST include a top-level error guard so that no
  error can clear user state or the draft.
- **FR-24**: The user's API key MUST never be stored together with the draft; the two
  MUST live in separate storage.
- **FR-25**: User data MUST never depend on LLM success: all user data (entries,
  bullets, answers, drafts, history) MUST be saved and remain accessible
  independently of any model request outcome. An LLM failure MUST never cause data
  loss, corruption, or blocked access to already-saved data; model outcomes affect
  only the model-dependent feature result, never the user's data.
- **FR-26**: The default path MUST be the free path: the user works without entering
  any key, using the free model combo whose provider key (NVIDIA) is held only
  server-side by the operator. Every existing quota and limiter (per-user daily,
  global daily, maximum input/output lengths) MUST apply to this path.
- **FR-27**: Bringing one's own key MUST be optional and live in a clearly separated
  "advanced settings" area. Requests made with the user's key MUST NOT consume the
  free daily quotas (per-user or global) and MUST instead be subject to their own
  anti-spam cap per minute (default: 10 requests per minute per user). This version
  MUST support exactly one BYOK provider: OpenRouter.
- **FR-28**: A failed user-key request (any failure on the user-key path — for
  example an invalid key or a provider-side rate limit) MUST NOT automatically fall
  back to the free path. It MUST show a dedicated message (English B1), and switching to
  the free path MUST happen only after the user explicitly confirms.
- **FR-29**: The user's key MUST be used only for the request it was entered with; it
  MUST never be stored (in logs, database, or browser storage), never displayed, and
  never included in any error message.
- **FR-30**: The free path MUST additionally enforce a per-user per-minute cap
  (default: 3 requests per minute).
- **FR-31**: The free path MUST enforce a global provider-per-minute limiter
  (default: 30 calls per minute — a safety margin under the provider key's total
  capacity of roughly 40). Every actual provider call on this path — including
  retries and fallback attempts — MUST pass through and be counted by this limiter;
  while it is full, no new provider call is started. A request arriving while the
  limiter is full MUST wait in a short queue (default: ~5 seconds, configurable) —
  this wait counts against the request's overall deadline (FR-34); if a slot frees
  within the wait, the request proceeds, otherwise it is rejected with the
  "service busy" message and the user's input is preserved.
- **FR-32**: GEN responses whose text is shown directly to the user MUST stream
  progressively; FAST responses and structured (JSON) outputs MUST be delivered
  one-shot. Model fallback and retry MUST happen only before the first streamed
  chunk. A first-token timeout (default: 20 seconds) and an inter-chunk silence
  timeout (default: 15 seconds) MUST apply; a stream interrupted midway MUST
  preserve the received text and MUST offer a single "continue" action that resumes
  generation from the preserved partial text — the already-displayed text stays on
  screen and the continuation appends to it. The continuation is a new request
  subject to the same limits.
- **FR-33**: A model that answers with a "model not found" class error (for example
  a 404 for a model name not yet available on the endpoint) MUST go straight to the
  next fallback. (The 10-minute unavailability marking and its cache are deferred to
  the next version by product decision 2026-11-06.)
- **FR-34**: Each attempt MUST respect a per-attempt timeout (defaults: GEN 30
  seconds, FAST 10 seconds) and the overall request MUST respect a deadline
  (defaults: GEN 60 seconds, FAST 20 seconds); once the deadline passes, no further
  attempt MUST be started. Every request MUST conclude with the gateway's structured
  outcome before the hosting platform's hard request timeout — zero requests may end
  in a platform timeout error (such as a 504 function-invocation timeout). The
  platform's function-time settings and compute mode are verified at planning time.
- **FR-35**: (Deferred to the next version by product decision 2026-11-06: v1 ships
  no per-IP cap on the main path — only the 5/min/IP login-attempt limiter (FR-36)
  and the provider limiter (FR-31).) When introduced, the auxiliary per-IP cap MUST
  be separate and higher than the per-user caps, taken only from the server
  platform's request metadata (never client-supplied values), applied as a daily cap
  (default: ~10× a single user's daily quota, configurable) so it backstops
  cookie-clearing and incognito bypasses; finer-grained per-minute protection comes
  from the provider limiter (FR-31).
- **FR-36**: First-time access during usability testing is gated by a single shared
  password for all testers — a shared entry gate only. The password MUST be read only
  from server-side environment configuration (constitution P13), MUST never be logged
  or displayed, and there MUST be no user accounts, registration, or user-side
  password change in this version. On success the server sets the signed, httpOnly,
  persistent identity cookie (FR-18); a wrong password yields a clear input
  error and sets no cookie. Rotating the password or the cookie-signing secret is
  done only by changing environment configuration and redeploying; rotating the
  signing secret invalidates all existing cookies, so every tester re-enters the
  password. If the password leaks, both are rotated.

### Key Entities *(include if feature involves data)*

- **Task Category (GEN / FAST)**: the classification every model request carries; it
  determines which model chain and retry policy apply.
- **Model Chain**: per category — one primary model plus an ordered fallback list;
  fully configurable.
- **Gateway Settings**: the configurable usage limits (per-user daily per category,
  global daily per category, per-user and global per-minute caps, maximum input
  length, maximum response length) and retry policy (attempts per model, timeout per
  attempt); changeable without code changes.
- **Request Log Entry**: one append-only local record per request with the fields
  listed in FR-08; never contains prompt content or keys.
- **Quota Identity**: the persistent anonymous browser identity (signed, httpOnly,
  ~30-day cookie) granted after the shared gateway password is accepted (FR-18/36).
  It keys the per-user counters; there are no individual identities in this version.
- **Usage Counter**: the per-user daily (per category) and global daily (per
  category) request counts, plus the per-minute provider-call limiter; keyed to the
  quota identity and the fixed UTC quota day (FR-19).
- **Request Outcome**: the final status of a request, using the status values listed
  in FR-08.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Under simulated failure of the primary model — separately for each
  failure type (rate limit, server error, timeout, empty response, invalid response)
  — 100% of test requests still return a usable response through a fallback, and
  every corresponding log entry names the model that responded.
- **SC-002**: When all models fail (simulated), 100% of cases show the error
  message and the Retry button, and the application remains fully usable (no crash)
  across repeated attempts.
- **SC-003**: Once any limit is reached, 100% of new requests are rejected with zero
  calls to the provider (verified via the request logs).
- **SC-004**: 100% of completed requests produce a log entry containing every
  required field; an automated scan of all logs finds zero occurrences of prompt
  content or keys.
- **SC-005**: In usability testing (~10 testers), testers can tell from the
  message alone whether the situation is temporary (they can retry) or a limit they
  reached — without needing a technical explanation.
- **SC-006**: For every failure or rejection mode listed in FR-21, the user's input
  is unchanged after the error and still present after a page reload in 100% of test
  runs, and Retry resends it without retyping.
- **SC-007**: After any LLM failure, rejection, or crash, 100% of previously saved
  user data remains intact and accessible — zero data-loss incidents attributable to
  model outcomes in all test runs.
- **SC-008**: When a user-key request fails, the free path is invoked automatically
  in 0% of cases; the dedicated message appears every time, and the switch to
  the free path occurs only after explicit user confirmation.
- **SC-009**: 100% of requests conclude with the gateway's own structured outcome;
  zero requests end in the hosting platform's timeout error across all test runs.
- **SC-010**: For GEN, text responses stream progressively to the user, and model
  switching never occurs after the first displayed chunk (0 occurrences in test
  runs).

## Out of Scope

- Full authentication.
- Payments and usage plans.
- Cost dashboard.
- Additional BYOK providers (exactly one — OpenRouter — in this version).
- Separate user accounts, registration, and user-side password management (deferred
  to a later version).

## Assumptions

- Limit defaults are recorded in the requirements (FR-10/11/12/27/30/31) and remain
  env-configurable; the model chains (primary + fallback order) are fixed at planning
  time, informed by the application's current default model configuration.
- The hosting platform's function-time settings and compute mode are verified at
  planning time (per FR-34).
- Testers share one gateway password (env-only, FR-36) as the entry gate; identity is
  the persistent anonymous cookie (FR-18) — a lightweight quota identity, not a login;
  full authentication and separate accounts remain out of scope.
- A task counts as one daily-quota unit once it reaches its first provider call;
  requests rejected before any provider call (limit, input, configuration) consume
  nothing, and internal retries and fallback attempts add no extra units (confirmed
  2026-11-06).
- Draft persistence is browser-local this round (the app has no accounts or server
  database); if server-side persistence is introduced later, it must keep the same
  guarantee.
- All interface text — including error and limit messages — is English B1
  (owner decision 2026-11-06: version 1 is English-only; see FR-15).
- Model access has two paths: the free path (operator key, server-side only) and the
  optional user-key path (BYOK — user-entered, used for that request only, never
  persisted). The legacy client-side BYOK flow (key kept in browser storage) is
  replaced by this design, resolving the direction of the constitution v3.3.0
  compliance flag.
- Logs are stored locally on the device; nothing is shipped to external services
  (constitution data policy).
- Sizing assumes approximately 10 concurrent usability testers; all sizes are
  configurable.

## Platform Rules Inherited (Constitution v3.3.0)

Per constitution P11, this spec inherits and MUST comply with:

- **P12** gateway-only provider access — this feature is the implementation of it.
- **P13** model name / base URL / API key read exclusively from environment
  configuration; nothing hardcoded.
- **P14** no keys or secrets in client-side code, logs, specs, or plans; no sensitive
  variable uses a public client-exposed prefix.
- **P13/P14 bounded exception (recorded 2026-11-06)**: the optional user-supplied key
  (BYOK) is entered by the user, used for that single request, and never persisted or
  displayed (FR-29); all operator-side keys remain strictly server-side and
  environment-only. Registering this exception explicitly in the constitution is a
  pending follow-up decision for the product owner.
- **P15** automated test coverage for every error path (rate limit, server error,
  timeout, malformed response).
- **P16** user-facing error messages simple and jargon-free — English B1 in v1
    (owner decision 2026-11-06 supersedes the Persian rule for v1; the
    constitution amendment is pending).
- **P17** all new code is TypeScript with strict mode (web edition).
- Standing quality gates (test:engine, tsc, build) and the §11 warm theme & voice for
  any new interface elements (error banner, Retry button).
- Data stays local (P8); logs never leave the device.
- The terminal edition is frozen: this feature applies to the web edition only.

## §13 Gateway Operational Additions (amended 2026-11-06, owner brief)

### FR-37 — Model-ID validation

*(Superseded 2026-11-07, §15 FR-45/46: the server-startup trigger is REMOVED —
validation runs through the content-free check route `POST /api/llm/check` and
the operator CLI; `npm run check:models` stays unchanged.)*

- At server startup AND via `npm run check:models` (scripts/check-models.ts), the
  gateway fetches the provider model list from GET {NVIDIA_BASE_URL}/models and
  compares every configured ID (GEN_MODEL, GEN_FALLBACKS, FAST_MODEL,
  FAST_FALLBACKS) against it.
- An ID missing from the list produces a clear warning naming the env variable and
  the ID; the application is NOT halted.
- If NO valid model remains for a category, a clear error is emitted (logged; the
  app keeps running — affected requests fail with the typed CONFIG_ERROR path).
- If the /models fetch itself fails, validation is skipped with a clear warning
  (indeterminate, not an error).
- Validation output is operator-facing (server logs / script output, English) —
  FR-15 (user-facing UI text) is unaffected.

### FR-38 — Mock mode (dev-only)

- When LLM_MOCK=true, the gateway returns fixed responses instead of calling the
  provider. The flag is IGNORED when the environment is production (a warning is
  logged if it is set there).
- With mock mode on, a dev-only request parameter (header `x-mock-error`) selects
  the simulated outcome: 429, 5xx, timeout, 403 served as an HTML body, or an
  empty response. Simulations traverse the real failure taxonomy, limits, and
  logging.
- With no scenario selected, mock mode returns a fixed successful response
  (one-shot text; streamed chunks for GEN).
- Live/manual error checking uses this mode (quickstart scenarios).

Assumption: validation and mock notices are operator-facing logs in English —
server-side, not user-facing UI text (FR-15 unaffected).

## §14 Audit Remediation (2026-11-07, owner audit brief)

Six-item audit of the gateway; per item the current code was assessed, gaps fixed,
and tests written. Standing contracts unchanged: typed results, fatal 400/401/403,
404 -> straight fallback, no hardcoded model names or keys.

### FR-39 — Chain pruning and per-run validity (extends FR-37)

- Model-ID validation now PRUNES the chains of the run: IDs missing from the
  provider list, and IDs matching forbidden patterns (FR-40), are REMOVED from the
  chain used by requests, each with a loud warning naming the env variable.
- If a category retains no valid model, a clear error is logged AND requests for
  that category fail with the typed CONFIG_ERROR result (never a crash).
- If the /models fetch fails (network, 403 HTML), validation is skipped with a
  warning and the env chains are used AS-IS (previous behavior preserved).

### FR-40 — Non-chat models excluded

- A configurable forbidden-pattern list (default: embed, safety-guard,
  content-safety, reward, parse) excludes non-chat models from every chain during
  validation, each with a loud warning. Excluded IDs are never called.

### FR-41 — Oversized model warning on the FAST chain

- A name-based size heuristic (largest "NNNb" token; unknown sizes tolerated
  without error) warns when a FAST-chain ID appears to be >= a configurable
  parameter threshold (default ~200B). Warning only — the model is NOT removed.
- Emitted at startup and in check:models.

### FR-42 — Empty-200 classification and reasoning models on FAST

- A 200 response with EMPTY content is classified retryable and logged with the
  distinct marker empty_response (it typically means the model spent max_tokens
  reasoning).
- A configurable reasoning-pattern list (default: gpt-oss, reasoning) warns when a
  FAST-chain ID matches, and a higher, env-configurable max token budget is applied
  to those models on the FAST path.

### FR-43 — Fallback transparency

- The gateway result ALWAYS carries modelUsed, usedFallback and fallbackDepth
  (index of the responding model in the chain); the request log carries
  fallbackDepth as well.
- When usedFallback=true the UI shows a small, non-intrusive notice that the
  answer came from a fallback model, so usability-test results are not misread.
  Interface language: English B1 (constitution v4.0.0 P16).

### FR-44 — Provider-call cap and shared-limit handling on 429

- Every real provider call (retry and fallback) passes the global limiter
  (already implemented; now tested).
- A configurable cap on provider calls per user request (default 4) bounds the
  chain: with persistent 429s across models, once the cap or the deadline is
  reached the typed RATE_LIMITED result (with retryAfter) is returned and the
  user's input is preserved. No unbounded loop is possible.
- After a 429 with Retry-After, the same delay is applied BEFORE the next model is
  called (shared-limit assumption: fallback may not help immediately).
- NEW dev-only script scripts/probe-rate-limit.ts (slow, report-only, excluded
  from automated tests) probes whether the provider's ~40 rpm cap is per-model or
  shared across models.

Assumption: audit warnings/errors are operator-facing logs in English (server-side;
FR-15 unaffected).

## §15 Error Honesty, Connection Check & LLM Settings Section (2026-11-07, owner brief; absorbs retired spec 005)

Provenance: on the live Vercel deployment a gate configuration failure was shown
to testers with the AI-outage text ("The AI service is unavailable...") at the
access-code screen — no AI was involved; and the §13 startup validation contacts
the provider during cold start, so the first page load can stall for seconds and
provider contact happens outside analysis stages. The owner brief (2026-11-07)
adds honest error UX, a visible connection check, and an independent LLM settings
section. Owner decision: spec 004 is the PRIMARY spec for everything
model-related, including this web experience — the separate spec 005 is retired
and absorbed here. Scope: web prototype only (terminal flow stays frozen).
All user-facing texts: English B1 (P16); technical detail stays in server logs
(P19). The user's data is never lost by any flow below (P18, FR-22 stays).

### FR-45 — Provider contact only at analysis stages (one approved exception)

- Zero provider contact during entry-page load and access-code submission; the
  page renders without waiting for any provider call. The §13 startup validation
  NO LONGER runs in the page-entry/server-start path (FR-46 replaces its trigger).
- Exactly ONE content-free connection check per session may run in the
  background, starting on the first screen after the gate ("What would you like
  to do today?") — it carries no user data — plus explicit user-triggered
  re-checks. Owner-approved exception (clarify 2026-11-07).
- All remaining provider contact happens only when the user triggers an analysis
  action (scoring, generation, matching).

### FR-46 — Connection check: endpoint, caching, consumption

- A typed, content-free check endpoint performs the §13/§14 validation (pruned
  chains) and returns reachability + state; it never returns HTML or user data.
- The result is cached per server instance (reuses the applied-chains store);
  the client runs it once per session from the menu screen and on explicit
  re-checks ("Check again").
- The first analysis action consumes the cached result; if the check has not
  finished, the action proceeds with a short capped wait or the raw env chains
  (§14 skip behavior) — never a long stall.
- A check that reports available is a status hint, never a guarantee: analysis
  failures still surface typed at the analysis point.

### FR-47 — Gate error messages separated (no false AI outage)

- A broken gate configuration shows a gate-specific message ("the service is not
  available right now, please try again later") — NEVER AI wording, no variable
  names, status codes, or model names (named cause stays in the server log,
  FR-23/P19).
- A wrong access code keeps its existing distinct message.

### FR-48 — Failure-class taxonomy (single source for the UI)

- Every GatewayReason maps to exactly one class: TRANSIENT (SERVICE_BUSY,
  MINUTE_LIMIT, RATE_LIMITED), NO-WAY-FORWARD (QUOTA_USER, QUOTA_GLOBAL,
  ALL_MODELS_FAILED, CONFIG_ERROR), BROWSER-UNREACHABLE (client-side NETWORK /
  page-load failure), OWN-KEY (BYOK_FAILED, BYOK_LIMIT). INVALID_INPUT,
  INVALID_TASK, UNAUTHORIZED keep their own handling (no class redirect).
- ALL_MODELS_FAILED is no-way-forward WITH the Retry button kept visible (the
  gateway has already tried every model before showing it).
- This mapping is the single source the UI consumes for messages, guidance, and
  available actions.

### FR-49 — Guidance box at the failing stage

- Every AI failure at an analysis stage shows an in-page guidance box at that
  same stage (never console-only, never a dead-end text alone), content matched
  to the class: wait-and-retry for transient (Retry stays primary); own-key path
  for no-way-forward; check-internet/VPN advice ONLY for browser-unreachable;
  fix-key advice for own-key failures (with the free-path retry option visible —
  the user is never trapped between two dead ends).
- VPN wording NEVER appears for server-side AI failures (a user-side VPN does
  not affect the server-to-provider link); only when the browser-to-platform
  link fails.
- Texts: English B1, no status codes, model names, variable names, or file
  paths; exact wording drafted at planning, owner-reviewed.

### FR-50 — No-way-forward transfer with advance explanation

- The transfer to the LLM settings section (FR-54) is preceded by a short
  explanation — why the free path cannot continue, where the user is going, and
  that they will return to the same stage — then proceeds after a brief visible
  moment or a single tap, whichever comes first. Never a silent jump.
- The origin stage is remembered. If a working key is already saved, the
  platform offers using it immediately instead of a pointless transfer.

### FR-51 — Return + one-tap retry (failure path only)

- After saving a key in a failure-initiated settings visit: return to the exact
  origin stage with input intact and ask once, "Retry with your own key?" —
  confirming runs the failed action once with the own key; dismissing leaves the
  user at the stage. Cancelling the settings without saving returns with no ask.
- Along this failure path only, saving a key also enables the use-for-analysis
  preference; menu-initiated visits never change it. Every other retry in the
  platform remains an explicit user action.

### FR-52 — Connection status: four truthful states, never blocking

- From the menu onward the connection state shows as one of: checking,
  available (green), needs-retry (yellow, with Check again), unavailable (red,
  with the own-key suggestion). Truthful to the check's and the last analysis
  result's state at all times.
- The check NEVER disables, delays, or hides any navigation control; status
  changes never interrupt the current screen. No "why is Next stuck?" state can
  exist.

### FR-53 — Persistent model banner (upgrade of the existing ModelBanner)

- One banner at the top of every screen from the menu onward: the active
  answering source ("Free service" or "Your key: MODEL") plus the connection
  color state (FR-52).
- In-place switch without leaving the screen: use your key (when a key is
  saved), use the free service, open model settings. A switch takes effect for
  the next analysis action with no reload and no loss of place; choosing the
  own key without a saved key leads to the settings with the origin remembered.
- Switching is never blocked by status; the banner keeps reporting the free
  path's state truthfully even while the own key is selected. Selecting a
  broken path is allowed — the honest failure appears at the point of action.

### FR-54 — LLM settings: BYOK as a fully independent settings section

- A self-contained "LLM settings" section with its own screens: key management
  (save / replace / clear), model choice, use-for-analysis preference, and the
  connection status display with Check again.
- Reachable from everywhere: the menu (as today), the banner (FR-53), and the
  failure transfers (FR-50).
- Entering and leaving NEVER disturbs flow state or drafts; a menu-initiated
  visit returns to the menu (today's behavior); only a failure-initiated visit
  returns to the origin stage (FR-51).
- Standing contracts unchanged: single BYOK provider (OpenRouter, FR-27), key
  per-request and never persisted server-side (FR-29), P14.

### FR-55 — BYOK servable without free-path configuration (preflight decoupling)

- Preflight MUST NOT require the free-path provider configuration for BYOK
  requests: with NVIDIA credentials missing or broken, a valid own-key request
  still succeeds; a no-key request returns the typed CONFIG_ERROR with the
  no-way-forward guidance (FR-49) — never a crash, a hang, or an empty body.
- Limits, deadlines, and privacy-safe logging behave identically for both paths.

### §15 Entities introduced

- Failure class: transient / no-way-forward / browser-unreachable / own-key —
  decides message, guidance, and available actions (FR-48).
- Origin stage: the screen and in-progress state a user came from when the
  settings were opened from a failure; remembered until save/cancel, then
  restored (FR-50/51).
- Guidance box: in-page error + class-matched advice + actions (FR-49).
- Connection check: the one content-free background request per session plus
  re-checks; cached per server instance (FR-46).
- Connection status state: checking / available / needs-retry / unavailable,
  shown as the banner's color state (FR-52/53).
- LLM settings section: the independent BYOK settings area (FR-54).

### §15 Measurable outcomes

- SC-011: Cold server + unreachable provider -> entry page renders and the
  access code passes with ZERO provider requests logged; exactly one
  content-free connection check appears from the menu screen onward.
- SC-012: First page load shows no multi-second stall attributable to provider
  checks (the previous cold-start wait is gone).
- SC-013: For every failure class, the guidance box appears at the failing
  stage in 100% of covered test scenarios; zero VPN wording in server-side AI
  failure texts.
- SC-014: From a forced no-way-forward failure, the guided journey (advance
  explanation -> settings -> save -> return -> one-tap retry) completes on the
  same stage with input intact and succeeds with the saved key.
- SC-015: With free-path credentials removed, an own-key analysis request
  succeeds and a no-key request returns the typed guidance failure (no crash,
  no empty response).
- SC-016: Zero occurrences of AI wording in gate-stage error texts; all new
  texts pass the simple-English review.
- SC-017: The status reaches a final state within a typical menu visit; the
  checking state makes any remaining wait self-explanatory.
- SC-018: Navigation completes immediately regardless of check state — zero
  blocked or delayed Next/continue controls in covered scenarios.
- SC-019: The banner reflects a state change within one screen update, and an
  in-place source switch applies to the next analysis action in 100% of
  covered scenarios without reload or loss of place.

Assumptions (§15): the automatic-transfer (no-way-forward) vs side-by-side-offer
(transient) split is a deliberate owner decision (2026-11-07); web-prototype
only — the terminal flow is frozen and untouched; exact B1 texts are drafted at
planning and owner-reviewed before implementation; the owner-approved
connection-check exception to "provider contact only at analysis stages" is
recorded in the 2026-11-07 clarify session.

## §16 Diagnostics, Live Smoke Test & BYOK Quick Access (2026-11-07, owner fix brief)

Owner brief after the §15 live session (post the .env.local incident). ALL
changes are additive — no existing feature is removed or rewritten without
an explicit owner decision (standing rule, owner brief 2026-11-07). Two
standing rules recorded verbatim from the brief: (1) NEVER edit or append
to `.env.local` — propose changes as a diff; (2) do not delete features
that were built earlier — ask first.

### FR-56 — Failure logging contract (server terminal)

- EVERY LLM failure attempt is logged to the server terminal with: model id,
  HTTP status (when present), error class (retryable/not_found/fatal/timeout/
  empty_response/malformed/network), the provider error BODY truncated
  (~300 chars), the attempt number within the request, and whether fallback
  was used.
- NEVER logged: API keys, resume/user text, cookie secrets (P14, FR-08/09 —
  the existing JSONL redaction contract is unchanged and stays the audit
  record; this FR adds the human-readable terminal line).
- The final gateway outcome keeps its existing one-line summary log.

### FR-57 — Dev browser-console failure logging

- In development ONLY (never production), the browser logs the same
  sanitized failure summary to the console: failure class, reason code,
  responding model (when present), attempt results — no keys, no user text.
- Production browsers log nothing beyond the existing UI surfaces.

### FR-58 — Startup configuration echo + duplicate warning

- At server startup the resolved GEN and FAST chain IDs (primary +
  fallbacks) are logged to the server terminal — model ids only, NEVER keys.
  This is a config echo, NOT a provider contact (FR-45's zero-contact rule
  is unaffected: no fetch happens at startup).
- In development, the startup also reads `.env.local` and WARNS with LINE
  NUMBERS when any variable is defined more than once (the 2026-11-07
  incident guard, now at startup where the operator actually looks).

### FR-59 — Live smoke test (`npm run test:live`)

- NEW operator command: sends a 1-token chat completion to EVERY configured
  chain model (GEN primary + fallbacks, FAST primary + fallbacks) using the
  real `.env.local`, and prints a per-model OK/FAIL table with HTTP status
  and the (truncated) error body on failure.
- Manual, live-key tool like check:connection — NEVER part of the automated
  test suite; may consume a tiny amount of the account's quota.

### FR-60 — check:connection upgraded to a live smoke test

- `npm run check:connection` keeps its timings + list-membership report and
  ADDS the FR-59 per-model 1-token smoke for the configured chains, so one
  command answers both "is the network up?" and "is every configured model
  actually servable?".

### FR-61 — BYOK quick access from every page

- A visible "Use my own API key" entry lives in the TOP BAR/HEADER on every
  page (the §15 banner becomes the persistent header element, shown on ALL
  screens including the gate and welcome screens), plus the existing main
  menu item — BYOK is reachable everywhere, not only via the settings page.
- The header shows the ACTIVE SOURCE at all times with the labels
  "Default free" or "My key" (supersedes the §15 labels "Free service" /
  "Your key" for the header display; the in-place source switching and
  status colors of FR-52/53 are unchanged).
- NEW quick path: a small panel/modal opened from the header — paste key,
  choose model, save, done — without navigating to the full settings page
  (which keeps its place for advanced use: status card, clearing, details).
- BYOK stays fully independent of the NVIDIA default configuration (FR-55
  decoupling unchanged; the quick save keeps the key memory-only per FR-29).

### FR-62 — BYOK failure: explicit resend with the default combo

- When the user's own model fails, the UI shows the error AND a button to
  RESEND that same request with the default free combo — per request only,
  never an automatic fallback (extends FR-28/§15's own-key guidance; the
  button is labeled as an explicit resend of the failed request).

### §16 Measurable outcomes

- SC-020: 100% of failure attempts produce a terminal line carrying all six
  FR-56 fields; a redaction guard test proves no key/resume text can appear.
- SC-021: dev browser console shows the sanitized failure summary; the
  production build logs nothing extra (guard-tested via build mode).
- SC-022: startup log lists every resolved chain ID and zero keys; a planted
  duplicate variable produces a startup warning WITH line numbers.
- SC-023: `npm run test:live` prints one OK/FAIL row per configured model;
  `check:connection` includes the same per-model smoke.
- SC-024: from EVERY page the BYOK quick modal is reachable in one click,
  saves a key + model without leaving the page, and the header always shows
  "Default free" or "My key".
- SC-025: after a BYOK failure, the resend-with-default button retries the
  exact failed request on the free path in 100% of covered scenarios; zero
  automatic fallbacks (SC-008 unchanged).

Assumptions (§16): terminal-only logging addition — the JSONL request log
contract is untouched; "startup" echo runs in dev and production (ids only);
`test:live`/`check:connection` smoke are operator-run (manual, real key);
the §15 once-per-session menu check and banner status colors are unchanged;
label supersession (Free service/Your key → Default free/My key) is
owner-mandated wording for the header display.

### FR-63 — Active BYOK provider display: Google AI Studio (owner decision 2026-11-07)

- The BYOK surfaces (quick modal, settings page, key hints) present EXACTLY
  ONE provider for now: **Google AI Studio**; the gateway BYOK path targets
  Google AI Studio's OpenAI-compatible endpoint
  (https://generativelanguage.googleapis.com/v1beta/openai, Bearer key).
- The other registry providers (OpenRouter, Ollama, Groq, …) are HIDDEN from
  the UI — NOT deleted; re-activating one is a config-level change.
  (Supersedes the FR-27 OpenRouter-only DISPLAY; the single-active-provider
  rule itself is unchanged.)
- The key stays memory-only per FR-29; P14 unchanged; BYOK independence from
  the NVIDIA config (FR-55) unchanged.

### §16.1 — Approved cleanup S1 (owner: "S1 + S2 اجرا کن؛ S3/S4 نه؛ هیچ حذف دیگری")

- DELETE the leftover temp file `web/probe-phase18.tmp.ts` (untracked, zero
  references).
- Add `/node_modules/` to the ROOT .gitignore and unstage the staged junk
  (vitest/npx cache at repo root).
- NOTHING else is deleted: S3 (legacy byok stack) and S4 (GEN route) are
  explicitly NOT approved; every other file/feature stays.

### FR-64 — Client check resilience: timeout + auto-recovery (owner decision 2026-11-07, "A+B")

- **A — client timeout:** the browser's check request to `/api/llm/check`
  MUST carry a 20-second abort signal; a timeout is treated exactly like a
  failed check (needs-retry, then unavailable on repetition) — the client
  can never hang on "Checking…" because the request never resolves.
- **B — auto-recovery:** a SAVED status is restored without a provider
  contact ONLY when it is "available"; when the last known status is
  needs-retry or unavailable (or there is no saved status), the menu mount
  runs ONE fresh check per page load, so the banner recovers by itself when
  the network returns. This amends the §15 once-per-session rule exactly to
  this extent (owner-approved; the §15 content-free exception unchanged).
- Server side unchanged: the 15-second provider abort (§15) already bounds
  every server response.

Assumption: the per-load auto-check when unhealthy adds at most one
content-free request per page load during outages — accepted by the owner
explicitly (option B).
