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

---

# v2 Addendum — model-driven analysis (web only), added 2026-11-09

**Input**: approved plan.md v2 (owner review 2026-11-09), contracts/
matcher-pipeline-v2.md, research.md R1–R11, data-model.md v2,
quickstart.md v2. Constitution v4.3.0 in force (incl. اصل ۲۲ — one fixed
model algorithm, governance in spec-004).

**Approved frozen artifacts** (owner-approved 2026-11-09; any change =
`matcher-rules-2.0.0` bump): the soft/trait mapping (research R2), the
system prompt text (contract §2.1), `role_nature` single-enum, the
output JSON schema (contract §3), the validator invariants V1–V8
(data-model.md).

**Scope guard**: WEB ONLY. No file under `terminal/` is modified by any
v2 task; the v1 web engine functions and `POST /api/matcher` stay in
place, dormant (S7). No new API route, no new env var (اصل ۲۲ / P12/P21).

Task IDs continue from the v1 list (T001–T025, all [X]); v2 tasks are
T026–T046.

---

## Phase 8: v2 Setup (spec + module skeleton)

**Purpose**: make the spec tell the truth about v2 BEFORE any code, and
lay down the typed contract.

- [X] T026 Edit `specs/002-jd-matcher/spec.md` to v2 per plan
  supersession list S8: add the v2 section (7-step pipeline as the
  method, output contract pointer to contracts/matcher-pipeline-v2.md,
  §15/§16 failure UX, web-only note); mark FR-009–FR-013, FR-014–FR-017,
  FR-020, FR-021, FR-022 "Superseded on web (v2 — terminal keeps v1)" in
  place, and FR-008 "Partially superseded on web (v2): the Review gate,
  invalid-key re-prompt, and Cancel/exit semantics stay; the Hard-skills
  and Soft-skills stage gates are removed (one analyzing step)"; add Clarifications session 2026-11-09 (the four owner rulings:
  one LLM call, SOFT_TAXONOMY = the existing 56-skill file, web only,
  §15/§16 no-model UX — plus constitution v4.3.0 اصل ۲۲ as the governing
  principle); keep story IDs stable (US2 = run the analysis and see the
  structured result; US3 = taxonomy discipline; US4 = trust guarantees
  and failure UX); set Status to "v2 — approved plan, ready for
  implement". No code before this task.
- [X] T027 [P] Create `web/src/engine/matcher2/v2/rulesVersion.ts` with
  `export const MATCHER_RULES_V2 = "matcher-rules-2.0.0"` (constant
  only; the v1 constant elsewhere is untouched).
- [X] T028 [P] Create `web/src/engine/matcher2/v2/types.ts` (TypeScript
  strict) exactly per data-model.md: `SkillItem` (`type`:
  "hard"|"soft"|"trait"; `name`: string; `category`:
  "technical"|"tool"|"experience"|"domain"|null — non-null only when
  type is "hard"; `evidence`: string[] — at least 1; `source`:
  "explicit"|"implied" — hard is always "explicit"; `confidence`:
  "high"|"medium"|"low"|null — non-null only for soft/trait),
  `SummaryV2` (six non-empty fields; `role_nature`:
  "executive"|"analytical"|"managerial" — exactly one),
  `RedFlag` (`kind`: "conflict"|"unrealistic"|"multi_role"|"vague"|
  "discriminatory"; `text`: string; `evidence`: string[] — at least 1),
  `MatcherAnalysisV2` (summary; must/preferred/bonus: SkillItem[];
  red_flags; `rules_version` — stamped by code, never by the model),
  `MatchFailure` (error ids + failure class per data-model.md).

## Phase 9: v2 Foundational (Blocking Prerequisites)

**Purpose**: taxonomy typing, prompt surface, gateway task, schema — and
the validator's failing tests — before any story code.

**CRITICAL**: No user-story work begins until this phase is complete.

- [X] T029 [P] Write the FAILING test
  `web/tests/engine/matcher2-v2/taxonomy.test.ts` first (P9): every one
  of the 56 `label_en` values typed exactly once (`soft`|`trait`);
  group defaults per research R2 (T3.3 and T4.5 → `trait`, all other
  groups → `soft`); per-skill exceptions `show commitment` (T3.2) and
  `show empathy` (T4.2) → `trait`; asserts the source file has exactly
  56 records with the required keys.
