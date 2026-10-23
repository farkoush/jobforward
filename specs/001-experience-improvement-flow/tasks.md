# Tasks: Help Entry-Level Job Seekers Narrate Their Experience (Level 1 Prototype)

**Input**: Design documents from `/specs/001-experience-improvement-flow/`

**Prerequisites**: plan.md (required), spec.md (required), research.md,
data-model.md, contracts/, quickstart.md — all present in this feature dir.

**Tests**: included — the constitution (Principle 9) mandates test-first
implementation and defines the mandatory test list (see quickstart.md). Tests
are marked with the note; tasks are ordered so each story's tests exist before
its implementation tasks.

**Organization**: Tasks are grouped by user story (US1–US4 from spec.md) so
each story can be implemented and tested independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1…US4)
- Include exact file paths in descriptions

## Path Conventions

- Single CLI project (plan.md Structure Decision): `src/jobforward/`, `tests/`
  at repository root, data files in `data/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Create project skeleton per plan.md: `src/jobforward/` with
  empty `cli.py`, `messages.py`, `models/`, `scoring/` (`evaluator.py`,
  `metrics.py`, `adapters/`), `flow/` (`path_service.py`, `questions.py`,
  `rewrite.py`, `incremental.py`), `storage/` (`repository.py`, `events.py`,
  `schema.py`)
- [ ] T002 Create `pyproject.toml` (name `jobforward`, `requires-python = ">=3.12"`,
  zero runtime dependencies) and `pytest.ini` (`testpaths = tests`);
  add a comment on running tests/CLI with `PYTHONUTF8=1` on Windows
- [ ] T003 [P] Create `src/jobforward/messages.py` with the Persian prompt-id
  constants from contracts/interface-contracts.md (`ADD_*`, `Q_RESULT_HINT` =
  «اگر عدد واقعی داری، همان را اضافه کن», `ASK_*`, `PROPOSAL_*`, `SCORE_*`,
  `MERGE_WARN`, `CONFIRM_DELETE_*`, `ERR_*`) — no other module may contain
  user-facing Persian strings (constitution Principle 10)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story

**?? CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 Implement all dataclasses/enums per data-model.md in
  `src/jobforward/models/entities.py`: ExperienceEntry (type enum job/project/
  course/side_work, title, organization/start/end optional verbatim,
  bullets 1–6, draft iff zero bullets, tombstone `deleted`),
  Bullet (verbatim text, status, ratings, rubric_version, history,
  questions, proposals, merge_warned), Ratings (four dims int in {0,1,2}),
  QuestionRecord, ProposalRecord, BulletHistory — with the validation rules
  VR-1–VR-5 quoted in data-model.md
- [ ] T005 Implement the status state machine from data-model.md
  (`new` until first successful analysis → `analyzed`; post-analysis change →
  `edited` → `analyzed` after re-analysis; failed analysis keeps prior label)
  in `src/jobforward/models/status.py`, including a transition function that
  rejects illegal transitions
- [ ] T006 Implement `src/jobforward/storage/repository.py`: atomic
  load/save of the single-user document `data/resume.json`
  (temp file + `os.replace`), `document_version` and `rubric_version` fields,
  and serialization of every entity from T004
- [ ] T007 [P] Implement `src/jobforward/storage/events.py`: append-only
  `data/events.log.jsonl` writer with ISO-8601 `ts` and the event types from
  data-model.md (`path_start`, `analysis_completed`, `proposal_accepted`,
  `proposal_rejected`, `question_rejected`, `bullet_deleted`, `entry_deleted`,
  `score_before`, `score_after`, `evaluator_invalid_output`, `evaluator_retry`)
- [ ] T008 Implement `src/jobforward/scoring/evaluator.py`: the
  `BulletEvaluator` port (request: verbatim bullet texts + optional user
  answers + rubric version; response: validated structured output per
  contracts/evaluator-output.schema.json). Include the shared validity check:
  schema match, all four keys ints in {0,1,2}, one rating per bullet; invalid
  output → rejected; adapters own one retry then must surface a failure
  (FR-014). No arithmetic and no text change may ever live in an adapter

**Checkpoint**: Foundation ready — user story implementation can begin

---

## Phase 3: User Story 1 — Record an experience and see a transparent score (P1) — MVP

**Goal**: The user records an entry (type/title/optional org/dates/1–6
bullets, optional context→action→result aid) and sees per-dimension scores,
the experience score, and the overall score — independent of any job posting.

**Independent Test**: `tests/integration` scenario: record the entry with
bullets rated (2,2), (2,1), (2,0), (2,2) and observe exactly 81.25 in the
experience score; run without any posting context.

### Tests for User Story 1 (write FIRST — must FAIL before implementation)

- [ ] T009 [P] [US1] Write `tests/unit/test_metrics.py`: dimension =
  sum÷(2×n)×100, experience = equal-weighted mean of the 4 dimensions,
  overall = simple mean of entries with bullets; the permanent reference
  fixture (2,2),(2,1),(2,0),(2,2) → exactly 81.25 (FR-007); drafts/deleted
  excluded (FR-003)
- [ ] T010 [P] [US1] Write `tests/contract/test_evaluator_output.py`:
  schema-compliant output accepted for input bullets; output with a rating
  of 3 / missing key / extra aggregate number → invalid; invalid → rejected,
  one retry, then reported; no partial scoring; FR-006 enforced (no posting
  input anywhere in the rating path)
- [ ] T011 [P] [US1] Write `tests/contract/test_cli_session.py`: all
  `ADD_*` prompts match `messages.py` (Persian), entry fields echoed verbatim,
  template result field shows ONLY `Q_RESULT_HINT`, empty optional fields
  stay visibly empty; prompts recorded via prompt ids
- [ ] T012 [P] [US1] Write `tests/unit/test_storage.py`: atomic save/load
  round-trip of a document containing one entry/bullet; save must leave no
  partial file on failure; VR-1 (1≤bullets≤6) enforced

### Implementation for User Story 1

- [ ] T013 [P] [US1] Implement the deterministic scoring engine
  `src/jobforward/scoring/metrics.py` (pure functions from T009)
- [ ] T014 [US1] Implement the default offline evaluator
  `src/jobforward/scoring/adapters/local.py`: deterministic rule-based ratings
  (template-field presence, quantified vs vague outcome skill keywords,
  single-verb action, bullet ordering/scannability) restricted to 0/1/2 per
  dimension, no aggregate math (depends on T008)
- [ ] T015 [US1] Implement entry recording + validation in
  `src/jobforward/flow/path_service.py`: `add_entry` enforces VR-1 (>6 bullets
  rejected, FR-002), zero bullets → draft + suggestion (FR-003), sections
  saved verbatim via repository
- [ ] T016 [US1] Implement the interactive CLI
  `src/jobforward/cli.py`: state machine IDLE→ENTRY_FILLED→SCORE_SHOWN per
  contracts/cli-session.md, rendering the Persian prompts and the
  `SCORE_*` display (per-dimension per-bullet, experience score, overall score,
  rubric version next to every score, FR-005/FR-008)
- [ ] T017 [US1] Emit log events in the CLI path: `path_start` on session
  start, `analysis_completed` after successful scoring (FR-015), via T007

**Checkpoint**: User Story 1 is fully functional and testable independently
(Scenario A step 1 + Scenario C of quickstart.md)

---

## Phase 4: User Story 2 — Question, answer, rewrite, explicit approval (P2)

**Goal**: For each bullet with room for improvement ask 1–2 rejectable
questions in at most one round; on an answer assemble a rewrite from only the
bullet + answers; approve → replace (status "edited", history kept);
reject/skip → nothing changes.

**Independent Test**: On a US1-scored experience, walk
question→answer→proposal→approve; separately reject a question and verify no
rewrite and a byte-identical bullet.

### Tests for User Story 2 (write FIRST — must FAIL before implementation)

- [ ] T018 [P] [US2] Write `tests/unit/test_questions.py`: selection rule
  (outcome < 2 OR skill_evidence < 2) yields exactly 1–2 Persian questions;
  a hard cap of ONE round per bullet per improvement run; every question
  carries a reject/skip option; rejection or no answer → no proposal and the
  bullet unchanged (FR-009 + Clarification Q1)
- [ ] T019 [P] [US2] Write `tests/unit/test_no_extra_claims.py`: the
  allow-list validator (bullet text ∪ user answers) accepts reassembled
  user-own segments and rejects any added number, impact, or claim; treat
  violation as a refused assembly, never a shown proposal (FR-010)
- [ ] T020 [P] [US2] Extend `tests/contract/test_cli_session.py`: `ASK_*`
  prompt with numbered answer/reject choices; `PROPOSAL_*` with
  approve/reject; approve → bullet replaced + status "edited" + previous text
  in history; reject → text and scores identical (FR-011)

### Implementation for User Story 2

- [ ] T021 [US2] Implement `src/jobforward/flow/questions.py`: question
  generation from the same rubric that produced the ratings (outcome gap →
  result-impact question; skills gap → relevance question), round cap logic
  (depends on T004/T008)
- [ ] T022 [US2] Implement `src/jobforward/flow/rewrite.py`: segment-based
  assembly from allowed sources only (original bullet parts + user answers,
  context→action→result slot structure), final no-extra-claims validation
  before showing a proposal (depends on T019)
- [ ] T023 [US2] Wire the loop into `flow/path_service.py` +
  `src/jobforward/cli.py`: AWAITING_QUESTION_ANSWER → answer →
  REWRITE_AWAITING_APPROVAL → decision; on approval write the new bullet
  (status "edited" via T005, history append); on reject nothing changes;
  emit `proposal_accepted` / `proposal_rejected` / `question_rejected` events
  (depends on T021, T022)

**Checkpoint**: User Stories 1 AND 2 work independently (Scenario B of
quickstart.md)

---

## Phase 5: User Story 3 — Incremental re-analysis and before/after comparison (P3)

**Goal**: Reruns re-analyze only new/edited bullets; unchanged bullets keep
score and label; approved rewrites show BEFORE/AFTER side by side.

**Independent Test**: Take a US1-scored 3-bullet entry, edit 1 bullet directly
(user edit = "edited"), rerun: only that bullet is re-analyzed; the others
keep score+label; side-by-side before/after is visible.

### Tests for User Story 3 (write FIRST — must FAIL before implementation)

- [ ] T024 [P] [US3] Write `tests/unit/test_incremental.py`: status
  semantics (T005) drive which bullets re-analyze; unchanged bullets keep
  previous ratings + rubric_version AND their label; direct user edit flips
  only that bullet to "edited"; after re-analysis returns to "analyzed"
  (FR-012, Clarification Q2/Q4)
- [ ] T025 [P] [US3] Write `tests/unit/test_stability.py`: run the local
  adapter 5 consecutive times over a fixed experience → max−min overall
  score = 0 (allowed ≤5) and no re-analysis occurs (SC-003)
- [ ] T026 [P] [US3] Write `tests/integration/test_full_path.py`: the
  complete record→score→question→answer→approve→rerun path; assert the
  `data/events.log.jsonl` contains every required event type with ISO
  timestamps and numeric score_before/score_after (FR-015, SC-001, SC-008)

### Implementation for User Story 3

- [ ] T027 [US3] Implement `src/jobforward/flow/incremental.py`: diff of
  current bullets vs. persisted state → set of new/edited bullets to
  re-analyze; unchanged bullets carry previous ratings/rubric_version forward
  untouched (depends on T005, T008)
- [ ] T028 [US3] Implement the results view in `src/jobforward/cli.py`:
  side-by-side BEFORE/AFTER score blocks for approved rewrites, including
  per-bullet labels (new/edited/analyzed) and rubric version on every score
  (FR-008, FR-012) + emit `score_before`/`score_after` events

**Checkpoint**: All three stories are independently functional (Scenario C of
quickstart.md)

---

## Phase 6: User Story 4 — Merge warning for overlapping bullets (P4)

**Goal**: Two or more overlapping bullets in one entry trigger a merge
warning with ZERO score effect and no merge without explicit confirmation.

**Independent Test**: An entry with two overlapping bullets shows the
warning; all scores unchanged; answering "no merge" leaves text+history intact
(FR-013).

### Tests for User Story 4 (write FIRST — must FAIL before implementation)

- [ ] T029 [P] [US4] Write `tests/unit/test_merge.py`: overlap detection
  flags only real overlap; warning presence never changes any
  bullet/experience/overall value; no-merge decision is a no-op (FR-013)

### Implementation for User Story 4

- [ ] T030 [US4] Implement overlap detection with the threshold stored in the
  rubric version in `src/jobforward/scoring/overlap.py`, wire
  `MERGE_WARN` rendering into `cli.py`, log the warning event; strictly no
  mutation without the user confirmation branch (depends on T005, T016)

**Checkpoint**: All four user stories work independently (Scenario D step 3)

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Qualified optional path + final validation affecting multiple stories

- [ ] T031 [P] Implement the optional, user-opt-in LLM adapter
  `src/jobforward/scoring/adapters/llm.py`: sends ONLY verbatim bullet text
  (+ the user's answers when assembling a rewrite) to a user-configured
  endpoint; validates output against the evaluator schema; on invalid output
  one internal retry then reports `ERR_*` (data intact); emits
  `evaluator_invalid_output`/`evaluator_retry` events; the default run stays
  fully local (complexity item in plan.md)
- [ ] T032 [P] Write `tests/unit/test_deletion.py` + implement deletion with
  confirmation in `flow/path_service.py`/`cli.py`: `CONFIRM_DELETE_*` prompt,
  exclusion of deleted bullets/entries from all scores, entry dropping to
  0 bullets reverts to draft, untouched histories of survivors,
  `bullet_deleted`/`entry_deleted` events (FR-020, Clarification Q3;
  depends on T016)
- [ ] T033 [P] Add the copy-text action (only text copying of each experience,
  FR-019): a non-mutating `COPY_*` prompt in `cli.py` that prints the exact
  entry text for clipboard use
- [ ] T034 [P] Add `README.md` at repository root: how to run (`PYTHONUTF8=1`,
  `python -m jobforward`), where data lives (`data/`), the local-only promise
  (FR-018), and pointer to quickstart.md
- [ ] T035 Run the full quickstart.md validation (all 4 scenarios) and record
  results in the PR/commit message
- [ ] T036 Final compliance review against the constitution: verify P1–P10
  one by one in code (zero-fabrication path, explicit approval paths,
  no posting input, deterministic metrics, statuses, local-only, log coverage,
  Persian strings only in messages.py, verbatim bullet storage)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — T001/T002 first, T003 parallel-safe
- **Foundational (Phase 2)**: depends on Setup — T004 → T005 sequential (same
  domain), T006 → T007 → T008 complete the blocking infra for ALL stories
- **US phases (3–6)**: depend on Phase 2 only; US2/US3/US4 consume US1's score
  output at runtime but are developed against it independently
- **Polish (Phase 7)**: depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: standalone after Foundation → MVP
- **US2 (P2)**: needs US1's ratings/flow at runtime, independent codebase-wise
- **US3 (P3)**: needs US1+US2 statuses to be meaningful; tests are still
  unit-isolated via T005 fixtures
- **US4 (P4)**: only consumes US1's scoring view; smallest story

### Within Each User Story

- Tests (T0xx marked "write FIRST") MUST fail before implementation
- models/port (T004–T008, foundations) → scoring/flow → CLI wiring → events
- Story checkpoint verified before moving to next priority

### Parallel Opportunities

- All [P] test tasks inside a story phase run together before its
  implementation tasks
- T013/T014 independent files (metrics vs adapter) once T008 lands
- US-phase tasks of different stories touch different files → parallelizable
  across developers after Phase 2

---

## Parallel Example: User Story 1

```bash
# Together (all independent test files):
Task: "tests/unit/test_metrics.py"        (T009)
Task: "tests/contract/test_evaluator_output.py" (T010)
Task: "tests/contract/test_cli_session.py"      (T011)
Task: "tests/unit/test_storage.py"        (T012)

# Then (after T008):
Task: "scoring/metrics.py"                (T013)
Task: "scoring/adapters/local.py"         (T014)
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → Phase 2 Foundational
2. Phase 3 US1: write failing tests (T009–T012), implement T013–T017
3. STOP and validate: quickstart Scenario A step 1 + metrics 81.25
4. Demo-ready increment (P1 value: transparent scoring)

### Incremental Delivery

1. Foundation → US1 (MVP) → US2 (improvement loop) → US3 (rerun economy +
   before/after) → US4 (merge warning) → Polish (LLM adapter + deletion +
   copy-text)
2. Each phase leaves the previous stories untouched and passing

### Single-developer default line (typical for this prototype)

Setup → Foundation → US1 → US2 → US3 → US4 → Polish, validating at every
story checkpoint against quickstart.md.

---

## Notes

- [P] = different files, no dependencies; story labels give traceability
- Tests BEFORE implementation (constitution Principle 9 mandatory)
- All user-facing Persian strings come from `messages.py` only (T003);
  `cli.py` imports prompts, never hardcodes Persian
- Every mutation needs an explicit user action — always provide a
  reject/skip/cancel option
- Validate each story checkpoint with quickstart.md scenarios
