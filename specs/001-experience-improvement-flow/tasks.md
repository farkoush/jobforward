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

---

## Phase 11: Rubric-3.1.0 — Parsing Correctness, Display↔Score Agreement & Web Improvement Loop (implemented 2026-11-03, recorded 2026-11-04)

> **BACKFILL NOTE**: the tasks below record work that is already implemented
> and verified (not executed sequentially from this file). Evidence is cited
> per task. Spec sections §2.1, §3.1, §5.1 and §6.1 document this phase.
> The Python terminal's DISPLAY and FLOW are unchanged (product-owner
> decision): only the shared extraction/scoring rules live in both engines,
> with web↔Python parity as a release gate.

**Purpose**: correct the five-part extraction (research verbs, intention
clauses, word sharing), align the result score with constitution P4
(present-but-vague = 1), and ship the web prototype's one-sentence display,
inline improvement loop, model disclosure and calibrated model prompt.

### Setup & Foundational

- [X] T063 Record the product-owner decisions governing this phase:
  web+parser-doc display scope only (terminal display unchanged), ALWAYS
  "resulting in [result: …]", research verbs → need never action, vague
  result = 1, adaptive connectors over the fixed frame, inline improvement
  form replacing the question screens (evidence: scope comment in
  `web/src/engine/messages.ts`, spec §2.1/§5.1/§6.1)
- [X] T064 [P] Pin web run scripts to port 3100 in `web/package.json`
  (`"dev": "next dev -p 3100"`, `"start": "next start -p 3100"`)
- [X] T065 Bump the default rubric version to `rubric-3.1.0` in
  `src/jobforward/scoring/evaluator.py`,
  `src/jobforward/scoring/adapters/llm.py`,
  `src/jobforward/storage/repository.py` (DEFAULT_RUBRIC_VERSION) and
  `web/src/engine/types.ts`; update version literals in
  `tests/contract/test_cli_session.py`, `tests/integration/test_five_part_flow.py`,
  `tests/integration/test_full_path.py`, `tests/unit/test_storage.py`,
  `web/tests/byok/client.test.ts`
- [X] T066 [P] Extend the parity harnesses to rubric-3.1.0 in
  `web/scripts/parity.mts` and `web/scripts/parity_python.py` with the same
  new edge bullets on both sides (research/intention Upwork bullet,
  research-only bullet, improved bullet, multi-line bullet) — PARITY OK

### User Story 1 — Correct five-part parsing (P1) (spec §2.1)

