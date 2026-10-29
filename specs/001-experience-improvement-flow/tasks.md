# Tasks: Help Entry-Level Job Seekers Narrate Their Experience (Level 1 Prototype)

**Input**: Design documents from `/specs/001-experience-improvement-flow/`

**Prerequisites**: plan.md (required), spec.md (required), research.md,
data-model.md, contracts/, quickstart.md — all regenerated 2026-10-25 against
the clarified spec (rubric-2.0.0, English B1, JD matcher) and constitution
v2.0.0. This file REPLACES the previous task list (old T001–T054 encoded the
superseded four-dimension Persian design and must not be executed).

**Tests**: included — the constitution (Principle 9) mandates test-first
implementation and defines the mandatory test list (see quickstart.md).
Tasks are ordered so each story's tests exist and FAIL before its
implementation tasks.

**Organization**: Tasks are grouped by user story (US1–US5 from spec.md) so
each story can be implemented and tested independently. US5 (matcher) shares
priority P2 with US2 but lands after it because it consumes recorded entries.

**Existing-code note**: the repository already contains a partial
implementation of the OLD design (`src/jobforward/`, `tests/`). Tasks below
describe the TARGET state; where a file exists, the task means "rework this
file to the cited contract" — do not carry over four-dimension ratings,
Persian strings, template fields, or organization/start/end fields.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1…US5 from spec.md)
- Include exact file paths in descriptions

## Path Conventions

