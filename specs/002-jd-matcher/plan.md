# Implementation Plan: JD Matcher — model-driven analysis (web only; v3 amendment)

**Branch**: `002-jd-matcher` | **Date**: 2026-11-16 (v3; plan v2 approved
2026-11-09 and implemented T026–T045) | **Spec**: ./spec.md (v3 —
method-aligned; owner Task 2 rulings in Clarifications Session
2026-11-16)

**Input**: the owner's 7-step analysis pipeline (provided at plan time,
2026-11-09) — input: the full posting text + the fixed soft-skill
taxonomy (SOFT_TAXONOMY); output: the second structure (summary +
must/preferred/bonus + red_flags); strictly sequential steps: 1 atomize →
2 one-pass labeling → 3 extraction (hard pass, then soft pass) → 4 merge
→ 5 prioritization → 6 summary & red_flags → 7 output + final validation.

**Owner rulings (AskUserQuestion session, 2026-11-09)**:

1. **One LLM call** — the 7 steps are the model's internal method; the
   final JSON is the only output; deterministic code validates the
   contract (retry once → refusal): the 001 §14 single-judge pattern.
2. **SOFT_TAXONOMY = `docs/soft-skills-taxonomy.json`** (the existing
   56-skill ESCO file; web copy at `web/data/`), typed soft/trait by a
   versioned mapping (research R2, drafted for owner review).
3. **Web only** — the terminal keeps v1 untouched; no terminal work.
4. **Model unavailable → exactly the spec-004 §15/§16 failure UX** as
   implemented on the 001 step pages; v1 output is never a fallback.

**Task 2 amendment rulings (owner zcode prompt §4, 2026-11-16)**: the ten
method deltas in spec Clarifications Session 2026-11-16 — contract
version bumps to `matcher-rules-2.1.0`; research R12–R19 carry the
decisions (R2 archived, R3 superseded).

## Summary

Replace the web JD-analysis core (v1: three deterministic
Must/Should/Nice tables + 56-skill synonym/inference matching) with a
model-driven analysis: one `matcher_analysis` GEN call through the
existing gateway route carries the 7-step method as its system prompt and
returns a single JSON document — `summary` (title, seniority, work type,
domain, role nature, problem solved), three skill buckets
(`must`/`preferred`/`bonus` with hard/soft/trait types, verbatim witness
sentences, source, confidence), and `red_flags` (conflicts, unrealistic
expectations, multi-role combos, vague duties, discriminatory phrasing —
never recorded as skills). A deterministic validator enforces the output
contract (taxonomy membership, verbatim evidence, field rules,
uniqueness, must-confidence gate) with one retry and then a refusal; the
no-model path reuses the §15/§16 failure UX unchanged. Input stage
(paste, cleaning, language/word-count/not-a-posting gates, review gate,
cancel/back semantics) is unchanged and stays fully deterministic, before
any model contact. Contract versioned `matcher-rules-2.0.0`.

## Technical Context

- **Language/Version**: TypeScript strict (Next.js app router, existing
  web app). **No Python changes.**
- **Primary Dependencies**: the existing LLM gateway (`/api/llm/gen`,
  `runGenGateway`, task registry, failure classes, ModelBanner) — no new
  runtime dependency; zod for the response schema (as elsewhere in web).
- **Storage**: no new persisted state; client event log gains
  `matcher_v2_*` events; the gateway request log captures the call.
- **Testing**: web vitest suites (`test:engine` — new v2 validator +
  taxonomy-typing tests with fixtures BEFORE implementation, `test:byok`,
  `test:llm`), `tsc --noEmit` + build, PARITY (v1 sections untouched),
  pytest untouched (terminal untouched).
- **Target Platform**: web dev/production on port 3100 / Vercel.
- **Performance Goals**: one streamed GEN call per analysis; the gateway's
  own 60 s deadline governs; review gate stays sub-second (unchanged code).
- **Constraints**: English-only postings and B1 UI strings (P10/P16);
  taxonomy names verbatim from the 56-skill file; model contact ONLY
  after the input gates pass (one background connection check per session
  from the menu screen remains the only other contact, per 004 §15);
  contract version `matcher-rules-2.0.0`; additive-only outside the
  explicit supersession list below.
- **Model usage (owner rule 2026-11-09)**: model-combo and BYOK are
  governed project-wide by spec-004 — this feature only registers
  `matcher_analysis` in the task registry and consumes the fixed gateway
  algorithm (routes, chains, contract validation, §15/§16 UX); no local
  chain/combo decision anywhere (research R11).
- **Scale/Scope**: one posting per analysis, 100–1,500 words, 56 taxonomy
  skills, single local user; web only.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*