- [X] T030 Implement `web/src/engine/matcher2/v2/taxonomy.ts` to make
  T029 pass: import `web/data/soft-skills-taxonomy.json` (public data,
  no keys — P14-safe; resolveJsonModule), apply the R2 typing map
  (group defaults + the two per-skill exceptions), export
  `SoftTaxonomyEntry[]` (`label_en`, `group_code`, `type`) and the data
  for the prompt table. The ESCO `id`, `alt_labels_en`,
  `description_en` are NOT exported to the prompt path.
- [X] T031 [P] Register the task in `web/src/lib/llm/tasks.ts`:
  `matcher_analysis: "GEN"` with the documented reason comment from
  contracts/matcher-pipeline-v2.md §1 (heavy structured generation of
  the full analysis document; GEN chain quality gates the whole step) —
  اصل ۲۲: this is the ONLY model plumbing this feature adds. Add a test
  (test:llm suite) that `categoryForTask("matcher_analysis") === "GEN"`
  and unknown task names are still rejected.
- [X] T032 [P] Add the prompt surface to `web/src/lib/byok/prompts.ts`
  per contract §2 — reproduce the owner-approved §2.1 text
  character-for-character: `BYOK_MATCHER_SYSTEM_PROMPT` (7-step method +
  taxonomy table slot), `buildMatcherTaxonomyTable(entries)` (one line
  per skill: `label_en | type | group_code`), `buildMatcherUserPrompt(
  postingText)` with the `<posting>` wrapper, and the retry-extension
  text ("Your previous answer was rejected. Fix exactly these problems:
  …"). English B1; byte-identical for gateway and BYOK paths (single
  prompt surface, 001 §15 rule).
- [X] T033 [P] Add `MatcherAnalysisV2Response` zod schema to
  `web/src/lib/schemas.ts` per data-model.md (the model NEVER sends
  `rules_version`; it is stamped by code from `MATCHER_RULES_V2`).
- [X] T034 [P] Write the FAILING validator test
  `web/tests/engine/matcher2-v2/validate.test.ts` with hand-written
  fixtures, one per invariant (P9; these fixtures double as the
  regression fixtures of quickstart scenario 8): a valid document
  passes; per-invariant invalid documents fail NAMING the offending
  item (e.g. `must[2].name`) — V1 evidence (whitespace-normalized
  containment in the cleaned posting, ≥1 sentence per item and red
  flag), V2 uniqueness (no name in two buckets, no name with two
  types), V3 must-gate (soft/trait in `must` requires
  `confidence === "high"`), V4 field rules (category non-null ⇔ hard;
  confidence non-null ⇔ soft/trait; hard ⇒ source "explicit"), V5
  taxonomy membership (case-insensitive compare, output canonicalized
  to `label_en`), V6 enums, V7 summary completeness, V8 all-buckets-
  empty → zero-skills failure; parse failure (no JSON) and shape
  failure count as failed checks; the validator accepts or rejects
  WHOLE and never edits output.

## Phase 10: User Story 2 (v2) — Run the analysis and see the structured result (P1) — MVP

**Goal**: paste → review gate (unchanged) → one `matcher_analysis` call →
validated result screen (summary + must/preferred/bonus + red flags).

**Independent Test**: with mock transport, a valid mock response renders
the full structured result with correct bucket counts and evidence
quotes; no `/api/matcher` call is made.

### Implementation for User Story 2 (v2)

- [X] T035 [US2] Implement `web/src/engine/matcher2/v2/validate.ts` to
  make T034 pass: invariants V1–V8 exactly per data-model.md; returns
  the validated `MatcherAnalysisV2` (with `rules_version` stamped from
  `MATCHER_RULES_V2`) or the failed-check list; never re-derives
  prioritization (research R5); never edits the model output.