- Single CLI project (plan.md Structure Decision): `src/jobforward/`, `tests/`
  at repository root, data files in `data/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Verify/extend the project skeleton per plan.md: ensure
  `src/jobforward/` contains `cli.py`, `messages.py`, `models/`
  (`entities.py`, `status.py`), `scoring/` (`evaluator.py`, `metrics.py`,
  `overlap.py`, `adapters/`), `matcher/` (`analyzer.py`, `actions.py`,
  `adapters/`), `flow/` (`path_service.py`, `questions.py`, `rewrite.py`,
  `incremental.py`), `storage/` (`repository.py`, `events.py`, `schema.py`)
  — create only what is missing (matcher/ package and scoring/overlap.py are
  new)
- [X] T002 Verify `pyproject.toml` (name `jobforward`,
  `requires-python = ">=3.12"`, zero runtime dependencies) and `pytest.ini`
  (`testpaths = tests`); keep the PYTHONUTF8=1 run comment for Windows
- [X] T003 [P] Rewrite `src/jobforward/messages.py` as the single source of
  ALL user-facing English B1 strings (constitution P10 v2.0.0): prompt ids
  `ADD_TYPE`, `ADD_TITLE`, `ADD_BULLET_PROMPT`, `ADD_BULLET_DONE`,
  `ASK_REWRITE_GATE` ("Do you want me to rewrite this bullet to make your
  experience stronger?" with numbered Yes/No, default Yes),
  `ASK_CONTEXT` / `ASK_ACTION` / `ASK_RESULT` (the three fixed PRD §4.2
  question texts; `ASK_RESULT` ends with "If you have real numbers, include
  them."), `DRAFT_OR_APPROVE`, `PROPOSAL_*`, `MERGE_WARN`,
  `CONFIRM_DELETE_*`, `MATCH_POSTING`, `MATCH_ACTION_*`, `COPY_*`, `SCORE_*`
  (with `{rubric}` on every score line), `ERR_TOO_MANY_BULLETS`,
  `ERR_NON_ENGLISH_INPUT`, `ERR_INVALID_EVALUATOR`, `ERR_EVALUATOR_FAILURE`,
  `ERR_MATCHER_FAILURE`, `ERR_ENV` — no other module may contain user-facing
  strings; remove every Persian string

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story

**?? CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 Rework `src/jobforward/models/entities.py` per data-model.md:
  `Ratings` with exactly `context`, `role_action_clarity`, `result`
  (ints ∈ {0,1,2}); `ExperienceEntry` (type enum job/project/course/
  side_work, title non-empty trimmed, bullets 1–6 or 0-for-draft, NO
  organization/start/end fields, `draft` + `draft_reason`
  (`no_bullets`/`user_saved`/None), `source` (`manual`), `entry_score`,
  `rubric_version`, `match_action`, tombstone `deleted`); `Bullet` (verbatim
  text, status, ratings, rating_pending, rubric_version, history, questions,
  proposals, merge_warned); `QuestionRecord` (gate_answer accepted/rejected,
  dimension context/role_action_clarity/result, text, round, answer,
  skipped, answered_at/skipped_at); `ProposalRecord`; `BulletHistory`;
  `JobRequirement` (text, skill_type hard/soft, priority
  required/preferred/bonus); `MatchAction` (entry_id, action
  highlight/no_change/not_relevant, reason, requirement_id, rubric_version,
  analyzed_at); keep validation rules VR-1–VR-5 quoted in data-model.md
- [X] T005 Verify `src/jobforward/models/status.py` state machine against
  data-model.md (new → analyzed → edited → analyzed; failed analysis keeps
  prior label; illegal transitions rejected by `transition()`) — update only
  if a gap is found
- [X] T006 [P] Rework `src/jobforward/storage/repository.py`:
  `document_version = 2`, `rubric_version = "rubric-2.0.0"`, serialize/
  deserialize every T004 entity (drop org/start/end, add draft_reason,
  source, match_action, JobRequirement persistence), atomic temp-file +
  `os.replace` save, and an id allocator helper that returns
  max(persisted entry ids) + 1 so restarts never duplicate ids
- [X] T007 [P] Rework `src/jobforward/storage/events.py`: event enum adds
  `question_skipped`, `entry_saved_as_draft`, `posting_analyzed`,
  `match_action_assigned` to the existing set (`path_start`,
  `analysis_completed`, `proposal_accepted`, `proposal_rejected`,
  `question_rejected`, `bullet_deleted`, `entry_deleted`, `score_before`,
  `score_after`, `evaluator_invalid_output`, `evaluator_retry`); keep
  append-only JSONL with ISO-8601 `ts`
- [X] T008 Rework `src/jobforward/scoring/evaluator.py`: the
  `BulletEvaluator` port on the THREE-dimension schema
  (contracts/evaluator-output section: request = verbatim bullet texts +
  optional user answers + rubric version; response = `rubric_version` +
  one rating per bullet with `context`/`role_action_clarity`/`result` ints
  ∈ {0,1,2} + optional English notes) with the shared validity check
  (schema match, all three keys, one rating per bullet, same order; notes
  must not contain aggregated scores) and `evaluate_with_retry` (one retry
  then raise — FR-014). No arithmetic and no text change may ever live in
  an adapter
- [X] T009 [P] Implement `src/jobforward/storage/schema.py`: document
  invariants VR-1–VR-9 from data-model.md as check functions (bullets 1–6
  or draft; overall eligibility = has ≥1 scored bullet AND not draft AND
  not deleted; rubric_version "rubric-2.0.0" next to every score; matcher
  action enum restricted to highlight/no_change/not_relevant)

**Checkpoint**: Foundation ready — user story implementation can begin

---

## Phase 3: User Story 1 — Record an experience and see a transparent score (P1) — MVP

**Goal**: The user records an entry (type/title/1–6 English bullets) and
sees per-dimension scores (context, role_action_clarity, result), the entry
score, and the overall score across eligible entries — independent of any
job posting.

**Independent Test**: `tests/integration` scenario: record the entry whose
bullets rate role_action_clarity (2,2), result (2,1), context (2,1) and
observe exactly 250/3 ≈ 83.33 as the entry score; run without any posting
context.

### Tests for User Story 1 (write FIRST — must FAIL before implementation)

- [X] T010 [P] [US1] Rewrite `tests/unit/test_metrics.py` for the
  three-dimension formula: dimension = sum ÷ (2 × bullet_count) × 100;
  entry = equal-weighted mean of the 3 dimension scores; overall = simple
  mean of eligible entries; the permanent fixture role_action (2,2),
  result (2,1), context (2,1) → entry score 250/3 (assert the exact
  fraction or `pytest.approx(83.33, abs=1e-9)` — a naive `== 83.33` float
  compare is a bug) (FR-007); drafts (both reasons) and deleted excluded
  (FR-003)
- [X] T011 [P] [US1] Write `tests/unit/test_language.py`: every string in
  `messages.py` is ASCII/B1 English (constitution P10 v2.0.0); bullet text
  and answers containing Persian (or other non-English script) are rejected
  with `ERR_NON_ENGLISH_INPUT` while pasted posting text is exempt (FR-017,
  FR-021); bullet text round-trips verbatim
- [X] T012 [P] [US1] Rewrite `tests/contract/test_evaluator_output.py` for
  the three-key schema: schema-compliant output accepted; rating 3 /
  missing `context` key / extra aggregate number → invalid; invalid →
  rejected, one retry, then reported; no partial scoring; FR-006 enforced
  (no posting input anywhere in the rating path)
- [X] T013 [P] [US1] Rewrite `tests/unit/test_storage.py`: atomic save/load
  round-trip of a document_version-2 document containing one entry/bullet
  (with draft_reason, source, match_action fields); save leaves no partial
  file on failure; id allocator returns max persisted id + 1 (restart
  safety); VR-1 (1 ≤ bullets ≤ 6) enforced
- [X] T014 [P] [US1] Rewrite `tests/contract/test_cli_session.py`: all
  prompts exist in `messages.py` and are English B1; entry fields echoed
  verbatim; every score line carries `{rubric}`; prompts recorded via
  prompt ids; state unchanged after each error

### Implementation for User Story 1

- [X] T015 [US1] Rewrite `src/jobforward/scoring/metrics.py` as pure
  three-dimension functions from T010 (depends on T008, T010)
- [X] T016 [US1] Rewrite `src/jobforward/scoring/adapters/local.py`:
  deterministic rule-based ratings per the rubric-2.0.0 checklists —
  context (specific project/team/problem vs generic "in an app" vs
  missing), role_action_clarity (single first-person action verb vs vague
  vs none), result (specific qualitative/numeric = 2; vague result,
  output-only, or personal learning = 1 per PRD §4.3; none = 0) — restricted
  to 0/1/2, no aggregate math (depends on T008)
- [X] T017 [US1] Rework `src/jobforward/flow/path_service.py`: `add_entry`
  enforces VR-1 (>6 bullets rejected, FR-002), zero bullets → draft
  (`draft_reason="no_bullets"`) + suggestion (FR-003), explicit
  save-as-draft path (`draft_reason="user_saved"`, FR-009/FR-003), English
  input validation VR-8, verbatim bullet storage, id allocation via T006,
  sections saved via repository (depends on T004, T006)
- [X] T018 [US1] Rework `src/jobforward/cli.py`: state machine
  IDLE→ENTRY_FILLED→SCORE_SHOWN per contracts/cli-session.md, rendering
  English B1 prompts exclusively from `messages.py` (T003) and the
  `SCORE_*` display: per-dimension per-bullet, entry score, overall score
  computed across ALL eligible entries in the persisted document (drafts
  and deleted excluded), overall hidden when no eligible entry exists,
  `rubric-2.0.0` next to every score (FR-005/FR-007/FR-008) (depends on
  T015–T017)
- [X] T019 [US1] Emit log events in the CLI path: `path_start` on session
  start, `analysis_completed` after successful scoring (FR-015), via T007
  (depends on T018)

**Checkpoint**: User Story 1 is fully functional and testable independently
(Scenario A of quickstart.md)

---

## Phase 4: User Story 2 — Rewrite gate, questions, proposal, explicit approval (P2)

**Goal**: Analysis first; per bullet a gate (default Yes); on accept,
exactly one skippable question per dimension scoring 0 or 1 in
Context → Action → Result order (0–3); on answers, a rewrite assembled only
from bullet + answers; approve → replace (status "edited", history kept);
reject/skip-all → nothing changes; partial answers → save entry as draft or
approve from answers so far.

**Independent Test**: On a US1-scored experience, walk gate → question →
answer → proposal → approve and verify the replaced bullet with status
"edited" and history retained; separately reject the gate, skip all
questions, and answer only part to verify no rewrite / no change / the
draft-or-approve option.

### Tests for User Story 2 (write FIRST — must FAIL before implementation)

- [X] T020 [P] [US2] Write `tests/unit/test_questions.py`: gate default Yes;
  answering No → no questions and no rewrite; exactly one question per
  dimension scoring 0 or 1 (0–3) in Context, Action, Result order; every
  question skippable; hard cap of ONE round per bullet per improvement run;
  gate rejection / skip-all / no answer → no proposal and byte-identical
  bullet; ≥1 answered + others unanswered → draft-or-approve option offered
  (FR-009 + Clarifications Session 2026-10-25)
- [X] T021 [P] [US2] Write `tests/unit/test_no_extra_claims.py`: the
  allow-list validator (bullet text ∪ user answers) accepts reassembled
  user-own segments and rejects any added number, impact, or claim; treat
  violation as a refused assembly, never a shown proposal; rule applies to
  pattern-guided rewrites (FR-010)

### Implementation for User Story 2

- [X] T022 [US2] Implement `src/jobforward/flow/questions.py`: gate prompt +
  question generation — one fixed `messages.py` question per deficient
  dimension, asked in context → role_action_clarity → result order, round
  cap 1, skip handling, partial-answer detection (depends on T004, T008,
  T020)
- [X] T023 [US2] Implement `src/jobforward/flow/rewrite.py`: segment-based
  assembly from allowed sources only (original bullet parts + user answers,
  context→action→result sentence pattern as structure ONLY — no stored
  fields, FR-004), final no-extra-claims validation (T021) before any
  proposal is shown (depends on T021)
- [X] T024 [US2] Wire the loop into `flow/path_service.py` +
  `src/jobforward/cli.py`: SCORE_SHOWN → gate → AWAITING_QUESTION_ANSWER →
  (answers) → DRAFT_OR_APPROVE or REWRITE_AWAITING_APPROVAL → decision; on
  approval write the new bullet (status "edited" via T005, history append,
  re-score, re-analyze only that bullet), on reject nothing changes; emit
  `proposal_accepted` / `proposal_rejected` / `question_rejected` /
  `question_skipped` / `entry_saved_as_draft` / `score_before` /
  `score_after` events (depends on T022, T023)

**Checkpoint**: User Stories 1 AND 2 work independently (Scenario B of
quickstart.md)

---

## Phase 5: User Story 5 — Match entries against a pasted job description (P2)

**Goal**: Full posting analysis (hard/soft skills; required/preferred/bonus;
red-line → required) and exactly one entry-level action per entry —
Highlight / No change / Not relevant to this job — with a one-line reason
citing the skill (type + priority). No Remove, no Shorten, zero score
effect.

**Independent Test**: Paste a fixed posting with a must-have hard skill and
a nice-to-have soft skill against two prepared entries; verify every entry
gets exactly one valid action with a reason citing skill type + priority,
the red-line requirement is classified `required`, and all clarity scores
are unchanged.

### Tests for User Story 5 (write FIRST — must FAIL before implementation)

- [X] T025 [P] [US5] Write `tests/contract/test_matcher_output.py` per
  contracts matcher-output section: valid requirements + actions accepted;
  `skill_type` outside {hard, soft}, `priority` outside
  {required, preferred, bonus}, unknown `action` value (including
  "remove"/"shorten" — MUST be treated as invalid), missing action for an
  entry, reason not citing skill type + priority → invalid; invalid →
  rejected, one retry, then reported with data intact (FR-021/FR-022)
- [X] T026 [P] [US5] Write `tests/unit/test_matcher.py`: local analyzer
  classifies a fixed posting (hard+required red-line phrase "must have"
  → required; soft+bonus "nice to have"); actions: entry matching a required
  hard skill → highlight with reason citing type+priority; partial/preferred
  relation → no_change; unrelated entry → not_relevant with short reason;
  matcher output changes NO score of any kind (FR-022, constitution P6)

### Implementation for User Story 5

- [X] T027 [US5] Implement `src/jobforward/matcher/analyzer.py` +
  `src/jobforward/matcher/adapters/local.py`: `PostingAnalyzer` port
  (request: pasted posting text verbatim + rubric version; response:
  validated requirement list per T025) with a deterministic keyword/phrase
  rule adapter (skill_type and priority classification; red-line phrases
  such as "must have" / "minimum requirement" force `required`); posting
  text never modified (depends on T025)
- [X] T028 [US5] Implement `src/jobforward/matcher/actions.py`: stage-2
  entry-level assignment — exactly one of highlight/no_change/not_relevant
  per non-deleted entry, one-line B1-English reason referencing the matched
  requirement (type + priority); the strings "Remove"/"Shorten" appear
  nowhere; output validated before display (depends on T027)
- [X] T029 [US5] Wire the matcher into `src/jobforward/cli.py` +
  `flow/path_service.py`: `MATCH_POSTING` prompt (paste text, Persian or
  English — exempt from the English-input check), display per-entry
  `MATCH_ACTION_*` blocks, persist latest `MatchAction` on each entry via
  the repository, emit `posting_analyzed` / `match_action_assigned` events;
  matcher failure → `ERR_MATCHER_FAILURE` + exit code 2; assert scores
  unchanged (depends on T028, T007)

**Checkpoint**: US1, US2, and US5 work independently (Scenario E of
quickstart.md)

---

## Phase 6: User Story 3 — Incremental re-analysis and before/after comparison (P3)

**Goal**: Reruns re-analyze only new/edited bullets; unchanged bullets keep
score and label; approved rewrites show BEFORE/AFTER side by side; 5
consecutive runs on unchanged data keep ≥ 90% of bullet-dimension scores
identical.

**Independent Test**: Take a US1-scored 3-bullet entry, edit 1 bullet
directly (user edit = "edited"), rerun: only that bullet is re-analyzed;
the others keep score+label; side-by-side before/after is visible.

### Tests for User Story 3 (write FIRST — must FAIL before implementation)

- [X] T030 [P] [US3] Write `tests/unit/test_incremental.py`: status
  semantics (T005) drive which bullets re-analyze; unchanged bullets keep
  previous ratings + rubric_version AND their label; direct user edit flips
  only that bullet to "edited"; after re-analysis returns to "analyzed"
  (FR-012, Clarifications Q2/Q4)
- [X] T031 [P] [US3] Write `tests/unit/test_stability.py`: run the local
  adapter 5 consecutive times over a fixed entry → ≥ 90% of
  bullet-by-dimension scores exactly identical (deterministic adapter →
  100%) and no re-analysis occurs (FR-016, SC-003)
- [X] T032 [P] [US3] Write `tests/integration/test_full_path.py`: the
  complete record→score→gate→question→answer→approve→rerun path; assert
  `data/events.log.jsonl` contains every required event type with ISO
  timestamps and numeric score_before/score_after (FR-015, SC-001, SC-008)

### Implementation for User Story 3

- [X] T033 [US3] Implement `src/jobforward/flow/incremental.py`: diff of
  current bullets vs. persisted state → set of new/edited bullets to
  re-analyze; unchanged bullets carry previous ratings/rubric_version
  forward untouched (depends on T005, T008)
- [X] T034 [US3] Implement the results view in `src/jobforward/cli.py`:
  side-by-side BEFORE/AFTER score blocks for approved rewrites, per-bullet
  status labels (new/edited/analyzed), rubric version on every score,
  direct bullet-edit handler (explicit user action → "edited"), +
  `score_before`/`score_after` events (FR-008, FR-012) (depends on T033)

**Checkpoint**: US1–US3 and US5 are independently functional (Scenario C of
quickstart.md)

---

## Phase 7: User Story 4 — Merge warning for overlapping bullets (P4)

**Goal**: Two or more overlapping bullets in one entry trigger a merge
warning with ZERO score effect and no merge without explicit confirmation.

**Independent Test**: An entry with two overlapping bullets shows the
warning; all scores unchanged; answering "no merge" leaves text+history
intact (FR-013).

### Tests for User Story 4 (write FIRST — must FAIL before implementation)

- [X] T035 [P] [US4] Write `tests/unit/test_merge.py`: overlap detection
  (each new bullet compared with all existing bullets) flags only real
  overlap; warning presence never changes any bullet/entry/overall value;
  no-merge decision is a no-op (FR-013)

### Implementation for User Story 4

- [X] T036 [US4] Implement `src/jobforward/scoring/overlap.py` with the
  threshold recorded in the rubric version, wire `MERGE_WARN` rendering
  (numbered merge/no-merge) into `cli.py`, log the warning; strictly no
  mutation without the user confirmation branch (depends on T005, T018)

**Checkpoint**: All five user stories work independently (Scenario D of
quickstart.md)

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Qualified optional paths + final validation affecting multiple
stories

- [X] T037 [P] Implement the optional, user-opt-in LLM scoring adapter
  `src/jobforward/scoring/adapters/llm.py`: sends ONLY verbatim bullet text
  (+ the user's answers when assembling a rewrite) to a user-configured
  endpoint; validates output against the three-dimension evaluator schema;
  on invalid output one internal retry then reports `ERR_EVALUATOR_FAILURE`
  (data intact, exit code 2); emits `evaluator_invalid_output` /
  `evaluator_retry` events; the default run stays fully local (complexity
  item in plan.md)
- [X] T038 [P] Implement the optional, user-opt-in LLM matcher adapter
  `src/jobforward/matcher/adapters/llm.py`: sends ONLY the pasted posting
  text to a user-configured endpoint; validates output against the matcher
  schema (T025); one retry then `ERR_MATCHER_FAILURE`; same event contract;
  default matcher stays the deterministic local analyzer
- [X] T039 [P] Write `tests/unit/test_deletion.py` + implement deletion with
  confirmation in `flow/path_service.py`/`cli.py`: `CONFIRM_DELETE_*` prompt,
  exclusion of deleted bullets/entries from all scores and merge analysis,
  entry dropping to 0 bullets reverts to draft, untouched histories of
  survivors, `bullet_deleted`/`entry_deleted` events (FR-020, Clarification
  Q3; depends on T018)
- [X] T040 [P] Add the copy-text action (only text copying of each
  experience, FR-019): a non-mutating `COPY_*` prompt in `cli.py` that
  prints the exact entry text for clipboard use
- [X] T041 [P] Add `README.md` at repository root: how to run
  (`PYTHONUTF8=1`, `python -m jobforward`), where data lives (`data/`), the
  local-only promise (FR-018, PDF upload deferred), and pointer to
  quickstart.md
- [X] T042 [P] Remove the stray empty `fix_entities.py` at the repository
  root (not part of any task; unrequested artifact)
- [X] T043 Run the full quickstart.md validation (Scenarios A–F) and record
  results in the PR/commit message
- [X] T044 Final compliance review against constitution v2.0.0: verify
  P1–P10 one by one in code (zero-fabrication path, explicit approval paths
  incl. gate rejection, no posting input to scoring, deterministic metrics
  with rubric-2.0.0, statuses, matcher boundary with no Remove/Shorten,
  local-only, log coverage, English B1 strings only in messages.py with
  English-only input, verbatim bullet storage)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — T001/T002 first, T003 parallel-safe
- **Foundational (Phase 2)**: depends on Setup — T004 → T005 sequential
  (same domain), T006/T007/T009 parallel-safe, T008 after T004
- **US phases (3–7)**: depend on Phase 2 only; US2/US3 consume US1's scores
  at runtime, US5 needs only recorded entries, US4 needs US1's scoring view
- **Polish (Phase 8)**: depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: standalone after Foundation → MVP
- **US2 (P2)**: needs US1's ratings/flow at runtime, independent codebase-wise
- **US5 (P2)**: needs only recorded entries (no scores) — could run parallel
  with US2 by a second developer
- **US3 (P3)**: needs US1+US2 statuses to be meaningful; tests are still
  unit-isolated via T005 fixtures
- **US4 (P4)**: only consumes US1's scoring view; smallest story

### Within Each User Story

- Tests (T0xx marked "write FIRST") MUST fail before implementation
- models/port (foundational) → scoring/flow → CLI wiring → events
- Story checkpoint verified before moving to next priority

### Parallel Opportunities

- All [P] test tasks inside a story phase run together before its
  implementation tasks
- T015/T016 independent files (metrics vs adapter) once T008 lands
- US2 and US5 touch disjoint files (flow/ + cli vs matcher/) → parallelizable
  after Phase 2

---

## Parallel Example: User Story 1

```bash
# Together (all independent test files):
Task: "tests/unit/test_metrics.py"              (T010)
Task: "tests/unit/test_language.py"             (T011)
Task: "tests/contract/test_evaluator_output.py" (T012)
Task: "tests/unit/test_storage.py"              (T013)
Task: "tests/contract/test_cli_session.py"      (T014)

