# Implementation Plan: Help Entry-Level Job Seekers Narrate Their Experience (Level 1 Prototype)

**Branch**: `001-experience-improvement-flow` | **Date**: 2026-10-23 | **Spec**: ./spec.md

**Input**: Feature specification from `specs/001-experience-improvement-flow/spec.md`
(text-only flow; Persian UI; deterministic scoring; one complete improvement path
for a single experience entry, per the project constitution).

## Summary

Build a Python interactive CLI prototype that walks an entry-level product-manager
job seeker through one complete improvement path for one experience entry:
record the entry and 1–6 bullets (optionally with the context→action→result
template as an aid), score each bullet on four dimensions from structured 0/1/2
ratings, ask at most one round of rejectable questions per improvable bullet,
assemble rewrites only from the bullet text plus the user's answers, replace
bullets only on explicit approval (status "edited", history retained, previous
bullet preserved), re-analyze only new/edited bullets, show before/after scores
side by side, and warn on overlapping bullets. All scores are computed by
deterministic code with a recorded rubric version; all important events are
logged with timestamps to a local JSONL file; all data stays in local files
(single-user JSON document + append-only event log); every user-facing string is
Persian and bullet text is stored verbatim.

## Technical Context

- **Language/Version**: Python 3.12 (user decision: "بر اساس پایتون ساخته شود")
- **Primary Dependencies**: Python standard library only for the v1 core
  (dataclasses, json, pathlib, argparse, datetime). The LLM scoring adapter is
  optional, behind a narrow port, and opt-in; no SDK enters the core path.
- **Storage**: local files only — `data/resume.json` (single-user document,
  written atomically via temp-file + replace) and `data/events.log.jsonl`
  (append-only, ISO-8601 timestamps)
- **Testing**: pytest, test-first per constitution Principle 9; the 81.25
  reference example is a permanent test fixture
- **Target Platform**: Windows terminal (current machine) and any UTF-8 terminal;
  run guidance sets `PYTHONUTF8=1` (Persian output)
- **Project Type**: CLI / interactive text-flow application (terminal "chat" loop)
- **Performance Goals**: every local operation responds in under 0.5 s
  (pure local computation, no network in the default run)
- **Constraints**: zero fabricated claims (zero tolerance — Principle 1); no
  login / upload / external transmission in the default run (Principle 8);
  numeric scoring deterministic (Principle 4); Persian UI, verbatim bullet text
  (Principle 10); single complete improvement path (Principle 8: anything beyond
  it must be justified before build)
- **Scale/Scope**: one local user; dozens of entries; hard limit 1–6 bullets per
  entry (spec FR-001/FR-002)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Design-time gate | Status | Verification |
|---|---|---|---|---|
| 1 | User data integrity — no fabricated claims | Rewrite assembler takes only bullet text + user answers; "no extra claim" contract test exists | PASS | design: `flow/rewrite.py` + tests |
| 2 | User as decision-maker | Every mutation (rewrite, merge, delete, direct edit) behind explicit user action; rejected question → no rewrite | PASS | design: `flow/path_service.py` |
| 3 | Score independent of job posting | No posting artifact exists in the data model at all | PASS | design: `models/` |
| 4 | Transparent, repeatable, traceable scoring | Rating (0/1/2) separated from deterministic `metrics.py`; rubric version stored next to every score; invalid evaluator output rejected, retried once, then reported | PASS | design: `scoring/metrics.py`, evaluator contract |
| 5 | Incremental analysis | Bullet statuses (new/edited/analyzed) with exact semantics from Clarifications; unchanged bullets keep score + label | PASS | design: `flow/incremental.py` |
| 6 | Only own data, resume-only | No fabricated experience; drafts (0 bullets) excluded from average | PASS | design: storage schema |
| 7 | Measurability | Append-only timestamped event log covering start, completion, suggestion accept/reject, score before/after, deletions | PASS | design: `storage/events.py` |
| 8 | Prototype simplicity | Text-only CLI, local files, no login/upload; the optional LLM adapter is the single justified addition (see Complexity Tracking) | PASS (with note) | Complexity Tracking |
| 9 | Test-driven | Tests for formula, no-extra-claims, incremental analysis, question rejection exist BEFORE implementation; 81.25 reference test is permanent | PASS | design: test plan in quickstart.md |
| 10 | Language | All strings in `messages.py` (Persian); bullet text stored and displayed verbatim | PASS | design: `messages.py` |

**Post-Phase-1 re-check**: PASS — no gate violated; one justified complexity item
below.

## Project Structure

### Documentation (this feature)

```text
specs/001-experience-improvement-flow/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
src/jobforward/
├── cli.py                  # Persian text-flow session loop (entry point)
├── messages.py             # Single source of truth for all Persian strings
├── models/                 # experience entry, bullet, suggestion, event, rubric version
├── scoring/
│   ├── evaluator.py        # port: returns validated structured ratings per bullet
│   ├── adapters/
│   │   ├── local.py        # deterministic offline adapter (default in v1)
│   │   └── llm.py          # optional adapter for a language model; validates output,
│   │                       #   retries once on invalid JSON, then reports failure
│   └── metrics.py          # fixed formula: dimension / experience / overall + 81.25 check
├── flow/
│   ├── path_service.py     # orchestrates the one complete improvement path
│   ├── questions.py        # picks 1–2 questions per improvable bullet; handles rejection
│   ├── rewrite.py          # assembles rewrites from bullet + user answers ONLY
│   └── incremental.py      # decides which bullets are new/edited and re-analyze
├── storage/
│   ├── repository.py       # atomic load/save of the local document
│   ├── events.py           # append-only JSONL event logger
│   └── schema.py           # storage invariants and versioned rubric field
└── tests/…
tests/
├── unit/                   # formula, no-extra-claims, statuses, message culture
├── contract/               # evaluator output schema, CLI session contract
└── integration/            # full-path end-to-end scenarios (acceptance criteria)
```

**Structure Decision**: Single CLI project (template Option 1) — smallest layout
that satisfies constitution Principle 8; every module maps to exactly one
constitution principle so the compliance review is trivial.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Optional LLM scoring adapter (`scoring/adapters/llm.py`, opt-in) | The spec/PRD explicitly describes language-model ratings with structured, validatable output (constitution Principle 4); PRD acceptance includes invalid-output and retry behavior that only exist with a model in the loop | A local-only heuristic adapter alone cannot exercise the PRD's invalid-output/retry/report path, and deleting the port would break the reference-example, stability, and no-claims test strategy that depend on separating ratings (adapter) from arithmetic (deterministic code). Default run remains fully local (Principle 8 compliant) |

## Done-When Mapping (preview for tasks phase)

- PR-9 tests exist before implementation: scoring formula (+81.25),
  no-extra-claims, incremental analysis, question rejection (quickstart.md)
- SC-002/SC-003 verified by unit + integration tests using the local adapter
- SC-008 verified by an integration test reading `events.log.jsonl`
