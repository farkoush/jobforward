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
