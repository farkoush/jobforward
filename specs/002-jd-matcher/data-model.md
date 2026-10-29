# Phase 1 Data Model: JD Matcher (Version 1)

Resolves entities from `specs/002-jd-matcher/spec.md` into concrete Python
dataclasses. This feature persists no new application state — the pipeline is
per-session and its events extend the existing JSONL log. Rules are versioned
as **`matcher-rules-1.0.0`** (any change to the cascade, heading list,
normalization, or inference table requires a new version).

## Entities

### CleanedPosting (matcher2/posting.py)

| Field | Type | Rules |
|---|---|---|
| raw_text | str | exactly as pasted (minus the `END` terminator line) |
| cleaned_text | str | control characters removed (keep `\n`, `\t`), line endings normalized to `\n`, `<script>`/`<style>` blocks removed with content, other HTML tags removed keeping inner text |
| script_blocks_removed | int | count of `<script>` blocks |
| style_blocks_removed | int | count of `<style>` blocks |
| html_tags_removed | int | count of remaining tags stripped |
| word_count | int | `len(cleaned_text.split())` |
| language_ok | bool | False when Persian/Arabic-script letters > 10% of all letters |

Invariant: word_count and language_ok are computed on `cleaned_text`; the
gates (FR-006/FR-007) run before any analysis.

### HardSkillRow (matcher2/hard_skills.py)

| Field | Type | Rules |
|---|---|---|
| name | str | normalized skill label (priority words and boilerplate reduced) |
| is_one_of | bool | True when alternative tools merged into one row |
| alternatives | list[str] \| null | the merged tool names, posting order |
| type | enum | `hard` / `hard_tool` (one-of rows are `hard_tool`) |
| priority | enum | `must` / `should` / `nice` |
| default_priority | bool | True when neither explicit word nor section applied (displayed "(default)") |
| evidence | str | ≤ 12 consecutive words appearing verbatim in the cleaned text |
| order | int | position of the item in the posting |

Invariants: evidence is a substring of `cleaned_text`; one row per normalized
skill name (duplicates merged keeping the highest priority); "is a plus"
inside Requirements yields `nice` (explicit word beats section).

### SoftSkillRow (matcher2/soft_skills.py)

| Field | Type | Rules |
|---|---|---|
| label_en | str | exactly the taxonomy `label_en` — no other name is ever created |
| group_code | str | taxonomy `group_code` (displayed Group column) |
| id | str | taxonomy `id` (full ESCO URI — stored, never displayed) |
| evidence | str | verbatim posting text supporting the row |
| reason | str \| null | one-sentence reason when certainty is `inferred` |
| priority | enum | `must` / `should` / `nice` (cascade on where the evidence appears) |
| certainty | enum | `explicit` / `inferred` |

Invariants: at most one row per taxonomy skill (evidence merges, highest
priority kept, Explicit beats Inferred at equal priority); inferred rows must
come from the curated inference table (never from company/industry/title
lines); the removal test is enforced structurally (only verbatim-name or
table-backed matches exist).

### UnmatchedConcept

| Field | Type | Rules |
|---|---|---|
| text | str | the posting phrase that looked like a skill |
| note | str | fixed explanation (e.g. the taxonomy has no general equivalent) |

Rendered on the "No taxonomy match" line(s); never becomes a skill row.

### AnalysisReport (matcher2/report.py)

| Field | Type | Rules |
|---|---|---|
| hard_tables | dict[priority → list[HardSkillRow]] | keys `must` / `should` / `nice`; rows in posting order |
| soft_rows | list[SoftSkillRow] | ordered Must → Should → Nice, Explicit before Inferred within each level |
| unmatched | list[UnmatchedConcept] | rendered on the "No taxonomy match" line |
| dropped_count | int | rows dropped for missing/overlong/non-verbatim evidence |
| rules_version | str | `matcher-rules-1.0.0` |
| consistency_ok | bool | totals equal displayed + hidden rows in every table |

Invariant: if `consistency_ok` is False the report is NOT displayed; the
consistency-error message is shown instead (FR-020). The report contains no
numeric clarity scores of any kind (P3; the matcher never touches resume
data — FR-024).

### StageGate (CLI)

| Field | Type | Rules |
|---|---|---|
| stages | enum | `paste` → `review` → `hard_skills` → `soft_skills` → done |
| continue_key | str | `Y` (only explicit Y advances; FR-008) |
| cancel_key | str | `C` (returns to `paste` from ANY stage, discarding the stage result; at `paste` exits the flow) |
| invalid_key_message | str | fixed message re-prompted on any other key |

### RunEvent (storage/events.py — new event types)

| Type | Context |
|---|---|
| `posting_received` | word count of raw paste |
| `posting_cleaned` | script/style/tag counts, word count |
| `posting_rejected_language` | ratio (persian letters / total letters) |
| `posting_rejected_length` | word count, limit breached |
| `posting_not_a_job` | — |
| `posting_analyzed` | rules_version, hard-skill counts per priority, soft-skill count |
| `extraction_failed` | — |
| `stage_confirmed` | stage name |
| `stage_cancelled` | stage name cancelled |
| `consistency_failed` | expected vs found counts |

All events carry the ISO-8601 `ts` and `type` fields of the existing logger.

## Data Sources

### Soft-skills taxonomy (docs/soft-skills-taxonomy.json)

- 56 records, version 0.1.0; fields used VERBATIM: `label_en`, 
  `alt_labels_en` (list), `group_code`, `group_label`, `id`.
- The file is a named data source of the spec; a contract test pins its
  shape (56 records, required keys) so accidental renames fail loudly.

## Storage Layout

No new persisted application state. Only the JSONL event log grows. The 001
document (`data/resume.json`) is not read or written by this feature.

## Validation Rules

- VR-M1: word gate 100–1,500 on cleaned text; language gate >10%
  Persian/Arabic letters; both run BEFORE analysis (FR-006/FR-007).
- VR-M2: every displayed evidence string is a verbatim substring of
  `cleaned_text`; violations drop the row and increment `dropped_count`
  (FR-012).
- VR-M3: priority cascade order is fixed (explicit word > section heading >
  Must default); an explicit word always overrides the section (FR-010).
- VR-M4: soft-skill names come only from the taxonomy `label_en`; unmatched
  concepts go to the "No taxonomy match" line (FR-014/FR-016).
- VR-M5: each table shows ≤ 5 rows; the counts line always shows real totals;
  consistency failure suppresses the report (FR-013/FR-020).
- VR-M6: no output text may contain a "matches / does not match" style
  verdict (FR-018); errors use their own fixed messages (FR-019).
- VR-M7: every stage transition logs `stage_confirmed` / `stage_cancelled`
  with timestamps (FR-023).
