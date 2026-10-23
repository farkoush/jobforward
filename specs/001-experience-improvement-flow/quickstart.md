# Quickstart: Run & Validate the Level 1 Prototype (Design-Time Validation Guide)

Validation guide for `specs/001-experience-improvement-flow`. Implementation
detail (module bodies, migrations, full test suites) belongs to `tasks.md` and
the implementation phase — this file documents WHAT must be runnable under
which commands and WHAT the expected outcome is, referencing
`data-model.md` and `contracts/interface-contracts.md`.

## Prerequisites

- Python 3.12 on PATH (`python --version`)
- Windows PowerShell / any UTF-8 terminal
- No installed dependencies (stdlib only) — nothing to install

## Setup

```powershell
# from the repository root
$env:PYTHONUTF8 = "1"        # Persian output needs UTF-8 in Windows terminals
python -m pytest tests/ --import-mode=importlib   # TDD order per constitution P9
```

Expected: tests exist and, before implementation, FAIL first
(constitution Principle 9); after implementation, all pass.

## Mandatory test-first suite (written BEFORE implementation)

| Test file | Proves (spec requirement) |
|---|---|
| tests/unit/test_metrics.py | FR-007 formula + the permanent 81.25 reference ((2,2),(2,1),(2,0),(2,2)) |
| tests/unit/test_no_extra_claims.py | FR-010 zero-fabrication validator (bug, zero tolerance) |
| tests/unit/test_incremental.py | FR-012 only-new/edited re-analysis; unchanged keep score+label; Q4 status semantics |
| tests/unit/test_questions.py | FR-009 1–2 questions, every question rejectable, rejection/no-answer → no rewrite |
| tests/contract/test_evaluator_output.py | FR-008 rating schema; FR-014 invalid → reject → retry once → report, data intact |
| tests/contract/test_cli_session.py | FR-017 Persian-only prompts; verbatim bullet echo; prompt-id contract |
| tests/integration/test_full_path.py | complete path + FR-015 events in `data/events.log.jsonl` (start, completion, accept/reject, score before/after, deletions) |
| tests/unit/test_stability.py | SC-003 five consecutive runs on a fixed experience: max−min ≤ 5 |

## Run the tool (interactive Persian text-flow)

```powershell
$env:PYTHONUTF8 = "1"
python -m jobforward
```

### Scenario A: happy path (proves SC-001, SC-002, SC-007)

1. Add an entry (job/project/course/side work) + 2 bullets →
   EXPECT: per-dimension scores per bullet, experience score, overall score;
   every score carries the rubric version (FR-005, FR-008).
2. Answer a question for one bullet ("Did this project change something …?"),
   then approve the rewrite →
   EXPECT: bullet replaced with status "edited", previous bullet retained in
   history (FR-011); BEFORE/AFTER score shown side by side (FR-012); re-scoring
   touches only the changed bullet (FR-012).
3. Exit and inspect `data/events.log.jsonl` →
   EXPECT: `path_start`, `analysis_completed`, `proposal_accepted`,
   `score_before`, `score_after` lines with ISO-8601 timestamps (FR-015; 100%
   of important events — SC-008).

### Scenario B: rejections protect the user (proves SC-004, SC-005)

1. Reject each offered question → EXPECT no rewrite and byte-identical bullet.
2. Reject a proposed rewrite → EXPECT nothing changes (text + scores identical).
3. Validate that no step shows a number, impact, or claim absent from the
   bullet + your own answers (FR-010 zero tolerance = 100% pass).

### Scenario C: repetition & independence (proves SC-003, FR-006)

1. Re-run the tool 5 times without changing the experience →
   EXPECT: identical overall score each run (max−min = 0 with the default local
   adapter; ≤ 5 allowed by SC-003) and no bullet re-analyzed (unchanged keep
   score+label).
2. With no job posting context at any time, all scores are identical whether a
   posting text happens to be on screen or not (FR-006).

### Scenario D: guards & recoverability (proves FR-002, FR-003, FR-013, FR-014, FR-020)

1. Enter 7 bullets → EXPECT explicit Persian rejection asking to reduce; entry
   untouched until ≤6.
2. Add an entry with 0 bullets → EXPECT draft treatment, excluded from the
   overall average, suggestion to write a description (FR-003).
3. Two overlapping bullets → EXPECT merge warning with zero effect on any score;
   answering "no merge" leaves everything unchanged (FR-013).
4. (adapter-dependent) Force an invalid evaluator response → EXPECT one retry,
   then a clear Persian error; the saved document is unchanged and usable
   (FR-014 event `evaluator_invalid_output` / `evaluator_retry` logged).
5. Delete a bullet then all its entry's bullets → EXPECT deletion confirmation
   step, exclusion from scores, entry returns to draft (FR-020, index and draft
   invariant — see data-model.md).

## Where to look next

- State machine + entities: `data-model.md`
- Prompt/JSON contracts: `contracts/interface-contracts.md`
- Decisions & rationale: `research.md`
