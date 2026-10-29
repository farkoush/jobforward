# Interface Contracts: JD Matcher (Version 1)

Two external interfaces exist in this feature:

1. The **human CLI flow** (the staged paste → review → hard skills → soft
   skills walk with [Y]/[C] gates).
2. The **analysis pipeline contract** (cleaning → hard skills → soft skills →
   report), including the taxonomy data-source contract.

All user-facing strings are English B1 and live in `messages.py`. The
pipeline is deterministic; rules are versioned `matcher-rules-1.0.0`.

---

## 1. CLI Flow Contract (`contracts/matcher-flow.md`)

Reachable from the idle menu ("Match a job posting").

### Stage machine

```text
PASTE ──paste + END/EOF──► REVIEW ──[Y]──► HARD_SKILLS ──[Y]──► SOFT_SKILLS ──[Y]──► done
  ▲                          │                 │                    │
  └──────────[C] from ANY stage (result discarded)───────────────┘
  [C] at PASTE ──► exit the flow
  error at PASTE/REVIEW (language, length, not-a-posting) ──► back to PASTE
  extraction failure (zero skills) ──► back to PASTE
```

### Rules (enforceable in tests)

- The paste is read as complete multi-line text terminated by a line whose
  stripped content is exactly `END`, or by end-of-input (Ctrl+D / EOF).
- No stage advances without an explicit `Y`; `C` always returns to PASTE and
  discards the cancelled stage's result; any other key re-prompts with the
  invalid-key message.
- Fixed messages (exact text, all in `messages.py`):
  - `MATCH_PROMPT_PASTE` — `Paste the full job posting in English. When
    you're done, type END on its own line (or press Ctrl+D).`
  - `MATCH_ERR_PERSIAN` — `Persian input isn't supported yet. Please paste
    the job posting in English.`
  - `MATCH_ERR_TOO_SHORT` / `MATCH_ERR_TOO_LONG` — include the actual word
    count and the fixed limit (100 / 1,500).
  - `MATCH_CLEAN_SCRIPT_ONE` — `I removed 1 script block from your text. I
    did not run it.`
  - `MATCH_CLEAN_BLOCKS` — `I removed N script blocks and M style blocks
    from your text. I did not run them.`
  - `MATCH_CLEAN_TAGS` — `I removed HTML tags from your text. The text
    inside them was kept.`
  - `MATCH_WORD_COUNT` — `Word count: N`
  - `MATCH_GATE` — `Review the result above. [Y] Continue · [C] Cancel`
  - `MATCH_CANCELLED` — `Cancelled. Going back to the start. Paste the job
    posting again.`
  - `MATCH_CANCELLED_EXIT` — `Cancelled. Exiting.`
  - `MATCH_ERR_INVALID_KEY` — `Please type Y to continue or C to cancel.`
  - `MATCH_ERR_NOT_A_POSTING` — `This doesn't look like a job posting, so I
    didn't analyze it. Please paste the full text of a job posting.`
  - `MATCH_ERR_ZERO_SKILLS` — `I couldn't extract any skills from this
    text. Nothing was analyzed.`
  - `MATCH_ERR_CONSISTENCY` — `The report failed its consistency check, so
    I'm not showing it. Please run the analysis again.`
  - `MATCH_DROPPED` — `I left out N item(s) because I couldn't find
    supporting text in the posting.`
  - `MATCH_LIMIT_HARD` — `Must: showing 5 of N. Version 1 shows up to 5
    rows per table.` (also Should/Nice)
  - `MATCH_LIMIT_SOFT` — `Showing 5 of N soft skills. Version 1 shows up to
    5 rows.`
  - `MATCH_NO_TAXONOMY_MATCH` — `No taxonomy match: {text}`
  - `MATCH_COUNTS` — `Must: {m} · Should: {s} · Nice: {n}`
- Exit behavior: the flow ends back at the idle menu; nothing is persisted
  except events.

---

## 2. Analysis Pipeline Contract (`contracts/matcher-pipeline.md`)

