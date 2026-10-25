# Phase 0 Research: Experience Improvement Flow (Level 1 Prototype)

Feature: `specs/001-experience-improvement-flow/spec.md` (clarified
2026-10-25). Governing documents: `docs/prd.md` (priority) and
`docs/spec-original.md`; constitution v2.0.0 (amended 2026-10-25: three-
dimension rubric version 2, English B1 tool text, JD matcher allowed with
boundaries, 90% stability gate).

## R-1: Python version

- **Decision**: Python 3.12 (unchanged from the pre-clarification plan).
- **Rationale**: current stable CPython series with mature stdlib dataclasses,
  typing, and pathlib; no external runtime needed; matches the user decision
  "build on Python".
- **Alternatives considered**: 3.11 (older, no advantage here); 3.13 (newer
  but no benefit for a stdlib-first CLI).

## R-2: Where the 0/1/2 ratings come from (evaluator)

- **Decision**: a narrow `BulletEvaluator` port with two adapters:
  1. `LocalHeuristicAdapter` (default, deterministic, fully offline) — scores
     each bullet on the three rubric-2 dimensions from rule-based text checks:
     **context** (specific project/team/problem named vs. generic "in an app"
     vs. missing), **role_action_clarity** (first-person single action verb vs.
     vague phrasing vs. none), **result** (quantified/specific qualitative
     result vs. vague result / output-only / personal learning vs. none).
  2. `LlmAdapter` (optional, explicitly user-enabled once per session) — sends
     ONLY the bullet text and, when assembling a rewrite, the user's answers;
     must return schema-conformant structured output; on invalid or incomplete
     output the adapter retries once, then reports failure to the user
     (spec FR-014), never scores silently, and leaves user data intact.
- **Rationale**: the PRD describes model-produced ratings with structured,
  validatable output and invalid-output handling, while the constitution
  requires all arithmetic in deterministic code and a default-local run. The
  port satisfies both: the ratings source is swappable; the default adapter
  keeps every run offline and repeatable for the 90% stability criterion
  (deterministic adapter yields 100%).
- **Alternatives considered**: LLM-only (violates local-data default +
  repeatability), heuristic-only (cannot exercise FR-014's invalid-output and
  retry/report path from the PRD), user-self-rating (contradicts the product
  purpose of transparent evaluation).

## R-3: Deterministic scoring module

- **Decision**: pure functions in `scoring/metrics.py`:
  `dimension_score(sum_points, bullet_count) = sum ÷ (2 × bullet_count) × 100`,
  `entry_score(three dimension scores) = equal-weighted mean`,
  `overall_score(eligible entries) = simple mean`. Eligible = has ≥ 1 bullet
  AND not a draft AND not deleted. The permanent reference fixture: two
  bullets with role_action_clarity (2,2) → 100, result (2,1) → 75, context
  (2,1) → 75 → entry score 250/3 ≈ 83.33 under rubric_version "rubric-2.0.0".
  Tests assert the exact fraction (250/3) or `pytest.approx(83.33, abs=1e-9)`,
  never a naive `== 83.33` float compare.
- **Rationale**: constitution Principle 4 (numbers MUST NOT come from the
  model) and the PRD formula demand exact, repeatable arithmetic; pure
  functions are trivially testable.
- **Alternatives considered**: spreadsheet-like aggregation (not a software
  artifact), storing user-facing numbers computed by the LLM (forbidden).

## R-4: Local storage design

- **Decision**: two files under `data/`:
  `resume.json` — the whole state (entries, bullets, histories, questions,
  proposals, latest match actions, rubric version, statuses), written
  atomically (temp file + `os.replace`);
  `events.log.jsonl` — append-only one-object-per-line log with ISO-8601
  timestamps.
- **Rationale**: PRD out-of-scope forbids upload/login/export in this version
  (PDF upload + email sign-in deferred by decision 2026-10-25); constitution
  Principle 8 requires simple local persistence; atomic write prevents data
  loss (FR-014); the JSONL log keeps PRD metrics computable without rewrite
  (Principle 7). Match actions are persisted per entry (latest run) for
  traceability but are always recomputable — they never feed scoring.
- **Alternatives considered**: SQLite (heavier than needed); per-bullet files
  (fragile consistency); in-memory only (violates measurability).

## R-5: CLI shape (no framework)

- **Decision**: `argparse` for the single entry point plus a plain
  `input()`/`print()` session loop that renders prompts and numbered choices
  from `messages.py` — every string in English at B1 level, with a numbered
  prompt id printed for every interaction so logs and tests stay comparable.
  All user input is validated to be English (reject non-English bullets and
  answers with an explicit message; never translate — FR-017). Pasted job
  description text is the one input exempt from the English check (may be
  Persian or English, FR-021).
- **Rationale**: constitution Principle 8 (nothing beyond the one path +
  matcher without justification); zero dependencies means zero install
  friction; easy grep in integration tests.
- **Alternatives considered**: rich/textual (adds visual styling the PRD bans
  as out of scope); click (extra dependency for no gain at this size).

## R-6: Text handling on Windows

- **Decision**: document `PYTHONUTF8=1` in quickstart; all user-facing strings
  live in `messages.py` (single source of truth, English B1); bullet text is
  never re-encoded or reshaped — stored exactly as received (Principle 10).
- **Rationale**: even with English-only tool text, bullet text may contain any
  Unicode punctuation the user types; UTF-8 mode avoids Windows code-page
  breakage.
