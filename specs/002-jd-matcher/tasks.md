# Tasks: JD Matcher — Job Posting Skill Analysis (Version 1)

**Input**: Design documents from `/specs/002-jd-matcher/`

**Prerequisites**: plan.md (required), spec.md (required), research.md,
data-model.md, contracts/matcher-pipeline.md, quickstart.md — all present.

**Tests**: included — the constitution (Principle 9) mandates test-first
implementation, and spec FR-022 requires the two draft example postings as
permanent regression fixtures with written expected outputs. Tasks are
ordered so each story's tests exist and FAIL before its implementation.

**Organization**: Tasks are grouped by user story (US1–US4 from spec.md).
US2 and US3 share priority P2; US3 lands after US2 because both render
through the same stage machine. US4 (guarantees) completes the flow.

**Existing-code note**: the repository contains the implemented 001 feature.
This feature adds a NEW `matcher2/` package and repoints the CLI match-menu
entry to it; the `matcher/` package from 001 stays in place (superseded, per
spec Clarifications 2026-10-25) and must NOT be reworked or deleted here.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1…US4 from spec.md)
- Include exact file paths in descriptions

## Path Conventions

- Single CLI project: `src/jobforward/`, `tests/` at repository root, data
  files in `data/`, taxonomy at `docs/soft-skills-taxonomy.json`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Create the `src/jobforward/matcher2/` package skeleton per
  plan.md: empty `posting.py`, `hard_skills.py`, `soft_skills.py`,
  `report.py`, and `rules_version.py` containing
  `MATCHER_RULES_VERSION = "matcher-rules-1.0.0"`; create
  `tests/fixtures/` with empty `__init__.py`-style package marker (or
  conftest-free plain data dir) for the regression samples
- [X] T002 [P] Add ALL fixed user-facing strings to
  `src/jobforward/messages.py` verbatim from
  `specs/002-jd-matcher/contracts/matcher-pipeline.md` §1 (English B1,
  constitution P10): `MATCH_PROMPT_PASTE`, `MATCH_ERR_PERSIAN`,
  `MATCH_ERR_TOO_SHORT`, `MATCH_ERR_TOO_LONG`, `MATCH_CLEAN_SCRIPT_ONE`,
  `MATCH_CLEAN_BLOCKS`, `MATCH_CLEAN_TAGS`, `MATCH_WORD_COUNT`,
  `MATCH_GATE`, `MATCH_CANCELLED`, `MATCH_CANCELLED_EXIT`,
  `MATCH_ERR_INVALID_KEY`, `MATCH_ERR_NOT_A_POSTING`,
  `MATCH_ERR_ZERO_SKILLS`, `MATCH_ERR_CONSISTENCY`, `MATCH_DROPPED`,
  `MATCH_LIMIT_HARD`, `MATCH_LIMIT_SOFT`, `MATCH_NO_TAXONOMY_MATCH`,
  `MATCH_COUNTS`, plus the hard/soft table headers — no other module may
  contain user-facing strings

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story

**?? CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 Extend `src/jobforward/storage/events.py` with the ten new
  event types from data-model.md — `posting_received`, `posting_cleaned`,
  `posting_rejected_language`, `posting_rejected_length`,
  `posting_not_a_job`, `posting_analyzed`, `extraction_failed`,
  `consistency_failed`, `stage_confirmed`, `stage_cancelled` — added to
  `ALL_EVENT_TYPES` with convenience methods; keep the append-only JSONL
  format and ISO-8601 `ts`
- [X] T004 [P] Write `tests/contract/test_taxonomy_contract.py`: pin the
  data source per contracts §3 — `docs/soft-skills-taxonomy.json` has
  exactly 56 records, every record has `id`, `label_en`, `label_fa`,
  `category_code`, `category_label`, `group_code`, `group_label`,
  `alt_labels_en` (a list), `description_en`, `resume_eligible`;
  `label_en` values are unique; `group_code` matches `^T\d+\.\d+$`;
  loading failures must surface as an extraction failure, never a partial
  report (FR-014)

**Checkpoint**: Foundation ready — user story implementation can begin

---

## Phase 3: User Story 1 — Paste a posting, review it, confirm or cancel (P1) — MVP