- [X] T036 [US2] Rewire the JD step in `web/src/app/page.tsx`: after the
  review gate `[Y]`, ONE analyzing state — `POST /api/llm/gen` with
  `{task: "matcher_analysis", input: cleaned_text, context: {system}}`
  (system = prompt + taxonomy table; `x-byok-key`/`x-byok-model`
  headers when BYOK is active), accumulate the NDJSON stream, parse,
  validate via T035; render the result screen per contract §6: summary
  block (labels `Job title`, `Seniority`, `Work type`, `Domain`,
  `Role nature`, `Problem this role solves`), buckets in fixed order
  `Must have` → `Preferred` → `Bonus` (header shows the real count; ALL
  rows shown — no truncation, S3), rows with type chip, category for
  hard, `Explicit · High confidence`-style text for soft/trait, evidence
  sentences as quotes, red-flags list with kind labels (`Conflict`,
  `Unrealistic`, `Several roles in one posting`, `Vague duties`,
  `Discriminatory phrasing`); `Back` → review gate; Cancel during
  analyzing → discard, return to paste; the v1 hard/soft stage gates
  are removed (S2) and `/api/matcher` is no longer called (S7 — route
  kept, dormant); events `matcher_v2_requested`, `matcher_v2_result`
  (bucket counts + red-flag count), `matcher_v2_cancelled`.
- [X] T037 [US2] Integration test with mock transport (web/tests,
  test:engine suite): the draft example posting fixture → exactly one
  `matcher_analysis` call → validated result rendered with the
  expected bucket counts and verbatim evidence; assert `/api/matcher`
  is NOT called and `rules_version` in the payload is
  `matcher-rules-2.0.0`.

**Checkpoint**: the full v2 happy path works end-to-end on web with mock
transport; v1 code paths remain green (parity + pytest untouched).

## Phase 11: User Story 3 (v2) — Taxonomy discipline (P2)

**Goal**: soft/trait rows carry taxonomy names only, typed and ordered
per the approved mapping.

**Independent Test**: a mock response containing an out-of-taxonomy name
fails V5 (the retry path is exercised in Phase 12 — T038/T040); the
corrected result shows the canonical `label_en`.

- [X] T039 [P] [US3] Ordering test in `web/tests/engine/matcher2-v2/`:
  within a bucket rows order hard → soft → trait, explicit before
  implied, posting order otherwise (contract §3).
  (T038 moved to Phase 12 — analyze O1: its retry assertion depends on
  T040.)

## Phase 12: User Story 4 (v2) — Trust guarantees and §15 failure UX (P3)

**Goal**: retry-once → refusal, zero-skills message, §15/§16 failure UX
identical to the 001 step pages; v1 output never shown on web.

**Independent Test**: with mock error scenarios, the step shows the
right failure class banner and never renders partial tables or a
verdict.

- [X] T040 [US4] Retry-once-then-refusal in the JD step (`page.tsx`): on
  validation failure, ONE retry call whose user prompt carries the §2.2
  retry extension with the failed-check list; a second failure →
  refusal `ERR_MATCHER_ANALYSIS_FAILURE` rendered ONLY via the §15
  NO_WAY_FORWARD UX (explanation + return-to-origin + one-tap
  "Retry with your own key?" — never as a result); events
  `matcher_v2_validation_retry` and `matcher_v2_refused`; dev-only
  `[llm]` console line listing the failed checks.
- [X] T038 [US3] (ID kept; executes after T040 — analyze O1 dependency)
  UI-level mock test: a first response with an out-of-taxonomy soft name
  (e.g. "excellent communication") fails V5 → retry → corrected row
  renders with the canonical taxonomy name and a `Trait` chip where the
  R2 mapping says trait (e.g. coping-attitude group); asserts
  `matcher_v2_validation_retry` fired once.
- [X] T041 [US4] Zero-skills path: a valid-contract mock response with
  all three buckets empty shows the fixed extraction-failed message
  (`ERR_MATCHER_ZERO_SKILLS`) — never a "no match" verdict; test in
  web/tests.
- [X] T042 [US4] Failure-class wiring via the existing
  `failure-class.ts` + ModelBanner + guidance box, identical to the 001
  step pages: mock `403_html`/`timeout` → TRANSIENT/BROWSER_UNREACHABLE
  per the contract §5 mapping; BYOK errors → OWN_KEY; all chains failed
  → NO_WAY_FORWARD with the BYOK transfer path; navigation never
  blocked; v1 output never shown (owner ruling 4); tests for each
  scenario in web/tests (test:llm/test:engine suites).
