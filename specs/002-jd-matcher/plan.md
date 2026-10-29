# Implementation Plan: JD Matcher — Job Posting Skill Analysis (Version 1)

**Branch**: `002-jd-matcher` | **Date**: 2026-10-25 | **Spec**: ./spec.md

**Input**: Feature specification from `specs/002-jd-matcher/spec.md`
(terminal flow; English-only postings; one-shot paste with `END` terminator;
cleaning + word-count gates; Must/Should/Nice hard-skill tables with a
priority cascade and verbatim evidence; a 56-skill ESCO taxonomy soft-skill
table; per-stage [Y]/[C] gates; no free-form verdict; consistency check;
5-run reliability; fixed regression samples).

## Summary

Extend the existing Python CLI with a new matcher flow that replaces the 001
per-entry matcher output: the user pastes one complete job posting
(terminated by a line containing only `END`), the tool cleans it (control
characters, line endings, script/style blocks, HTML tags), reports what it
removed, shows the word count, and gates every stage with `[Y] Continue ·
[C] Cancel` (Cancel always returns to Paste; Cancel at Paste exits). The
analysis is two steps on the cleaned text — step 1-a: hard skills in three
tables (Must / Should / Nice) with a fixed priority cascade (explicit word →
section heading → Must "(default)"), ≤ 12-word verbatim evidence, "one of"
merges for alternative tools, real-total counts and a 5-row display limit;
step 1-b: soft skills strictly from the 56-skill taxonomy
(`docs/soft-skills-taxonomy.json`, fields `label_en` / `alt_labels_en` /
`group_code` / `group_label` / `id`) with Explicit/Inferred certainty, a
"No taxonomy match" line, and the same priority cascade. The pipeline is
deterministic end-to-end (5-run reliability = 100%), produces no free-form
"matches / does not match" verdict, separates input errors and extraction
failures from any verdict, checks report consistency before display, and
keeps the two draft example postings as permanent regression samples.

## Technical Context

- **Language/Version**: Python 3.12 (unchanged; matches the existing codebase)
- **Primary Dependencies**: Python standard library only (`re` for cleaning
  and matching, `json` for the taxonomy file, `dataclasses`, `pathlib`).
  The pipeline is deterministic rule-based; no LLM and no network in the
  default run.
- **Storage**: no new persisted state — the flow is per-session. Matcher
  events extend the existing append-only `data/events.log.jsonl`.
- **Testing**: pytest; the two draft example postings are permanent fixtures
  with written expected outputs (spec FR-022); the reliability criterion is
  covered by a 5-run identity test (deterministic → 100% ≥ 90%).
- **Target Platform**: Windows terminal + any UTF-8 terminal; run guidance
  keeps `PYTHONUTF8=1`.
- **Project Type**: CLI feature inside the existing interactive session
  (a new top-level matcher flow reachable from the idle menu).
- **Performance Goals**: every stage responds in under 0.5 s on a 1,500-word
  posting (pure local computation).
- **Constraints**: input is data only (FR-002 — nothing executed, no links
  opened; the cleaning pipeline strips scripts before anything else sees the
  text); English-only postings with the >10% Persian/Arabic-letter
  rejection; fixed user-facing messages exactly as drafted (English B1);
  display limit 5 rows per table with real-total counts; matcher rules
  versioned as `matcher-rules-1.0.0` (any cascade/inference change bumps it)
- **Scale/Scope**: one posting per flow run; 100–1,500 words; 56 taxonomy
  skills; single local user

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*
Constitution version in force: **3.0.0** (amended 2026-10-26 — P6 now
describes the posting-only, skill-tables-only matcher; P10 requires
English-only postings; both changes were ratified from this feature's
Clarifications).