**Goal**: One-shot paste terminated by `END`/EOF; cleaning (control chars,
line endings, script/style blocks, HTML tags) with a report; word count;
>10% Persian/Arabic-letter rejection; 100–1,500-word gate; `[Y]/[C]` gate
with Cancel always returning to Paste (Cancel at Paste exits).

**Independent Test**: Paste a 200-word posting containing
`<script>alert(1)</script>`; verify the cleaning message, the word count,
and that `[Y]` advances while `[C]` returns to the paste prompt and `X`
re-prompts.

### Tests for User Story 1 (write FIRST — must FAIL before implementation)

- [X] T005 [P] [US1] Write `tests/unit/test_posting_cleaning.py`: control
  characters removed (keep `\n`, `\t`); `\r\n`/`\r` normalized to `\n`;
  `<script>`/`<style>` blocks removed WITH content and counted
  (case-insensitive); remaining tags removed keeping inner text and
  counted; the `END` sentinel is never part of the text; word count =
  `len(cleaned.split())`; order matters (script removal precedes tag
  stripping) (FR-003, FR-004, FR-005)
- [X] T006 [P] [US1] Write `tests/unit/test_language_check.py`: the ratio
  counts LETTERS only — English `[A-Za-z]` vs Persian/Arabic-script ranges
  (U+0600–U+06FF, U+0750–U+077F, U+08A0–U+08FF, U+FB50–U+FDFF,
  U+FE70–U+FEFF); >10% → rejected; scattered Persian names in English
  text pass; digits/punctuation never affect the ratio (FR-006)
- [X] T007 [P] [US1] Write `tests/contract/test_matcher2_messages.py`:
  every fixed message from contracts §1 exists in `messages.py` with the
  EXACT drafted text (including `I removed 1 script block…` singular
  variant); all are ASCII English B1 (FR-004, FR-006–FR-008, FR-019,
  FR-020 message contract)
- [X] T008 [P] [US1] Write `tests/integration/test_matcher_flow.py`
  (scripted CLI, injectable I/O): full-paste input lines + `END` reaches
  REVIEW showing the cleaning report (or none) and `Word count: N`;
  `[Y]` advances toward the hard-skills stage; `[C]` at any stage returns
  to PASTE with `MATCH_CANCELLED` and discards state; `[C]` at PASTE
  prints `MATCH_CANCELLED_EXIT` and exits the flow; invalid key re-prompts
  with `MATCH_ERR_INVALID_KEY`; too-short/too-long/Persian inputs return
  to PASTE with their fixed messages and never analyze; Ctrl+D (EOF from
  the injected input fn) is accepted as a terminator (FR-001, FR-007,
  FR-008)

### Implementation for User Story 1

- [X] T009 [US1] Implement `src/jobforward/matcher2/posting.py`:
  `clean_posting(raw) -> CleanedPosting` per data-model.md (ordered steps
  of T005) with `script_blocks_removed`, `style_blocks_removed`,
  `html_tags_removed`, `word_count`, and the letter-ratio
  `language_ok` check of T006 (depends on T005, T006)
- [X] T010 [US1] Implement the staged flow in `src/jobforward/cli.py`:
  new matcher states PASTE → REVIEW driven by `matcher2.posting`, the
  `[Y]/[C]` gate helper (Y advances; C returns to PASTE discarding the
  stage result; other keys re-prompt), the idle-menu match entry wired to
  the new flow (the 001 `matcher/` call sites removed from the flow path),
  and events `posting_received`, `posting_cleaned`,
  `posting_rejected_language`, `posting_rejected_length`,
  `stage_confirmed`, `stage_cancelled` logged via T003 (depends on T009,
  T002, T003)

**Checkpoint**: User Story 1 is fully functional and testable independently
(quickstart Scenario G1)

---

## Phase 4: User Story 2 — Hard-skill tables with priorities and evidence (P2)

**Goal**: Three tables (Must / Should / Nice) with the fixed priority
cascade, "one of" merges, duplicate merges vs distinct skills, ≤ 12-word
verbatim evidence with drop+count, posting-order rows, "—" for empty
groups, real-total counts, and the 5-row display limit.