- [X] T043 [US4] Regression samples stay inputs-only on web: both draft
  example postings remain fixed INPUTS; ensure each has at least one
  valid and one invalid v2 JSON fixture in the T034 fixture set
  (byte-goldens stay terminal-only — FR-022 superseded on web, S8).

## Phase 13: v2 Polish & Cross-Cutting Concerns

- [X] T044 [P] Reconcile `specs/002-jd-matcher/quickstart.md` with the
  implementation if any scenario revealed a drift; any change to the
  approved contract/prompt/schema text is reported to the owner FIRST
  and is a `matcher-rules-2.0.0` bump (frozen artifacts).
- [X] T045 Run ALL gates green: `cd web && npm run test:engine &&
  npm run test:byok && npm run test:llm && npx tsc --noEmit &&
  npm run build && npm run parity`, then `cd ../terminal &&
  python -m pytest` — v1 parity sections and pytest MUST stay green
  (terminal untouched, R7); no new parity sections for v2.
- [ ] T046 Owner walkthrough per quickstart scenarios 1–8 on the live
  GEN chain (incl. `matcher_analysis` servability per constitution
  اصل ۲۲/P20; any combo/BYOK adjustment that falls out is a SPEC-004
  change, never a 002-local mechanism).

---

## v2 Dependencies & Execution Order

### Phase dependencies

- Phase 8 (Setup) → Phase 9 (Foundational) → story phases 10 → 11 → 12
  (US2 must land before US3/US4 tests exercise the UI), Phase 13 last.
- T026 (spec edit) gates EVERYTHING — no code before it.
- T030 needs T028 (types) + T029 (failing test); T032 needs T028
  (entry type); T035 needs T034 (failing fixtures); T036 needs T030,
  T031, T032, T033, T035.

### Parallel opportunities

- Phase 8: T027, T028 in parallel (after T026).
- Phase 9: T029 first (test); T031, T033, T034 independent files —
  parallel; T030/T032 after their type deps.
- T039 independent; T038 lands after T040 (retry dependency, O1).
- Phase 13: T044 parallel with T045.

### Single-developer default line

T026 → (T027, T028) → T029 → T030 → (T031, T032, T033, T034) → T035 →
T036 → T037 → (T039) → T040 → T038 → T041 → T042 → T043 → (T044, T045)
→ T046 — validating at every story checkpoint against quickstart.md.

---

## v2 Notes

- Frozen artifacts (R2 mapping, contract §2.1 prompt, schema, V1–V8) are
  owner-approved: reproducing them is character-for-character; changing
  them is a rules-version change needing owner approval first.
- Web only: no `terminal/` file appears in any v2 task; dormant v1 code
  is NOT deleted (S7) — deletion is a separate owner decision.
- The refusal and every retry are events + dev console lines, never user
  text beyond the §15 UI (P16/P19).
- No new route, no new env var, no direct provider call outside the
  gateway (constitution اصل ۲۲, P12–P14, P21).

---

# v3 Addendum — method alignment (Task 2), added 2026-11-16

**Input**: spec v3 (Clarifications Session 2026-11-16), plan v3
(supersessions S9–S13), research R12–R19 (R2 ARCHIVED, R3 superseded),
data-model v3 (V9), contract v3 (§2.1 rewrite, §2.3 few-shot),
quickstart scenarios 9–11, owner plan approval WITH conditions الف–هـ
(recorded in the spec Change history). The affected tests/code list was
delivered to the owner BEFORE execution (condition الف).

**Frozen artifact**: contract §2.1 v3 prompt text — reproduce
character-for-character; changes after approval = version bump.

**Scope guard**: unchanged from v2 — WEB ONLY, terminal frozen, no new
route/env, task registry is the only model plumbing (اصل ۲۲). Tasks
T001–T046 above are DONE (T046 owner walkthrough remains open); v3 tasks
are **T047–T063**.

---

## Phase 14: v3 Setup (bank + types)