# Then (after T008):
Task: "scoring/metrics.py"                      (T015)
Task: "scoring/adapters/local.py"               (T016)
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → Phase 2 Foundational
2. Phase 3 US1: write failing tests (T010–T014), implement T015–T019
3. STOP and validate: quickstart Scenario A + the 250/3 ≈ 83.33 fixture
4. Demo-ready increment (P1 value: transparent scoring)

### Incremental Delivery

1. Foundation → US1 (MVP) → US2 (improvement loop) → US5 (matcher) →
   US3 (rerun economy + before/after) → US4 (merge warning) → Polish
   (LLM adapters + deletion + copy-text)
2. Each phase leaves the previous stories untouched and passing

### Single-developer default line (typical for this prototype)

Setup → Foundation → US1 → US2 → US5 → US3 → US4 → Polish, validating at
every story checkpoint against quickstart.md.

---

## Notes

- [P] = different files, no dependencies; story labels give traceability
- Tests BEFORE implementation (constitution Principle 9 mandatory)
- All user-facing English B1 strings come from `messages.py` only (T003);
  `cli.py` imports prompts, never hardcodes user-facing text
- Every mutation needs an explicit user action — always provide a
  reject/skip/cancel option; the rewrite gate defaults to Yes but must be
  answerable No with zero side effects