**Independent Test**: The hard-skills regression fixture reproduces the spec
example exactly (3 Must / 2 Should / 1 Nice, "is a plus" override, one-of
row, verbatim evidence, counts line).

### Tests for User Story 2 (write FIRST — must FAIL before implementation)

- [X] T011 [P] [US2] Create the regression fixture pair
  `tests/fixtures/hard_skills_posting.txt` (the spec's example posting:
  Requirements / Required Tools / Preferred Qualifications) and
  `tests/fixtures/hard_skills_expected.json` (expected rows: names, types,
  priorities, evidence quotes, "one of" structure, counts 3/2/1) per
  FR-022 — the fixture is authoritative and permanent
- [X] T012 [P] [US2] Write `tests/unit/test_hard_skills.py`: cascade order
  (explicit word > section heading > Must "(default)"); the exact word
  lists (must/required/mandatory/essential/at least/minimum;
  preferred/desirable/ideally; plus/nice to have/bonus/advantage); heading
  sets (Responsibilities/Requirements/Required Tools → Must;
  Preferred Qualifications → Should); "is a plus" inside Requirements →
  Nice; "Power BI, Metabase, or Grafana" → one row "One of: Power BI /
  Metabase / Grafana" typed `hard_tool`; same normalized skill merged with
  highest priority; genuinely different skills stay separate rows; evidence
  ≤ 12 words and verbatim in cleaned text; non-verbatim evidence dropped
  and counted; rows in posting order (FR-009–FR-012)

### Implementation for User Story 2

- [X] T013 [US2] Implement `src/jobforward/matcher2/hard_skills.py`:
  section detection (case-insensitive, optional trailing `:`), item
  extraction (bullet markers `- • * ·` stripped; non-section lines are
  items for unstructured postings), the priority cascade with
  `default_priority`, boilerplate reduction and alternative-tool merge per
  rules `matcher-rules-1.0.0`, duplicate merge, evidence extraction with
  verbatim-substring verification and drop+count (depends on T009, T012)
- [X] T014 [US2] Render the HARD_SKILLS stage in `src/jobforward/cli.py`:
  three tables in fixed order with columns Skill | Type | Evidence, "—"
  for an empty group, first-5 display with `MATCH_LIMIT_HARD`, the
  `MATCH_COUNTS` line with real totals, `MATCH_DROPPED` when rows were
  dropped, the `[Y]/[C]` gate to the soft-skill stage, and log
  `posting_analyzed` (context: rules_version, hard-skill counts per
  priority, soft-skill count) once the report builds (depends on T013,
  T010)

**Checkpoint**: User Stories 1 AND 2 work independently (quickstart Scenario
G2, including the fixture regression)

---

## Phase 5: User Story 3 — Soft-skill table from the taxonomy (P2)

**Goal**: Soft skills strictly from the 56 taxonomy skills (`label_en` shown
verbatim), Explicit via `label_en`/`alt_labels_en` whole-word matches,
Inferred only via the curated inference table with a one-sentence reason,
cascade priorities, per-skill merge, removal test, "No taxonomy match" line,
group codes shown, ESCO `id` stored not shown, 5-row limit.

**Independent Test**: The soft-skills regression fixture reproduces the spec
example exactly (4 rows incl. the Inferred build-networks row; the
"No taxonomy match" line for "Excellent communication skills"; no row from
"fast-growing fintech").

### Tests for User Story 3 (write FIRST — must FAIL before implementation)

- [X] T015 [P] [US3] Create the regression fixture pair
  `tests/fixtures/soft_skills_posting.txt` (the spec's example posting:
  Responsibilities / Requirements / Preferred Qualifications + the
  fintech sentence) and `tests/fixtures/soft_skills_expected.json`
  (expected rows with label_en, group_code, evidence, priority, certainty,
  the Inferred reason, and the unmatched concept) per FR-022
