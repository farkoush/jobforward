# Phase 0 Research: JD Matcher (Version 1)

Feature: `specs/002-jd-matcher/spec.md`. Key inputs: the user's draft
("Prompt for spec: jd-matcher"), the pre-specify clarify decisions
(2026-10-25: supersede the 001 matcher output; English-only postings;
taxonomy fields verified in the repo), and the existing codebase
(constitution v2.0.0; `matcher/` package from 001 kept but superseded).

## R-1: Where the new pipeline lives

- **Decision**: a new `matcher2/` package; the existing `matcher/` package
  (001 per-entry actions) stays but is no longer invoked by the CLI match
  flow.
- **Rationale**: the spec's Supersession note retires the per-entry actions
  as product behavior while the 001 storage layout (persisted
  `match_action` on entries) must remain loadable; a separate package makes
  the supersession explicit, keeps the old code testable, and gives the new
  pipeline its own rules version without touching 001 behavior.
- **Alternatives considered**: rework `matcher/` in place (blurs what is
  superseded; risks breaking 001's persistence tests); a new top-level
  package name outside `matcher*` (loses the discoverable connection).

## R-2: Paste termination in a terminal

- **Decision**: read lines until a line whose stripped content equals `END`
  (case-sensitive as drafted; trailing whitespace tolerated) OR until
  end-of-input (EOFError from the injected input function — Ctrl+D). The
  `END` line itself is not part of the posting.
- **Rationale**: the spec requires a one-shot paste; in a terminal every
  newline sends a line, so a sentinel line is the only reliable terminator.
  The CLI's injected `input_fn` makes EOF testable deterministically.
- **Alternatives considered**: empty line terminator (the 001 behavior —
  ambiguous because postings contain blank lines); Ctrl+D only (not reliable
  on Windows consoles).

## R-3: Cleaning pipeline and its report

- **Decision**: pure function `clean_posting(raw) -> CleanedPosting` with
  ordered steps: (1) remove control characters except `\n`, `\r`, `\t`
  (category Cc minus allowed whitespace); (2) normalize line endings
  (`\r\n`, `\r` → `\n`); (3) remove `<script>…</script>` and
  `<style>…</style>` blocks with all content, case-insensitive, counting
  blocks; (4) remove remaining HTML tags `<[^>]*>` keeping inner text,
  counting removals. The report distinguishes script blocks, style blocks,
  and plain-tag removals; nothing else is changed (no entity unescaping in
  v1 — noted as a known limitation).
- **Rationale**: the spec fixes exactly these steps and their report
  messages; a pure function is trivially testable and order matters (script
  removal must precede tag stripping so block content cannot leak).
- **Alternatives considered**: a real HTML parser (extra dependency; the
  spec says plain text only); entity unescaping (not required by the draft;
  would alter verbatim evidence matching).

## R-4: Word counting and the length gate

- **Decision**: words = `cleaned_text.split()` on whitespace; the gate is
  `100 <= words <= 1500` counted AFTER cleaning; the too-short/too-long
  messages include the actual count.
- **Rationale**: the spec fixes the range and the counting base ("counted on
  the cleaned text"); whitespace splitting is the simplest deterministic
  definition consistent with the draft's examples.

## R-5: Persian/Arabic-script rejection rule

- **Decision**: count letters only — English letters `[A-Za-z]` versus
  Persian/Arabic-script letters in the ranges U+0600–U+06FF, U+0750–U+077F,
  U+08A0–U+08FF, U+FB50–U+FDFF, U+FE70–U+FEFF. Reject when
  `arabic_letters / (arabic_letters + latin_letters) > 0.10`. Digits,
  punctuation, and other scripts are ignored by the ratio (the spec fixes
  "letters").
- **Rationale**: implements the spec's ">10% of its letters are
  Persian/Arabic script" with the "scattered Persian names allowed"
  exemption; pure and deterministic.
- **Alternatives considered**: full language detection (overkill;
  nondeterministic libraries are banned by the stdlib-only rule).

## R-6: Hard-skill extraction and the priority cascade

- **Decision**: line-oriented extraction on the cleaned text.
  (1) Section detection: a line that (stripped of trailing `:`) equals a
  known heading sets the current section — Responsibilities, Requirements,
  Required Tools → Must; Preferred Qualifications → Should; additional
  synonymous headings may be added in `matcher-rules-1.0.0` but never
  reorder the cascade. (2) Item extraction: list lines (leading `-`, `•`,
  `*`, `·` stripped) and non-empty plain lines become items; sentences
  outside sections are items too (unstructured postings). (3) Priority:
  explicit word on the item (word lists fixed in the spec) → section
  priority → Must "(default)". (4) Skill naming: the item text with the
  priority word and leading boilerplate ("experience with/of", "strong
  knowledge of", "familiarity with", "ability to", "at least") reduced per
  the rules version; alternative tools ("A, B, or C" / "A or B" where the
  parts are short tool-like tokens) become one row `One of: A / B / C` typed
  `Hard (tool)`. (5) Merging: same normalized skill name → one row with the
  highest priority; genuinely different names stay separate rows (the BNPL
  example: "experience working on BNPL" vs "familiarity with BNPL concepts"
  normalize differently). (6) Evidence: the item's own first ≤ 12 words,
  which by construction appear verbatim in the cleaned text; a proposed
  quote that cannot be located verbatim is dropped and counted.
- **Rationale**: deterministic and testable against the draft's example
  (3/2/1 with "is a plus" overriding the Requirements heading); the cascade
  order and word lists are spec-fixed, so only the naming normalization is
  rules-versioned.
- **Alternatives considered**: LLM extraction (violates the determinism /
  5-run reliability gate and the stdlib-only constraint); pure keyword
  dictionaries (would miss the section cascade and evidence rules).

## R-7: Soft-skill matching against the taxonomy

- **Decision**: load `docs/soft-skills-taxonomy.json` (56 records; fields
  used verbatim: `label_en`, `alt_labels_en`, `group_code`, `group_label`,
  `id`). Explicit match: any `label_en` or `alt_labels_en` variant appears
  in the cleaned text as whole words (case-insensitive). Inferred match: a
  curated, versioned inference table maps responsibility/requirement phrases
  to taxonomy ids with a fixed one-sentence reason (the draft's example:
  "manage stakeholders" → build networks, reason: "stakeholder management
  has no direct equivalent and this is the closest option"); no inference
  from company/industry/title lines (the table simply has no entries keyed
  to them). Merge per taxonomy id keeping the highest priority and the
  first evidence; Explicit beats Inferred at equal priority. Removal test:
  only table-backed or verbatim-name matches can exist, so every row's
  evidence alone leads to the skill. Concepts that look like skills but
  match nothing (detected via a small list of unmatched skill-ish phrases,
  e.g. "communication skills") are reported on the "No taxonomy match"
  line.
- **Rationale**: satisfies FR-014–FR-017 deterministically; the taxonomy
  file is the single source of skill names; the inference table is the one
  justified complexity item (plan.md Complexity Tracking) and is versioned.
- **Alternatives considered**: fuzzy/embedding matching (nondeterministic,
  extra dependencies); inventing skills for unmatched concepts (forbidden by
  FR-014).

## R-8: Report building, display limits, consistency

- **Decision**: `report.py` assembles the three hard tables (order Must,
  Should, Nice; rows in posting order; "—" for empty groups), the soft table
  (Must → Should → Nice, Explicit before Inferred), the counts line from
  real totals, the truncation notes (first 5 rows per table; soft table
  counts Explicit+Inferred together in the shown 5), the dropped-items
  message, and a consistency check: displayed-plus-hidden row counts must
  equal the totals; on mismatch the consistency-error message replaces the
  report. The report carries `matcher-rules-1.0.0`.
- **Rationale**: the spec fixes the display rules, the counts semantics
  ("real totals even when fewer rows are displayed"), and the
  error-instead-of-inconsistent-report behavior.

## R-9: Stage gates and CLI flow

- **Decision**: the CLI match flow becomes a linear staged walk:
  PASTE → REVIEW (cleaned text available on request, cleaning report, word
  count) → HARD SKILLS (three tables + counts) → SOFT SKILLS (table +
  no-match line) → done. Each transition renders
  `Review the result above. [Y] Continue · [C] Cancel`; `Y` advances,
  `C` returns to PASTE discarding the stage result (and logs
  `stage_cancelled`), any other key re-prompts with the invalid-key message.
  Cancel at PASTE exits the flow. Errors (language, length, not-a-posting,
  zero skills) return to PASTE with their fixed messages. Rejections and
  confirmations are logged.
- **Rationale**: implements FR-008 exactly; reuses the CLI's injectable I/O
  for deterministic tests.

## R-10: Test strategy mapped to acceptance criteria

- **Decision**: pytest layers:
  - `tests/unit/test_posting_cleaning.py` — cleaning steps, report counts,
    control chars, script/style removal, HTML tag stripping.
  - `tests/unit/test_language_check.py` — the 10% letters rule; scattered
    Persian names pass; Persian postings rejected.
  - `tests/unit/test_hard_skills.py` — the cascade (word > section >
    default), "is a plus" override, "one of" merge, duplicate merge vs
    distinct skills, verbatim-evidence drop.
  - `tests/unit/test_soft_skills.py` — taxonomy loading (56 skills, exact
    field names), explicit/alt-label match, inference table rows with
    reasons, no company/industry inference, merge, "No taxonomy match".
  - `tests/unit/test_report_consistency.py` — real totals vs displayed 5,
    truncation messages, consistency error path.
  - `tests/contract/test_matcher2_messages.py` — every fixed message exists
    in `messages.py` verbatim (English B1).
  - `tests/contract/test_taxonomy_contract.py` — the taxonomy file has 56
    records with the confirmed field names.
  - `tests/fixtures/` — the two draft example postings + written expected
    outputs (FR-022 regression samples).
  - `tests/integration/test_matcher_flow.py` — full [Y]/[C] walk including
    cancel-back-to-paste and cancel-at-paste exit.
  - `tests/integration/test_matcher_reliability.py` — 5 consecutive runs on
    each regression sample → identical skills and priorities (100% ≥ 90%).
- **Rationale**: every acceptance scenario maps to at least one automated
  test; fixtures are written first (constitution P9).
- **Alternatives considered**: property-based tests (not needed for a
  deterministic pipeline).
