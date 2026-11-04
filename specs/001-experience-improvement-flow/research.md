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