- [X] T016 [P] [US3] Write `tests/unit/test_soft_skills.py`: taxonomy
  loading via the T004 contract; explicit whole-word match on `label_en`
  AND `alt_labels_en` variants (case-insensitive); inference table rows
  carry a one-sentence reason and map only responsibility/requirement
  phrases ("manage stakeholders" → build networks with the drafted
  reason); NO inference from company/industry/title lines (the fintech
  sentence produces nothing); merge per skill id keeping the highest
  priority with Explicit beating Inferred at equal priority; the removal
  test holds structurally (every row's evidence alone leads to the skill);
  unmatched skill-ish concepts (e.g. "communication skills") land on the
  "No taxonomy match" line and never become rows (FR-014–FR-016)

### Implementation for User Story 3

- [X] T017 [US3] Implement `src/jobforward/matcher2/soft_skills.py`:
  taxonomy loader (exact fields verbatim; malformed file → extraction
  failure, never a partial report), explicit matcher, the curated inference
  table (versioned with `matcher-rules-1.0.0`; seeded at minimum with the
  drafted stakeholder→build-networks entry), merge logic, and the
  unmatched-concept detection list (depends on T016, T004)
- [X] T018 [US3] Render the SOFT_SKILLS stage in `src/jobforward/cli.py`:
  the table with columns Skill | Group | Evidence | Priority | Certainty
  ordered Must → Should → Nice (Explicit before Inferred within each
  level), first-5 display with `MATCH_LIMIT_SOFT`, the
  `MATCH_NO_TAXONOMY_MATCH` line(s), no ESCO URI ever printed, and the
  final `[Y]/[C]` gate that finishes the run (depends on T017, T014)

**Checkpoint**: US1–US3 work independently (quickstart Scenario G3,
including the fixture regression)

---

## Phase 6: User Story 4 — No free-form verdict, consistency, reliability (P3)

**Goal**: Output is tables + counts only; input errors and extraction
failures use their own messages and are never verdicts; the consistency
check (totals == displayed + hidden) suppresses an inconsistent report;
5-run reliability ≥ 90%; regression fixtures rerun after every change.

**Independent Test**: Run both fixtures 5 times each — byte-identical
tables; a non-posting and a zero-skill text yield their fixed messages; a
tampered report triggers the consistency error instead of display.

### Tests for User Story 4 (write FIRST — must FAIL before implementation)

- [X] T019 [P] [US4] Write `tests/unit/test_report_consistency.py`: totals
  equal displayed + hidden rows for every table; a deliberately
  inconsistent report makes the builder return the failure state; the
  failure path never renders partial tables; `dropped_count` flows into
  `MATCH_DROPPED` (FR-020, FR-013)
- [X] T020 [P] [US4] Write `tests/integration/test_matcher_reliability.py`:
  run the full pipeline on BOTH regression fixtures 5 consecutive times →
  identical skills and priorities every run (deterministic → 100% ≥ 90%,
  FR-021); assert the rendered output contains no verdict-like text
  ("matches", "does not match", "relevant"/"irrelevant" as standalone
  judgments) and that a not-a-posting text and a zero-skill text produce
  `MATCH_ERR_NOT_A_POSTING` / `MATCH_ERR_ZERO_SKILLS` respectively
  (FR-018, FR-019); the not-a-posting detection rule lives in the rules
  version (zero recognized headings AND fewer than 3 list items AND no
  priority words → not a posting)

### Implementation for User Story 4

- [X] T021 [US4] Implement `src/jobforward/matcher2/report.py`:
  `build(...) -> AnalysisReport` per data-model.md — hard tables ordered
  Must/Should/Nice with posting-order rows, soft rows ordered
  Must → Should → Nice (Explicit first), truncation metadata (first 5 per
  table), real totals, `dropped_count`, `rules_version`, and the
  consistency check; expose a `render plan` (row/limit/totals) the CLI
  prints so display and data never diverge (depends on T013, T017, T019)
- [X] T022 [US4] Wire the guarantees into `src/jobforward/cli.py`: the
  not-a-posting check on the cleaned text before extraction; zero-skills →
  `MATCH_ERR_ZERO_SKILLS` and back to PASTE; consistency failure →
  `MATCH_ERR_CONSISTENCY` instead of the report; log `posting_not_a_job`,
  `extraction_failed`, `consistency_failed` (depends on T021, T010)

**Checkpoint**: All four user stories work independently (quickstart
Scenario G4)

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and final validation affecting multiple stories

- [X] T023 [P] Update `README.md`: a "JD Matcher (v1)" section — the staged
  flow, English-only postings, the 56-skill taxonomy source
  (`docs/soft-skills-taxonomy.json`), the display limit, and the
  supersession note that this replaces the 001 per-entry matcher output
- [X] T024 Run the full quickstart.md validation (Scenarios G1–G4, both
  regression fixtures) and record results in the PR/commit message
- [X] T025 Final compliance review against constitution v3.0.0 for this
  feature: P1 (evidence verbatim or dropped; inference table reason-backed),
  P2 (explicit [Y] at every stage; cancel discards), P3 (no scores touched),
  P6 (posting-only: the flow reads and writes no resume data), P7 (all ten
  events logged with timestamps), P8 (deterministic stdlib pipeline; the
  inference table justified in plan.md Complexity Tracking), P9 (fixtures
  and tests preceded implementation), P10 (all new strings in
  `messages.py`, English B1) — including the FR-002 data-only guard:
  grep-audit `src/jobforward/matcher2/` and the CLI matcher flow for
  execution-capable constructs (`eval`, `exec`, `subprocess`,
  `webbrowser`, `os.startfile`, `urllib`, `socket`) — there must be none

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — T001 first, T002 parallel-safe
- **Foundational (Phase 2)**: depends on Setup — T003 and T004 complete the
  blocking infra for ALL stories
- **US phases (3–6)**: depend on Phase 2 only; US2/US3 consume US1's
  cleaned posting at runtime; US4 consumes US2+US3 outputs
- **Polish (Phase 7)**: depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: standalone after Foundation → MVP
- **US2 (P2)**: needs US1's CleanedPosting at runtime; independent code
- **US3 (P2)**: needs US1's CleanedPosting; independent of US2's code
- **US4 (P3)**: needs US2+US3 outputs to guard; tests are unit-isolated via
  fixtures

### Within Each User Story

- Tests (T0xx marked "write FIRST") MUST fail before implementation
- Fixtures (T011, T015) are written before their extraction code
- Story checkpoint verified before moving to next priority

### Parallel Opportunities

- All [P] test/fixture tasks inside a story phase run together before its
  implementation tasks
- T009 (posting.py) and T003 (events) are independent
- US2 and US3 touch disjoint files (hard_skills.py vs soft_skills.py) →
  parallelizable after Phase 2

---

## Parallel Example: User Story 1

```bash
# Together (all independent test files):
Task: "tests/unit/test_posting_cleaning.py"      (T005)
Task: "tests/unit/test_language_check.py"        (T006)
Task: "tests/contract/test_matcher2_messages.py" (T007)
Task: "tests/integration/test_matcher_flow.py"   (T008)

# Then:
Task: "matcher2/posting.py"                      (T009)
Task: "cli.py staged flow"                       (T010)
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → Phase 2 Foundational
2. Phase 3 US1: write failing tests (T005–T008), implement T009–T010
3. STOP and validate: quickstart Scenario G1 (cleaning, gates, cancel)
4. Demo-ready increment (P1 value: safe, gated posting input)

### Incremental Delivery

1. Foundation → US1 (gated input) → US2 (hard tables) → US3 (soft table) →
   US4 (guarantees) → Polish
2. Each phase leaves the previous stories untouched and passing

### Single-developer default line (typical for this feature)

Setup → Foundation → US1 → US2 → US3 → US4 → Polish, validating at every
story checkpoint against quickstart.md.

---

## Notes

- [P] = different files, no dependencies; story labels give traceability
- Tests and fixtures BEFORE implementation (constitution Principle 9
  mandatory; FR-022 makes the two fixtures permanent)
- All user-facing strings come from `messages.py` only (T002); the drafted
  message texts are contractual — reproduce them character-for-character
- Every stage transition needs an explicit `[Y]`; `[C]` always returns to
  PASTE; nothing is analyzed without passing both gates
- Evidence must be a verbatim substring of the cleaned text — no
  paraphrasing, no invented rows, no skills outside the taxonomy
- The 001 `matcher/` package is superseded: do not rework, delete, or call
  it from the new flow
- Matcher rules are versioned `matcher-rules-1.0.0`; any cascade, heading,
  normalization, or inference-table change bumps the version
