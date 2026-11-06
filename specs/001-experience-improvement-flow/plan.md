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

**Phase 16 (spec §12): the Python side moved to the `terminal/` edition**
(`terminal/pyproject.toml`, `terminal/src/jobforward/**`,
`terminal/tests/**`, `terminal/data/**`); `web/` is unchanged at the root;
`specs/`, `.specify/`, `docs/` are shared governance. The tree below shows
the terminal edition's internals (paths are relative to `terminal/`):

```text
terminal/src/jobforward/
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

---

## Phase 15 Addendum (five-part analysis UX, 2026-11-05)

Spec §5.2/§6.2 (clarified 2026-11-05; items 1–3 of the owner's UX review;
4–8 deferred to §10). WEB-ONLY presentation/interaction phase: Python
engine, terminal, `messages.py`, parity corpus UNTOUCHED. Tasks start at
**T121**.

### Design additions

- **Pure display helpers (NEW `web/src/engine/flow/display.ts`)** — the two
  deterministic pieces of the new UI live OUTSIDE the component so P9 tests
  are engine-level (no React test infra exists; web-only module — no twin,
  presentation logic, not analysis): `partStates(rows)` derives
  Complete/Vague/Missing per part (missing = empty words, ALWAYS; vague =
  non-empty + vague flag; complete otherwise — mirrors PartDisplayState),
  and `questionOrder(rows)` returns the focused-loop order — missing parts
  first, then vague parts, each in Need→Feature→Action→Result order, metric
  last. No scoring/extraction logic moves here.
- **Five-cell status row (page.tsx, above the sentence)** — one cell per
  part with the English B1 state label; text+weight only (no icons, no
  color coding on the row).
- **Bracket-free sentence** — `frameworkSpan` becomes: filled/vague = the
  verbatim words with a soft underline in the KEPT status colors (themed
  emerald/amber/red — product-owner answer 2026-11-05); missing = a dotted
  placeholder slot in the slot's position carrying the part label in muted
  text (the sentence keeps reading naturally). All §5.1 content rules
  (closed connectors, ", resulting in", verbatim words) are untouched. The
  gray coverage block stays under the sentence.
- **Focused question loop (BulletGate rework)** — exactly ONE question
  expanded (ordered by `questionOrder`), the rest collapsed to a one-line
  summary with the state label; Next advances; clicking a sentence fragment
  (filled, vague, OR dotted slot) opens that part's question; the active
  fragment is highlighted; typing updates the sentence live (the existing
  inputs already drive `displayRows`); confirmed parts remain visible and
  clickable to reopen. The "Still needs to be filled" list is REMOVED on
  the web (superseded — the ambiguity reason renders inside the open
  question); the terminal names-only list is untouched. Complete bullets
  skip the loop (confirmation only, as today). Zero confirmed answers still
  means no rewrite; re-submission re-scores through the same pipeline.
- **Copy rules** — the existing question texts (§6) are read verbatim; new
  strings are only the state labels (Complete/Vague/Missing), Next, the
  collapsed summary, and the question counter (e.g. "Question 2 of 4") —
  English B1, no emoji (theme guard keeps passing).

### Files to modify (complete list — user rule: file list before coding)

| # | File | Change |
|---|---|---|
| 1 | `web/tests/engine/display.test.ts` | NEW — failing tests for partStates + questionOrder (P9, first) |
| 2 | `web/src/engine/flow/display.ts` | NEW — pure display helpers (part states + question order) |
| 3 | `web/src/app/page.tsx` | BulletGate rework: status row, underline spans + dotted slots, focused loop (Next/click/highlight/live), needs-list removal; frameworkSpan rework |
| 4 | `web/src/engine/messages.ts` | new English B1 strings (state labels, Next, collapsed summary, question counter) |
| 5 | docs: plan/research/quickstart/tasks (+ spec already amended) | Phase 15 records |

Python engine, terminal, parity harnesses, theme guard: UNTOUCHED (parity
and guard stay green).

### Constitution check (Phase 15)

No violations. P1/P2 (every §6.1 decision unchanged; the tool never invents;
user confirms per part), P4 (no scoring change), P8 (no new dependencies),
P9 (display-helper tests written first), P10 (English B1 strings), §11
(no icons/emoji on the row).

### Expected gates

`npm run test:engine` green (incl. new display tests, TDD red-first) ·
`tsc --noEmit` clean · parity PARITY OK (unchanged) · `npm run test:byok`
23/24 baseline · `npm run scan:byok` passed · `python -m pytest` 227 green ·
walkthrough: five-cell row with text+weight states, bracket-free sentence
with colored underlines + dotted slots, one question open at a time in
missing→vague→metric order, Next/fragment-click navigation, live sentence
update while typing, needs list gone, terminal byte-identical.

---

## Phase 16 Addendum (repository layout — terminal/web separation, 2026-11-05)

Spec §12 (clarified 2026-11-05: root siblings; optional-skip parity;
matcher/ deleted). Refactor/move-only — zero behavior change in either
edition. **Executes BEFORE the pending Phase 15 implementation (owner
priority).** Tasks start at **T127**.

### Verified ground facts (2026-11-05)

- Root items: `README.md`, `data/` (holds `events.log.jsonl` +
  `resume.json.bak` — no `resume.json` right now; BOTH files move as-is),
  `docs/`, `pyproject.toml`, `pytest.ini` (`testpaths = tests`),
  `specs/`, `src/`, `tests/`, `web/`; no root conftest — the tests rely on
  `python -m pytest` cwd sys.path, so they work from `terminal/` unchanged.
- `.gitignore` `data/` pattern matches at any depth → `terminal/data/`
  stays ignored without changes.
- **Cross-dependency found**: `src/jobforward/matcher2/soft_skills.py`
  reads `docs/soft-skills-taxonomy.json` cwd-relative — running the CLI
  from `terminal/` would fail. Fix: copy the taxonomy into `terminal/data/`
  and change the default path to `data/soft-skills-taxonomy.json` (same
  content; root `docs/` file stays as the normative 002 contract; web keeps
  its own `web/data/` copy — three self-contained copies, sync rule: the
  root docs file is the source of record, editions' copies change only via
  a deliberate re-copy).
- Web runtime imports NOTHING from the Python side (verified); the only
  coupling is `web/scripts/parity_python.py`.

### Migration map (git mv — history follows)

| From (root) | To | Notes |
|---|---|---|
| `pyproject.toml` | `terminal/pyproject.toml` | testpaths relative → works from terminal/ |
| `pytest.ini` | `terminal/pytest.ini` | same |
| `src/` | `terminal/src/` | package internals unchanged |
| `tests/` | `terminal/tests/` | run `python -m pytest` from terminal/ |
| `data/` | `terminal/data/` | live files preserved byte-for-byte |
| (new) `docs/soft-skills-taxonomy.json` copy | `terminal/data/soft-skills-taxonomy.json` | + path fix below |

Deletions: `src/jobforward/matcher/` (after move) +
`tests/unit/test_matcher.py` + `tests/contract/test_matcher_output.py`
(227 → 216-ish; exact new count recorded in evidence).

Code edits (behavior-preserving): `matcher2/soft_skills.py` default
`"docs/…"` → `"data/…"`; `web/scripts/parity_python.py` resolves
`terminal/src` (chdir `terminal/`, sys.path `terminal/src`) and emits
`{"parity":"skipped"}` exit-0 when absent; `web/scripts/parity.mts` prints
"PARITY SKIPPED — terminal engine not present" without failing; with the
engine present the behavior is identical (PARITY OK).

Docs (new): `terminal/README.md` (Terminal v1 — frozen baseline statement,
run/test from its folder); root `README.md` gains the repo map (root
README exists — updated, not created).

Docs truthfulness pass (living docs only): plan Project Structure section,
quickstart Run/Tests commands, tasks.md Phase 16 pointer note — historical
task lines keep their old paths AS RECORDS with the note explaining the
mapping (`src/jobforward/…` → `terminal/src/jobforward/…` etc.).

### Files to modify (complete list — user rule: file list before coding)

| # | Path | Change |
|---|---|---|
| 1 | `terminal/pyproject.toml` | MOVED (git mv) |
| 2 | `terminal/pytest.ini` | MOVED (git mv) |
| 3 | `terminal/src/jobforward/**` | MOVED (git mv) |
| 4 | `terminal/tests/**` | MOVED (git mv) |
| 5 | `terminal/data/**` | MOVED (git mv; live data preserved) |
| 6 | `terminal/data/soft-skills-taxonomy.json` | NEW copy from docs/ |
| 7 | `terminal/src/jobforward/matcher/` + `terminal/tests/unit/test_matcher.py` + `terminal/tests/contract/test_matcher_output.py` | DELETED (git rm) |
| 8 | `terminal/src/jobforward/matcher2/soft_skills.py` | default path → data/ |
| 9 | `web/scripts/parity_python.py` | terminal-path resolution + skip JSON |
| 10 | `web/scripts/parity.mts` | skip handling + message |
| 11 | `terminal/README.md` | NEW — frozen baseline |
| 12 | `README.md` (root) | repo map + edition statuses |
| 13 | `specs/001…/plan.md`, `quickstart.md`, `tasks.md` (+research) | Phase 16 records + path pass |

### Constitution check (Phase 16)

No violations. P4/P1/P2 (zero behavior change — moves and path constants
only), P8 (no new dependencies; editions self-contained), P9 (skip-
simulation acceptance check), P7 (logs/data preserved, relocated intact).

### Expected gates

pytest from `terminal/` green (227 minus the two deleted legacy matcher
test files) · parity PARITY OK with terminal present · skip-simulation:
temporarily rename `terminal/` → parity prints the skip message and exits 0
→ rename back · web gates unchanged (test:engine, tsc, test:byok 23/24,
scan) · `git log --follow` proves history followed a moved file.

---

## Phase 18 Addendum (entry & review UX simplification, 2026-11-06)

Spec §13 (clarified 2026-11-06: per-experience paste; editable-text-only
split review). WEB-ONLY flow/presentation phase: Python engine, terminal,
`messages.py`, parity corpus UNTOUCHED; the analysis pipeline (§2–§6) is
untouched. Tasks start at **T133** (T091/T092 remain open).

### Clarify integration (2026-11-06 — supersedes parts of the design below)

The plan-stage clarify session (4 owner answers; recorded in the spec's
Clarifications 2026-11-06) changed the review mechanics: the conservative
header parser described under "Deterministic paste parser" is SUPERSEDED
by a **drag-and-drop segment review** — the `splitBullets` output becomes
draggable items; ONLY the first non-marker line auto-places (into Title);
every other segment starts in Achievements; the tool never attributes
organization or dates on its own (a segment the USER drags into the Dates
section fills the structured fields only on an exact date-pattern match).
Further owner answers: the 1–6 cap is REMOVED on the web (SPLIT_TOO_MANY
joins the removed strings; terminal VR-1 stays frozen); a NO-change
re-confirm skips re-analysis (P5); a type switcher joins the review
screen (labels swap, segments carry over). `entry_parse.ts` becomes a
THIN wrapper — `parsePastedExperience(pasted)` = `splitBullets` + the
first-line marker check, PLUS `matchDatePattern(text)` (the deterministic
MONTH-PRECISION drop-time matcher per the §13.1 pinned grammar — a
matched segment is consumed into the structured fields; a bare year /
year-only range / prose date → the legacy free-text `dates`, never a
month invention) — with tests for the placement rules, the matcher, and
the absence of any AUTOMATIC date attribution (analyze remediations
F1–F3 applied 2026-11-06: the spec §13.4 update-in-place sentence, the
§13.1 grammar pin, the §13.5 consumption criterion). FILE LIST rows 1,
2, 8, 9 read accordingly
(row 9 also drops the per-type DATE strings and adds the type-switcher
label); everything else stands.

### Design additions

- **Paste-first entry (`entry_details` → `entry_paste`)** — after
  `entry_type` (unchanged), the entry screen is ONE paste box (the whole
  experience: title, organization, dates, achievements — as written in
  the resume) + the kept 8-line soft-limit note; the discrete detail
  fields are gone from entry time. The paste textarea keeps the existing
  draft autosave (`web/src/lib/draft.ts`, cleared only on success — P18).
- **Deterministic paste parser (NEW `web/src/engine/flow/entry_parse.ts`)**
  — `parsePastedExperience(pasted)` separates the parts BEFORE the split:
  the FIRST line, when it is not `-`/`•`-prefixed, is the header line —
  split on `|`, en/em dash, hyphen, and comma separators; a segment
  matching a date pattern (`YYYY-MM`, `YYYY`, `YYYY–YYYY`,
  "present"/"current") is the dates segment; the first non-date segment
  pre-fills the title, the second the organization. Nothing is dropped or
  invented (P1): unrecognized header segments flow into the achievements
  text, and date text that does not parse to `YYYY-MM` is stored in the
  legacy free-text `dates` field (display fallback). A marker-prefixed
  first line means no header — all fields stay empty. `product_domain` is
  NEVER parsed. The remaining lines feed the EXISTING `splitBullets`
  unchanged.
- **Post-paste review screen (NEW `entry_review`; `entry_split` removed)**
  — one screen shows every part separately and editable: the ONE unified
  form component (same fields for every type; the organization label
  follows the type — Job "Company", Project "Project name", Course
  "Provider", Side work "Client") plus the achievements list ("I found N
  achievements. Is that correct?") as numbered, individually editable
  text blocks. The Merge with next / Split / Delete buttons and the
  Keep/Discard + "and also" suggestion UI are REMOVED (`splitBullets`
  itself is UNCHANGED — it keeps computing `flagged`/`splitSuggested`;
  the UI just no longer renders controls for them, so the Phase 13 engine
  tests stay green). Cleared rows are dropped at confirm; confirmed
  bullets are verbatim paste lines or the user's own edits (P2).
- **Structured dates (web-additive)** — `start_date`/`end_date`
  (`YYYY-MM`, validated text inputs with a B1 format error — not a native
  month picker) + an `ongoing` checkbox ("I still work here" — checked
  clears and disables the end field; dates display "2022-04 – present").
  The legacy free-text `dates` field is RETAINED as (a) the load-compat
  fallback for old documents and (b) the holder for unparseable pasted
  date text; display rule: the structured pair when present, else the
  legacy string. Old documents load unchanged (additive, never
  backfilled — P5).
- **Score screen merged into the bullet list (`score` removed)** —
  `bullet_list` becomes the review page: the unchanged bullet list + the
  score panel at the BOTTOM — `ScoreRing` (§11.5 styling unchanged)
  showing `entry_score` beside "Experience score: {value}/100" (NEW panel
  string WITHOUT the rubric version). The "Overall score" label
  (`SCORE_OVERALL`) and the rubric-version header are retired from
  DISPLAY; `SCORE_OVERALL_HIDDEN` + `SCORE_DRAFT_LINE` carry the draft
  no-number state; `ENCOURAGE_SCORED` renders only right after a fresh
  scoring (same condition as today's score screen). Per-bullet dimension
  lines leave the summary; per-part detail stays inside BulletGate
  (§5.2/§6.2). The rubric version string stays STORED with every score
  (§3 unchanged).
- **Back on every stage** — a text-only "Back" control (no arrows/icons,
  §11.1 rule 1) on: entry_type→menu · entry_paste→entry_type ·
  entry_review→entry_paste · bullet_list→entry_review ·
  bullet_gate→bullet_list · confirm_complete→bullet_list ·
  merge→bullet_list · copy→bullet_list · survey→copy · match_hard→
  match_review · match_soft→match_hard (gate/welcome/menu/done keep none;
  the existing match-flow Cancels already cover paste/review; byok
  settings keeps its Back). Going back never wipes state (all flow state
  is component state that survives `go()`; the paste additionally
  autosaves) — this promotes the deferred Phase 15 item (8) Back clause;
  auto-save of ANSWERS stays deferred.
- **Re-confirm semantics (P5 note)** — re-confirming `entry_review` after
  going back UPDATES the same stored entry (the client keeps the entry id
  from the first confirm and re-sends with it; the API/schema gain an
  optional entry id → update-in-place) instead of duplicating it;
  unchanged bullet text produces identical deterministic scores. This is
  the §13.4 "re-runs exactly as a fresh confirm" rule.
- **Stage bar fix + labels** — FLOW_LABELS (add flow) become
  `Experience / Review / Achievements / Result`; STAGE_INDEX:
  entry_type+entry_paste=0, entry_review=1, bullet_list+bullet_gate=2
  (fixes today's regression — bullet_gate maps to index 2 while being
  reached from bullet_list at index 3), confirm_complete+merge+copy=3;
  match labels unchanged; no bar on gate/welcome/menu/settings/survey/
  done (as today).

### Files to modify (complete list — user rule: file list before coding)

| # | File | Change |
|---|---|---|
| 1 | `web/tests/engine/entry_parse.test.ts` | NEW — failing tests first (P9): header parse, date patterns (YYYY-MM / range / present / unparseable→legacy `dates`), marker-first & single-line pastes, unattributed segments preserved, domain never guessed |
| 2 | `web/src/engine/flow/entry_parse.ts` | NEW — deterministic `parsePastedExperience` (web-only input shaping — no twin, no parity coupling; the D24 pattern) |
| 3 | `web/src/engine/types.ts` | ExperienceEntry optional `start_date`/`end_date`/`ongoing` |
| 4 | `web/src/engine/flow/pathService.ts` | pass the three fields; update-in-place on re-confirm (optional entry id) |
| 5 | `web/src/lib/schemas.ts` | AddEntryRequestSchema: optional `start_date`/`end_date` (regex `^\d{4}-(0[1-9]|1[0-2])$`)/`ongoing` + optional entry id |
| 6 | `web/src/app/api/entry/route.ts` | pass-through (+ update path) |
| 7 | `web/src/lib/client.ts` | StoredEntry optional new fields |
| 8 | `web/src/app/page.tsx` | entry_paste + entry_review screens; entry_split/score screens REMOVED; unified form (per-type labels, structured dates + ongoing), editable achievements list; score panel into bullet_list; Back on all listed screens; STAGE_INDEX/FLOW_LABELS fix |
| 9 | `web/src/engine/messages.ts` | NEW: paste label/instruction, review heading, per-type org labels (×4), Start/End/"I still work here", date-format error, "Back", panel score line, stage labels; REMOVED: SPLIT_MERGE/SPLIT_DELETE/SPLIT_ACCEPT/SPLIT_KEEP/SPLIT_DISCARD/SPLIT_KEEP_ONE/SPLIT_WHERE/SPLIT_SUGGESTION/SPLIT_FLAG_PROMPT; KEPT: SPLIT_FOUND/SPLIT_CONFIRM/SOFT_LIMIT_NOTE/ADD_PASTE_*/draft strings |
| 10 | docs: plan/research/data-model/quickstart/tasks (+ spec already amended) | Phase 18 records |