- [X] T047 [P] Create `web/src/engine/matcher2/v2/fewshotIndex.ts`: direct
  imports of `specs/002-jd-matcher/few-shot/EX-J001.json` (R17 — JSON
  source of truth, bundler-embedded, no sync/loader), typed as
  `ParsedFewShotExample`; export `finalFewShotExamples()` applying the
  runtime filter `status === "final" && split === "fewshot"` (today the
  bank yields `[]` — EX-J001 is draft; SC-010). The out-of-root import is
  enabled by `experimental.externalDir` in web/next.config.ts (analyze
  I-1, owner-approved 2026-11-16); if the import still fails at build,
  report the exact bundler error to the owner before any workaround.
- [X] T048 [P] Update `web/src/engine/matcher2/v2/rulesVersion.ts`:
  `MATCHER_RULES_V2 = "matcher-rules-2.1.0"` (v2.0.0 superseded — see
  contract §8).
- [X] T049 [P] Update `web/src/engine/matcher2/v2/types.ts`: `SkillType =
  "hard" | "soft"` (trait REMOVED); `SkillItem` gains `in_taxonomy:
  boolean | null` (soft only; hard null) and `ad_wording: string | null`
  (soft only; REQUIRED non-empty when `in_taxonomy === false`, else
  null) per data-model v3.
- [X] T050 [P] Update `web/src/lib/schemas.ts` (`MatcherSkillItemSchema`):
  `type: z.enum(["hard", "soft"])`, `in_taxonomy: z.boolean().nullable()`,
  `ad_wording: z.string().nullable()` — model-shape only; deep rules stay
  in the validator.

## Phase 15: v3 Foundational (taxonomy matching + few-shot + prompt)

**CRITICAL**: story work begins only after this phase.

- [X] T051 Write the FAILING tests in
  `web/tests/engine/matcher2-v2/taxonomy.test.ts` (P9; replaces the trait
  mapping tests): no `type` field on entries; `alt_labels_en` exported per
  entry; 56 records; the NEW `matchSoftName(name)` precedence helper —
  (1) exact case-insensitive label_en wins: "show commitment" and
  "demonstrate loyalty" resolve to themselves even though each is also an
  alt of "meet commitments"; (2) single alt match adopts that record;
  (3) multi-record alt match returns `{kind: "ambiguous", candidates}`:
  "demonstrate commitment" → [meet commitments, show commitment],
  "demonstrate enthusiasm" → [show commitment, show determination],
  "guide others" → [advise others, lead others]; (4) no match → none.
- [X] T052 Implement `web/src/engine/matcher2/v2/taxonomy.ts` to make T051
  pass: REMOVE `TRAIT_GROUPS`/`TRAIT_EXCEPTIONS`/`typeFor` and the `type`
  field (R2 archived — S9); export `alt_labels_en` per entry; implement
  `matchSoftName` with the V5 precedence (data-model v3 rule 5).
- [X] T053 Write the FAILING tests in
  `web/tests/engine/matcher2-v2/fewshot.test.ts` (P9; new file):
  `finalFewShotExamples()` is `[]` today (EX-J001 draft — SC-010);
  `buildMatcherFewShotBlock` with SYNTHETIC final examples — at most 2
  selected by the R18 score (heading overlap + bullets-vs-paragraphs +
  language + obligation words + length ±150), diversity skip on identical
  heading sets, the FIXED wording `These examples show how ad formats
  differ. Do not copy their labels and do not treat them as rules.
  Analyze each ad on its own structure.` prepended when ≥1 example, and
  `why`/`rule`/`do_not_copy` injected per example; empty list ⇒ `""`.
- [X] T054 Implement the few-shot block + prompt v3 in
  `web/src/lib/byok/prompts.ts` to make T053 pass and reproduce contract
  §2.1 character-for-character: `buildMatcherFewShotBlock(examples)` +
  `buildMatcherSystemPrompt(taxonomyLines, fewShotBlock)` (few-shot slot
  before the taxonomy table); the taxonomy table line becomes
  `<label_en> | <alt labels comma-joined> | <group_code>`; the §2.1 v3
  text (7 sections, about summary-only, strong=none, zone-beats-weak,
  weakening only lowers, tightened repetition, in_taxonomy/ad_wording
  step-3b rules, ambiguous-name guidance, no trait, final check with
  in_taxonomy).

## Phase 16: User Story 3 (v3) — taxonomy discipline: validator + fixtures

**Goal**: V3/V4/V5/V9 enforced; SC-008 acceptance shape testable.