`matcher2/` exposes pure functions; the CLI renders their results.

### Cleaning (`posting.clean_posting(raw) -> CleanedPosting`)

- Order: control characters (keep `\n`, `\t`) → line endings (`\r\n`, `\r`
  → `\n`) → `<script>`/`<style>` blocks with content (case-insensitive,
  counted) → remaining HTML tags (counted, inner text kept).
- The `END` sentinel is stripped by the CLI before cleaning.
- Gates: `language_ok` (>10% Persian/Arabic-script letters → False) and
  `100 <= word_count <= 1500`.

### Hard skills (`hard_skills.extract(cleaned) -> list[HardSkillRow]`)

- Section headings (case-insensitive, optional trailing `:`):
  Responsibilities / Requirements / Required Tools → `must`;
  Preferred Qualifications → `should`. Unknown sections do not change
  priority.
- Priority cascade: explicit word on the item > section > `must` with
  `default_priority=True`.
  - Must words: must, required, mandatory, essential, at least, minimum
  - Should words: preferred, desirable, ideally
  - Nice words: plus, nice to have, bonus, advantage
- Alternative tools ("A, B, or C") → one row, `is_one_of=True`,
  `alternatives=[A, B, C]`, type `hard_tool`, name `One of: A / B / C`.
- Same normalized skill in several places → one row, highest priority;
  different normalized names → separate rows.
- Evidence: first ≤ 12 words of the item; MUST be a verbatim substring of
  `cleaned_text`, else the row is dropped and counted.
- Output order: posting order.

### Soft skills (`soft_skills.match(cleaned, taxonomy) -> (rows, unmatched)`)

- Taxonomy records use fields verbatim: `label_en`, `alt_labels_en`,
  `group_code`, `group_label`, `id`. A contract test pins the file shape
  (56 records).
- Explicit: whole-word, case-insensitive occurrence of `label_en` or any
  `alt_labels_en` variant in the cleaned text.
- Inferred: only via the curated inference table (phrase → skill id + fixed
  reason); no inference from company/industry/title lines.
- Merge per skill id: highest priority; Explicit beats Inferred at equal
  priority; first evidence kept.
- Skill-ish concepts with no match → `UnmatchedConcept` (rendered on the
  "No taxonomy match" line), never a skill row.

### Report (`report.build(...) -> AnalysisReport`)

- Three hard tables ordered Must / Should / Nice (rows in posting order;
  empty group renders "—"); soft rows ordered Must → Should → Nice,
  Explicit before Inferred.
- Display limit: first 5 rows per table; truncation messages with real
  totals; the counts line uses real totals always.
- Consistency check before display: displayed + hidden rows == totals for
  every table; failure → `MATCH_ERR_CONSISTENCY` instead of the report.
- No verdict text of any kind may enter the output (FR-018).

### Events

The CLI logs `posting_received`, `posting_cleaned`,
`posting_rejected_language`, `posting_rejected_length`, `posting_not_a_job`,
`posting_analyzed` (context: rules_version, hard-skill counts per priority,
soft-skill count), `extraction_failed`, `stage_confirmed`,
`stage_cancelled`, `consistency_failed` via the existing JSONL logger
(ISO-8601 `ts`).

---

## 3. Taxonomy Data Contract (`docs/soft-skills-taxonomy.json`)

- Version 0.1.0, 56 records, uniform keys:
  `id` (ESCO URI), `label_en`, `label_fa` (unused in v1), `category_code`,
  `category_label`, `group_code`, `group_label`, `alt_labels_en` (list),
  `description_en`, `resume_eligible` (unused in v1).
- Pinned by `tests/contract/test_taxonomy_contract.py`: 56 records, required
  keys present, `label_en` unique, `group_code` matches `^T\d+\.\d+$`.
- Loading failures (missing file, wrong shape) surface as an extraction
  failure with `MATCH_ERR_ZERO_SKILLS` — never as a partial report.
