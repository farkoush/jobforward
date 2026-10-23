# Phase 0 Research: Experience Improvement Flow (Level 1 Prototype)

Feature: `specs/001-experience-improvement-flow/spec.md`
Constraint from user: contradictions resolve in favor of the PRD text and the
constitution (`if contradictory, PRD and constitution are authoritative`).

## R-1: Python version

- **Decision**: Python 3.12.
- **Rationale**: current stable CPython series with mature stdlib dataclasses,
  typing, and pathlib; no external runtime needed; matches the user decision
  "بر اساس پایتون ساخته شود".
- **Alternatives considered**: 3.11 (older, no advantage here); 3.13 (newer but
  no benefit for a stdlib-first CLI).

## R-2: Where the 0/1/2 ratings come from (evaluator)

- **Decision**: a narrow `BulletEvaluator` port with two adapters:
  1. `LocalHeuristicAdapter` (default, deterministic, fully offline) — scores
     bullets from rule-based text checks (e.g., converts the context→action→
     result template fields, presence of quantified vs. vague outcomes, skill
     keywords such as analysis/prioritization/experiment, single-verb action
     sentence, reading order).
  2. `LlmAdapter` (optional, explicitly user-enabled once per session) — sends
     ONLY the bullet text and, when assembling a rewrite, the user's answers;
     must return schema-conformant structured output; on invalid or incomplete
     output the adapter retries once, then reports failure to the user
     (spec FR-014), never scores silently, and leaves user data intact.
- **Rationale**: the PRD describes model-produced ratings with structured,
  validatable output and invalid-output handling, while the constitution
  requires all arithmetic in deterministic code and default-local data. The
  port satisfies both: ratings source is swappable; the default adapter keeps
  every run offline and repeatable for the 5-run stability criterion.
- **Alternatives considered**: LLM-only (violates local-data default +
  repeatability), heuristic-only (cannot exercise FR-014's invalid-output and
  retry/report path from the PRD), user-self-rating (contradicts the product
  purpose of transparent evaluation).

## R-3: Deterministic scoring module

- **Decision**: pure functions in `scoring/metrics.py`:
  `dimension_score(sum_points, bullet_count) * 100`,
  `experience_score(four dimensions)`, `overall_score(entries with bullets)`.
- **Rationale**: constitution Principle 4 (numbers MUST NOT come from the model)
  and PRD acceptance criteria demand the exact formula and the 81.25 reference
  example; pure functions are trivially repeatable and testable.
- **Alternatives considered**: spreadsheet-like aggregation (not a software
  artifact), storing user-facing numbers computed by the LLM (forbidden).

## R-4: Local storage design

- **Decision**: two files under `data/`:
  `resume.json` — the whole state (entries, bullets, histories, rubric version,
  statuses), written atomically (temp file + `os.replace`);
  `events.log.jsonl` — append-only one-object-per-line log with ISO-8601
  timestamps.
- **Rationale**: PRD out-of-scope forbids upload/login/export; constitution
  Principle 8 requires simple local persistence; atomic write prevents data
  loss on crash (FR-014 "data not lost"); JSONL log keeps PRD metrics
  computable without rewrite (constitution Principle 7).
- **Alternatives considered**: SQLite (heavier than needed); per-bullet files
  (fragile consistency); in-memory only (violates measurability).

## R-5: CLI shape (no framework)

- **Decision**: `argparse` for the single entry point plus a plain
  `input()`/`print()` session loop that renders prompts and numbered choices
  using `messages.py`; a numbered prompt id is printed for every interaction so
  logs and tests stay comparable.
- **Rationale**: constitution Principle 8 (nothing beyond the one path without
  justification); zero dependencies means zero install friction; easy grep in
  integration tests.
- **Alternatives considered**: rich/textual (adds visual styling the PRD bans
  as out of scope); click (extra dependency for no gain at this size).

## R-6: Persian text handling on Windows

- **Decision**: document `PYTHONUTF8=1` in quickstart; all Persian strings live
  in `messages.py` (single source of truth); bullet text is never re-encoded or
  reshaped — stored exactly as received (constitution Principle 10).
- **Rationale**: Persian output must render correctly in Windows PowerShell
  (UTF-8 code page issues are the classic breakage point).
- **Alternatives considered**: regex-normalizing zero-width or half-space
  characters (violates verbatim storage).

## R-7: Rewrite assembly without fabrication

- **Decision**: `flow/rewrite.py` builds the proposal from an allow-list of
  segments: the bullet's own sentence parts (kept verbatim or dropped empty),
  plus the user's typed answers interleaved into the context→action→result
  slot structure; NO verb/number/inference generation. Then, in both the local
  and LLM path, the final proposed text is checked against the "no extra
  claim" rule: any number/type/impact that cannot be located verbatim or as a
  non-rephrased value inside (bullet ∪ answers) fails assembly — the proposal
  is refused (bug zero tolerance; constitution Principle 1).
- **Rationale**: PRD/constitution require zero-tolerance for invented claims
  with a specific, testable validator, so it must be a shared component.
- **Alternatives considered**: free-form LLM sentences after the fact (would
  need unprovable post-filtering), manual word-by-word template dialog only
  (too thin to meaningfully improve bullets in testing with real users).

## R-8: Test strategy mapped to acceptance criteria

- **Decision**: pytest layers:
  - `tests/unit/test_metrics.py` — formula + the mandatory example:
    ratings (2,2), (2,1), (2,0), (2,2) → 81.25 (written before implementation).
  - `tests/unit/test_no_extra_claims.py` — the answer/bullet allow-list
    validator rejects any invented number, impact, or claim
  - `tests/unit/test_incremental.py` — status semantics new→edited→analyzed;
    unchanged label/score conservation
  - `tests/unit/test_questions.py` — 1–2 questions; every question rejectable;
    rejection/no-answer → no rewrite
  - `tests/contract/test_evaluator_output.py` — schema of evaluator output;
    invalid output → rejected, retried once → then reported
  - `tests/contract/test_cli_session.py` — scripted prompt-id/assertion-style
    checks that the session stays Persian and prompt ids increase
  - `tests/integration/test_full_path.py` — one full record→score→question→
    answer→approve→incremental run; log assertions (start, completion, accept,
    before/after) per event type
  - `test_stability.py` — run the local adapter 5 times on fixed data;
    max-min = 0 ≤ 5
- **Rationale**: every PRD acceptance criterion is mechanically testable with
  the chosen stack; constitution Principle 9 ordering is respected in tasks
  design.
- **Alternatives considered**: property-based testing (nice-to-have, not
  needed); manual test script (not repeatable).