**Independent Test**: the five ambiguous names behave per the precedence;
"stakeholder management" passes V9; "leadership" fails; zero-finals
prompt has no few-shot block.

- [X] T055 Write the FAILING tests in
  `web/tests/engine/matcher2-v2/validate.test.ts` (P9; trait cases
  removed): V3 (soft-only must-gate), V4 (`in_taxonomy` non-null ⇔ soft;
  `ad_wording` null ⇔ not in_taxonomy:false), V5 precedence (the five
  ambiguous names from T051 + exact/single/none cases), **V9** — accepts
  "stakeholder management" (ad_wording "interact effectively with
  different stakeholders" verbatim in the S14 witness; stakeholder ∈
  witness; management ∈ the closed list) and rejects "leadership"
  (absent concept), rejects missing/empty `ad_wording`, rejects
  ad_wording not verbatim in any evidence sentence, rejects
  `in_taxonomy: false` with `source: "implied"`; ordering
  `orderBucketForDisplay` hard → soft (no trait rank).
- [X] T056 [US3] Implement `web/src/engine/matcher2/v2/validate.ts` v3 to
  make T055 pass: invariants V1–V9 per data-model v3 — V3 soft-only;
  V4 field rules incl. `in_taxonomy`/`ad_wording`; V5 via `matchSoftName`
  (exact → canonicalize+true; single alt → same; ambiguous → failed check
  NAMING the candidates; none → false + explicit-only); **V9** with the
  versioned closed-list constant
  `{management, communication, collaboration, coordination}`
  (case-insensitive, singular-tolerant word coverage of the name by
  witness words ∪ list) + ws-verbatim `ad_wording` containment; V6 enums
  without trait; `rules_version` stamped from T048.
- [X] T057 [US3] Update fixtures + pipeline tests:
  `web/tests/engine/matcher2-v2/fixtures.ts` — validDocA/B gain
  `in_taxonomy`/`ad_wording` (SQL hard → null/null; work-in-teams soft →
  true/null; stakeholder-management style rows with ad_wording);
  `web/tests/engine/matcher2-v2/analysis.test.ts` — prompt assertions
  (alt labels IN the table line, no "trait" anywhere, NO few-shot block
  with the real draft-only bank, system prompt carries the §2.1 v3
  wording); happy-path/retry/refusal/zero-skills/gateway/BYOK tests
  re-green.
- [X] T058 [US3] SC-008 acceptance-shape test (new test in
  `web/tests/engine/matcher2-v2/`): reconstruct the EX-J001 ad text by
  joining the json `sentences[].text` under their headings; assert
  `runMatcherInputGates` passes (284 words) and the built user prompt
  contains the sentences; then a hand-written EXPECTED document
  embodying the owner acceptance (Communication + Stakeholder management
  soft `in_taxonomy: false` in must WITH ad_wording; Agile/Scrum
  preferred; fintech + product-analytics tools bonus per the weakening
  rule) PASSES the validator — the model-judgment part (~20+ skills
  live) stays the owner walkthrough.

## Phase 17: User Story 2 (v3) — result screen

- [X] T059 [US2] Update `web/src/app/page.tsx` + `web/src/engine/matcher2/
  v2/messages.ts`: remove the Trait chip branch and `MATCH_V2_TYPE_TRAIT`;
  for `in_taxonomy === false` rows render the tag "not in the 56-skill
  list" (new B1 constant) and show `ad_wording` as the row's small
  "Ad wording: …" line; ordering already hard → soft.
- [X] T060 [US2] Extend the pipeline/UI test (analysis.test.ts): an
  in_taxonomy:false row renders with the tag and its ad_wording; no
  "Trait" chip anywhere.

## Phase 18: v3 Polish & Cross-Cutting

- [X] T061 [P] Consistency sweep: quickstart.md scenarios 9–11 runnable as
  written; spec/plan/data-model/contract cross-references carry
  matcher-rules-2.1.0; the spec Change history table is current.
- [X] T062 Run ALL gates green: `cd web && npm run test:engine &&
  npm run test:byok && npm run test:llm && npx tsc --noEmit &&
  npm run build && node scripts/parity.mjs`, then
  `cd ../terminal && python -m pytest` — v1 parity + pytest untouched
  (terminal frozen); no new parity sections.