- [X] T067 [P] [US1] Write the extraction tests in
  `tests/unit/test_part_extraction.py` (8 new): research verbs fill need not
  action (the "Benchmarked 7 … to uncover friction in hiring and
  project-assignment flows." case), research-only bullet leaves action empty,
  purpose clause inside an action clause is not carved, purpose clause after
  a delivery verb stays out of the result, need phrases ending in "to" are
  not intentions, multi-line bullet extracts like one line, improved-bullet
  parts case, feature marker inside the intention clause skipped
- [X] T068 [US1] Implement rubric-3.1.0 extraction in
  `src/jobforward/flow/parts.py`: NEED_MARKER += problem-discovery verbs
  (analyzed, researched, identified, noticed, found, benchmarked, mapped,
  surveyed, audited, compared, evaluated) + "had no"; ACTION_VERB -=
  analyzed|researched; FEATURE_MARKER += `flows?`; new `_INTENTION_MARKER`
  ("to uncover|deliver|improve|…") with lookbehinds excluding need phrases
  ending in "to"; carve the intention tail from a non-action need clause,
  else take it from a clause with no action verb and no metric; skip feature
  markers inside the intention tail; strip a leading "and|or" from the
  feature fragment; normalize whitespace at the top of `extract_parts`
- [X] T069 [US1] Mirror the identical rule set in `web/src/engine/flow/parts.ts`
  (verbatim twin of `parts.py`, same regexes, same comments citing
  specs/001-experience-improvement-flow/few-shot/parser-prompt Problems 1/2/4)
- [X] T070 [US1] Parity gate — `cd web && npx tsx scripts/parity.mts` →
  PARITY OK for rubric-3.1.0 on the extended edge corpus

### User Story 2 — Display and score agree (P1) (spec §3)

- [X] T071 [P] [US2] Write the scoring tests in
  `tests/unit/test_part_scoring.py` (3 new): present vague result part scores
  1 not 0; missing result part still scores 0; the improved bullet scores
  full marks (2,2,2)
- [X] T072 [US2] Floor a present-but-vague result at 1 in
  `src/jobforward/scoring/adapters/local.py` and
  `web/src/engine/scoring/local.ts`; extend ACTION_VERB_ANY (rebuilt,
  redesigned, implemented, introduced, shipped, migrated, established,
  spearheaded, fixed, simplified, scoped), CONCRETE_OBJECT (+ `flows?`) and
  SPECIFIC_RESULT (+ "no longer") in BOTH files
- [X] T073 [US2] Fix `frameworkRows` in `web/src/app/page.tsx`: a "vague"
  designation requires non-empty words — an empty part is always "missing",
  never vague with an empty quote

### User Story 3 — The five-part display reads as one sentence (P2, web-only) (spec §5.1)

- [X] T074 [P] [US3] Add the web-only display strings to
  `web/src/engine/messages.ts`: sentence frame + connector variants
  (FRAMEWORK_OPEN_*/FRAMEWORK_SEG_*/FRAMEWORK_TAIL), renamed labels
  (PART_LABEL_FEATURE "Feature name", PART_LABEL_ACTION "Specific action"),
  FRAMEWORK_ORIGINAL "Job seeker's original text: …", NEEDS_REASON_*/SUGGEST_*/
  STARTER_*/INLINE_Q_*/METRIC_REAL_NUMBER_NOTE/COPY_BUTTON; header comment
  records the 2026-11-03 web-only decision and the intentional divergence
  from `src/jobforward/messages.py` (which keeps the §5 list format)
- [X] T075 [US3] Implement `frameworkSentence()` in `web/src/app/page.tsx`
  with the connector selector regexes (RESEARCH_START, COLLAB_MARKER,
  COLLAB_WITH, DELIVERY_VERB): one-sentence display on the bullet-gate screen
  with status-colored brackets (filled emerald / vague amber / missing red),
  connectors plain; the old `<ul>` list rendering removed
- [X] T076 [US3] Regenerate the parser-doc display layer in
  `specs/001-experience-improvement-flow/few-shot/parser-prompt.md`: Display Rules rewritten to the closed
  variant set; all example and answer-key sentences regenerated under the
  same rules (E1/E3/E5 keep collaboration because their actions really
  collaborate; E2/T2/T9 → "work on"; T5 → "research into"; rest →
  "building of")
- [X] T077 [US3] Verify live at http://localhost:3100 (rebuild + restart +
  "Restart session"): the research bullet renders "Research into […] and
  research into [feature name - missing] through […]"; connectors re-predict
  from confirmed answers

### User Story 4 — Improve the bullet in one screen (P2, web-only) (spec §6.1)

- [X] T078 [P] [US4] Implement grounded suggestions: `resultCore()` derives a
  problem-area core from the original extracted result (strip trailing period
  + "to <verb>" intention prefix) in `web/src/app/page.tsx`;
  STARTER_GROUND_* templates compose per-part answers around it in
  `web/src/engine/messages.ts`; generic STARTER_* remain the fallback; metric
  stays x-based with METRIC_REAL_NUMBER_NOTE