- The reference fixture is 250/3 ≈ 83.33 under rubric-2.0.0 — assert the
  exact fraction, never a naive float equality
- Matcher actions are Highlight / No change / Not relevant to this job ONLY;
  the strings "Remove" and "Shorten" must not appear in code or messages
- Validate each story checkpoint with quickstart.md scenarios

---

## Phase 9: Five-Part Framework Update (rubric_version 3)

- [X] T045 [US2] Define the Specific-Action scoring checklist (0/1/2) in a new design document.
  - File: specs/001-experience-improvement-flow/checklists/specific-action.md
  - Requirement: FR – Define exact 0/1/2 scoring levels for the Specific Action dimension (similar to Context and Result).

- [X] T046 [US2] Update the local heuristic adapter to use the new Specific-Action checklist.
  - File: src/jobforward/scoring/adapters/local.py (modify or add helper for action scoring)
  - Requirement: FR – Adapter must rate the action dimension using the checklist.

- [X] T047 [US2] Add unit tests that verify the Specific-Action scoring logic (0, 1, 2 cases).
  - File: tests/unit/test_specific_action_scoring.py
  - Requirement: FR – Test‑first implementation; tests must fail before adapter update.

- [X] T048 [US2] Bump the default rubric version used by the evaluator to "rubric-3.0.0".
  - File: src/jobforward/scoring/evaluator.py (change default rubric_version value)
  - Requirement: FR – New scores must be stored with rubric_version = 3.

