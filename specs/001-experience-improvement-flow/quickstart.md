# Quickstart: Experience Improvement Flow (Level 1 Prototype)

Validation and run guide for `specs/001-experience-improvement-flow/`.
All tool text is English at B1 level; all user input is English (pasted
posting text may be Persian or English). Rubric version: `rubric-2.0.0`
(three dimensions: Context, Role and Action Clarity, Result).

## Prerequisites

- Python 3.12+
- Repository root: `E:\_ai_projects\jobforward`
- Data directory `data/` is created at first run (git-ignored; delete it to
  reset to a fresh state)

## Run

```bash
# from the repository root
pip install -e .          # once (src layout)
PYTHONUTF8=1 python -m jobforward
# or without installing:
PYTHONUTF8=1 PYTHONPATH=src python -m jobforward
```

```powershell
$env:PYTHONUTF8="1"; python -m jobforward   # PowerShell
```

## Tests

```bash
PYTHONUTF8=1 python -m pytest -v
```

The permanent reference fixture test (Scenario A, step 3) must exist and pass
before its implementation lands (constitution Principle 9).

---

## Scenario A — Record an entry and see a transparent score (US1)

1. Start the CLI; choose "add experience"; enter type `job`, a title, and
   these two bullets (exactly):
   - Bullet 1: text that the local adapter rates role_action_clarity 2.
   - Bullet 2: text rated role_action_clarity 2, result 1, context 1.
2. Observe the score display: per-bullet `context`, `role_action_clarity`,
   `result` (each 0/1/2), the entry score, the overall score, and
   `rubric-2.0.0` printed next to every score.
3. **Reference check**: with the fixture ratings — role_action_clarity (2,2),
   result (2,1), context (2,1) — the entry score is 250/3 ≈ **83.33**
   (dimension scores 100, 75, 75). Assert the exact fraction in
   `tests/unit/test_metrics.py`; a naive `== 83.33` float compare is a bug.
4. Record a second entry; verify the overall score is the simple average of
   both entries (only entries with ≥ 1 bullet and not drafts count).
5. Record an entry with zero bullets: it is kept as a draft, excluded from
   the overall score, and the tool suggests writing a description bullet.

## Scenario B — Gate, questions, rewrite, explicit approval (US2)

1. On a scored bullet whose result dimension is 0 or 1, accept the rewrite
   gate "Do you want me to rewrite this bullet…?" (default Yes).
2. Verify exactly one question per dimension scoring 0 or 1, asked in
   Context → Action → Result order (0–3 total), each offering Answer / Skip.
   The Result question ends with "If you have real numbers, include them."
3. Answer the Result question, skip the others: the tool offers **save the
   whole entry as a draft** or **approve a rewrite from the answers so far**.
   Choose draft → the entry becomes a draft and disappears from the overall
   average.
4. Repeat with all questions answered: verify the proposed rewrite contains
   ONLY words from the original bullet and your answers (no invented numbers,
   impacts, or claims); approve it → the bullet is replaced with status
   "edited", the previous text is kept in history, and the entry is
   re-scored with the bullet re-analyzed.
5. Repeat and reject the gate (or skip all questions): verify no rewrite, and
   the bullet text and scores are byte-identical before and after.

## Scenario C — Incremental re-analysis and before/after (US3)

1. Take an entry with 3 scored bullets; edit one bullet directly (a direct
   user edit is explicit consent); rerun the improvement path.
2. Verify only the edited bullet is re-analyzed; the other two keep their
   previous score and status label.
3. Open the results view: approved rewrites show BEFORE and AFTER scores
   side by side under the same rubric version.
4. Run the whole path 5 consecutive times with no change: ≥ 90% of
   bullet-by-dimension scores are exactly identical (the deterministic local
   adapter gives 100%), and no unchanged bullet is re-analyzed.

## Scenario D — Merge warning (US4)

1. Record an entry with two overlapping bullets; verify the merge warning
   appears with numbered Merge / No-merge choices.
2. Verify no bullet score, entry score, or overall score changed because of
   the warning.
3. Answer "no merge": verify no bullet text or history changed.

## Scenario E — Job description matcher (US5)

1. Choose "match posting"; paste a job description containing at least one
   hard skill marked must-have (red line), one soft skill marked nice-to-have.
2. Verify the posting analysis classifies every extracted requirement by
   skill_type (hard/soft) and priority (required/preferred/bonus), with the
   red-line requirement classified `required`.
3. Verify every experience entry receives exactly one action — Highlight /
   No change / Not relevant to this job — with a one-line reason citing the
   skill (type + priority) it is based on; "Remove" and "Shorten" never
   appear.
4. Verify every clarity score (bullet, entry, overall) is unchanged after the
   matcher run.

## Scenario F — Deletion and copy-text (polish)

1. Delete a bullet: verify the explicit confirmation prompt; after deletion
   the bullet is excluded from all scores and a `bullet_deleted` event is
   logged with a timestamp.
2. Delete the last bullet of an entry: the entry reverts to draft treatment.
3. Use copy-text: the exact entry text is printed for clipboard use; nothing
   is mutated; no resume file export exists.

## Log verification (SC-008)

After running the scenarios, inspect `data/events.log.jsonl`: every line is a
JSON object with an ISO-8601 `ts` and a `type` from the event enum
(`path_start`, `analysis_completed`, `proposal_accepted`, `proposal_rejected`,
`question_rejected`, `question_skipped`, `entry_saved_as_draft`,
`bullet_deleted`, `entry_deleted`, `score_before`, `score_after`,
`posting_analyzed`, `match_action_assigned`, `evaluator_invalid_output`,
`evaluator_retry`). A missing event type for an executed flow means the
feature is treated as incomplete.
