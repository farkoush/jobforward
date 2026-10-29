# Quickstart: JD Matcher (Version 1)

Validation and run guide for `specs/002-jd-matcher/`. All tool text is
English B1; postings must be English. Rules version: `matcher-rules-1.0.0`.
The flow is reachable from the idle menu: "2) Match a job posting".

## Prerequisites

- Python 3.12+, repository root `E:\_ai_projects\jobforward`
- `docs/soft-skills-taxonomy.json` present (56 skills)
- Run: `PYTHONUTF8=1 python -m jobforward` (or `PYTHONPATH=src`)

## Tests

```bash
PYTHONUTF8=1 python -m pytest -v
```

The two regression fixtures (below) must pass before implementation lands.

---

## Scenario G1 — Paste, clean, review, gates (US1)

1. Choose "Match a job posting"; paste a 200-word English posting containing
   `<script>alert(1)</script>`; type `END` on its own line.
2. Verify: `I removed 1 script block from your text. I did not run it.` then
   `Word count: 199` (word count of the cleaned text) and the gate
   `Review the result above. [Y] Continue · [C] Cancel`.
3. Press `X` → verify `Please type Y to continue or C to cancel.`; press
   `C` → verify `Cancelled. Going back to the start. Paste the job posting
   again.` and the paste prompt returns.
4. Cancel at the paste stage → `Cancelled. Exiting.` and the flow exits.
5. Paste a 42-word text → too-short message with the actual count; paste an
   1,800-word text → too-long message; paste text that is >10% Persian →
   `Persian input isn't supported yet…`; paste a letter (not a posting) →
   the not-a-posting message. None of these may ever print a verdict.
6. Paste English text with one scattered Persian name → accepted.

## Scenario G2 — Hard-skill tables (US2)

1. Paste the spec's hard-skills example posting (Requirements / Required
   Tools / Preferred Qualifications) and confirm through the stages.
2. Verify the three tables reproduce the spec example exactly: Must (3 rows:
   digital product management, Scrum and Agile, One of: Power BI / Metabase /
   Grafana typed "Hard (tool)"), Should (2 rows: digital wallets/BNPL,
   Shaparak and payment networks), Nice (1 row: lending/BNPL conceptual
   familiarity — "is a plus" overrode the Requirements heading).
3. Verify every evidence quote appears verbatim in the cleaned text, rows
   follow posting order, the counts line reads `Must: 3 · Should: 2 ·
   Nice: 1`, and an empty group shows "—".
4. Paste a posting whose Must table has >5 rows → verify the truncation
   message `Must: showing 5 of N. Version 1 shows up to 5 rows per table.`
   while the counts line shows the real total.
5. Paste an unstructured posting (no headings, no priority words) → rows
   show Must with "(default)".

## Scenario G3 — Soft-skill table (US3)

1. Paste the spec's soft-skills example posting and confirm through.
2. Verify the table reproduces the spec example: work in teams (T4.3,
   Explicit, Must), make decisions (T3.2, Explicit, Must), build networks
   (T4.3, Inferred with the stakeholder reason, Must), comply with
   regulations (T4.5, Explicit, Should).
3. Verify `No taxonomy match: "Excellent communication skills"` appears and
   that "fast-growing fintech" created no row.
4. Verify the displayed skill names are exactly `label_en` values, the Group
   column shows `group_code`, no ESCO URI appears in the table, and >5 rows
   truncate with the soft truncation message while all rows stay stored.

## Scenario G4 — Reliability, consistency, errors (US4)

1. Run each regression sample 5 consecutive times → identical skills and
   priorities every time (100% ≥ 90%).
2. Verify the output never contains a "matches / does not match" verdict.
3. Verify a zero-skill valid posting yields
   `I couldn't extract any skills from this text. Nothing was analyzed.`
4. Verify the stored regression fixtures
   (`tests/fixtures/`) pass after every change (FR-022).

## Event verification

After the scenarios, `data/events.log.jsonl` contains the new matcher events
(`posting_received`, `posting_cleaned`, `posting_rejected_language`,
`posting_rejected_length`, `posting_not_a_job`, `posting_analyzed`,
`extraction_failed`, `stage_confirmed`, `stage_cancelled`,
`consistency_failed`) each with an ISO-8601 `ts`.
