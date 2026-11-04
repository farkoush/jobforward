# Implementation Plan: Help Entry-Level Job Seekers Narrate Their Experience (Level 1 Prototype)

**Branch**: `001-experience-improvement-flow` | **Date**: 2026-10-25 | **Spec**: ./spec.md

**Input**: Feature specification from `specs/001-experience-improvement-flow/spec.md`
(text-only terminal flow; English B1 tool text and English-only user input;
three-dimension rubric version 3 with deterministic scoring; the FINALIZED
five-part rewriting framework — user_need / product_feature / action / result
/ metric — with automatic part extraction, 0–5 guided questions, and a
part-based Context definition; one complete improvement path for a single
experience entry; constitution v3.0.0).

## Summary

Build a Python interactive CLI prototype that walks an entry-level product-
manager job seeker through one complete improvement path for one experience
entry — record the entry (type, title, 1–6 free-text English bullets), score
each bullet on three dimensions (Context, Specific Action, Result) from
structured 0/1/2 ratings, display the five-part framework for the selected
bullet (candidate's exact words; missing/vague markers), run a per-bullet
rewrite gate (default Yes) with 0–5 skippable questions in the fixed order
Need → Feature → Action → Result → Metric, assemble rewrites only from the
bullet text plus the user's answers, offer draft-or-confirm on partial
answers, replace bullets only on explicit approval (status "edited", history
retained, previous bullet preserved), re-analyze only new/edited bullets,
show before/after scores side by side, and finish with a copyable final text
(code block, one bullet per line). All score arithmetic is deterministic
code under rubric_version 3.0.0 (reference fixture: two bullets, dimension
means 100/75/75 → entry score 250/3 ≈ 83.33); stability gate: ≥ 90% of
bullet-by-dimension scores identical across 5 consecutive runs. All data
stays in local files (single-user JSON document + append-only event log);
every user-facing string is English at B1 level and bullet text is stored
verbatim. (The 001 job-description matcher of the original plan is
SUPERSEDED by feature 002-jd-matcher; the matcher/ package remains in place
but the product behavior is 002's posting-only analysis.)

## Technical Context

- **Language/Version**: Python 3.12 (user decision "build on Python"; carried
  over from research R-1)
- **Primary Dependencies**: Python standard library only for the v1 core
  (dataclasses, json, pathlib, argparse, datetime). Two optional adapters sit
  behind narrow ports and are user-opt-in: the LLM scoring adapter and the LLM
  matcher analyzer. No SDK enters the core path.
- **Storage**: local files only — `data/resume.json` (single-user document,
  written atomically via temp-file + `os.replace`) and `data/events.log.jsonl`
  (append-only, ISO-8601 timestamps)
- **Testing**: pytest, test-first per constitution Principle 9; the 83.33
  reference example (250/3) is a permanent test fixture
- **Target Platform**: Windows terminal (current machine) and any UTF-8
  terminal; run guidance sets `PYTHONUTF8=1`
- **Project Type**: CLI / interactive text-flow application (terminal "chat"
  loop), all tool text in English at B1 level
- **Performance Goals**: every local operation responds in under 0.5 s
  (pure local computation, no network in the default run)
- **Constraints**: zero fabricated claims (zero tolerance — Principle 1); no
  login / upload / external transmission in the default run (Principle 8);
  numeric scoring deterministic (Principle 4); English B1 tool text,
  English-only user input, verbatim bullet storage (Principle 10); scope =
  one complete improvement path + one posting match per session (Principle 8)
- **Scale/Scope**: one local user; dozens of entries; hard limit 1–6 bullets
  per entry (spec FR-001/FR-002)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*
Constitution version in force: **3.0.0** (amended 2026-10-26).

| # | Principle | Design-time gate | Status | Verification |
|---|---|---|---|---|
| 1 | User data integrity — no fabricated claims | All five framework parts contain ONLY the candidate's own words (extraction never invents text); rewrite assembler takes only bullet text + user answers; "no extra claim" contract test exists; zero tolerance for added nouns/verbs/tools/numbers | PASS | design: `flow/parts.py` + `flow/rewrite.py` + tests |
| 2 | User as decision-maker | Every mutation (rewrite approval, direct edit, delete) behind explicit user action; gate rejection / skipped questions → no rewrite; partial answers → draft-or-confirm option (spec §7); skip allowed on every question | PASS | design: `flow/questions.py`, `flow/path_service.py` |
| 3 | Score independent of job posting | The 001 matcher is superseded by 002; no posting artifact reaches the scoring path; scores unchanged by matcher activity | PASS | design: `scoring/` isolated; matcher untouched |
| 4 | Transparent, repeatable, traceable scoring | Three fixed dimensions (context, role_action_clarity, result), 0/1/2 ratings from adapter; arithmetic only in `metrics.py`; rubric_version = "rubric-3.0.0" stored next to every new score (prior scores keep their version); invalid evaluator output rejected, retried once, then reported; stability gate ≥ 90% over 5 runs (deterministic local adapter → 100%). NOTE: constitution P4 text still cites rubric_version = 2 — an amendment re-pinning rubric 3 is required and is owned by the product owner (report-only) | PASS (amendment pending) | design: `scoring/metrics.py`, `checklists/specific-action.md` |
| 5 | Incremental analysis | Bullet statuses (new/edited/analyzed); unchanged bullets keep score + label; only new/edited re-analyzed | PASS | design: `flow/incremental.py` |
| 6 | Own data / matcher boundary (v3.0.0) | The improvement flow touches no job posting; the matcher behavior is 002's posting-only analysis (001 per-entry actions retired) | PASS | constitution v3.0.0 P6; 002 spec |
| 7 | Measurability | Append-only timestamped event log covering start, completion, suggestion accept/reject, score before/after, deletions | PASS | design: `storage/events.py` |
| 8 | Prototype simplicity | Text-only English CLI, local files, no login/upload; deterministic five-part part-extraction heuristics added as a justified complexity item | PASS (with notes) | Complexity Tracking |
| 9 | Test-driven | Tests for formula (250/3 ≈ 83.33), no-extra-claims, incremental analysis, gate/question rejection exist BEFORE implementation; 83.33 reference test is permanent; Phase 9 Specific-Action tests preceded the adapter change | PASS | test plan + Phase 10 ordering |
| 10 | Language (v3.0.0) | All strings in `messages.py` (English B1); user input validated as English; bullet text stored and displayed verbatim | PASS | design: `messages.py` |

**Post-Phase-1 re-check**: PASS — no unjustified gate violation; three
justified complexity items below; one constitution amendment pending
(P4 rubric version re-pin — product-owner action, does not block design).

## Project Structure

### Documentation (this feature)

```text
specs/001-experience-improvement-flow/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output ($speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/jobforward/
├── cli.py                  # English B1 text-flow session loop (entry point)
├── messages.py             # Single source of truth for all English B1 strings
├── models/                 # entry, bullet, suggestion, matcher entities, rubric version
│   ├── entities.py
│   └── status.py
├── scoring/
│   ├── evaluator.py        # port: returns validated structured ratings per bullet
│   ├── metrics.py          # fixed 3-dimension formula + 83.33 reference check
│   ├── overlap.py          # bullet-overlap detection; threshold in rubric version
│   └── adapters/
│       ├── local.py        # deterministic offline adapter (default in v1)
│       └── llm.py          # optional opt-in adapter; validates output,
│                           #   retries once on invalid JSON, then reports failure
├── matcher/
│   ├── analyzer.py         # port: pasted posting -> validated JobRequirement list
│   │                       #   (skill_type hard/soft; priority required/preferred/
│   │                       #   bonus; red-line grouped under required)
│   ├── actions.py          # per-entry Highlight / No change / Not relevant to
│   │                       #   this job + one-line reason citing a skill
│   └── adapters/
│       ├── local.py        # deterministic keyword-based analyzer (default in v1)
│       └── llm.py          # optional opt-in analyzer; same validation/retry rules
├── flow/
│   ├── path_service.py     # orchestrates record / draft / delete / copy paths
│   ├── parts.py            # NEW: deterministic five-part extraction
│   │                       #   (user_need / product_feature / action / result /
│   │                       #   metric) from bullet text; candidate's words only
│   ├── questions.py        # per-bullet rewrite gate + 0-5 skippable questions
│   │                       #   in fixed order Need→Feature→Action→Result→Metric
│   ├── rewrite.py          # assembles rewrites from bullet + user answers ONLY
│   │                       #   (keyword-preservation wording rules)
│   └── incremental.py      # decides which bullets are new/edited and re-analyze
├── storage/
│   ├── repository.py       # atomic load/save of the local document
│   ├── events.py           # append-only JSONL event logger
│   └── schema.py           # storage invariants and versioned rubric field
tests/
├── unit/                   # formula, no-extra-claims, statuses, gate/questions,
│                           # language gate, matcher classification
├── contract/               # evaluator output schema, matcher output schema,
│                           # CLI session contract
└── integration/            # full-path end-to-end scenarios (acceptance criteria)
```

**Structure Decision**: Single CLI project — smallest layout that satisfies
constitution Principle 8; every module maps to exactly one constitution
principle so the compliance review is trivial. The `matcher/` package is the
one structural addition versus the pre-clarification design and maps to
Principle 6's JD-matcher boundary.

## Five-Part Framework Design (Phase 10 addendum, 2026-10-29)

Design decisions for the finalized spec (spec.md §§1–10) that the existing
architecture must absorb:

1. **Part extraction (`flow/parts.py`)** — deterministic, stdlib-only
   heuristics split the bullet's own words into `user_need`,
   `product_feature`, `action`, `result`, `metric` (metric = number-bearing
   phrase; result = outcome clause after result connectors; action = action-
   verb clause; need = problem statement; feature = named product surface —
   marker lists versioned with the rubric). Extraction never paraphrases:
   parts are verbatim substrings of the bullet, and an undetectable part is
   empty (`part_present = False`), never guessed (Principle 1).
2. **Context scoring from parts** — `_rate_context` consumes the extracted
   need/feature: need absent → 0 (even with a feature); generic need or
   feature absent → 1; specific need + specific feature → 2. Bullets stored
   before Phase 10 (no part fields) keep the raw-text heuristic fallback so
   old data still displays and re-scores.
3. **Question engine (`flow/questions.py`)** — extends 0–3 to 0–5 questions,
   fixed order Need → Feature → Action → Result → Metric; conditions:
   Need/Action/Result asked when their dimension score is 0 or 1,
   Feature/Metric when the field is empty; every question skippable; the
   tool names the achievement and part before each question; a complete
   bullet (2/2/2) gets confirmation only.
4. **Partial answers** — after the question round, unanswered parts offer
   draft-save vs confirm-rewrite-with-answers-so-far (rewrite_status
   "draft"); skipping everything → no rewrite (Principle 2).
5. **Display & output** — framework display per spec §5 (header,
   `Original:`, `[part]` brackets, missing/vague notes, Filled correctly /
   Still needs to be filled lists); final output per §8 (code block, `- `
   lines, copy notice). All new strings go to `messages.py` (English B1).
6. **Storage compatibility** — new bullet fields are optional with safe
   defaults; documents saved before Phase 10 load unchanged; stored
   `rubric-2.0.0` scores keep their version verbatim; the stored dimension
   key stays `role_action_clarity` (the spec's `dimension_scores {context,
   action, result}` maps onto it).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Optional LLM scoring adapter (`scoring/adapters/llm.py`, opt-in) | The PRD describes language-model ratings with structured, validatable output; PRD acceptance includes invalid-output and retry behavior that only exist with a model in the loop | A local-only heuristic adapter alone cannot exercise the invalid-output/retry/report path, and deleting the port would break the reference-example, stability, and no-claims test strategy that depends on separating ratings (adapter) from arithmetic (deterministic code). Default run remains fully local (Principle 8 compliant) |
| `matcher/` package with its own adapter port | Spec US5 / FR-021–FR-022 (docs/prd.md §4.1) required per-entry matcher actions — SUPERSEDED by feature 002-jd-matcher (posting-only analysis); the package stays for storage compatibility and is not reworked | A single LLM-only matcher would break the default-local rule (Principle 8); the port's validate/retry contract remains the reference pattern for 002's `matcher2/` |
| Deterministic five-part extraction heuristics (`flow/parts.py`) | The finalized spec requires the five parts "extracted automatically" with only the candidate's own words, deterministically (reliability gate, Principle 1) | An LLM extraction step would break determinism/stability and risk fabricated part text; asking the user to fill five fields contradicts spec §1 ("the candidate never fills in the framework directly"). Marker-based extraction is testable and versioned with the rubric |

---

## Phase 11 Addendum (rubric-3.1.0 as-built, 2026-11-04)

Phase 11 (implemented 2026-11-03, tasks T063–T092) extends this plan as
follows; spec sections §2.1, §3, §3.1, §5.1, §6.1 are the normative record.

### Technical context additions

- **Engines**: the rubric-3.1.0 extraction/scoring rules live in BOTH the
  Python engine (`src/jobforward/flow/parts.py`,
  `src/jobforward/scoring/adapters/local.py`) and the deterministic TS port
  (`web/src/engine/flow/parts.ts`, `web/src/engine/scoring/local.ts`) as
  verbatim twins; parity gate `web/scripts/parity.mts` ↔
  `web/scripts/parity_python.py` is a release gate (PARITY OK on the extended
  edge corpus: research/intention bullet, research-only bullet, improved
  bullet, multi-line bullet).
- **Display divergence (intentional)**: the web display layer
  (`web/src/engine/messages.ts`, `web/src/app/page.tsx frameworkSentence`)
  implements the §5.1 one-sentence format with the closed connector variant
  set and status colors; `src/jobforward/messages.py` keeps the §5 list
  format. Display-only divergence — product-owner decision 2026-11-03.
- **Web improvement loop**: `web/src/app/page.tsx` replaces the per-screen
  question flow with the §6.1 inline form (grounded suggestions via
  `resultCore()` + STARTER_GROUND_*, Confirm + `improveAnswer()` light
  repair, `submitInlineAnswers` → `improvedBullet()` → re-score through
  `scoreAndPersist` with before/after, copy with execCommand fallback).
- **Model disclosure & prompt**: `web/src/components/ModelBanner.tsx` on the
  model-capable screens (entry_bullets, score, bullet_list, merge);
  `web/src/lib/byok/prompts.ts` carries the governing goal + four calibration
  few-shot examples (§3.1).
- **External-model contract**: `specs/001-experience-improvement-flow/few-shot/parser-prompt.md` +
  `specs/001-experience-improvement-flow/few-shot/parser-samples.json` (v1.3.0) are normative for any model and
  for the engine (§2.1); declared in `contracts/parser-prompt.md`.
- **Versioning**: every new score stores `rubric-3.1.0`; the constitution was
  amended to v3.1.0 (2026-11-04) pinning the semver string as the version of
  record and clarifying present-but-vague result = 1 (T090). Single source of
  truth (T093, product-owner request): the version literal exists exactly
  once per engine — `src/jobforward/rubric.py` `RUBRIC_VERSION` (re-exported
  as `DEFAULT_RUBRIC_VERSION` by `storage/repository.py`) and
  `web/src/engine/types.ts` `DEFAULT_RUBRIC_VERSION`; all other consumers
  import, so a bump is a one-line edit per engine, with the parity gate
  proving the two constants agree.

### Constitution check (Phase 11)

No violations. P1 (verbatim brackets; improved bullets only from confirmed
answers; suggestions never auto-applied), P2 (Confirm per part; zero answers
⇒ no rewrite), P4 (vague=1 alignment; deterministic arithmetic; semver rubric
stored), P8 (three screens REMOVED — simplification), P9 (tests landed with
every rule change), P10 (English B1 strings only). Recorded notes: the
display divergence (P8 note) and the backfill sequencing (P9 note).

### Gates (as-run)

`python -m pytest` 216 green · parity PARITY OK · `tsc` clean ·
`npm run test:byok` 24 green (live-Ollama timeout environmental) ·
`npm run scan:byok` green.

---

## Phase 12 Addendum (coverage record — chunk attribution, 2026-11-04)

Spec §2.2 (clarified 2026-11-04). Diagnostic-only coverage pass over the
bullet's own words; tasks start at **T095** (T091/T092 remain open).

### Design additions

- **Computation (`flow/parts.py` + TS twin `web/src/engine/flow/parts.ts`)** —
  a deterministic `build_coverage(bullet_text, parts, ratings)` appended to
  the
  existing extraction module as a verbatim twin: five per-part entries
  (quote = the part's exact extracted words; empty quote + a missing reason
  for an absent part) plus one entry per **maximal contiguous unclaimed
  span** of the whitespace-normalized bullet (quote + reason). Claiming
  matches the extracted part texts verbatim inside the bullet; the §2.1
  feature-inside-action overlap is claimed by the action and never orphaned.
  No re-segmentation of claimed text (product-owner decision: "only the
  unclaimed words").
- **Data (`data-model.md` Phase 12 addendum)** — optional `coverage` list on
  the bullet; documents saved before Phase 12 load unchanged (field absent by
  default, never backfilled). Diagnostic only: no effect on scores, questions,
  completeness, or the improvement loop (rubric stays rubric-3.1.0 — no gate-5
  version bump).
- **Display (web only)** — a gray "Not attributed to the framework" block
  under the framework sentence: one row per orphaned span with quotation +
  reason. New strings in `web/src/engine/messages.ts` (English B1);
  `src/jobforward/messages.py` and the §5 terminal display are UNCHANGED —
  Phase 12 is web + data scope only.
- **Removability** — the product owner may remove the record later without a
  rubric change: the feature is self-contained (one optional bullet field +
  one web block), so removal is two small diffs.

### Constitution check (Phase 12)

No violations. P1 (quotes are verbatim substrings; orphan reasons describe
unclaimed text, never add text), P4 (no scoring change; deterministic
computation only), P8 (diagnostic-only, self-contained, smallest footprint),
P9 (coverage tests written first, failing before implementation), P10
(English B1 strings via the messages module).

### Expected gates

pytest green (new coverage tests included) · parity PARITY OK on the extended
corpus (a bullet with leftover connector/greeting text → orphaned span with
reason) · tsc clean · existing web tests green.

---

## Phase 13 Addendum (hybrid entry — paste-and-split, 2026-11-04)

Spec §4.2 (clarified 2026-11-04). WEB-ONLY: the terminal entry flow, display
and `messages.py` are UNTOUCHED; the Python engine is untouched; tasks start
at **T106** (T091/T092 remain open).

### Design additions

- **Split engine (`web/src/engine/flow/entry_split.ts`, NEW)** — deterministic
  `splitBullets(pasted)` → `SplitCandidate { text, flagged, splitSuggested }`:
  lines starting with `-`/`•` become candidates (the list marker itself is
  formatting and is stripped — segmentation, not rewriting, P1); marker-less
  lines that do not match the flag rule are wrap continuations and join the
  previous candidate with a single space; a candidate is FLAGGED ("not an
  achievement — keep or discard?") when it has NO action verb AND no parser
  signal AND opens with a responsibility-style phrase ("Responsible for…",
  "Duties included…"); a line containing " and also " gets a SPLIT
  suggestion (the split point is at that connector) — every decision is the
  user's (P2).
- **Parser-signal reuse (`web/src/engine/flow/parts.ts`)** — export one
  helper (`lineHasParserSignal`) that reuses the EXISTING marker lists (need
  / feature / result / metric / number) — single source of truth; no marker
  or rule change (the five-part analysis logic is untouched).
- **Entry fields** — `company`, `dates` (single free-text field, e.g.
  "2022–2024"), `product_domain`: stored + displayed, NO effect on any
  analysis/suggestion logic this phase; additive optional fields so old
  documents/sessions load unchanged. The entry screen also carries the
  instruction "Write each achievement on a separate line, starting with - or
  •", a short example below the box, and the SOFT limit: past 8 lines show
  "Put your best achievements first; you can add the rest later." and never
  block. The example is PINNED (analyze F2): "New users could not find the
  items they saved, so I rebuilt the saved items page, resulting in more
  users coming back." The English-only boundary (P10/VR-8) EXTENDS to the
  three new fields (analyze F1) — validated in `addEntry` and the UI with
  the existing `ERR_NON_ENGLISH_INPUT` message.
- **Flow** — `entry_type` → NEW `entry_details` (fields + big textarea) →
  NEW `entry_split` ("I found N achievements. Is that correct?" + flag
  keep/discard + split suggestion + merge/split/delete — text only moved or
  re-joined, never rewritten) → Confirm → the EXISTING `/api/entry` +
  per-bullet pipeline (§4.1/§6.1) with "Achievement n of total" progress and
  the ORIGINAL pasted text visible at the top of the analysis screens.
- **VR-1 stays (assumption A1)** — the confirmed list still respects the
  1–6-bullets cap (FR-002 unchanged, "do not change the analysis logic"):
  when the split produces more than 6 candidates the split screen asks the
  user to keep the best 6 (delete/merge to fit) — consistent with the
  soft-limit wording "you can add the rest later"; the TEXTAREA itself is
  never blocked at any length.

### Files to modify (complete list — user requirement: file list before coding)

| # | File | Change |
|---|---|---|
| 1 | `web/src/engine/flow/entry_split.ts` | NEW — deterministic split engine (`splitBullets`) |
| 2 | `web/src/engine/flow/parts.ts` | export `lineHasParserSignal` (reuses existing markers; no rule change) |
| 3 | `web/src/engine/types.ts` | optional `company`/`dates`/`product_domain` on ExperienceEntry |
| 4 | `web/src/engine/flow/pathService.ts` | `addEntry` passes the three optional fields through (VR-1/VR-8 untouched) |
| 5 | `web/src/lib/schemas.ts` | `AddEntryRequestSchema` optional fields |
| 6 | `web/src/app/api/entry/route.ts` | pass the fields through |
| 7 | `web/src/lib/client.ts` | StoredEntry optional fields; session keeps the original pasted text (`sourceText?`) |
| 8 | `web/src/app/page.tsx` | entry flow rewrite: `entry_details` + `entry_split` screens, soft limit, flags, merge/split/delete, confirm, paste visible during analysis |
| 9 | `web/src/engine/messages.ts` | new English B1 strings (instruction, example, found-count, flags, soft limit, buttons) |
| 10 | `web/package.json` | `test:engine` script for the new engine tests |
| 11 | `web/tests/engine/entry_split.test.ts` | NEW — tests-first for the split rules (P9) |
| 12 | docs: plan/research/data-model/quickstart/tasks (+ spec already amended) | Phase 13 records |

Python engine, terminal display, parity harnesses: UNTOUCHED (parity must
stay green as-is).

### Constitution check (Phase 13)

No violations. P1 (segmentation only — markers are formatting; text is never
rewritten or invented), P2 (every keep/discard/merge/split/delete is the
user's action), P4 (no scoring change → no rubric bump), P8 (web-only, no new
dependencies), P9 (split tests written first, failing), P10 (English B1
strings in messages.ts; English-only boundary unchanged).

### Expected gates

`tsc --noEmit` clean · engine split tests green (`npm run test:engine`) ·
parity PARITY OK (unchanged corpus) · `npm run test:byok` 23/24 baseline ·
`npm run scan:byok` passed · manual walkthrough: paste a 9-line experience →
soft-limit message, split list with one flagged line, merge two, confirm,
analysis shows "Achievement 2 of 4" with the paste visible on top.

---

## Phase 14 Addendum (platform theme and voice, 2026-11-05)

Spec §11 (clarified 2026-11-05). Cross-cutting TONE rules; COMPLETE warm
adoption on every web screen; Tailwind-variant-only (raw pack stays outside
the repo); fonts already vendored in `web/src/fonts/` (SourceSans3 /
Fraunces / JetBrainsMono variable TTFs + OFL). Python engine, terminal,
`messages.py`, parity corpus: UNTOUCHED. Tasks start at **T115**.

### Design additions

- **Single token source (`web/src/app/globals.css`, REWRITE)** — the pack's
  Tailwind variant adapted: `@theme inline` semantic map + `:root` oklch
  tokens (brand #942B2B / hover / cream surfaces / warm text pair /
  input border / error #C33C00 pair / success #5E713C pair / accent) + warm
  neutral ramp + themed red/emerald scale + component classes with the SAME
  names as today (btn-primary → red pill, btn-secondary, text-input, card,
  tech-tag, pulse-dot) + NEW `.msg-error/.msg-success/.msg-info` message
  classes. No other file defines colors (spec §11.2).
- **Fonts (`web/src/app/layout.tsx`)** — `next/font/local` with the three
  vendored variable fonts (weight ranges, not Inter), exposed as
  `--font-sans/--font-display/--font-mono`; build-time bundling, zero
  runtime external font requests (P8; product-owner decision 2026-11-05).
- **Literal-color sweep (`web/src/app/page.tsx`, `web/src/components/`)**
  — remaining literal whites/monochrome utilities move to the semantic
  tokens (bg-white → bg-card, text-white on primary surfaces →
  text-primary-foreground); message blocks adopt the `msg-*` classes. NO
  structural, text, or flow changes (P1/P2 untouched — styling only). The
  amber model-banner keeps its amber (the theme deliberately does not
  redefine amber — §5.1's vague color stays).
- **Theme guard (`web/tests/engine/theme.test.ts`, NEW)** — runs under the
  existing `test:engine` glob: (a) zero emoji codepoints in any
  `messages.ts` export; (b) the key tokens exist in globals.css. Written
  FIRST (P9).
- **Light mode only** (assumption); dark hook unused.

### Files to modify (complete list — user rule: file list before coding)

| # | File | Change |
|---|---|---|
| 1 | `web/tests/engine/theme.test.ts` | NEW — theme guard tests (first) |
| 2 | `web/src/app/globals.css` | REWRITE — warm tokens + component classes (single source) |
| 3 | `web/src/app/layout.tsx` | next/font/local with the three vendored fonts; Inter removed |
| 4 | `web/src/app/page.tsx` | literal-color sweep onto semantic tokens + msg-* classes |
| 5 | `web/src/components/*.tsx` | only if they carry literal whites (checked at implement; ModelBanner's amber stays) |
| 6 | docs: plan/research/quickstart/tasks (+ spec already amended) | Phase 14 records |

`web/src/fonts/*` (3 TTFs + 3 OFL) are already vendored and get committed
with this phase. Python engine, terminal, parity harnesses: UNTOUCHED.

### Constitution check (Phase 14)

No violations. P8 (fonts self-hosted — build-time only; no new dependency),
P10 (no text changes — English B1 strings byte-identical), P4 (no scoring
change), P1/P2 (presentation only), P9 (guard test first).

### Expected gates

theme guard tests green (`test:engine` incl. new file) · `tsc --noEmit`
clean · parity PARITY OK (unchanged corpus) · `npm run test:byok` 23/24
baseline · `npm run scan:byok` passed · `python -m pytest` 227 green ·
walkthrough: cream background, red pill primary buttons, Fraunces headings,
18px body, warm error/success pairs, network tab shows no font request to
any external origin.
