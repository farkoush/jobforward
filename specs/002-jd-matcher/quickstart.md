# Quickstart: JD Matcher — model-driven analysis (web only; v3)

Validation and run guide for the v3 contract (`contracts/matcher-pipeline-v2.md`,
rules version `matcher-rules-2.1.0`). Web surface only — the terminal flow
is untouched and keeps v1. Full implementation detail lives in
data-model.md and the contract; this file is only the run/validate path.

## Prerequisites

- Repository root `E:\_ai_projects\jobforward`; dev server pinned to port
  3100: `npm run dev` in `web/`
- A working model chain for the default free service, or a BYOK key
  configured in the LLM settings screen (004 §16) — the JD analysis is a
  model step and follows the same banner/status rules as scoring
- The 56-skill taxonomy is build-bundled (FIX-1) — no runtime file needed
- Few-shot bank: `specs/002-jd-matcher/few-shot/EX-Jxxx.json` (owner
  source of truth, imported directly — no sync, no drift). Today the
  bank has zero `status: final` examples (EX-J001 is `draft`), so the
  prompt ships with NO few-shot block (SC-010)
- Mock mode (`LLM_MOCK`, 004 §13) for offline contract testing

## Static gates

```bash
cd web
npm run test:engine    # engine tests incl. the v3 validator + taxonomy + few-shot + pipeline tests
npm run test:byok      # BYOK paths (prompt surface shared with the gateway)
npm run test:llm       # gateway tests (incl. the matcher_analysis task registration)
npx tsc --noEmit && npm run build
node scripts/parity.mjs   # v1 matcher parity must stay green (terminal untouched)
cd ../terminal && python -m pytest   # unchanged, must stay green
```

## Validation scenarios

1. **Happy path (default free chain).** Open the app, paste a full English
   posting at the JD step, confirm the review gate (cleaning report + word
   count), then confirm analysis. Expected: one `matcher_analysis` call in
   the request log; result screen shows the summary block, all three
   buckets (Must have / Preferred / Bonus) with every row's evidence
   quotes, and the red-flags list; `rules_version: matcher-rules-2.1.0`
   in the payload; ModelBanner state unaffected.
2. **Taxonomy discipline.** Use a posting with implied soft skills
   (e.g. stakeholder management duties). Expected: soft rows carry
   taxonomy names only (`label_en`, matched by name or alt label), an
   explicit out-of-taxonomy soft skill keeps the ad's wording with
   `in_taxonomy: false` and the "not in the 56-skill list" tag plus its
   `Ad wording` line, `Explicit`/`Implied` source, and a confidence
   value; no type chip other than Hard/Soft exists (trait retired).
3. **Contract retry (mock).** With `LLM_MOCK` enabled and a mock scenario
   that returns malformed JSON, run an analysis. Expected: one
   `matcher_v2_validation_retry` event, then either the corrected result
   or — on the second failure — the §15 NO_WAY_FORWARD UX with Retry and
   "Retry with your own key?"; never a partial table.
4. **Model unavailable.** Stop the chain (or mock `403_html`/`timeout`).
   Expected: exactly the §15/§16 failure UX of the other step pages
   (failure-class banner, guidance box, Retry / BYOK transfer); v1 tables
   never appear; navigation stays open.
5. **Zero skills.** Feed a valid-contract mock response with empty buckets.
   Expected: the fixed extraction-failed message — never a "no match"
   verdict.
6. **Input gates unchanged.** `<script>` block cleaning, >10% Persian
   letters, 42-word and 1,800-word pastes, not-a-posting text: same fixed
   messages and stages as v1, all before any model call (no gateway entry
   in the request log for rejected input).
7. **BYOK path.** With a personal key enabled, run scenario 1. Expected:
   same prompts (byte-identical surface), same validator, `x-byok-*`
   headers on the same `/api/llm/gen` route; failure classifies OWN_KEY.
8. **Cancel/Back.** `[C]`-equivalent (Cancel) at review or analyzing
   discards the stage result and returns to paste; `Back` from the result
   screen returns to the review gate; navigation is never blocked while a
   stale/failed status shows.
9. **Sample-ad acceptance (SC-008, v3).** Analyze the EX-J001 ad (the
   Meta/fintech PM posting; tests reconstruct its text from the yaml
   sentences). Expected: ~20+ skills; "Communication" and "Stakeholder
   management" appear as soft with `in_taxonomy: false` in must; "Agile/
   Scrum" is preferred; fintech and product-analytics tools are bonus
   (weakening never raises a level).
10. **Zero final few-shot examples (SC-010, v3).** With EX-J001 still
    `draft`, the system prompt contains NO few-shot block and the
    analysis behaves identically.
11. **Out-of-taxonomy tag (v3).** A mock response with an explicit soft
    skill named outside the taxonomy renders with
    `in_taxonomy: false` and the "not in the 56-skill list" tag; the
    same name with `source: implied` is dropped by the model and would
    fail V5 if sent.

## Regression samples

The two v1 draft example postings remain the fixed regression INPUTS
(EX-J001's ad is the third, reconstructed from the yaml sentences — no
standalone fixture file per owner ruling). Because the model judges (§14
single-judge pattern), expected outputs are not byte-goldens: they are
(a) validator fixtures — hand-written valid/invalid v3 JSON documents
(with `in_taxonomy`) checked against the invariants — and (b) the
owner's manual walkthrough set after every rules version bump
(`matcher-rules-2.1.0` → next). The v1 byte-golden fixtures stay for the
terminal flow and parity, untouched.
