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

---

## Addendum: rubric-3.1.0 decisions (2026-11-03, recorded 2026-11-04)

Decisions made during Phase 11 implementation (spec §2.1/§3/§3.1/§5.1/§6.1);
each with its rationale and rejected alternatives.

### D1 — Research/mapping verbs are need signals, never action verbs

- **Decision**: `analyzed`, `researched`, `identified`, `noticed`, `found`,
  `benchmarked`, `mapped`, `surveyed`, `audited`, `compared`, `evaluated` (+
  `had no`) are user-need markers; `analyzed`/`researched` removed from the
  action-verb list. An all-research bullet leaves Action empty/vague.
- **Rationale**: the governing goal (problem → fix work → result) needs Action
  to mean product-changing/delivery work; research establishes the problem.
- **Alternatives rejected**: research counts as Action (broke Problems 2/4;
  user accepted "keep current rules" after a rule-by-rule dispute over their
  Upwork bullet); ask-the-user on every all-research bullet (deferred — same
  revisit trigger).

### D2 — Infinitive purpose clause is a vague result

- **Decision**: intention marker (`to uncover|deliver|improve|…`) with
  lookbehinds excluding need phrases ending in "to"; result taken from the
  marker onward; carved from the need clause when it carries no action verb,
  else from a clause filling neither Action nor a metric.
- **Rationale**: "aiming to …" states intent, not an outcome (Problem 4);
  carving keeps the no-shared-words rule intact.
- **Alternatives rejected**: purpose phrase as complete result (fabricates an
  outcome); leave result empty and keep the phrase in the need (hides the
  vagueness the user must fix).

### D3 — No shared words, one permitted overlap

- **Decision**: each word in exactly one part; exception = feature name
  inside the action sentence; feature markers inside the carved intention
  tail are skipped; leading "and|or" stripped from the feature fragment.
- **Alternatives rejected**: permissive overlap everywhere; zero overlap with
  no exception (real bullets legitimately name the feature inside the action).

### D4 — Present-but-vague result scores 1; 0 = missing only

- **Decision**: a non-empty extracted result whose raw rating is 0 is floored
  at 1 in BOTH engines; missing result still scores 0.
- **Rationale**: constitution P4 always said a vague result is 1; the local
  engine's 0 contradicted the display (Problem 6) and the constitution. This
  is an alignment fix, not a new criterion.
- **Alternatives rejected**: keep 0 for vague; ask the model each time.

### D5 — In-sentence display with a closed connector variant set

- **Decision**: ONE sentence; verbatim bracketed words with status colors;
  connectors predicted from a CLOSED set (Research into/Analysis of;
  collaboration/building/work/research feature segment; through/, resulting
  in/and fixed). ALWAYS ", resulting in [result: …]" even for vague results
  (user ruling).
- **Rationale**: the earlier fixed frame asserted "collaboration with the
  product team" for a solo research bullet — a fabricated claim (P1).
- **Alternatives rejected**: fixed frame for everything (fabrication);
  free-form connectors (not deterministic, can invent words).

### D6 — Inline improvement form replaces the question screens (web only)

- **Decision**: one block per empty/vague part (ambiguity reason, grounded
  suggestion, editable input, Confirm with light repair); "1) Yes" submits;
  the question screens, draft-or-approve step and proposal screen are removed
  from the web path (terminal keeps §4.1 steps 5–10).
- **Alternatives rejected**: keep both flows (redundant); live-update on
  keystroke without Confirm (user chose Confirm-based replacement).

### D7 — Improved bullets re-scored by the same first-time pipeline

- **Decision**: on submit with ≥1 confirmed answer, the improved text is
  assembled as plain prose, recorded with status "edited", and re-scored
  through exactly the first-time path, showing before/after.
- **Rationale**: the user required "same as the first raw submission".
- **Note**: the first run exposed real gaps (improved bullet scored LOWER,
  33.33→16.67) which drove the `had no`/`flows?`/verb-list extensions — all
  fixed and parity-tested (33.33 → 100).