Constitution version in force: **v4.3.0** (P1–P22; P22 = اصل ۲۲, one
fixed model algorithm — ratified 2026-11-09 from this feature's session;
this plan already implements it: the task-registry registration (T031)
is the ONLY model plumbing, existing gateway routes, contract validation
(T035), §15/§16 failure UX (T042)).

| # | Principle | Design-time gate | Status | Verification |
|---|---|---|---|---|
| 1 | User data integrity — no fabricated claims | Evidence verbatim (validator V1); names constrained to taxonomy (V5); summary/red flags from posting only; nothing auto-added | PASS | design: `engine/matcher2/v2/validate.ts` + tests |
| 2 | User as decision-maker | Review gate + Cancel/Back semantics unchanged; analysis runs only on explicit confirm | PASS | design: page.tsx JD step |
| 3 | Score independent of posting | No scores in v2; scoring step untouched | PASS | — |
| 4 | Transparent, repeatable, traceable | `matcher-rules-2.0.0` stamped on results; validator accepts/rejects whole; retry/refusal/events logged (R9/R10). Determinism is replaced by contract-validation — the §14 precedent. **Recorded exception: web-only, no py+ts lockstep for v2 (owner ruling 3); terminal keeps v1; parity untouched** | PASS (with recorded exception) | plan gate; tasks add no parity sections for v2 |
| 5 | Incremental analysis | N/A (no resume bullets in this flow) | PASS | — |
| 6 | Own data / matcher boundary | Analyzes the pasted posting only; reads no resume data | PASS | design: data-model entities |
| 7 | Measurability | `matcher_v2_*` events (requested/result/retry/refused/cancelled) | PASS | contract §7 |
| 8 | Prototype simplicity | Reuses gateway + §15 components; one new engine module; no new route/env. Note: v1 web code kept dormant (R7) — deletion deferred to owner | PASS (with note) | Complexity Tracking |
| 9 | Test-driven | Validator fixtures (valid/invalid v2 JSON) and taxonomy-typing tests written BEFORE implementation | PASS | tasks ordering |
| 10 | Language | System prompt English; ALL UI strings English B1; postings English-only (unchanged gates) | PASS | contract §2/§6 |
| 11 | Spec-kit process | This plan; spec.md v2 edit = first implementation task | PASS | Task notes |
| 12 | Centralized LLM gateway (غیرقابل‌مذاکره) | Task `matcher_analysis` registered in the task registry; called via existing `/api/llm/gen`; no provider/model names outside the gateway | PASS | contract §1 |
| 13 | Model config env-only | No new env; BYOK via existing headers | PASS | — |
| 14 | Keys never in client/logs | Existing BYOK header flow + redaction reused; no new logging of key material | PASS | — |
| 15 | Error-path coverage | Mock scenarios cover malformed JSON → retry → refusal; unavailable chain; empty buckets | PASS | quickstart scenarios 3–5 |
| 16 | English, simple error messages | Fixed B1 failure texts from the shared failure-class UI; refusal never rendered as a result | PASS | contract §5 |
| 17 | TypeScript strict | New module strict-mode, `tsc --noEmit` gate | PASS | quickstart static gates |
| 18 | User data never depends on LLM success | The analysis is not user data; entries/scores/drafts intact on any failure; failures never mutate data | PASS | design: failure paths display-only |
| 19 | Operational diagnosability | Events + request log + dev-only `[llm]` console lines with failed checks | PASS | contract §7 |
| 20 | Model servability | Task rides the GEN chain; chains/validation infra unchanged | PASS | — |
| 21 | Env completeness | No new env variables | PASS | — |

**Post-Phase-1 re-check**: PASS — one recorded exception (P4 web-only
scope, owner ruling 3) and one simplicity note (R7 dormant v1); no
unjustified violations.

## Supersessions and removals (explicit — owner approves at plan review)

All owner-approved in the 2026-11-09 session; listed here so plan approval
confirms them together (no other removals):

- **S1** — Web analysis output replaced: three deterministic tables
  (Must/Should/Nice hard tables + soft table) → one model-driven document
  (summary + must/preferred/bonus + red_flags). (Ruling 1)
- **S2** — Web stage gates for the two table stages removed: after the
  review gate there is ONE analyzing step and the result screen.
  Cancel/back semantics preserved. (follows from S1)
- **S3** — Web 5-row display limit, "showing 5 of N", and the v1 counts
  line superseded: all rows shown; per-bucket counts in headers. (R8)
- **S4** — Evidence form: ≤ 12-word quote → witness sentences, verbatim
  (whitespace-normalized) from the cleaned posting. (pipeline step 7)
- **S5** — v1 soft matching (explicit synonym/alt-label matching + curated
  inference table) and the "No taxonomy match" line superseded: semantic
  mapping onto SOFT_TAXONOMY with soft/trait typing; an unmatched concept
  simply produces no row (or a red flag when the pipeline says so). (R2)