- [X] T049 [US2] Update the storage layer to record the new rubric version for persisted bullets and entries.
  - File: src/jobforward/storage/repository.py (and optionally src/jobforward/storage/schema.py) – adjust hard‑coded "rubric-2.0.0" literals to "rubric-3.0.0" and ensure backward compatibility.
  - Requirement: FR – Persistence must reflect the new rubric version while remaining compatible with older data.

- [X] T050 [US2] Run the full quickstart validation suite (Scenarios A–F) and record the results.
  - No code change – execution task.
  - Requirement: FR – All tests, including the new Specific-Action tests, must pass; any failures must be fixed before proceeding.

---

---

## Phase 10: Five-Part Framework Implementation (spec finalized 2026-10-29)

**Purpose**: Implement the finalized five-part rewriting framework (spec §§1–10;
plan "Five-Part Framework Design"). Phase 9 (rubric-3.0.0 Specific Action
scoring) is done; this phase adds part extraction, the framework display,
0–5 questions, draft/confirm, and the final output. Tests are written FIRST
and must FAIL before their implementation task (constitution P9).

- [X] T051 [P] [US2] Write `tests/unit/test_part_extraction.py`: deterministic
  five-part extraction per plan §Five-Part-Framework-Design — each part is a
  verbatim substring of the bullet text or empty (never paraphrased, never
  invented, Principle 1); metric = number-bearing phrase; result = outcome
  clause after result connectors; action = action-verb clause; need =
  problem statement; feature = named product surface; undetectable parts are
  empty with `part_present` False
