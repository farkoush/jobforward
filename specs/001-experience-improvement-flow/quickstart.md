# Quickstart: Experience Improvement Flow (Level 1 Prototype)

Validation and run guide for `specs/001-experience-improvement-flow/`.
All tool text is English at B1 level; all user input is English (pasted
posting text may be Persian or English). Rubric version: `rubric-3.0.0`
(three dimensions: Context, Role and Action Clarity, Result).

## Prerequisites

- Python 3.12+
- Terminal edition folder: `terminal/` (Phase 16 layout, spec §12) — the
  CLI and its pytest suite live there; `terminal/data/` is created at first
  run (git-ignored; delete it to reset to a fresh state)

## Run

```bash
# from the terminal/ folder
PYTHONUTF8=1 python -m jobforward
```

```powershell
cd terminal; $env:PYTHONUTF8="1"; python -m jobforward   # PowerShell
```

## Tests

```bash
# from the terminal/ folder
PYTHONUTF8=1 python -m pytest -q
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

## Scenario B — Framework, gate, five questions, rewrite, approval (US2,
finalized five-part framework)

1. On a scored bullet, verify the framework display appears BEFORE the gate:
   `Experience: <title> - Achievement <n> of <total>`, `Original: "<text>"`,
   the five bracketed parts (missing parts like `[User need or problem -
   missing]`, vague parts with the exact words + `vague`), and the
   `Filled correctly` / `Still needs to be filled` lists.
2. Accept the rewrite gate "Do you want me to rewrite this bullet…?"
   (default Yes). Verify exactly one skippable question per missing/vague
   part, in the order Need → Feature → Action → Result → Metric (0–5
   total), each preceded by the identification line naming the achievement
   and part. A complete bullet (2/2/2) gets NO questions — only a
   confirmation.
3. Answer the Metric question ("Do you have a real number? If not, you can
   skip this."), skip the Result question: the tool offers **save the whole
   entry as a draft** or **confirm a rewrite with your answers so far**.
   Choose draft → the entry becomes a draft and disappears from the overall
   average.
4. Repeat with the result answered too: verify the proposed rewrite contains
   ONLY words from the original bullet and your answers (no invented
   keywords, numbers, impacts, or claims); approve it → the bullet is
   replaced with status "edited", the previous text is kept in history, and
   the entry is re-scored with the bullet re-analyzed under rubric-3.0.0.
5. Repeat and reject the gate (or skip all questions): verify no rewrite,
   and the bullet text and scores are byte-identical before and after.

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

---

## Addendum: rubric-3.1.0 validation (Phase 11, 2026-11-04)

End-to-end validation for the Phase 11 behavior (spec §2.1, §3, §3.1, §5.1,
§6.1). All repo-root commands unless noted.

### Engine tests

```bash
python -m pytest          # 216 green
```

Key suites: `tests/unit/test_part_extraction.py` (research verbs → need,
intention carve, lookbehinds, multi-line, `flows`, feature-in-intention
skipped), `tests/unit/test_part_scoring.py` (present-but-vague result = 1,
missing = 0, improved bullet 2/2/2), plus the contract/integration/storage
suites that pin `rubric-3.1.0`.

### Web↔Python parity gate

```bash
cd web && npx tsx scripts/parity.mts    # PARITY OK for rubric-3.1.0
```

### Web unit tests + security scan

```bash
cd web && npm run test:byok   # 24 tests; live-Ollama test may time out under machine load (environmental)
cd web && npm run scan:byok   # green
```

### Browser walkthrough (http://localhost:3100)

`cd web && npm run dev` (dev, port 3100) or `npm run build && npm run start`.
Then:

1. Unlock, add an experience, paste the Upwork-style research bullet
   ("Benchmarked 7 competitors and mapped … to uncover friction in hiring and
   project-assignment flows.").
2. Bullet gate: ONE sentence — opens "Research into", feature segment "and
   research into [feature name – missing]", result ", resulting in [result:
   … – vague]".
3. Fill a part via a grounded suggestion (or type over it), Confirm — the
   part turns emerald, stays editable with "(filled)", and an "Improved
   phrasing" note appears when the text was repaired.
4. Copy — clipboard holds the improved bullet as plain prose + "Copied"
   tooltip.
5. Submit ("1) Yes") with ≥1 confirmed answer — score screen shows
   before/after from the same pipeline (33.33 → 100 for the fully improved
   bullet).
6. BYOK on (key + model set): the amber "Model in use on this screen: …"
   banner appears on entry_bullets/score/bullet_list/merge and never on
   matcher screens; off → never.
7. After engine-file changes with a running `next start` server: rebuild +
   restart + "Restart session" (localStorage holds old parts); `next dev`
   applies on save — still "Restart session" if a session is open.

### External-model contract spot check

Paste "Scope of Execution" → Examples 1–6 of `specs/001-experience-improvement-flow/few-shot/parser-prompt.md`
into any model, send one test bullet (T1–T10) at a time, compare with the
answer key. The engine must agree with the same examples (spec §2.1, §9).

## Addendum: Phase 12 coverage validation (2026-11-04, spec §2.2)

### Engine tests

`python -m pytest` — new coverage tests prove: five per-part entries with
quotation/status/reason (empty quote + a missing reason for absent parts);
leftover text becomes one orphaned span per maximal run with a reason
("Benchmarked 7 competitors and mapped … to uncover friction in hiring and
project-assignment flows." → no orphans; a bullet with a trailing greeting →
one orphan); the feature-inside-action overlap is never orphaned; old
documents without `coverage` load unchanged; orphan data never changes any
score.

### Web↔Python parity gate

`cd web && npm run parity` — the corpus gains an orphan case (leftover
connector/greeting text); PARITY OK requires identical coverage records from
both engines.

### Browser walkthrough (http://localhost:3100)

Analyze a bullet with leftover text: under the one-sentence framework a gray
"Not attributed to the framework" block lists each orphaned span with its
quotation and reason; a fully covered bullet shows no block. The terminal CLI
display is byte-identical to before Phase 12.

## Addendum: Phase 13 validation (2026-11-04, spec §4.2)

### Engine tests

`cd web && npm run test:engine` — new split tests prove: `-`/`•` lines become
candidates with the marker stripped; a wrap continuation (no marker, no flag
match) joins the previous candidate with a single space; "Responsible for
weekly meetings" is flagged (no action verb, no parser signal, responsibility
opening); an action-bearing line is NOT flagged; "…, and also …" gets a split
suggestion; the paste text is never rewritten (every candidate is a verbatim
substring modulo marker strip and line joins).

### Browser walkthrough (http://localhost:3100)

1. Add an experience: fill title/company/dates ("2022–2024")/product domain,
   then paste a 9-line experience in the big box → the soft-limit message
   "Put your best achievements first; you can add the rest later." appears
   and input is NOT blocked.
2. Split: "I found 6 achievements. Is that correct?" with one line flagged
   ("Responsible for weekly meetings") → Discard it; one line offers a split
   at " and also " → accept; merge two short bullets; delete one → exactly 6
   remain → Confirm.
3. Analysis runs per bullet ("Achievement 2 of 6" in the header) with the
   ORIGINAL pasted text visible at the top of the analysis screens; scores
   and the improvement loop behave exactly as before (Phase 11/§6.1).
4. The stored entry shows company/dates/domain; old sessions (saved before
   Phase 13) still load.

### Gates

`tsc --noEmit` clean · `npm run test:engine` green · parity PARITY OK
(unchanged) · `npm run test:byok` 23/24 baseline · `npm run scan:byok`
passed. The terminal CLI is untouched.

## Addendum: Phase 14 theme validation (2026-11-05, spec §11)

### Theme guard tests

`cd web && npm run test:engine` — the new theme tests prove: zero emoji
codepoints in any `messages.ts` export; the key tokens (brand, background,
card, secondary, foreground, muted, input, error pair, success pair,
accent, radius, content width, the three font families) are present in
`web/src/app/globals.css`.

### Browser walkthrough (http://localhost:3100)

1. Every screen (welcome, entry_details, entry_split, score, bullet_list,
   bullet_gate, matcher screens): cream background, brand red-brown pill
   primary button, Fraunces headings, Source Sans 3 18px body — no surface
   left monochrome.
2. Trigger an error (empty paste) → warm orange-red message pair, never the
   brand red; complete an entry → olive-green success pair where shown.
3. DevTools → Network → filter "font": ZERO requests to external origins
   (fonts bundled from web/src/fonts/ at build).
4. Flow unchanged: the same texts, the same screens, scores identical to
   before (pytest 227 / PARITY OK as proof the engines did not move).

### Gates

`tsc --noEmit` clean · `npm run test:engine` green (incl. theme guard) ·
parity PARITY OK (unchanged) · `npm run test:byok` 23/24 baseline ·
`npm run scan:byok` passed · `python -m pytest` 227 green. The terminal CLI
is untouched.

## Addendum: Phase 15 validation (2026-11-05, spec §5.2/§6.2)

### Engine tests

`cd web && npm run test:engine` — the new display tests prove: partStates
derives Complete/Vague/Missing per part (empty = missing ALWAYS, even at
rating 0; vague = non-empty + vague flag; otherwise complete) and
questionOrder returns missing parts first, then vague parts, each in
Need→Feature→Action→Result order, metric last (a metric that is merely
empty is last, never first).

### Browser walkthrough (http://localhost:3100)

1. Bullet gate: a five-cell status row sits ABOVE the sentence —
   Complete/Vague/Missing per part, text+weight only (no icons).
2. The sentence has NO brackets: filled/vague words carry a soft colored
   underline; missing slots show a dotted gap with the muted part label;
   the sentence reads naturally end-to-end; the gray coverage block is
   still under the sentence.
3. Exactly ONE question is expanded, ordered missing → vague → metric;
   the rest are collapsed to one-line summaries; Next advances; clicking a
   fragment (or a dotted slot) opens that part's question; the active
   fragment is highlighted; typing updates the sentence LIVE.
4. Confirmed parts turn Complete in the row, stay visible, and reopen on
   click; the old needs list is GONE; the reason for a vague part appears
   inside its open question.
5. A complete bullet (2/2/2) skips the loop — confirmation only.
6. Terminal unchanged; scores unchanged (pytest 227 / PARITY OK as proof).

### Gates

`npm run test:engine` green (incl. display tests, TDD red-first) ·
`tsc --noEmit` clean · parity PARITY OK (unchanged) · `npm run test:byok`
23/24 baseline · `npm run scan:byok` passed · `python -m pytest` 227 green.
The terminal CLI is untouched.

## Addendum: Phase 16 validation (2026-11-05, spec §12) — run/test FROM THE NEW LOCATIONS

### Terminal edition (from `terminal/`)

- Tests: `PYTHONUTF8=1 python -m pytest -q` from `terminal/` — green at the
  recorded count (227 minus the two deleted legacy matcher test files).
- CLI: `PYTHONUTF8=1 python -m jobforward` from `terminal/` — starts, reads
  `terminal/data/` (the live files moved intact), and the taxonomy loads
  from `terminal/data/soft-skills-taxonomy.json`.
- `terminal/README.md` states the frozen-baseline status.

### Web edition (from `web/`) — unchanged commands

- `npm run dev` (port 3100), `npm run test:engine`, `npm run build`,
  `npm run test:byok`, `npm run scan:byok` — all as before.

### Parity gate

- With `terminal/` present: `cd web && npx tsx scripts/parity.mts` →
  PARITY OK (same corpus as always).
- Skip simulation (acceptance): temporarily rename `terminal/` → run parity
  → "PARITY SKIPPED — terminal engine not present", exit 0 → rename back.
  Web gates must not fail during the simulation.

### Repo-map check

Repository root contains only the edition folders (`terminal/`, `web/`),
shared governance (`specs/`, `.specify/`, `docs/`), and repo meta;
`git log --follow` on a moved file proves history followed the rename; the
live data files are byte-identical after the move.

## Addendum: Phase 18 validation (2026-11-06, spec §13) — WEB-ONLY walkthrough

From `web/`: `npm run dev` (port 3100) → gate → menu → Add experience.

1. **Paste-first**: pick a type → the screen shows ONE paste box (no
   detail fields). Paste a full experience (header line + `- ` bullets).
   Past 8 lines the soft-limit note appears and never blocks.
2. **Review**: the review screen shows the FIXED per-type section labels
   (Title / Company or the type's equivalent / Dates / Achievements) with
   the split segments as movable items — ONLY the first non-marker line
   auto-places (into Title), everything else starts in Achievements; drag
   a segment into Company or Dates to place it (a segment dragged into
   Dates fills the `YYYY-MM` fields only on the exact pattern match;
   anything else becomes the free-text dates value); the type switcher
   swaps only the labels; Start/End accept `YYYY-MM` (invalid input → the
   B1 format error) and "I still work here" clears/disables the end
   field; the achievements are editable text with NO merge/split/delete/
   keep/discard buttons. Clear one row → confirm → that row is absent
   from the analysis. Confirming with NO change → no re-analysis
   (returns directly).
3. **Review page**: the old score screen is gone — the bullet list shows
   the panel at the bottom: Experience score + ring only, no "Overall
   score", no rubric-version header; a draft shows the no-number state.
4. **Back everywhere**: Back returns entry_type→menu, paste→type,
   review→paste, list→review, bullet→list, and the final screens→list —
   with all entered state intact at every step.
5. **Re-confirm**: from the review page go Back → confirm WITHOUT any
   change → no re-analysis runs and the review page returns directly;
   change something → confirm → the SAME stored entry is updated (no
   duplicate in the menu list) and the panel re-renders with the
   re-scored entry.

Gates: `npm run test:engine` green (incl. the new entry_parse tests, TDD
red-first) · `tsc --noEmit` clean · `npm run build` exit 0 · parity
PARITY OK (unchanged corpus) · `npm run test:byok` 23/23
(BYOK_SKIP_LIVE=1) · `npm run scan:byok` passed · `PYTHONUTF8=1 python
-m pytest` 213 green from `terminal/`. Terminal untouched.

## Phase 19 (2026-11-09): transparency scoring rules + step-3 display

Prereq: the free chain or BYOK reachable for scoring (a no-model run
proves the deterministic path is unchanged).

1. **Bullet screen (step 3 of 4)**: open a scored bullet — the line
   `Context: n/2 · Role and Action Clarity: n/2 · Result: n/2` sits
   above the five-part analysis (after Back); the five-cell row shows
   ONLY part label + state text (no `· n/2`); there is NO Copy button
   on this screen. The review list (previous page) still shows the same
   line under each bullet.
2. **Final copy unchanged**: finish a bullet → the result screen (step 4)
   still offers its Copy with the §8 plain-prose text.
3. **Model criteria** (requires a working model path): re-score a bullet
   like "Interviewed 6 users and found that onboarding confuses new
   users" — the action part fills ("Interviewed 6 users") and
   Specific Action scores per the levels, while "6" is NOT quoted as
   the metric; a bullet whose need is only a goal ("Improving the match
   rate…") does not earn a need quote for context 2; "Redesigned the
   platform" (verb + generic object, no how/role) does not earn a 2.
4. **No-model behavior unchanged**: the same bullets through the
   deterministic path (terminal, no LLM) produce the same parts,
   statuses, and scores as before — only the stored `rubric_version`
   string reads rubric-3.2.0.

Gates: `npm run test:engine` green · `tsc --noEmit` clean ·
`npm run build` exit 0 · parity PARITY OK · `npm run test:byok` green
(BYOK_SKIP_LIVE=1) · `npm run scan:byok` passed · `npm run test:llm`
green · `PYTHONUTF8=1 python -m pytest` green from `terminal/`.