- **S6** — v1 priority word-list cascade superseded by the pipeline's
  signal/weakening/conflict/repetition/cap rules, prompt-encoded
  (contract §2.1). (part of S1)
- **S7** — Web route `POST /api/matcher` and v1 engine functions
  (`extractHardSkills`, `matchSoftSkills`, `buildReport`) become DORMANT
  on the active path — kept, not deleted; deletion is a separate future
  owner decision. (R7)
- **S8** — spec.md v1 requirements superseded ON WEB (terminal keeps all):
  FR-009–FR-013 (hard tables), FR-014–FR-017 (soft table form + taxonomy
  line), FR-020 (consistency message; v2 counts are structurally
  consistent), FR-021 (5-run determinism → contract-validation + event
  trail, §14 pattern), FR-022 (byte-golden web regression → validator
  fixtures + owner walkthrough; byte-goldens stay for the terminal);
  FR-008 PARTIALLY superseded on web: the Review gate, invalid-key
  re-prompt, and all Cancel/exit semantics stay exactly as written, but
  the Hard-skills and Soft-skills stage gates are removed (S2 — one
  analyzing step). FR-001–FR-007, FR-018, FR-019, FR-023, FR-024
  unchanged. The spec.md v2 edit is the first implementation task.

**v3 amendment supersessions (2026-11-16 — owner-ruled in §4; listed for
plan-review confirmation):**

- **S9** — The R2 soft/trait mapping and the `trait` type are RETIRED
  everywhere (prompt, schema, validator, UI chip). This supersedes the
  R2 mapping the owner approved at the v2 plan review.
- **S10** — Validator V5's taxonomy-membership rejection is REPLACED by
  the in_taxonomy rule (explicit out-of-taxonomy kept; implied dropped).
  This supersedes the v2 FR-014-form note and the v2.0.0 V5. **Amended
  2026-11-16 (plan-approval condition ب): V5 gains the ambiguous-name
  precedence — exact label_en match wins; a single alt match adopts that
  record; a multi-record alt match FAILS the check naming the candidates
  (owner-verified set: show commitment, demonstrate loyalty, demonstrate
  commitment, demonstrate enthusiasm, guide others — the first two
  resolve by exact label_en).**
- **S11** — The alt-labels-excluded decision (research R3) is
  SUPERSEDED: alt_labels_en return to the prompt table (recognition),
  canonical names stay the recorded output.
- **S12** — The v2.0.0 step-5 weakening wording ("at most preferred")
  and the unconditional repetition upgrade are corrected per §4 (weaken
  = only lower; repetition needs every witness ≥ preferred and blocks on
  a bonus witness; about never counts).
- **S13** — EXTENSION (owner ruling 2026-11-16, resolving the R14 open
  judgment point): "Stakeholder management" is EXPLICIT (S14 primary
  witness in Requirements, S9 complementary). Explicit out-of-taxonomy
  soft names are recorded with a NEW `ad_wording` field under the V9
  SEMANTIC NORMALIZATION BOUND (subject noun in the witness + the closed
  generalization list {management, communication, collaboration,
  coordination}; forbidden: adding absent concepts, merging two skills,
  changing nature; the original sentence always stays in evidence).
  SC-008 stays the final walkthrough judge; such items go to the
  taxonomy-candidates store (Task 4) for later taxonomy addition.

## Project Structure

### Documentation (this feature)

```text
specs/002-jd-matcher/
├── plan.md                        # This file (v2)
├── research.md                    # Phase 0 (v2 — R1–R10)
├── data-model.md                  # Phase 1 (v2 entities + invariants)
├── contracts/
│   ├── matcher-pipeline.md        # v1 contract — KEPT (terminal active)
│   └── matcher-pipeline-v2.md     # NEW v2 contract (prompt/schema/validation)
├── quickstart.md                  # v2 run/validate guide
└── tasks.md                       # v1 tasks [X]; v2 tasks appended by /speckit-tasks
```

### Source Code (web only)