- [ ] T063 Owner walkthrough (quickstart scenarios 1–11 incl. SC-008 live
  on the GEN chain; final-judge role per SC-008; any combo/BYOK fallout =
  SPEC-004 change, اصل ۲۲). T046 (v2 walkthrough) folds into this one.
  **Progress (owner-delegated local run, 2026-11-16..20):** scenarios 1–8
  EXECUTED in the real browser on localhost:3100 with the EX-J001 ad —
  gates pass (275 words, no cleaning), live GEN call reached the chain
  (lightning-30b answered in 17 s on the 2026-11-16 200-window), the
  contract retry→refusal path fired correctly, and the §15/§16 failure UX
  (guidance box, Retry, Use-my-key, red banner, open navigation) verified
  VISUALLY on repeated 403-flap refusals. P19 fix landed: refusal/retry
  events now carry sanitized failed-check kinds. REMAINING for the owner:
  one live run inside a 200-window (NVIDIA edge geo-block flapping
  200↔403 — environmental, VPN-dependent) to judge SC-008's ~20+ skills
  output. Scenario 11 tested via fixtures (no live window needed).
  **2026-11-20 addition (owner asked for the EXPERIENCE flow too):** the
  add-experience flow (spec-001 Phase 13–19) was driven end-to-end in the
  same browser session and exposed a REAL §13.1 violation — the Phase-13
  wrap-merge in splitBullets swallowed the Title/Company/Dates header
  lines into one blob that auto-placed into Title, defeating the
  drag-to-Company/Dates design. FIXED in parsePastedExperience (own §13.1
  segmentation: marked line = new segment; unmarked-after-marked =
  wrapped-bullet continuation; unmarked-otherwise = own segment;
  splitBullets untouched — Phase-13 pinned; entry_split helpers exported
  additively). Verified live: Title = "Product Manager" only, header
  lines drag to Company and Dates (matchDatePattern parses the range into
  structured start/end), stale "Cancelled. Exiting." message leak on flow
  switch fixed (chooseType clears the message). Scoring on the confirm
  stage hit the same 403 flap → correct §15 UX at the failing stage with
  the draft intact (P18/P13.4 verified).
- [X] T064 Prompt text single source (owner ruling 2026-11-16, research
  R20): `web/data/matcher-prompt.json` ({version, lines}) generated from
  the live constant (no hand copy); `web/src/lib/byok/prompts.ts` imports
  it and joins the lines; contract §2.1 replaced with the pointer +
  version pin; `web/tests/engine/matcher2-v2/prompt-file.test.ts` enforces
  the three-way version equality (contract pointer == json.version ==
  MATCHER_RULES_V2) + content sanity. The "Read before Edit" working rule
  recorded in memory.

---

## v3 Dependencies & Execution Order

- Phase 14 (types/constants/bank) → Phase 15 (matching + prompt) →
  Phase 16 (validator + fixtures) → Phase 17 (UI) → Phase 18.
- T052 needs T051 (failing tests) + T049; T054 needs T047 + T053;
  T056 needs T055 + T048/T049; T057 needs T056; T058 needs T056+T057;
  T059 needs T056 (validated fields exist end-to-end); T060 needs T059.

### Parallel opportunities

- Phase 14: T047, T048, T049, T050 all parallel.
- Phase 15: T051→T052 sequential; T053→T054 sequential; the two chains
  parallel with each other.
- Phase 16: T055 (failing) → T056; T057/T058 after T056.
- Phase 18: T061 parallel with T062.

### Single-developer default line

T047 → T048 → T049 → T050 → T051 → T052 → T053 → T054 → T055 → T056 →
T057 → T058 → T059 → T060 → T061 → T062 → T063 — validating at every
phase checkpoint.

---

## v3 Notes

- Frozen artifact: contract §2.1 v3 prompt — character-for-character;
  changes = version bump + owner approval.
- The closed generalization list (V9) is a versioned constant; adding a
  word = owner approval + rules bump (owner ruling).
- R2 stays ARCHIVED in research.md (condition الف) — nothing deleted.
- Web only; terminal untouched; dormant v1 code stays dormant (S7);
  T046 folds into T063.
