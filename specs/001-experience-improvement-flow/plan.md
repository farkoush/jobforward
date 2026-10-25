# Implementation Plan: Help Entry-Level Job Seekers Narrate Their Experience (Level 1 Prototype)

**Branch**: `001-experience-improvement-flow` | **Date**: 2026-10-25 | **Spec**: ./spec.md

**Input**: Feature specification from `specs/001-experience-improvement-flow/spec.md`
(text-only terminal flow; English B1 tool text and English-only user input;
three-dimension rubric version 2 with deterministic scoring; one complete
improvement path for a single experience entry plus a job description matcher;
constitution v2.0.0).

## Summary

Build a Python interactive CLI prototype that walks an entry-level product-
manager job seeker through one complete improvement path for one experience
entry — record the entry (type, title, 1–6 free-text English bullets), score
each bullet on three dimensions (Context, Role and Action Clarity, Result)
from structured 0/1/2 ratings, run a per-bullet rewrite gate (default Yes)
with 0–3 skippable questions for dimensions scoring 0 or 1, assemble rewrites
only from the bullet text plus the user's answers, replace bullets only on
explicit approval (status "edited", history retained, previous bullet
preserved), re-analyze only new/edited bullets, show before/after scores side
by side, and warn on overlapping bullets. A second feature fully analyzes a
pasted job description (hard/soft skills; Required/Preferred/Bonus priorities;
red-line grouped under Required) and assigns exactly one entry-level action —
Highlight / No change / Not relevant to this job — with a one-line reason per
entry. All score arithmetic is deterministic code under rubric_version 2.0.0
(reference fixture: two bullets, dimension means 100/75/75 → entry score
250/3 ≈ 83.33); stability gate: ≥ 90% of bullet-by-dimension scores identical
across 5 consecutive runs. All data stays in local files (single-user JSON
document + append-only event log); every user-facing string is English at B1
level and bullet text is stored verbatim.

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
Constitution version in force: **2.0.0** (amended 2026-10-25).

| # | Principle | Design-time gate | Status | Verification |
|---|---|---|---|---|
| 1 | User data integrity — no fabricated claims | Rewrite assembler takes only bullet text + user answers; "no extra claim" contract test exists; rule applies to pattern-guided rewrites too | PASS | design: `flow/rewrite.py` + tests |
| 2 | User as decision-maker | Every mutation (rewrite approval, direct edit, delete, merge) behind explicit user action; gate rejection / skipped questions → no rewrite; partial answers → draft-or-approve option | PASS | design: `flow/questions.py`, `flow/path_service.py` |
| 3 | Score independent of job posting | No posting artifact reaches the scoring path; matcher output stored separately from scores; scores unchanged when a posting changes | PASS | design: `matcher/` isolated from `scoring/metrics.py` |
| 4 | Transparent, repeatable, traceable scoring | Three fixed dimensions (context, role_action_clarity, result), 0/1/2 ratings from adapter; arithmetic only in `metrics.py`; rubric_version = "rubric-2.0.0" stored next to every score; invalid evaluator output rejected, retried once, then reported; stability gate ≥ 90% identical bullet-dimension scores over 5 runs (deterministic local adapter → 100%) | PASS | design: `scoring/metrics.py`, evaluator contract |
| 5 | Incremental analysis | Bullet statuses (new/edited/analyzed) with exact semantics from spec Clarifications; unchanged bullets keep score + label | PASS | design: `flow/incremental.py` |
| 6 | Own data, resume-only + JD matcher boundary | No fabricated experience; drafts excluded from average; matcher analyzes only user-pasted posting text, emits exactly one validated action per entry (Highlight / No change / Not relevant), never Remove/Shorten, never modifies text | PASS | design: `matcher/analyzer.py`, `matcher/actions.py` |
| 7 | Measurability | Append-only timestamped event log covering start, completion, suggestion accept/reject, score before/after, deletions, posting analysis | PASS | design: `storage/events.py` |
| 8 | Prototype simplicity | Text-only English CLI, local files, no login/upload; PDF upload + email sign-in deferred; two justified additions in Complexity Tracking (optional LLM scoring adapter, matcher with rule-based default) | PASS (with notes) | Complexity Tracking |
| 9 | Test-driven | Tests for formula (250/3 ≈ 83.33), no-extra-claims, incremental analysis, gate/question rejection exist BEFORE implementation; 83.33 reference test is permanent | PASS | design: test plan in quickstart.md |
| 10 | Language | All strings in `messages.py` (English B1); user input validated as English; bullet text stored and displayed verbatim | PASS | design: `messages.py` |

**Post-Phase-1 re-check**: PASS — no gate violated; two justified complexity
items below.

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
│   ├── questions.py        # per-bullet rewrite gate + 0-3 skippable questions
│   ├── rewrite.py          # assembles rewrites from bullet + user answers ONLY
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

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Optional LLM scoring adapter (`scoring/adapters/llm.py`, opt-in) | The PRD describes language-model ratings with structured, validatable output; PRD acceptance includes invalid-output and retry behavior that only exist with a model in the loop | A local-only heuristic adapter alone cannot exercise the invalid-output/retry/report path, and deleting the port would break the reference-example, stability, and no-claims test strategy that depends on separating ratings (adapter) from arithmetic (deterministic code). Default run remains fully local (Principle 8 compliant) |
| `matcher/` package with its own adapter port | Spec US5 / FR-021–FR-022 (docs/prd.md §4.1) require full posting analysis and per-entry actions; requirement extraction is language-model-shaped work but the default run must stay offline | A single LLM-only matcher would break the default-local rule (Principle 8) and the determinism needed to test classification; a purely manual matcher would contradict the product purpose. The port keeps the default run deterministic (rule-based keyword analyzer) with the same validate/retry/report contract as the scoring evaluator |