`web/src/engine/flow/entry_split.ts`, `parts.ts`, the Python engine,
terminal, parity harnesses: UNTOUCHED. contracts/: no change — no external
interface contract covers the web entry API (the zod schema is the
validation source, as since Phase 13).

### Constitution check (Phase 18) — constitution v4.0.0

No violations. P1 (pre-fill from conservative patterns only, never
guessed; unattributable text preserved — nothing lost, nothing invented),
P2 (every shaping decision is the user's own edit; confirm required), P3
(scoring untouched), P4 (no rubric change; the version stays stored — only
the display drops it), P5 (additive fields never backfilled;
update-in-place avoids duplicate entries; unchanged text → identical
deterministic scores), P7 (existing entry events continue; an
update-in-place logs the same entry_saved shape — no new event family), P8
(simplification — screens and controls REMOVED; no new dependencies;
native text inputs), P9 (entry_parse tests written first, failing), P10/
P16 (all new strings English B1), P17 (tsc strict), §11.1 (Back is
text-only — no icons/arrows; warm tokens only), P12–P14 (no LLM surface
touched), P18 (Back never wipes; draft autosave unchanged; confirm
persists server-side independently of any model outcome).

### Expected gates

`npm run test:engine` green (new entry_parse tests TDD red-first + existing
split 11 + theme 6 + display 6) · `tsc --noEmit` clean · `next build`
exit 0 · parity PARITY OK (corpus unchanged) · `npm run test:byok` 23/23
baseline (BYOK_SKIP_LIVE=1) · `npm run scan:byok` passed ·
`PYTHONUTF8=1 python -m pytest` 213 green from terminal/ · walkthrough:
paste a full experience → review shows pre-filled fields + YYYY-MM dates +
ongoing checkbox + editable achievements (no shaping buttons) → clear a
row → confirm → review page shows the panel (Experience score + ring
only) → Back at every stage returns with state intact → re-confirm
updates the entry (no duplicate) → 0 achievements → draft.