### D8 — Grounded suggestions and light repair

- **Decision**: suggestions derived from the bullet's own words (a "core"
  from the original extracted result; per-part templates), generic fill-ins
  as fallback; metric suggestions use "x" and stress a real number. Confirm
  applies light repair shown as "Improved phrasing".
- **Rationale**: generic fill-ins produced useless answers; repair is
  cosmetic and never adds claims (P1).

### D9 — Model disclosure banner + BYOK prompt calibration

- **Decision**: amber banner "Model in use on this screen: {provider}:
  {model}" only on screens where a model call can happen, only when BYOK
  scoring is on with key+model. The BYOK evaluator prompt states the
  governing goal and adds four calibration examples (complete outcome = 2;
  goal/purpose phrase = 1 never 2; no outcome phrase = 0).
- **Rationale**: transparency (P4; BYOK §3); a live OpenRouter test rated a
  purpose-phrase result 2/2 against the written rule — few-shot examples
  fixed it (24/24 green incl. live Ollama).
- **Alternatives rejected**: post-hoc clamping of model scores (hides the
  disagreement); banner on all screens (matcher is deterministic — it would
  lie).

### D10 — Parser prompt document as the external-model contract

- **Decision**: `specs/001-experience-improvement-flow/few-shot/parser-prompt.md` +
  `specs/001-experience-improvement-flow/few-shot/parser-samples.json` (v1.3.0) are the normative contract for
  external models; the engine must satisfy the same examples. The pasted
  format demo is FORMAT DEMO ONLY, not normative (user decision 2026-11-04);
  the demo no longer appears in the document (removed in the 2026-11-03
  rewrite).