- [X] T052 [US2] Implement `src/jobforward/flow/parts.py`
  (`extract_parts(text) -> BulletParts`) with versioned marker lists; extend
  `models/entities.py` Bullet with optional `user_need`, `product_feature`,
  `action`, `result`, `metric` fields and the five-boolean `part_present`;
  storage round trip must keep pre-Phase-10 documents loading unchanged
  (depends on T051)
- [X] T053 [P] [US2] Write `tests/unit/test_part_scoring.py`: Context from
  extracted need/feature per spec §3 (need missing → 0 even with feature;
  generic need or feature missing → 1; specific need + feature → 2); Result:
  bare number only → 1 with the what-does-it-represent question, specific
  qualitative → 2 without a number; metric never changes the result score;
  raw-text fallback for bullets without part fields (spec §3, plan design §2)
- [X] T054 [US2] Update `src/jobforward/scoring/adapters/local.py` and the
  analysis path to consume extracted parts (context from need/feature, result
  bare-number rule), keeping `role_action_clarity` as the stored key and
  `rubric_version = "rubric-3.0.0"` on new scores (depends on T052, T053)
- [X] T055 [P] [US2] Add the framework strings to `src/jobforward/messages.py`
  (English B1, only place for user-facing strings) and write
  `tests/contract/test_framework_display.py`: header
  `Experience: <title> – Achievement <n> of <total>`, `Original: "<text>"`,
  `[part]` brackets with `missing` note (e.g. `[User need or problem –
  missing]`), vague note with exact words, `Filled correctly` and `Still
  needs to be filled` lists, the draft-or-confirm message, and the copy
  notice (spec §§5, 7, 8)