```text
web/src/
├── lib/
│   ├── byok/prompts.ts            # + BYOK_MATCHER_SYSTEM_PROMPT,
│   │                              #   buildMatcherUserPrompt,
│   │                              #   buildMatcherTaxonomyTable
│   ├── llm/tasks.ts               # + matcher_analysis: "GEN" (documented)
│   └── schemas.ts                 # + MatcherAnalysisV2Response zod schema
├── engine/matcher2/v2/            # web-only v2 module (v3: + few-shot, − trait)
│   ├── types.ts                   # MatcherAnalysisV2, SkillItem (hard|soft,
│   │                              #   in_taxonomy), SummaryV2, RedFlag, MatchFailure
│   ├── taxonomy.ts                # imports web/data/soft-skills-taxonomy.json
│   │                              #   (public data, 56 records) — alt_labels exposed
│   │                              #   for the prompt table; R2 typing REMOVED (S9)
│   ├── validate.ts                # V1–V8 validator → ok | failed-check | zero_skills
│   ├── fewshotIndex.ts            # direct imports of specs/002-jd-matcher/
│   │                              #   few-shot/EX-Jxxx.json (R17 — JSON source
│   │                              #   of truth, bundler-embedded, no sync)
│   └── rulesVersion.ts            # MATCHER_RULES_V2 = "matcher-rules-2.1.0"
└── app/page.tsx                   # JD step: review gate unchanged →
                                  #   analyzing (POST /api/llm/gen,
                                  #   NDJSON accumulate → parse → validate →
                                  #   retry-once → §15 UX on refusal) →
                                  #   result screen (summary + buckets +
                                  #   red flags, Back)
web/tests/
├── engine/matcher2-v2/            # NEW: validator fixtures (valid/invalid
│                                  #   JSON per invariant), taxonomy typing
│                                  #   (56 typed exactly once), rules version
└── ...                            # existing suites untouched
```

**Structure Decision**: a `v2/` submodule inside the existing
`engine/matcher2/` — keeps the v1 engine (dormant on web, active in the
terminal, parity-locked) visually and physically separate from the v2
contract; the shared prompts stay in `lib/byok/prompts.ts` (single prompt
surface, gateway + BYOK byte-identical); no new API route (P12) — the
analysis rides `/api/llm/gen` with the task registry doing the
category mapping.

**Implementation record (post-implement, analyze D1 — owner-approved
2026-11-15)**: four artifacts beyond the tree above, all tested:
`web/src/lib/matcher-analysis.ts` (the injectable-fetch client pipeline —
NDJSON accumulate, retry-once, cancel token; extracted so the pipeline is
testable without a React harness), `web/src/engine/matcher2/v2/inputGates.ts`
(the deterministic client-side input gates in the v1 error order),
`web/src/engine/matcher2/v2/messages.ts` (v2 UI strings deliberately OUTSIDE
the py+ts parity-locked `engine/messages.ts`), and the widened
`web/package.json` `test:engine` glob (`tests/engine/**/*.test.ts`) that
picks the new suite directory up. **v3 addition (owner ruling R20,
2026-11-16)**: the matcher prompt text lives ONLY in
`web/data/matcher-prompt.json` (`{version, lines}` — imported directly by
prompts.ts); contract §2.1 points at it and pins the version; the
three-way version equality is test-enforced.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| v1 web matcher code kept dormant (route + 3 engine modules + tests) | No-feature-removal rule: deletion is the owner's separate decision; keeping it keeps v1 parity sections meaningful | Deleting now would remove still-tested, owner-visible behavior without an explicit request; the cost is dead-code weight, recorded here |
| Model-judged prioritization (not re-derived in code) | The pipeline's judgment steps (tone inference, weakening words, main-duty tie) are not deterministic; §14 precedent = model judges, code validates structure | Full deterministic re-derivation = re-implementing the pipeline, contradicting ruling 1 |
| Taxonomy bundled into the client (import of `web/data/soft-skills-taxonomy.json`) | The prompt is built client-side (single prompt surface rule) and needs the typed table | Server-side injection into the gateway route would fork the prompt surface (BYOK parity breaks); the file is public data with no keys |
| Few-shot examples as JSON files imported directly (no sync/loader) | Bundlers cannot glob a folder, so each new example needs one import line in `fewshotIndex.ts`; JSON has no comments so why/rule/do_not_copy are long single strings — owner-accepted costs (R17) | yaml + sync script + generated mirror — a conversion step and drift risk the owner explicitly removed; js-yaml dependency — rejected (P8); runtime fs read — rejected (Task 1 ENOENT lesson) |

## Task notes (for /speckit-tasks)

- v2 tasks T001–T046 are DONE (T026–T045 [X]; T046 owner walkthrough
  still open — unaffected by this amendment). The v3 tasks continue the
  numbering (T047+) and are generated by `/speckit-tasks`.
- v3 implementation order: convert EX-J001 to json + fewshotIndex.ts →
  taxonomy.ts (alt labels, remove R2 typing) → prompt §2.1 v3 rewrite →
  schema/validator (in_taxonomy, V3/V5) → page.tsx UI (chip/tag) →
  fixtures/tests (SC-008 reconstruction from EX-J001, zero-finals) →
  all gates → owner walkthrough.
- The contract §2.1 v3 text is the owner-review artifact: reproducing it
  is character-for-character; changing it after approval is a
  rules-version change.
- Walkthrough (owner, live or mock) includes running `matcher_analysis`
  over the active GEN chain; any model-combo or BYOK adjustment that
  falls out is a SPEC-004 change, never a 002-local mechanism (R11).