- [X] T079 [US4] Build the inline improvement form in `web/src/app/page.tsx`
  BulletGate: one block per empty/vague part — colored headline with status,
  "Why this is unclear:" reason first for vague parts, INLINE_Q_* question in
  large font, select with 2 editable grounded options, always-editable input,
  Confirm button applying `improveAnswer()` light repair (collapse spaces,
  capitalize, add "I " to subject-less delivery-verb actions, dedupe "the
  the") with an "Improved phrasing:" note when text changed; confirmed blocks
  stay visible/editable with a green "(filled)" headline; sentence + Filled
  list update on Confirm
- [X] T080 [US4] Implement `submitInlineAnswers` in `web/src/app/page.tsx`:
  0 answers → final confirmation for a complete bullet (`isComplete`), else
  NO_REWRITE → bullet_list; ≥1 answer (partial allowed) → `improvedBullet()`
  plain-prose assembly, history + proposals records with status "edited",
  re-score through `scoreAndPersist` (the SAME first-time pipeline: fresh
  extraction + ratings, BYOK or local), SCORE_BEFORE_AFTER on the score
  screen; delete QuestionScreen, draft_or_approve screen, proposal screen and
  their state/imports; `gateAnswer` simplified to the rejection path
- [X] T081 [US4] Add the copy action in `web/src/app/page.tsx`: "Copy" text
  button beside the original text; copies `improvedBullet()` output as plain
  prose (no brackets/labels/status markers; trailing periods stripped;
  mid-sentence parts lowercased unless starting with "I"); hidden-textarea +
  `execCommand` fallback for browsers where the async clipboard API fails;
  "Copied" tooltip (role=status, 2s); falls back to the verbatim original
  bullet when nothing improved exists
- [X] T082 [US4] Verify end-to-end in the browser (rebuild + restart +
  "Restart session"): select→input→Confirm per part, "1) Yes" → score screen
  with before/after (33.33 → 100 for the fully improved bullet); 2-of-5
  answered goes straight through; zero answers on an incomplete bullet →
  no-rewrite outcome

### User Story 5 — Model disclosure & calibrated prompt (P3) (spec §3.1)

- [X] T083 [P] [US5] Create `web/src/components/ModelBanner.tsx`: amber note
  "Model in use on this screen: {provider displayName}: {model}"
  (BYOK §3 disclosure), self-subscribing to BYOK state changes, rendered only
  when the screen is active AND useForScoring AND key AND model are set;
  hidden for the deterministic engine
- [X] T084 [US5] Mount ModelBanner in `web/src/app/page.tsx` for the
  model-capable screens (entry_bullets, score, bullet_list, merge); matcher
  screens never show it
- [X] T085 [US5] Update `web/src/lib/byok/prompts.ts`: governing-goal line
  ("every bullet should show problem-solving — the problem first, then the
  work done to fix it, then the result"), explicit result rules (actual
  outcome = 2; goal/purpose phrase "to uncover…"/"in order to…"/"aiming
  to…"/"so that…" = 1 never 2; no outcome phrase = 0), and four calibration
  few-shot examples with expected JSON ratings (complete bullet / missing
  need / output-only result / goal-instead-of-result) — 24/24
  `npm run test:byok` green incl. live-Ollama contract test

### User Story 6 — One normative contract for external models (P3) (spec §2.1, contracts/parser-prompt.md)

- [X] T086 [P] [US6] Write `specs/001-experience-improvement-flow/few-shot/parser-prompt.md` (governing goal,
  Scope of Execution, Section Display Rules with the closed variant set,
  Problems 1–6, Fixed Rules, Examples 1–6 as acceptance tests, test bullets
  T1–T10 with traps T6/T9, tester-only answer key) and
  `specs/001-experience-improvement-flow/few-shot/parser-samples.json` v1.3.0 (acceptance_examples E1–E6,
  test_bullets T1–T10, display_frame)
- [X] T087 [P] [US6] Rule the pasted format demo 1 "FORMAT DEMO ONLY — not
  normative" (product-owner decision 2026-11-04): the demo no longer appears
  in the document (removed in the 2026-11-03 rewrite; the Scope of Execution
  already states all examples are illustrative); the ruling is recorded in
  spec §2.1 and this task
- [X] T088 [US6] Record the one-rule-set parity obligation: the deterministic
  engine satisfies the same acceptance examples (E1–E6, T1–T10) — spec §2.1,
  §9; `contracts/parser-prompt.md`

### Polish & Cross-Cutting

- [X] T089 Run the full gate suite: `python -m pytest` (216 green), parity
  PARITY OK, `tsc` clean, `npm run test:byok` (24 green; the live Ollama test
  may time out under machine load — environmental, passed twice same day),
  `npm run scan:byok` green
- [X] T090 Amend the project constitution to v3.1.0
  (`.specify/memory/constitution.md`, 2026-11-04): replace the stale
  `rubric_version = 2` integer pins with semver-string pinning (version of
  record = the rubric-X.Y.Z string stored with every score; current
  rubric-3.1.0); clarify that a present-but-vague result = 1 and 0 is
  reserved for a missing result; re-baseline the 83.33 reference-test and
  quality gates under the governing semver rubric; matcher rules stay v1 —
  this closes the amendment T062 reported as pending
- [ ] T091 [P] Align the parser-doc answer-key "Still needs to be filled"
  lists with the web presentation (reason + suggestions + inline question)
  — the doc currently shows reason-only lists. OPEN: on product-owner
  request (web-only richness was deliberate)
- [ ] T092 [P] Retry OpenRouter CORS from a different VPN exit; if the 403
  edge block persists, disable the provider in
  `web/src/lib/byok/providers.config.ts` with the documented reason. OPEN:
  tracked in `docs/byok-cors-results.md` (FAIL row 2026-11-03; worked once
  after a VPN change — retest from the blocked exit)
- [X] T093 [P] Make the rubric version a single source of truth
  (product-owner request 2026-11-04): new `src/jobforward/rubric.py`
  (`RUBRIC_VERSION = "rubric-3.1.0"`) is the ONLY Python literal;
  `storage/repository.py` re-exports it as `DEFAULT_RUBRIC_VERSION` (all
  existing importers unchanged); `scoring/evaluator.py` (2 dataclass
  defaults) and `scoring/adapters/llm.py` (adapter default) import it; tests
  assert against the constant instead of a literal
  (`tests/contract/test_cli_session.py`, `tests/integration/test_five_part_flow.py`,
  `tests/integration/test_full_path.py`, `tests/unit/test_storage.py` — the
  `rubric-2.0.0` historical fixture stays); parity harnesses
  (`web/scripts/parity.mts`, `web/scripts/parity_python.py`) import their
  engine's constant. TS twin: `web/src/engine/types.ts`
  `DEFAULT_RUBRIC_VERSION` is the only TS literal (already imported by
  `api/score/route.ts` and `lib/byok/prompts.ts`; now also by
  `web/tests/byok/client.test.ts`). Parity gate proves the two constants
  agree. Historic comments/docstrings naming a version are a record of what
  changed in that version and stay. Behavior unchanged — evidence: pytest
  216 green, PARITY OK, tsc clean, test:byok 23/24 (live-Ollama timeout
  environmental, unchanged).
- [X] T094 [P] Consolidate the model-facing prompt package into
  `specs/001-experience-improvement-flow/few-shot/` (product-owner request
  2026-11-04 — one folder with everything a model is given for spec 001, so
  different models converge): MOVED (not copied — single source of truth)
  `docs/bullet-parser-prompt.md` → `few-shot/parser-prompt.md` and
  `docs/bullet-parser-samples.json` → `few-shot/parser-samples.json`
  (v1.3.0 — location-move changelog entry, no sample changes); added
  `few-shot/model-rating-few-shots.md` (documents the 4 BYOK rating few-shots
  verbatim from `web/src/lib/byok/prompts.ts`, which stays the runtime
  source; both must change together) and `few-shot/README.md` (purpose, the
  two model surfaces — parsing stays deterministic in-app, ratings are the
  only model output — new-model test procedure, convergence measurement via
  the 16 acceptance examples, change rules). All references updated to the
  new path: spec §2.1, plan, tasks (T076/T086/T087/T088/T091), research,
  quickstart, `contracts/parser-prompt.md`, and the code comments in
  `flow/parts.py` + `flow/parts.ts` (kept as verbatim twins),
  `scoring/adapters/local.py` + `web/src/engine/scoring/local.ts`,
  `web/src/app/page.tsx`. Convergence levers recorded: explicit rules,
  few-shots, `temperature: 0` (client.ts), schema validation + retry,
  0/1/2-only output, arithmetic in code. Evidence: pytest 216 green, PARITY
  OK, tsc clean after the move; zero stale `docs/bullet-parser*` references
  (grep clean).

## Phase 12: Coverage Record — Chunk Attribution (spec §2.2, clarified 2026-11-04)

**Purpose**: a diagnostic-only coverage pass over the bullet's own words —
five per-part entries (quotation / status / reason) plus one entry per
maximal contiguous unclaimed span ("orphaned") with a reason — computed
deterministically in BOTH engines, stored as an optional bullet field,
rendered web-only as a gray "Not attributed to the framework" block under the
sentence. NO effect on scores, questions, completeness, or the improvement
loop (research D11); the rubric stays rubric-3.1.0 (no gate-5 bump); the
Python terminal display is UNCHANGED (product-owner constraint). Removable
later without a rubric change. Tasks start at T095 (T091/T092 remain open).

### Setup & Foundational

- [X] T095 Record the product-owner decisions governing this phase
  (2026-11-04): coverage is diagnostic only — no effect on scores/questions/
  completeness, rubric stays rubric-3.1.0; "orphaned" = only the unclaimed
  words (maximal contiguous spans, no re-segmentation); web presentation =
  separate gray "Not attributed to the framework" block under the sentence;
  terminal display unchanged (evidence: spec §2.2 resolved blocks + §4
  coverage field + §9 coverage criteria, research D11–D13, plan Phase 12
  Addendum, data-model Phase 12 addendum, quickstart Phase 12 addendum)

### Tests First (P9 — failing before implementation)

- [X] T096 [P] Write the failing coverage unit tests in
  `tests/unit/test_coverage.py`: five per-part entries in order
  Need→Feature→Action→Result→Metric with quote/status/reason (filled quotes
  verbatim in the bullet; empty quote + a missing reason for absent parts;
  vague = non-empty words whose dimension rating is < 2 — need/feature from
  context, action from role_action_clarity, result from result; metric is
  filled when non-empty, never vague); the fully covered Upwork bullet
  ("Benchmarked 7 competitors and mapped … to uncover friction in hiring and
  project-assignment flows.") yields NO orphaned spans; a bullet with a
  trailing greeting/connector ("… . Honestly it was a mess.") yields ONE
  orphaned span with a reason citing its words; the feature-inside-action
  overlap (§2.1) is claimed by the action and never orphaned; the union of
  part quotations and orphaned spans covers the whole whitespace-normalized
  bullet; orphan data never changes any dimension score
- [X] T097 [P] Write the failing storage tests in `tests/unit/test_storage.py`:
  a bullet saved without `coverage` loads unchanged and never gains the
  field; a bullet saved with `coverage` round-trips the record exactly
  (field is optional, no migration, P5)
- [X] T098 [P] Extend the parity harnesses `web/scripts/parity.mts` +
  `web/scripts/parity_python.py` with the same orphan corpus case on both
  sides and a coverage-record comparison (identical entries, order, reasons)

### Python Engine (deterministic, stdlib-only)

- [X] T099 Implement `build_coverage(bullet_text, parts, ratings)` in
  `src/jobforward/flow/parts.py`: claim the extracted part texts verbatim
  (whitespace-normalized matching, §2.1); group every unclaimed run of the
  bullet into maximal contiguous spans; five part entries (empty quote + a
  missing reason for absent parts; filled/vague/missing status per §4 —
  vague follows the dimension rating) + one orphaned entry per span with an
  English B1 reason describing why no part claims it; feature-inside-action
  words claimed by the action; reason strings live beside the function as
  verbatim-twin constants (NOT in `messages.py` — terminal display scope
  untouched); deterministic ordering per the data-model Phase 12 addendum
- [X] T100 Wire coverage into the analysis path at the call site that
  already fills `part_present`/part fields for a scored bullet (so every
  analyzed bullet carries the optional `coverage` record in its stored
  dict); the record is recomputed on re-analysis and never affects
  ratings/questions/completeness (D11)
- [X] T101 [P] Storage tolerance in `src/jobforward/storage/repository.py`:
  the bullet dict accepts an optional `coverage` list (load/save round-trip,
  absent by default, old documents unchanged — no schema bump)

### Web Engine & Display (twin + gray block)

- [X] T102 [P] Implement the verbatim TS twin `buildCoverage()` in
  `web/src/engine/flow/parts.ts` (same claiming, spans, ordering, reasons as
  T099) and add the optional `coverage` field to the engine bullet type in
  `web/src/engine/types.ts`
- [X] T103 [P] Add the English B1 strings to `web/src/engine/messages.ts`:
  block title "Not attributed to the framework" and the orphan-reason
  vocabulary (mirrors the Python constants)
- [X] T104 Render the gray "Not attributed to the framework" block under the
  one-sentence framework in `web/src/app/page.tsx`: one row per orphaned
  span (quotation + reason), neutral gray styling that never reuses the
  emerald/amber/red states; no block when there are no orphaned spans; per
  §5.1 the per-part quotation/status/reason ride on the existing part
  rendering

### Verification (gates as-run)

- [X] T105 Run all gates and record evidence (as-run 2026-11-04):
  `python -m pytest` **227 green** (216 prior + 11 new coverage/storage
  tests; TDD red confirmed first — ImportError, then two failing asserts:
  a wrong test expectation for the vague rule — context=0 makes a present
  feature vague per §4, test corrected to a bullet WITH a need — and a
  dead-code serialize bug in repository.py fixed by assign-then-return);
  parity **PARITY OK** with the new orphan case ("I rebuilt the pricing
  page, and the rollout finished in two weeks") and the coverage_edge
  comparison — the TS twin is byte-identical to Python; `tsc --noEmit`
  clean; `npm run test:byok` **23/24** (the 1 fail is the documented
  live-Ollama environmental timeout, unchanged from T093/T094);
  `npm run scan:byok` passed; terminal display untouched (`messages.py`
  and §5 display code never modified — coverage is data-only in Python);
  `data/resume.json` untouched. Note: `messages.ts` carries only
  COVERAGE_TITLE — the orphan-reason vocabulary lives beside
  `buildCoverage`/`build_coverage` as verbatim-twin constants so the
  parity gate compares a single computation source (T103 deviation,
  parity-mandated). Changed files: `flow/parts.py` (build_coverage +
  constants), `models/entities.py` (optional `Bullet.coverage`),
  `storage/repository.py` (optional serialize/load key), `cli.py` (two
  analysis call sites: _score_and_show + _reanalyze_bullet),
  `web/src/engine/flow/parts.ts` (buildCoverage twin),
  `web/src/engine/types.ts` (CoverageEntry + optional Bullet coverage),
  `web/src/lib/client.ts` (StoredBullet), `web/src/engine/messages.ts`
  (COVERAGE_TITLE), `web/src/app/page.tsx` (applyScoreToEntry wiring +
  gray block in BulletGate), parity harnesses (orphan case +
  coverage_edge).

## Phase 13: Hybrid Entry — Paste-and-Split (spec §4.2, clarified 2026-11-04)

**Purpose**: the user pastes one job's whole work experience at once; a
deterministic split engine shapes the candidate bullet list (flag "not an
achievement" lines, suggest splits at " and also ", wrap-merge continuation
lines); the user merges/splits/deletes and confirms ("I found 4 achievements.
Is that correct?"); the EXISTING per-bullet five-part pipeline then runs with
"Achievement n of total" progress and the original pasted text visible on
top. WEB-ONLY (D14): the terminal entry flow, display and `messages.py` are
untouched; the Python engine is untouched; the parity corpus is unchanged
(PARITY OK as-is). New optional entry fields company/dates(free-text)/
product_domain are stored + displayed with NO analysis effect (D15); VR-1
(1–6 confirmed bullets) stays (D17); the textarea is never blocked (soft
8-line limit). Tasks start at T106 (T091/T092 remain open).

### Setup & Foundational

- [X] T106 Record the product-owner decisions governing this phase
  (2026-11-04): WEB-ONLY scope (terminal entry flow/display + messages.py +
  Python engine untouched); fields stored+displayed with no analysis effect,
  dates = one free-text field; flag rule = no action verb + no parser signal
  + responsibility-style opening, wrap continuations merge into the previous
  bullet; VR-1 stays (confirmed list 1–6, textarea never blocked) —
  evidence: spec §4.2 resolved blocks + §4 entry fields + §9 criteria,
  research D14–D17, plan Phase 13 Addendum (incl. the 12-file list),
  data-model Phase 13 addendum, quickstart Phase 13 validation

### Tests First (P9 — failing before implementation)

- [X] T107 [P] Add the `test:engine` script to `web/package.json`
  (`tsx --test tests/engine/*.test.ts`) and write the failing split tests in
  `web/tests/engine/entry_split.test.ts`: `-`/`•` lines become candidates
  with the marker stripped; a wrap continuation (no marker, no flag match)
  joins the previous candidate with a single space; "Responsible for weekly
  meetings" is flagged while an action-bearing line is not; "…, and also …"
  sets splitSuggested; every candidate text is verbatim from the paste
  (modulo marker strip and line joins — text never rewritten, P1); >6
  candidates still split (the cap is the UI's job, D17)

### Engine (deterministic, web-only)

- [X] T108 Export `lineHasParserSignal(text)` from `web/src/engine/flow/
  parts.ts`: true when any existing marker list matches (need / feature /
  action / result-connector / intention / number+measure) — single source of
  truth, no marker or rule change (the five-part analysis logic untouched)
- [X] T109 Implement `splitBullets(pasted)` in NEW
  `web/src/engine/flow/entry_split.ts` returning
  `SplitCandidate { text, flagged, splitSuggested }[]` per research D16:
  normalize line endings, trim, drop empty lines; `-`/`•` lines are
  candidates (marker stripped); non-matching marker-less lines join the
  previous candidate with one space; flag rule = no action verb AND no
  parser signal AND /^(responsibilities?|responsible|duties|tasked|in charge
  of)\b/i opening; " and also " (word-boundary, case-insensitive) →
  splitSuggested; leading text before the first bullet becomes its own
  unflagged candidate
- [X] T110 [P] Fields pass-through: `web/src/engine/types.ts` ExperienceEntry
  gains optional `company`/`dates`/`product_domain` (null default; old
  entries unchanged); `web/src/lib/schemas.ts` AddEntryRequestSchema accepts
  them as optional strings; `web/src/engine/flow/pathService.ts` addEntry
  passes them through (VR-1 untouched); VR-8 EXTENDS to the three new fields
  (analyze F1 — P10 covers ALL user input): addEntry validates them with the
  existing `containsNonEnglish` boundary → `ERR_NON_ENGLISH_INPUT`;
  `web/src/app/api/entry/route.ts` forwards them
- [X] T111 [P] `web/src/lib/client.ts`: StoredEntry gains the three optional
  fields; the session keeps the original pasted text (`sourceText?`,
  display-only, never persisted into the stored entry)

### UI (entry flow rewrite)

- [X] T112 Add the English B1 strings to `web/src/engine/messages.ts`:
  field labels (company, dates, product domain), the instruction "Write each
  achievement on a separate line, starting with - or •", the PINNED example
  bullet (analyze F2): "New users could not find the items they saved, so I
  rebuilt the saved items page, resulting in more users coming back.", the
  found-count question "I found {n} achievements. Is that correct?", the
  flag prompt ("This line does not look like an achievement — keep it or
  discard it?"), the split suggestion, merge/split/delete labels, the
  soft-limit message "Put your best achievements first; you can add the
  rest later.", the >6 guidance to keep the best 6, and the confirm button
- [X] T113 Rewrite the web entry flow in `web/src/app/page.tsx`: replace
  entry_title/entry_bullets with `entry_details` (type shown, title +
  company + dates + product-domain fields — each validated with the existing
  `containsNonEnglish` boundary, analyze F1 — big achievement textarea with
  the instruction + example + soft-limit message past 8 lines) and
  `entry_split` (found-count question, flagged lines with Keep/Discard,
  split-suggested lines with Split/Keep-as-one, per-pair Merge,
  per-candidate Delete, >6 keep-best-6 guidance, Confirm) — every edit is
  the user's action and text is only moved or re-joined, never rewritten;
  per-candidate English check at SPLIT time with the existing
  `ERR_NON_ENGLISH_INPUT` message (analyze F4 — the server keeps enforcing
  VR-8 at Confirm); confirming with ZERO candidates takes the EXISTING draft
  path (entry saved as a draft with the new fields, analyze F3); on Confirm
  POST the confirmed bullets (+ optional fields) to /api/entry and enter the
  EXISTING per-bullet pipeline with "Achievement n of total" progress and
  the ORIGINAL pasted text visible at the top of the analysis screens
  (session sourceText)

### Verification (gates as-run)

- [X] T114 Run all gates and record evidence (as-run 2026-11-04):
  TDD red-first confirmed (module-missing fail, then the import bug
  `ACTION_VERB.test is undefined` caught by the tests and fixed by exporting
  the shared list from parts.ts); `tsc --noEmit` clean (after fixing the
  last `setDraftBullets` leftover in the Menu onAdd reset);
  `npm run test:engine` **11/11 green** (marker strip, wrap-merge,
  responsibility flag incl. the marked variant, leading unmarked text,
  action-bearing join, " and also " suggestion, CRLF + empty lines, >6
  candidates, bare-marker candidates dropped); parity **PARITY OK**
  (corpus unchanged — Python untouched); `npm run test:byok` **23/24**
  (live-Ollama environmental, unchanged); `npm run scan:byok` passed;
  `python -m pytest` **227 green** (Python engine untouched); terminal and
  `messages.py` untouched. Implementation notes: `addEntry` gained a
  trailing optional `context` param (company/dates/product_domain) with the
  VR-8 English boundary EXTENDED to the three fields (analyze F1) — VR-1
  and the bullet/title checks byte-identical; split-time per-candidate
  English check (F4); confirm with ZERO candidates takes the existing draft
  path with the new fields (F3); the " and also " connector is dropped as a
  join word and a manual split takes the typed first-words-of-the-second
  needle (both segmentation — text never rewritten); ModelBanner's active
  screen list updated 1:1 (`entry_bullets` → `entry_split`), preserving the
  Phase 11 disclosure set (score/bullet_list/merge unchanged).
  Changed files: the plan's 12-file list
  exactly (entry_split.ts and tests/engine/entry_split.test.ts NEW).

## Phase 14: Platform Theme and Voice (spec §11, clarified 2026-11-05)

**Purpose**: the warm platform theme (product-owner pack) and its four
voice/tone rules become the project-wide look and contract — COMPLETE
adoption on every web screen (cream background, brand red-brown pill
primary buttons, Fraunces headings, Source Sans 3 18px body), Tailwind-
variant-only (raw pack stays outside the repo), the global stylesheet as
the SINGLE token source, three fonts VENDORED in `web/src/fonts/` loaded
via next/font/local (zero runtime external font requests, P8), an automated
theme guard (no emoji in message strings; key tokens present), light mode
only. Cross-cutting tone rules; the terminal already complies (B1, ASCII,
frozen) and is NEVER touched. Python engine, `messages.py`, parity corpus:
UNTOUCHED. Presentation only — no analysis/flow/text changes (P1/P2/P4).
Tasks start at T115 (T091/T092 remain open).

### Setup & Foundational

- [X] T115 Record the product-owner decisions governing this phase
  (2026-11-04/05): theme pack delivered and reviewed; COMPLETE web adoption
  (D18); Tailwind-variant-only, raw files outside the repo (D19); fonts
  VENDORED locally in `web/src/fonts/` (3 variable TTFs + 3 OFL licenses,
  downloaded from the official google/fonts repo, verified signed) loaded
  via next/font/local — no external font links (D20); enforceable tone
  rules get an automated guard, visual-only rules stay walkthrough-checked
  (D21); light mode only (assumption) — evidence: spec §11 resolved blocks
  + §9 theme criterion, research D18–D21, plan Phase 14 Addendum (incl. the
  file list), quickstart Phase 14 validation

### Tests First (P9 — failing before implementation)

- [X] T116 Write the failing theme guard tests in NEW
  `web/tests/engine/theme.test.ts` (runs under the existing
  `npm run test:engine` glob): (a) scan EVERY exported string constant of
  `web/src/engine/messages.ts` — zero emoji codepoints (Unicode
  Extended_Pictographic / surrogate emoji ranges); (b) `web/src/app/globals.css`
  defines the key tokens — brand + hover, background/card/secondary,
  foreground/muted, input border, the error pair, the success pair, accent,
  the 14px radius family and pill, the 680px content width, the three font
  families, and the msg-error/msg-success/msg-info classes; red first
  (globals.css is still monochrome)

### Implementation (styling only — no structural/text/flow change)

- [X] T117 Rewrite `web/src/app/globals.css` as the SINGLE token source
  (plan Phase 14 Addendum): the pack's Tailwind variant adapted — @theme
  inline semantic map + :root oklch tokens (brand #942B2B, hover #7A2020,
  background #FAF9F5, card #FEFDFB, secondary #F0EEE5, text #141413,
  muted #59554E, input #CBC3B6, error #C33C00 with bg/text pair, success
  #5E713C with pair, accent #FBE2D9, warm neutral ramp, themed
  red/emerald scales), component classes with today's names (btn-primary →
  brand-red pill with soft shadow, btn-secondary, text-input, card,
  tech-tag, pulse-dot) and NEW msg-error/msg-success/msg-info classes;
  body 18px/1.65, Fraunces headings, 680px column, 14px/18px radii
- [X] T118 [P] Switch `web/src/app/layout.tsx` to next/font/local with the
  three VENDORED variable fonts (`web/src/fonts/SourceSans3[wght].ttf`,
  `Fraunces[SOFT,WONK,opsz,wght].ttf`, `JetBrainsMono[wght].ttf` — weight
  ranges), exposing the sans/display/mono CSS variables the stylesheet
  consumes; REMOVE the Inter import; body/background classes use the
  semantic tokens
- [X] T119 Sweep `web/src/app/page.tsx` (and `web/src/components/*.tsx`
  where they carry literal whites): remaining monochrome utilities move to
  the semantic tokens (bg-white → bg-card, text-white on primary surfaces →
  text-primary-foreground, literal border colors → border tokens), message
  blocks adopt the msg-* classes; the amber model-banner KEEPS its amber
  (§5.1's vague color — deliberately not redefined by the theme); NO
  structural, text, or flow changes

### Verification (gates as-run)

- [X] T120 Run all gates and record evidence (as-run 2026-11-05):
  TDD red-first confirmed (4 theme-guard fails: tokens missing, fonts not
  in layout, Inter present); then all green — `npm run test:engine`
  **17/17** (11 split + 6 theme guard: emoji scan, key tokens, font
  variables, message/component classes, no-external-font-origin scan,
  layout loads the three vendored TTFs + no next/font/google);
  `tsc --noEmit` clean; **`next build` exit 0** — next/font/local bundles
  the bracket-named vendored TTFs; parity **PARITY OK** (corpus unchanged);
  `npm run test:byok` 23/24 (live-Ollama environmental, unchanged);
  `npm run scan:byok` passed; `python -m pytest` **227 green**. Sweep was
  small: the Working…/error/success blocks now use msg-info/msg-error/
  msg-success; the copy tooltip uses bg-foreground/text-background; the
  themed neutral/red/emerald scales carry the rest — ModelBanner and
  ByokSettings needed NO change (no literal whites; amber untouched, §5.1).
  Guard deviation noted (T116): the three font FAMILY names do not appear
  in globals.css by design (next/font injects hashed family names), so the
  guard asserts the font CSS VARIABLE mappings + the vendored-file loads in
  layout.tsx + the no-external-origin scan — the thing §11.4 actually
  requires. Light-mode-only held. Changed files: theme.test.ts (NEW),
  globals.css (REWRITE), layout.tsx (fonts), page.tsx (msg-* + tooltip) —
  the plan's list exactly.