| # | Principle | Design-time gate | Status | Verification |
|---|---|---|---|---|
| 1 | User data integrity — no fabricated claims | Every row carries verbatim evidence from the cleaned text; rows without evidence are dropped and counted; the inference table is curated and reason-backed | PASS | design: `matcher2/hard_skills.py` + `matcher2/soft_skills.py` + tests |
| 2 | User as decision-maker | Every stage advances only on explicit `[Y]`; Cancel always returns to Paste and discards the stage result | PASS | design: stage gate in `cli.py` |
| 3 | Score independent of job posting | The matcher writes no scores; the analysis report carries no numeric clarity data | PASS | design: report entities contain no score fields |
| 4 | Transparent, repeatable, traceable scoring | N/A for scores; the analog holds: deterministic pipeline (`matcher-rules-1.0.0`), 5-run identity ≥ 90% (deterministic → 100%), consistency check before display | PASS | design: `matcher2/report.py` |
| 5 | Incremental analysis | N/A (no resume bullets analyzed by this feature) | PASS | — |
| 6 | Own data / matcher boundary | The matcher analyzes only the pasted posting; it does not touch resumes (supersedes the 001 per-entry actions per spec Clarifications) | PASS | constitution v3.0.0 P6; spec Clarifications 2026-10-25 |
| 7 | Measurability | Matcher events (posting received/cleaned/analyzed, stage confirmations, rejections, errors) logged with timestamps | PASS | design: `storage/events.py` extension |
| 8 | Prototype simplicity | Text-only terminal flow, stdlib-only, no network; justified additions tracked below (deterministic inference table) | PASS (with note) | Complexity Tracking |
| 9 | Test-driven | Regression fixtures (both example postings + expected outputs) exist BEFORE implementation; reliability and consistency tests precede the report code | PASS | design: test plan in quickstart.md |
| 10 | Language | All strings English B1 in `messages.py`; postings MUST be English (>10% Persian/Arabic letters rejected) | PASS | constitution v3.0.0 P10 |

**Amendment note**: the two touch-points that this feature's decisions
superseded (P6's matcher-output description and P10's posting-language
exception) were ratified into constitution **v3.0.0** on 2026-10-26; the
gate table above reflects the amended text. Remaining amendment surface:
`docs/prd.md` §8 and 001 FR-021 (product-owner owned, report-only).

**Post-Phase-1 re-check**: PASS — no unjustified gate violations; one
complexity item below.

## Project Structure

### Documentation (this feature)

```text
specs/002-jd-matcher/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
├── checklists/          # Spec quality checklist (from $speckit-specify)
└── tasks.md             # Phase 2 output ($speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
src/jobforward/
├── cli.py                     # NEW matcher flow states (see below); idle menu unchanged
├── messages.py                # ALL new user-facing strings (fixed English B1 messages from the spec)
├── matcher2/                  # NEW package: the version-1 matcher pipeline
│   ├── posting.py             # cleaning (control chars, line endings, script/style
│   │                          #   blocks, HTML tags), cleaning report, word count,
│   │                          #   >10% Persian/Arabic-letter language check
│   ├── hard_skills.py         # 1-a: section detection, item extraction, priority
│   │                          #   cascade, "one of" merge, duplicate merge,
│   │                          #   ≤12-word verbatim evidence, drop+count
│   ├── soft_skills.py         # 1-b: taxonomy loading (label_en/alt_labels_en/
│   │                          #   group_code/group_label/id), explicit matching,
│   │                          #   curated inference table (Inferred + reason),
│   │                          #   removal test, merge, no-taxonomy-match line
│   ├── report.py              # tables (Must/Should/Nice), 5-row display limit,
│   │                          #   real-total counts, dropped-items message,
│   │                          #   consistency check (counts == rows)
│   └── rules_version.py       # matcher-rules-1.0.0 constant
├── matcher/                   # EXISTING 001 package — superseded, left in place
│   └── ...                    #   (no longer invoked by the CLI match flow)
└── storage/
    └── events.py              # NEW event types: posting_received, posting_cleaned,
                               #   posting_rejected_language, posting_rejected_length,
                               #   posting_not_a_job, posting_analyzed,
                               #   extraction_failed, consistency_failed,
                               #   stage_confirmed, stage_cancelled
tests/
├── unit/                      # test_posting_cleaning.py, test_language_check.py,
│                              #   test_hard_skills.py, test_soft_skills.py,
│                              #   test_report_consistency.py
├── contract/                  # test_matcher2_messages.py (fixed messages),
│                              #   test_taxonomy_contract.py (field names verbatim)
├── fixtures/                  # regression postings + expected outputs (FR-022)
└── integration/               # test_matcher_flow.py (full [Y]/[C] walk),
                               #   test_matcher_reliability.py (5 runs identical)
```

**Structure Decision**: a NEW `matcher2/` package rather than reworking
`matcher/` — the 001 per-entry matcher is superseded but kept for storage
compatibility (persisted `match_action` fields remain loadable), and the new
pipeline is a different product behavior with its own rules version. The
CLI's match-menu entry switches to the new flow.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Curated inference table in `matcher2/soft_skills.py` (phrase → taxonomy skill + reason) | The spec requires Inferred soft skills with a one-sentence reason (e.g. "stakeholder management" → build networks) that deterministic code can produce and test | A free-form LLM inference would break the determinism/reliability gate (FR-021) and the no-fabrication rule (P1); leaving inference out would drop spec-required rows. The table is versioned with `matcher-rules-1.0.0` so any change is a rules change |