- **Alternatives rejected**: treat the demo as normative (contradicts the
  doc's own rules); two rule sets for models and engine (parity is the point).

## Addendum: Phase 12 coverage decisions (2026-11-04)

### D11 — Coverage is diagnostic only

- **Decision**: the coverage record (spec §2.2) has NO effect on scores,
  questions, completeness, or the improvement loop; the rubric stays
  rubric-3.1.0 (no gate-5 version bump). Purpose: let the product owner see
  how the engine attributes the bullet's words ("how the model thinks"); it
  may be removed again later without a rubric change.
- **Rationale**: product-owner answer 2026-11-04 — "این بخش هیچ تاثیر بر
  نمره‌دهی ندهد … در آینده دوباره این بخش حذف می شود / فقط برای تست". Any
  scoring effect would force a new rubric version and contradict the stated
  purpose.
- **Alternatives rejected**: orphans affect scores (would need rubric-3.2.0 —
  against the answer); orphans add questions (the 0–5 question contract and
  §6 conditions would change).

### D12 — Orphaned = maximal contiguous unclaimed spans

- **Decision**: no re-segmentation. The five parts are extracted exactly as
  before (§2.1); whatever whitespace-normalized text no part claims is grouped
  into maximal contiguous spans; each span is one orphaned entry with a
  reason citing its words. The feature-inside-action overlap (§2.1) is
  claimed by the action and never orphaned.
- **Rationale**: product-owner answer 2026-11-04 — "فقط کلمات نگرفته".
  Re-segmenting claimed text would duplicate the parser's §2.1 job;
  sentence-level chunking manufactures false orphans for multi-part
  sentences.
- **Alternatives rejected**: clause-level full segmentation (re-does §2.1);
  sentence-level chunks (false orphans); per-word orphans (noise).

### D13 — Web-only gray block; terminal unchanged

- **Decision**: the web prototype renders a separate "Not attributed to the
  framework" block under the sentence — one gray row per orphaned span with
  quotation + reason; the terminal display (§5) is unchanged
  (product-owner constraint: never update the Python terminal display).
- **Rationale**: the three-state colors (emerald/amber/red) encode part
  statuses; folding orphans into them would blur the verdicts. Gray keeps the
  diagnostic separate from the statuses.
- **Alternatives rejected**: a fourth in-sentence color (clutter, weakens the
  closed-sentence contract); rendering orphans inside the "Still needs to be
  filled" list (orphans are not to-fill items).

## Addendum: Phase 13 entry-flow decisions (2026-11-04)

### D14 — Web-only scope; terminal untouched

- **Decision**: the hybrid paste-and-split entry is implemented in the web
  prototype only; the terminal keeps its bullet-by-bullet entry flow and
  display; `messages.py` and the Python engine are untouched (Phases 11–12
  pattern).
- **Rationale**: product-owner answer 2026-11-04 — "فقط وب". The user flow
  (text box, list editing) is inherently graphical; the terminal flow is a
  frozen surface.
- **Alternatives rejected**: port the flow to the terminal too (double work,
  breaks the frozen-terminal constraint); defer terminal to a later phase
  (recorded as possible future work, not in this phase).

### D15 — New fields stored + displayed; dates free-text

- **Decision**: `company`, `dates` (ONE free-text field, e.g. "2022–2024"),
  and `product_domain` are collected on the entry screen, stored and
  displayed — with NO effect on any analysis, scoring, or suggestion logic
  this phase. Using them in suggestions is a future decision.
- **Rationale**: product-owner answer 2026-11-04 — "ذخیره+نمایش؛ dates آزاد".
  Honors the brief's hard constraint "do not change the five-part analysis
  logic" while capturing the context fields for role level/domain later.
- **Alternatives rejected**: feed them into suggestions now (violates the
  constraint); structured start/end dates (more schema, no consumer yet).

### D16 — Deterministic flag rule + wrap-merge

- **Decision**: a candidate line is flagged "not an achievement" iff it has
  NO action verb AND no parser signal (the existing need/feature/result/
  metric/number marker lists, reused via one exported helper) AND opens with
  a responsibility-style phrase ("Responsible for…", "Duties included…") —
  the user then chooses keep or discard. Marker-less lines NOT matching the
  flag rule are wrap continuations and join the previous candidate with one
  space. Lines containing " and also " get a split suggestion at that
  connector. The list marker (`-`/`•`) is stripped as formatting.
- **Rationale**: product-owner answer 2026-11-04 — "قاعدهٔ ترکیبی +
  wrap-merge". Reusing the parser's marker lists keeps one source of truth
  and avoids a second heuristic vocabulary.
- **Alternatives rejected**: flag every action-verb-less line (noise:
  context lines like "Team of 3" get flagged); no auto-flagging (loses the
  brief's "Responsible for weekly meetings" requirement).

### D17 — VR-1 unchanged; the confirmed list caps at six (assumption)

- **Decision**: FR-002's 1–6-bullets cap stays. The pasted TEXT is never
  blocked (soft limit only); when the split produces more than six
  candidates, the split screen asks the user to keep the best six
  (delete/merge to fit) — matching the soft-limit message "you can add the
  rest later" (a second entry can hold the rest).
- **Rationale**: "do not change the five-part analysis logic" includes its
  validation contract; the score API and VR-1 both assume ≤ 6 bullets.
- **Alternatives rejected**: raise the cap for paste flow (changes a locked
  rule and the score route's 1–6 bound); silently truncate (violates P2 —
  the user decides what to keep).

## Addendum: Phase 14 theme decisions (2026-11-05)

### D18 — Complete adoption on every web screen

- **Decision**: the warm theme replaces the monochrome look COMPLETELY —
  cream background, brand red-brown pill primary buttons, Fraunces
  headings, Source Sans 3 18px body — on every web screen (welcome through
  matcher); no surface stays monochrome.
- **Rationale**: product-owner answer 2026-11-05 — "جایگزینی کامل",
  consistent with "apply the theme to the whole project"; a mixed look
  would read as two products.
- **Alternatives rejected**: partial adoption (inconsistent surfaces);
  colors-only (leaves the vendored fonts unused).

### D19 — Tailwind-variant-only; one token source

- **Decision**: the repository adopts ONLY the pack's Tailwind variant into
  the global stylesheet; the raw standalone files (jbf-*.css, preview.html,
  fonts.html) stay outside the repo with the product owner.
- **Rationale**: product-owner answer 2026-11-05 — "فقط نسخهٔ Tailwind".
  One token source means no duplicate color sets to keep in sync.
- **Alternatives rejected**: archiving the raw pack in the repo (a second,
  drifting copy of every token).

### D20 — Fonts vendored via next/font/local

- **Decision**: the three variable fonts are loaded from the vendored
  `web/src/fonts/` files (SourceSans3, Fraunces, JetBrainsMono + OFL
  licenses, downloaded from the official google/fonts repo, verified signed
  TTFs) through next/font/local; the Inter default is removed. Bundling
  happens at build time — the running app makes ZERO external font
  requests (P8; product-owner decision 2026-11-05: "لینک خارجی نباشد").
- **Rationale**: local fonts with proper licensing (OFL), no runtime
  external dependency, deterministic rendering everywhere.
- **Alternatives rejected**: Google Fonts <link> (runtime external
  requests — against the owner's decision and the spirit of P8);
  next/font/google (build-time fetch still hits the network on every clean
  build — vendored files are strictly better offline).

### D21 — Enforceable tone rules get an automated guard

- **Decision**: a new engine test (runs under the existing test:engine glob)
  enforces what is mechanically checkable: no emoji codepoints in any
  user-facing message string, and the presence of the theme's key tokens in
  the global stylesheet. The visual-only rules (brand red never for long
  text; error color separation) stay spec-documented and walkthrough-checked.
- **Rationale**: the tone rules are part of the product contract (§11.1);
  the enforceable half belongs in the test suite (P9), the rest in review.
- **Alternatives rejected**: no guard (rules decay silently); a full visual
  regression harness (out of proportion for the prototype — P8).

## Addendum: Phase 15 analysis-UX decisions (2026-11-05)

### D22 — Status colors stay on the underlines; the row is text+weight

- **Decision**: the sentence's soft underlines KEEP the three status colors
  (themed emerald/amber/red — §5.1's palette now on the warm scales). The
  five-cell status row differentiates states by TEXT and weight ONLY — no
  colored icons, no emoji (§11.1 rule 1: a color is not a colored icon).
- **Rationale**: product-owner answer 2026-11-05 — "رنگ‌ها روی زیرخط".
  Color is the fastest status recognition and §5.1 already pins these
  meanings; the row stays neutral so the theme's brand-red discipline
  (primary buttons/emphasis only) is untouched.
- **Alternatives rejected**: monochrome underlines everywhere (slower
  recognition; drops the established §5.1 color semantics).

### D23 — The needs list is superseded on the web

- **Decision**: the web's "Still needs to be filled" list is REMOVED — the
  five-cell row + the focused question loop replace it, and the ambiguity
  reason renders INSIDE the open question. The terminal's names-only list
  (§5) is unchanged.
- **Rationale**: product-owner answer 2026-11-05 — "جایگزین می‌شود"; three
  simultaneous layers (row/sentence/list) would be clutter, against the
  owner's items 1+3 intent.
- **Alternatives rejected**: keeping the list under the sentence (clutter,
  duplicated state); moving the reason to a tooltip only (hidden from the
  flow).

### D24 — Display logic as pure engine helpers (web-only, no twin)

- **Decision**: the two deterministic pieces — per-part state derivation
  (Complete/Vague/Missing, mirroring PartDisplayState: empty = missing
  ALWAYS, vague = non-empty + vague flag) and the focused-loop question
  order (missing first, then vague, each in Need→Feature→Action→Result,
  metric last) — live in a NEW web-only module
  `web/src/engine/flow/display.ts` as pure functions, tested engine-level.
- **Rationale**: no React test infrastructure exists; pure helpers give P9
  real red-first tests without adding test deps (P8). The logic is
  presentation-only (web-only — no Python twin, no parity coupling; the
  analysis logic does not move).
- **Alternatives rejected**: inline logic in the component (untestable with
  the current setup); a Python twin (it is not analysis logic — parity does
  not apply).

## Addendum: Phase 16 layout decisions (2026-11-05)

### D25 — Root siblings; web stays in place

- **Decision**: `terminal/` + `web/` at the repository root, beside the
  shared governance (`specs/`, `.specify/`, `docs/`); `web/` is NOT moved.
- **Rationale**: product-owner answer 2026-11-05 — "هم‌عرض در ریشه". Moving
  web/ would churn every web path referenced by tasks/scripts/configs for
  zero independence gain; the goal is legibility, not symmetry of churn.
- **Alternatives rejected**: shared `apps/` parent (big churn, no benefit).

### D26 — Parity becomes optional-skip

- **Decision**: the parity gate keeps its full corpus comparison while the
  terminal engine exists (PARITY OK required, unchanged); when
  `terminal/` is absent it emits a clear skip and exits 0 — the web gates
  never fail because of it.
- **Rationale**: product-owner answer 2026-11-05 (after the owner asked
  what the gate is for) — the twin-drift oracle stays armed as long as the
  baseline exists; removing the terminal must not break web.
- **Alternatives rejected**: deleting the gate (loses the oracle);
  hard-fail (contradicts the independence requirement).

### D27 — Taxonomy copy inside the terminal edition

- **Decision**: `terminal/data/soft-skills-taxonomy.json` is added (copy of
  `docs/soft-skills-taxonomy.json`) and the Python default path changes
  from `docs/…` to `data/…` — the terminal edition becomes self-contained.
  The root `docs/` file stays the normative 002 contract; `web/data/` keeps
  its own copy. Sync rule: the root docs file is the source of record;
  edition copies change only via deliberate re-copy.
- **Rationale**: verified cross-dependency — the cwd-relative `docs/…` read
  would break the CLI from its new home; the copy pattern matches how the
  web edition already reads its own `web/data/` copy.
- **Alternatives rejected**: reaching back to `../docs` from terminal/
  (breaks the independence guarantee); moving docs/ into terminal/
  (docs are shared governance).

### D28 — Historical task paths stay as records

- **Decision**: the one-time path pass updates the LIVING docs (plan
  structure, quickstart commands, root/terminal READMEs); historical
  task lines keep their old paths AS RECORDS, with a pointer note mapping
  them to the new locations.
- **Rationale**: rewriting hundreds of historical task lines would falsify
  the record of what was done when; the note preserves truthfulness.
- **Alternatives rejected**: global find/replace over tasks.md (falsifies
  history).

## Addendum: Phase 18 entry & review UX decisions (2026-11-06)

### D29 — Paste covers ONE experience (owner clarification)

- **Decision**: the paste-first screen collects ONE experience's whole
  text (the type selection stays in front of it); the whole-work-history
  (multi-job) paste is out of scope for this phase.
- **Rationale**: owner's AskUserQuestion answer 2026-11-06 (recommended
  option) — keeps the one-experience-per-run architecture and the §4.1
  pipeline unchanged.
- **Alternatives rejected**: whole-history paste with a multi-entry split
  (a larger flow restructure — deferred).

### D30 — Editable-text-only split review (owner clarification)

- **Decision**: every found achievement is a plain editable text block;
  Merge with next / Split / Delete AND Keep/Discard (and the "and also"
  suggestion) are removed from the UI; cleared rows drop at confirm.
- **Rationale**: owner's AskUserQuestion answer 2026-11-06 — the button
  clusters were confusing; direct text editing is simpler and covers
  join/break/delete by editing the text itself.
- **Alternatives rejected**: editable text + a delete-only button;
  controls hidden under a "More options" toggle (both add back complexity
  the owner rejected).
- **Engine note**: `splitBullets` is UNCHANGED (`flagged`/`splitSuggested`
  stay computed; the UI ignores them) so the Phase 13 tests and the
  verbatim/user-edit guarantee (P2) hold as-is.

### D31 — Conservative paste parsing (entry_parse)

- **Decision**: the header line = the FIRST line when it is not
  `-`/`•`-prefixed; separators `|`, en/em dash, hyphen, comma; the dates
  segment = a `YYYY-MM` / `YYYY` / `YYYY–YYYY` / "present"/"current"
  match; title/org = the first/second non-date segments; unrecognized
  header segments flow into the achievements text; date text that does
  not parse to `YYYY-MM` is stored in the legacy free-text `dates` field
  (display fallback) so nothing is dropped; `product_domain` is never
  parsed; fields not found stay EMPTY (never guessed — P1).
- **Rationale**: spec §13.1 requires pre-fill "where the tool found it"
  with zero invention and zero loss; conservative patterns are
  deterministic and testable.
- **Alternatives rejected**: multi-line header parsing (ambiguous); a
  native `<input type="month">` (inconsistent browser chrome — a
  validated text input with a B1 error is deterministic and testable);
  NLP-style field extraction (violates P1 conservatism).
  (SUPERSEDED 2026-11-06 by D36 — the parser no longer attributes
  organization or dates; see below.)

### D32 — Structured dates are web-additive

- **Decision**: `start_date`/`end_date` (`YYYY-MM`) + `ongoing` on the
  web entry; the legacy free-text `dates` is retained for load-compat and
  as the unparseable-text holder; display = the structured pair
  ("2022-04 – present" when ongoing) else the legacy string verbatim.
- **Rationale**: spec §13.1 + the §4 data-model note (additive; old
  documents load unchanged); the owner asked for year–month precision and
  an ongoing state.
- **Alternatives rejected**: replacing `dates` outright (breaks old
  documents); full date objects with days (the owner pinned year–month).

### D33 — Score panel merge mechanics

- **Decision**: the `score` screen is removed; the panel (Experience
  score + `ScoreRing`, §11.5 styling) renders at the bottom of
  `bullet_list`; `SCORE_OVERALL` and the rubric-version header leave the
  DISPLAY (the version string stays stored per §3); drafts keep the
  no-number state; `ENCOURAGE_SCORED` shows only right after a fresh
  scoring.
- **Rationale**: owner review 2026-11-06 — both labels showed the SAME
  `entry_score`; one label + one ring is the honest minimum (P4
  transparency: the number's meaning stays unambiguous).
- **Alternatives rejected**: keeping the per-bullet dimension cards on
  the summary (the owner asked for the Experience score only; per-part
  detail already lives inside BulletGate).

### D34 — Back mapping and re-confirm semantics

- **Decision**: a text-only "Back" on every stage with the mapping in the
  plan addendum; Back never wipes state; re-confirming `entry_review`
  UPDATES the same stored entry via an optional entry id
  (update-in-place, no duplicate), re-running the pipeline as a fresh
  confirm (§13.4).
- **Rationale**: owner requirement "برگشت به صفحه قبل در هر مرحله"; this
  promotes the deferred Phase 15 item (8) Back clause; without
  update-in-place a Back-and-reconfirm would duplicate stored entries.
- **Alternatives rejected**: a navigation history stack (overkill — the
  flow is a linear stage list; a static previous-stage map is
  deterministic); back-wipes-state (explicitly forbidden by the owner).

### D35 — Stage labels and the bullet_gate regression

- **Decision**: add-flow stage labels become Experience / Review /
  Achievements / Result; `bullet_gate` maps to the same index as
  `bullet_list` (2), fixing today's one-step regression (the bar moved
  backwards when a bullet opened); no bar on gate/welcome/menu/settings/
  survey/done (unchanged).
- **Rationale**: the merged flow has four natural stages; the §11.5 bar
  must not regress mid-flow.
- **Alternatives rejected**: keeping "Details" (the details form no
  longer exists); a fifth stage (the review screen is one stage).

### D36 — Drag-and-drop segment review (supersedes D31's attribution; owner clarify 2026-11-06)

- **Decision**: the owner rejected automatic attribution ("a simple model
  cannot reliably place the date or split the text"): ONLY the first
  non-marker line auto-places (into Title); every other segment starts in
  Achievements; the user moves segments between the fixed section labels
  by drag-and-drop (a drop onto a single-value section displaces the old
  segment back to Achievements — nothing is lost); a user-dragged
  Dates-section segment fills the structured `YYYY-MM` fields only on an
  exact date-pattern match. Also from the same session: the 1–6 cap is
  REMOVED on the web (terminal VR-1 frozen); a no-change re-confirm
  skips re-analysis (P5); a type switcher on the review screen swaps the
  labels only.
- **Rationale**: owner clarify answers 2026-11-06 (spec Clarifications
  session) — the user is the decision-maker (P2), the split stays
  deterministic (P1), and the structured dates stay user-controlled.
- **Alternatives rejected**: the D31 conservative header parser
  (superseded); full auto-placement with drag as mere correction (the
  owner chose first-line-only); keeping the 1–6 cap (the owner removed
  it).

## Addendum: Phase 19 transparency-scoring decisions (2026-11-09)

Owner directive 2026-11-09 (`/speckit-plan` invocation): transparency
scoring clarifications (Context / Role and Action Clarity / Result) plus
step-3-of-4 page changes. Four decisions were resolved with the product
owner in two AskUserQuestion rounds the same day (the mandatory
pre-change rule in the directive was satisfied; every conflict below was
put to the owner explicitly).

### R19-1: Five-cell-row rating numbers move to one line (supersedes the 2026-11-07 §13.3 clause)

- **Decision**: on the web bullet screen (step 3 of 4) the stored 0/1/2
  ratings NO LONGER ride beside the five-cell row's state labels. The row
  keeps part name + state text only. The transparency-score line — the
  SAME line shown per achievement on the review list
  (`Context: n/2 · Role and Action Clarity: n/2 · Result: n/2`,
  the `SCORE_DIMENSION` format) — renders ONCE above the five-part
  analysis (above the framework sentence, after the Back button). The
  review-list per-bullet line is unchanged.
- **Rationale**: owner-confirmed supersession (2026-11-09): "I agree —
  those numbers were only examples; show the same transparency score
  here that the step-2 list page showed per achievement, before the
  five-part analysis." One score line per screen instead of numbers
  repeated on five cells.
- **Alternatives considered**: keep the cell numbers and only add the
  line (rejected — scores would appear twice on the same screen; the
  owner chose the line).

### R19-2: Copy button removed from the bullet screen (supersedes §6.1's copy clause on the web bullet screen)

- **Decision**: the bullet screen's Copy button (the §6.1 copy action —
  improved bullet as plain prose, falling back to the original) is
  removed, with its "Copied" tooltip and the now-unused helpers and
  message strings (`COPY_BUTTON`, `COPY_TOOLTIP`, `RATING_CELL` — all
  used only there). The final-output copy on the result screen (§8,
  step 4) is UNCHANGED.
- **Rationale**: owner-confirmed 2026-11-09 ("yes — only from this
  page"); the final text copy remains the single copy affordance.
- **Alternatives considered**: keeping §6.1 as is (rejected by owner).

### R19-3: Quantified research method counts as action (model-judge criteria; narrows the 2026-11-03 ruling)

- **Decision**: when a research bullet states its method with PRECISE
  quantity — how many interviews were conducted, how many people filled
  the questionnaire — the method fills the action part and is scored as
  action (the dimension's level definitions govern; a quantified scope
  supports a 2). Research verbs WITHOUT a precise quantity
  (e.g. "benchmarked competitors") remain need signals with the action
  part empty and Specific Action 0 (the 2026-11-03 product-owner ruling
  otherwise stands). The related sample size is NOT a metric (R19-4).
- **Rationale**: owner answer 2026-11-09: a precisely quantified
  research method "is considered an all-research bullet AND action" —
  the concrete effort (6 interviews, 30 questionnaire respondents) is
  real work the reader can see.
- **Alternatives considered**: leaving the 2026-11-03 ruling untouched
  (the owner moved past it); making ALL research methods action
  (rejected — the owner keyed the rule on precision).

### R19-4: Model-judge criteria scope — prompt + rubric docs only; deterministic engine byte-identical

- **Decision**: ALL new scoring criteria land in the model rating
  prompt (`web/src/lib/byok/prompts.ts` — the single prompt surface,
  used by both the gateway and BYOK paths) and the rubric documents
  (spec §3.1/§15, `few-shot/model-rating-few-shots.md`, a one-line
  additive pointer in `checklists/specific-action.md`). The
  deterministic engine, the T1–T10 corpus, and the parity gate stay
  behavior-identical (§14's freeze holds for behavior; only the stored
  `rubric_version` string moves, R19-5).
- **Rationale**: owner answer 2026-11-09 ("only the model instructions");
  the web scores exclusively through the model, the no-model engine is
  the frozen terminal baseline + parity reference.
- **Alternatives considered**: implementing the rules in the
  deterministic engine too (rejected — would rewrite T1–T10 goldens,
  e.g. "Benchmarked 7 competitors…" losing its empty-action golden).

### R19-5: rubric-3.1.0 → rubric-3.2.0 (version of record)

- **Decision**: the shared constants move to **rubric-3.2.0**
  (`terminal/src/jobforward/rubric.py` `RUBRIC_VERSION`,
  `web/src/engine/types.ts` `DEFAULT_RUBRIC_VERSION`); new scores carry
  the new string; older scores keep theirs. Test fixtures/comments that
  hardcode the literal update mechanically. The deterministic engine's
  PARTS/STATUSES/SCORES are unchanged — the version stamp is metadata
  (the criteria of record moved; the marker-based engine implements the
  frozen subset).
- **Rationale**: the scoring criteria change (constitution gate 5: a new
  rubric version is REQUIRED when scoring criteria change; owner's
  directive: "rubric_version must rise with each change"). MINOR bump
  follows the rubric-3.1.0 precedent (criteria refinement, same 0/1/2
  scale, same formula — P4's formula section untouched).
- **Alternatives considered**: MAJOR 4.0.0 (rejected — scale and formula
  unchanged, precedent is MINOR); per-path versions (rejected — one
  version of record keeps stored scores comparable).

### R19-6: Prompt criteria wording (design source for T-tasks)

- **context**: the product/platform NAME alone is not a feature — the
  feature must be a capability, part, or flow of the product; a GOAL is
  not a need ("improving match rate" is what the writer wanted, not a
  problem someone had); for research/PM bullets the product domain the
  work is about (e.g. the MVP scope, requirements definition) can be
  the feature — built OR planned.
- **role_action_clarity**: a verb + generic object
  ("Redesigned the platform") is never a 2; a 2 needs the WHAT (which
  part) AND the HOW or the ROLE; the method counts as part of the
  action (interviews, questionnaires, tests, team collaboration);
  in team work the person's role must be specific — "collaborated
  with" alone is insufficient; quantified research methods per R19-3.
- **result**: goal/intent phrases ("aiming to", "with the goal of")
  stay 1-never-2 (current behavior preserved); dates, project duration,
  and sample sizes (e.g. "6 interviews") are NOT metrics — the metric
  quotation is an OUTCOME number only; a bare number without a stated
  meaning stays 1 and the tool asks what it shows (current behavior
  preserved).
- **Rationale**: the owner's directive §1, combined with R19-3/R19-4;
  calibration examples in `few-shot/model-rating-few-shots.md` and the
  prompt carry these as few-shots (e.g. a quantified-research bullet
  whose action = "Interviewed 6 users" and whose metric is NOT "6
  users"; a goal-as-need rejection; a concrete-object action without
  how/role scoring 1).
- **Alternatives considered**: encoding the rules as output-validation
  invariants (rejected — they are judgment criteria, not structural
  invariants; §14.2's invariants are unchanged).