- [X] T056 [US2] Implement the framework display in `src/jobforward/cli.py`
  per spec §5 (depends on T052, T055)
- [X] T057 [US2] Extend `src/jobforward/flow/questions.py` to the 0–5
  question engine: fixed order Need → Feature → Action → Result → Metric;
  conditions (Need/Action/Result when dimension score 0/1; Feature/Metric
  when field empty); identification line before each question; every
  question skippable; complete bullet (2/2/2) → confirmation only, zero
  questions; update the rewrite-gate message to the finalized wording
  (depends on T054)
- [X] T058 [US2] Partial-answers path in `flow/questions.py` + `cli.py`:
  unanswered parts after the round offer draft-save vs
  confirm-rewrite-with-answers-so-far (rewrite_status "draft");
  no answers or all skipped → no rewrite, original bullet untouched
  (spec §7; depends on T057)
- [X] T059 [P] [US2] Write `tests/unit/test_rewrite_wording_rules.py` and
  align `flow/rewrite.py`: keywords (nouns, verbs, tool names, numbers,
  results, product names) unchanged; only grammar/spelling/tense, linking
  words (`and`, `to`, `with`, `by`, `for`), word order may change; a rewrite
  needing a new keyword leaves the part empty and asks a question; no new or
  changed keywords ever appear in a proposal (spec §7)
- [X] T060 [P] [US2] Write `tests/contract/test_final_output.py`: final text
  rendered without brackets, inside a code block, one bullet per line
  prefixed `- `, with the copy notice; unimproved bullets keep their original
  wording (spec §8)
- [X] T061 [US2] Integration test `tests/integration/test_five_part_flow.py`:
  full workflow — display → gate → questions (with skips) → draft or
  approve → status edited → re-analysis stamped rubric-3.0.0 → final text;
  5-run stability on the same input; update quickstart.md Scenario B to the
  five-part flow (depends on T056–T060)
- [X] T062 Final compliance review against constitution v3.0.0 for the
  five-part flow: P1 (parts are verbatim candidate words; extraction never
  invents), P2 (explicit approval + draft option + skips never mutate),
  P4 (arithmetic deterministic; rubric-3 stored on new scores; old versions
  preserved), P5 (only new/edited re-analyzed), P7 (events logged),
  P10 (all new strings in messages.py, English B1) — and record the pending
  constitution amendment: P4 still cites rubric_version = 2; re-pinning to
  rubric 3 is a product-owner action (report-only, do not edit the
  constitution in this feature)