- **Alternatives considered**: regex-normalizing characters (violates verbatim
  storage).

## R-7: Rewrite assembly without fabrication

- **Decision**: `flow/rewrite.py` builds the proposal from an allow-list of
  segments: the bullet's own sentence parts (kept verbatim or dropped when
  empty), plus the user's typed answers interleaved into the
  context→action→result sentence pattern. NO verb/number/inference generation.
  Then, in both the local and LLM path, the final proposed text is checked
  against the "no extra claim" rule: any number/impact/claim that cannot be
  located verbatim or as a non-rephrased value inside (bullet ∪ answers) fails
  assembly — the proposal is refused (bug zero tolerance; Principle 1).
- **Rationale**: PRD/constitution require zero-tolerance for invented claims
  with a specific, testable validator, so it must be a shared component; the
  2026-10-25 PRD change extends the rule explicitly to pattern-guided
  rewrites.
- **Alternatives considered**: free-form LLM sentences after the fact (would
  need unprovable post-filtering), manual word-by-word dialog only (too thin
  to meaningfully improve bullets with real users).

## R-8: Rewrite gate and question flow

- **Decision**: analysis always runs first. For each bullet `flow/questions.py`
  asks the gate question "Do you want me to rewrite this bullet to make your
  experience stronger?" (default Yes). On Yes, it asks exactly one question
  per dimension scoring 0 or 1, in Context → Action → Result order (0–3
  total), each skippable. The three question texts are fixed in
  `messages.py` exactly as the PRD specifies; "If you have real numbers,
  include them" is embedded in the Result question text. If ≥ 1 question is
  answered and others are unanswered (or the user says they need time), the
  tool offers: save the whole entry as a draft, or approve a rewrite from the
  answers so far. Gate rejection, skipping all, or no answers → no rewrite.
  At most one round per bullet per run; no automatic re-ask after re-analysis.
- **Rationale**: locked by spec Clarifications Session 2026-10-25 and PRD
  §4.2/§4.3 feedback flow; per-bullet scope was a user decision.
- **Alternatives considered**: per-entry gate with ≤ 3 questions total
  (rejected: PRD §4.2 describes the flow per single bullet; user confirmed).

## R-9: JD matcher design

- **Decision**: `matcher/analyzer.py` exposes a `PostingAnalyzer` port with
  two adapters: `LocalRuleAdapter` (default: keyword/phrase rules classify
  extracted requirements by skill_type hard/soft and priority
  required/preferred/bonus; any red-line phrase ("must have", "minimum
  requirement") forces priority=required) and an optional opt-in
  `LlmAdapter` with the same validate/retry/report contract as the scoring
  evaluator. `matcher/actions.py` assigns exactly one action per entry —
  Highlight / No change / Not relevant to this job — with a one-line reason
  citing the skill (type + priority) it is based on. There is no Remove and
  no Shorten action anywhere in the code or messages, and the matcher never
  mutates entries or scores.
- **Rationale**: constitution Principle 6 boundary + Principle 8 default-local
  rule; the PRD requires two-stage processing (full posting analysis, then
  experience filtering at entry level, never bullet level).
- **Alternatives considered**: LLM-only matcher (breaks default-local rule and
  test determinism); no matcher (contradicts the clarified spec's US5).

## R-10: Test strategy mapped to acceptance criteria

- **Decision**: pytest layers:
  - `tests/unit/test_metrics.py` — 3-dimension formula + the permanent
    fixture: role_action (2,2), result (2,1), context (2,1) → 250/3 ≈ 83.33
    (written before implementation).
  - `tests/unit/test_no_extra_claims.py` — the bullet ∪ answers allow-list
    validator rejects any invented number, impact, or claim.
  - `tests/unit/test_incremental.py` — status semantics new→edited→analyzed;
    unchanged label/score conservation; direct edit flips only that bullet.
  - `tests/unit/test_questions.py` — gate default Yes; 0–3 questions in
    Context/Action/Result order for dims scoring 0–1; every question
    skippable; gate rejection / skip-all → no rewrite; partial answers →
    draft-or-approve option.
  - `tests/unit/test_language.py` — all `messages.py` strings are English B1;
    non-English bullet/answer input is rejected, posting text is not.
  - `tests/unit/test_matcher.py` — classification (hard/soft; required/
    preferred/bonus; red-line→required); exactly one action per entry; no
    Remove/Shorten; zero score effect.
  - `tests/contract/test_evaluator_output.py` — 3-dim schema; invalid output →
    rejected, retried once → then reported.
  - `tests/contract/test_matcher_output.py` — matcher schema (requirements +
    actions); unknown action / missing priority → invalid.
  - `tests/contract/test_cli_session.py` — prompt ids exist, English B1,
    numbered choices, verbatim bullet echo, state unchanged after errors.
  - `tests/unit/test_stability.py` — run the local adapter 5 times on fixed
    data; ≥ 90% of bullet-dimension scores identical (deterministic → 100%).
  - `tests/unit/test_deletion.py` — confirm-gated deletion; exclusions;
    draft reversion; survivor history intact.
  - `tests/integration/test_full_path.py` — record→score→gate→question→
    answer→approve→incremental rerun; log assertions per event type with
    ISO timestamps and numeric score_before/score_after.
- **Rationale**: every acceptance criterion is mechanically testable with the
  chosen stack; constitution Principle 9 ordering is respected in task design.
- **Alternatives considered**: property-based testing (nice-to-have, not
  needed); manual test script (not repeatable).
