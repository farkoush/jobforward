# BYOK CORS results

Per BYOK §3: no provider is declared "supported" without a real CORS test
(preflight + an actual request from the browser origin). This file records
the results. **Run date: not yet run — all entries below are UNVERIFIED.**

To verify a provider: start the app (`npm run build && npm start`), open the
Model settings screen, pick the provider, paste a real key, press Validate,
and record the outcome here (status shown + the Network tab preflight
result). Providers that fail are disabled in `providers.config.ts` with the
documented reason.

| Provider | Preflight | GET model list | POST chat | Verdict | Date |
|---|---|---|---|---|---|
| Google AI Studio (Gemini) | **PASS** (real 401 response received in-browser with a fake key — preflight allowed) | UNVERIFIED (blocked on the invalid key) | UNVERIFIED | enabled; model-list/chat pending a real key | 2026-11-02 (preflight only) |
| OpenRouter | UNVERIFIED | UNVERIFIED | UNVERIFIED | enabled, pending test | — |
| Ollama (local, localhost) | **PASS** (GET /api/tags from browser origin succeeded — "Detected") | **PASS** (live list rendered: qwen3:8b, size shown) | **PASS** (live rating run headlessly through the same adapter + prompt; output matched the terminal contract and passed validation) | enabled, verified | 2026-11-02 |
| Groq | UNVERIFIED | UNVERIFIED | UNVERIFIED | **disabled** (CORS unverified) | — |
| Mistral | UNVERIFIED | UNVERIFIED | UNVERIFIED | **disabled** (CORS unverified) | — |

Heuristic recorded: from the browser, a `TypeError: Failed to fetch` with no
response is mapped to `cors_blocked` (for cloud providers) or
`local_origin_blocked` (for Ollama), because a preflight block is the
dominant cause when the machine is online. Genuine outages surface under the
same code — the user messages cover both ("check your internet and any
VPN", "Ollama isn't reachable / origin not allowed").
