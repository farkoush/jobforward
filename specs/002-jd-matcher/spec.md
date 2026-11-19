# Feature Specification: JD Matcher — Job Posting Skill Analysis (Version 1)

**Feature Branch**: `002-jd-matcher`

**Created**: 2026-10-25

**Status**: v3 — method-aligned (owner rulings 2026-11-16), specify complete

**Version 2 note (2026-11-09)**: the analysis output is replaced ON WEB by
the model-driven v2 pipeline (section "Version 2 — Model-Driven Analysis"
below); the terminal keeps v1 unchanged and frozen. Governing principle:
constitution v4.3.0 اصل ۲۲ (one fixed model algorithm — task registry →
gateway chains → contract validation → §15/§16 failure UX; combo/BYOK
governance lives in spec-004 only).

**Version 3 note (2026-11-16, owner Task 2 rulings)**: the method is
aligned with the owner's finalized decisions — the trait type and the R2
soft/trait mapping are retired, explicit out-of-taxonomy soft skills are
KEPT with `in_taxonomy: false`, alt labels return to the prompt, the
section enum grows to seven values, the weakening rule only LOWERS levels,
the repetition rule tightens, and stage 2 receives a few-shot bank.
Contract version: `matcher-rules-2.1.0`.

**Input**: User draft "Prompt for spec: jd-matcher": a terminal flow that
accepts one complete pasted job posting in English, cleans it, and produces a
transparent skill analysis — three hard-skill tables (Must / Should / Nice)
and one soft-skill table drawn strictly from the 56-skill ESCO taxonomy —
with per-stage confirmation, verbatim evidence for every row, real-total
counts, a 5-row display limit, and no free-form "matches / does not match"
verdict.

**Language note**: Version 1 is English only — input, all tool messages, and
all analysis output. Pasted postings that are predominantly Persian are not
analyzed. A second language may be announced later by the product owner;
until then no multilingual support is built.

**Supersession note**: This feature replaces the matcher output of feature
001-experience-improvement-flow. The per-entry actions of 001 (Highlight /
No change / Not relevant to this job / FR-022) are retired as product
behavior: version 1 of the JD Matcher analyzes the job posting only and does
not touch resumes — no resume report, no per-entry recommendations, no
"bold / unchanged / short" counts. The 001 implementation remains in place
but is superseded by this feature's flow.

## Clarifications

### Session 2026-10-25 (pre-specify decisions)

- Q: How does this feature relate to the implemented 001 matcher (US5 /
  FR-021–FR-022, per-entry Highlight / No change / Not relevant actions)? →
  A: This feature REPLACES that output. The analysis is posting-only; the
  per-entry actions are retired from the product (decision recorded
  2026-10-25).
- Q: The 001 spec, docs/prd.md §8, and constitution P10 currently allow
  Persian-or-English postings; the draft rejects Persian postings. Which
  governs? → A: The draft wins — postings must be English. Persian
  rejection rule below. (Follow-up amendments to 001 FR-021, docs/prd.md
  §8, and constitution P10 are required and tracked separately; docs/ is
  updated only by the product owner.)
- Q: What are the exact soft-skills taxonomy field names? → A: Verified in
  the repository file (56 skills, version 0.1.0): `label_en` (the skill
  name shown), `alt_labels_en` (plural, a list of alternative labels),
  `group_code` (the Group column, e.g. "T4.3") and `group_label`, and the
  ESCO URI in `id` (stored, never shown). The spec uses these names
  verbatim.

### Session 2026-11-09 (v2 rulings — owner decisions at /speckit-plan)

- Q: How does the new 7-step pipeline execute? → A: ONE LLM call — the
  seven steps are the model's internal method in the system prompt; the
  final JSON is the only output; deterministic code validates the output
  contract (retry once → refusal), the §14 single-judge pattern.
- Q: Where does SOFT_TAXONOMY come from? → A: the existing
  `docs/soft-skills-taxonomy.json` (56 ESCO skills; web copy at
  `web/data/`), typed soft/trait by a versioned mapping (group defaults
  T3.3/T4.5 → trait; per-skill exceptions "show commitment", "show
  empathy" → trait) — owner-approved in research R2.
- Q: Which surface? → A: WEB ONLY. The terminal keeps v1 untouched and
  frozen — no terminal file is modified by v2 (P4 lockstep exception
  recorded in the plan).
- Q: What shows when the model is unavailable? → A: exactly the
  spec-004 §15/§16 failure UX as implemented on the 001 step pages; the
  v1 output is never a fallback.
- Governing process rule: constitution v4.3.0 اصل ۲۲ — this feature only
  registers the `matcher_analysis` task and consumes the fixed gateway
  algorithm (no new route, no new env, no local chain decision).

### Session 2026-11-16 (Task 2 rulings — method alignment, owner zcode prompt)

- Q: How are the finalized method decisions (owner prompt §4) applied to
  the v2 contract? → A: ten deltas, all owner-decided, one version bump
  (`matcher-rules-2.1.0`): no trait type; explicit out-of-taxonomy soft
  skills kept with `in_taxonomy: false` (implied out-of-taxonomy dropped);
  alt_labels_en matching returns; seven section values; about is
  summary-only and never an independent section; a weakening word only
  LOWERS (bonus_zone + weak stays bonus); repetition requires every
  witness at least preferred and blocks on a bonus witness; "Strong
  <skill>" is signal none; stage 2 receives a few-shot bank (only
  `status: final` + `split: fewshot` load; zero final examples must work;
  at most 2 similar-but-diverse examples by format_features with
  why/rule/do_not_copy injected and the fixed wording); acceptance:
  ~20+ skills on the sample ad with Communication and Stakeholder
  management as soft `in_taxonomy: false` in must, Agile/Scrum preferred,
  fintech and product analytics tools bonus.
- Q: Where do the labeled examples live? → A: `specs/002-jd-matcher/few-shot/`
  — one `EX-Jxxx.json` per example (owner ruling 2026-11-16: JSON is the
  source of truth, imported directly, no sync/loader/drift) with
  `format_features`, `sentences`
  (stage-2 labels only), `why`, `rule`, `do_not_copy`, optional
  `near_miss`; `split: eval` is test-only and never prompts; a sample
  becomes `final` only when the owner says so; the tool saves analyzed ads
  as `candidate` examples that are NEVER loaded into prompts (storage =
  Task 4).
- Q (R14 ruling): is "Stakeholder management" explicit or implied? → A:
  EXPLICIT — S14 directly asks for the ability in Requirements and S9 is
  a complementary witness. The name is recorded under the SEMANTIC
  NORMALIZATION BOUND below, with `ad_wording` and the main sentence;
  SC-008 stays the final walkthrough judge; the item is stored in the
  separate taxonomy-candidates store (Task 4) so it can later be added
  to the taxonomy.
- Q: what is the SEMANTIC NORMALIZATION BOUND for explicit
  out-of-taxonomy soft skills (`in_taxonomy: false`)? → A: ALLOWED —
  mechanical change (lowercase, singular, dropping intensity words like
  "strong"/"effective"); turning the ad's phrase into the common name of
  that work PROVIDED the subject noun is in the witness sentence
  ("interact effectively with different stakeholders" → "stakeholder
  management"); verb generalization ONLY from a CLOSED list:
  management, communication, collaboration, coordination (adding a word
  to this list requires owner approval). FORBIDDEN — adding a concept
  absent from the sentence ("ownership" → "leadership"); merging two
  different skills into one name; changing the nature (hard↔soft).
  REQUIRED — the original sentence always stays in `evidence`; the ad's
  original phrase is recorded in a separate `ad_wording` field so
  normalization loses nothing and candidates stay comparable at review.
  VALIDATION (code-checkable): the subject noun must be in the witness
  and the verb word — or the name itself — must be in the witness or in
  the closed list. This accepts "Stakeholder management" and rejects a
  fabricated skill.
- Q (plan-approval condition ب): how are ambiguous taxonomy names
  matched? → A: precedence rule — (1) EXACT case-insensitive `label_en`
  match wins over everything; (2) an alt-label match to EXACTLY ONE
  record adopts that record; (3) an alt-label match to MULTIPLE records
  is REPORTED as ambiguous (a V5 failed check naming the candidates) —
  the model then either uses the exact canonical name of one candidate
  or records the skill with `in_taxonomy: false` + `ad_wording`.
  Owner-verified 2026-11-16: "show commitment" and "demonstrate loyalty"
  resolve by rule 1 (each is also an alt of "meet commitments");
  "demonstrate commitment", "demonstrate enthusiasm" and "guide others"
  are genuinely ambiguous today. The rule is GENERAL (merge-taxonomy,
  Task 4, may create new overlaps). Plan-approval conditions: R2 is
  ARCHIVED not deleted; the affected tests/code list was delivered
  before execution; weakening only lowers; repetition needs every
  witness ≥ preferred; alt labels are used again in matching — all
  recorded in Change history.

## Version 2 — Model-Driven Analysis (web only; amended 2026-11-16, matcher-rules-2.1.0)

**Input**: the full cleaned posting (v1 input stage UNCHANGED: paste →
clean → language gate → word-count gate → not-a-posting gate → review
gate with `[Y]`/`[C]`). Model contact happens only after every input
gate passes.

**Method (the model's internal 7 steps, encoded in the system prompt —
contracts/matcher-pipeline-v2.md §2.1; amended 2026-11-16)**: 1 atomize
into numbered sentences S1..Sn (one bullet = one sentence; a
multi-skill sentence is never split) → 2 one-pass labeling per sentence
(section: title/about/duties/requirements/preferred/benefits/details;
signal: strong/weak/bonus_zone/none; content: hard/soft/both/none;
content=none drops out). "Preferred Qualifications" and similar
headings (nice to have, bonus, plus) are a bonus_zone. "about" is used
ONLY for the summary — it yields no skills and never counts as an
independent section. "Strong <skill>" describes skill level, not
obligation: signal none. If bonus_zone and a weak word both apply,
bonus_zone wins. Stage 2 is the ONLY stage that receives few-shot
examples (bank below) → 3 extraction without priority (hard pass on
hard/both: explicit only, with name, category technical/tool/
experience/domain, evidence sentence ids; then soft pass AFTER the hard
pass on soft/both: explicit first, then implied — every implied item
cites its witness sentence. Soft names come from the taxonomy by
matching label_en AND alt_labels_en. An EXPLICIT soft skill that is not
in the taxonomy is KEPT with the ad's own wording and `in_taxonomy:
false` — the ad's phrase goes into `ad_wording` and the name may be
normalized ONLY within the semantic normalization bound (Clarifications
2026-11-16: subject noun from the witness + the closed generalization
list {management, communication, collaboration, coordination}); an
IMPLIED soft skill not in the taxonomy is dropped. A name
already recorded in the hard pass is never re-recorded) → 4 merge
same-name/synonym items (evidence list, per-witness signal, independent
sections; merged confidence = highest witness confidence, never
inflated) → 5 prioritization — the ONLY place priority is set
(per-witness base: strong→must; weak→preferred; bonus_zone→bonus; no
signal: requirements→must, duties→preferred, benefits→bonus. A
weakening word caps that evidence at preferred — it may only LOWER a
level, never raise it. Item level = highest witness. Conflict → lower
level wins + red_flags, and the repetition rule does not apply.
Repetition: found in ≥2 independent sections — the title counts, about
does NOT — with no conflict AND every witness at least preferred;
promotion is exactly ONE level and a bonus witness blocks it. Implied
soft cap: low→bonus, medium→preferred, high→up to must only if tied to
a core duty or found in 2 sections) → 6 summary (job title, seniority,
work type, domain, role nature executive|analytical|managerial —
exactly one, problem solved) + red_flags (conflicts, unrealistic
expectations, merged roles, vague duties, subjective or potentially
discriminatory phrases — recorded ONLY as red flags, never as skills;
no separate personality profile is built) → 7 output: ONLY the JSON
document with the final self-check (every item has evidence; no name
repeated; no low-confidence soft item in must; each sentence labeled
once).

**Few-shot bank (stage 2 only)**: `specs/002-jd-matcher/few-shot/`, one
`EX-Jxxx.json` per example (JSON is the source of truth — direct
imports, no sync/conversion; `why`, `rule` and `do_not_copy` are single
strings) with `format_features`, `sentences` (stage-2 labels only),
optional `near_miss`. Only
`status: final` + `split: fewshot` examples are loaded; `split: eval`
is test-only; drafts are NEVER loaded; the system must work with ZERO
final examples. Selection picks at most 2 most-similar-but-diverse
examples by `format_features` (headings, bullets vs paragraphs,
language, obligation words, length). `why`, `rule` and `do_not_copy`
are injected together with the sentences and labels, with the fixed
wording: "These examples show how ad formats differ. Do not copy their
labels and do not treat them as rules. Analyze each ad on its own
structure."

**Output contract** (`matcher-rules-2.1.0`): `{summary, must[],
preferred[], bonus[], red_flags[]}` — full schema in
contracts/matcher-pipeline-v2.md §3 and data-model.md v2. Every item:
type ("hard" | "soft" — NO trait), name (hard: the ad's own words;
soft: a taxonomy `label_en` when in the taxonomy, else the ad's own
wording), category (hard only), evidence (≥1 witness sentence,
verbatim — whitespace-normalized containment), source (explicit |
implied; hard always explicit), confidence (soft only), in_taxonomy
(soft only), ad_wording (soft only; required when in_taxonomy is false —
the ad's original phrase, verbatim).

**Deterministic validation (web engine, invariants V1–V8)**: verbatim
evidence; no name in two buckets or two types; a soft item in `must`
requires confidence "high"; field rules (category ⇔ hard, confidence ⇔
soft); taxonomy rule — a soft name MUST be a taxonomy `label_en`
(canonicalized) UNLESS `in_taxonomy: false`, which is legal ONLY with
`source: "explicit"`; enums; summary completeness; all-buckets-empty →
`ERR_MATCHER_ZERO_SKILLS` (an extraction failure — never a verdict).
Any violation → ONE retry with the failed-check list → refusal
`ERR_MATCHER_ANALYSIS_FAILURE`, rendered ONLY as the §15
NO_WAY_FORWARD UX — never as a result or verdict.

**Execution (constitution اصل ۲۲)**: task `matcher_analysis` = GEN in
the gateway task registry; called through the existing
`POST /api/llm/gen` NDJSON route (BYOK via the same route and headers);
prompt surface in `web/src/lib/byok/prompts.ts` (single surface,
byte-identical for gateway and BYOK); no new route, no new env.

**Result screen (web)**: summary block (Job title / Seniority / Work
type / Domain / Role nature / Problem this role solves) + three buckets
in fixed order Must have → Preferred → Bonus (real count in the header;
ALL rows shown — no truncation) + the red-flags list with kind labels;
soft rows show source · confidence and, when `in_taxonomy: false`, a
short "not in the 56-skill list" tag with the ad's own wording; `Back`
returns to the review gate; Cancel during analyzing discards the result
and returns to paste.

**Failure UX**: identical to the 001 step pages — failure-class banner
(TRANSIENT / NO_WAY_FORWARD / BROWSER_UNREACHABLE / OWN-KEY),
GuidanceBox at the failing stage, one-tap "Retry with your own key?",
4-state status that never blocks navigation (FR-52 carries over).

**Events**: `matcher_v2_requested`, `matcher_v2_result`,
`matcher_v2_validation_retry`, `matcher_v2_refused`,
`matcher_v2_cancelled`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Paste a posting, review it, confirm or cancel (Priority: P1)

The user pastes the whole job posting at once as complete multi-line text.
Because every newline sends a line in a terminal, the paste is finished by a
line containing only `END` (or by end-of-input, e.g. Ctrl+D). The tool
accepts the full paste without processing it line by line. The input is
plain text; before any analysis it is cleaned: control characters removed,
line endings normalized, `<script>` and `<style>` blocks removed with all
their content, and all other HTML tags removed while the text inside them is
kept. The input is data only: nothing in it is executed and no link is
opened — a sentence such as "ignore previous instructions" is just posting
text. After cleaning, the tool shows a cleaning report (if anything was
removed), the word count of the cleaned text, and the stage gate
`[Y] Continue · [C] Cancel`.

The posting must be in English: if more than 10% of its letters are
Persian/Arabic script, the text is rejected with an explicit message.
Scattered Persian names inside English text are allowed. The cleaned text
must contain at least 100 words and at most 1,500 words (counted on the
cleaned text); outside this range the tool shows a clear message with the
actual count and the limit, and does not analyze.

**Why this priority**: Nothing else works without a correctly received,
cleaned, length-checked posting.

**Independent Test**: Paste a posting containing a `<script>` block and
roughly 200 words; verify the cleaning report, the word count, and that
Continue reaches the hard-skills stage while Cancel returns to the paste
prompt.

**Acceptance Scenarios**:

1. **Given** a clean 200-word English posting, **When** the user pastes it
   and types `END`, **Then** the cleaning stage shows no removal message,
   shows `Word count: 200`, and waits for `[Y]` or `[C]`.
2. **Given** a posting containing `<script>alert(1)</script>`, **When** it
   is pasted and confirmed, **Then** the tool reports
   `I removed 1 script block from your text. I did not run it.` and analyzes
   the rest normally.
3. **Given** a posting whose letters are more than 10% Persian/Arabic
   script, **When** it is pasted, **Then** the tool does not analyze it and
   shows the Persian-input message.
4. **Given** a cleaned text of 42 words, **When** the paste is submitted,
   **Then** the tool shows the too-short message with the actual count and
   the 100-word minimum, and does not analyze.
5. **Given** a cleaned text of 1,800 words, **When** the paste is submitted,
   **Then** the tool shows the too-long message with the actual count and
   the 1,500-word maximum, and does not analyze.
6. **Given** any stage of the flow, **When** the user presses `[C]`,
   **Then** the stage's result is discarded, the tool returns to the Paste
   stage, and the user pastes the posting again.
7. **Given** the Paste stage itself, **When** the user cancels, **Then** the
   tool exits.
8. **Given** any gate prompt, **When** the user types an invalid key,
   **Then** the tool shows `Please type Y to continue or C to cancel.` and
   waits again.

---

### User Story 2 - See the hard-skill tables with priorities and evidence (Priority: P2)

The tool extracts hard skills only (knowledge, tools, methods, experience,
domain) — soft skills never appear in this step — and shows three tables in
the fixed order Must, Should, Nice, each with columns Skill | Type |
Evidence. Priority is decided in a strict cascade: first an explicit word on
the same item (Must: must, required, mandatory, essential, at least,
minimum; Should: preferred, desirable, ideally; Nice: plus, nice to have,
bonus, advantage); second, the section heading (Responsibilities,
Requirements, and Required Tools are Must; Preferred Qualifications is
Should); third, if neither exists in an unstructured posting, Must by
default, marked "(default)". An explicit word overrides the section heading
(e.g. "is a plus" inside Requirements makes the row Nice). Alternative tools
("X or Y") become one row labeled "one of". A skill appearing in several
places becomes one row with the highest priority; two genuinely different
skills stay two rows. Every row carries a short evidence quote of at most 12
words that appears verbatim in the cleaned text; a row without verbatim
evidence is dropped. An empty group is shown as "—"; rows follow posting
order. The last line shows the real totals
(`Must: 3 · Should: 2 · Nice: 1`) even when fewer rows are displayed, and
each table shows at most the first 5 rows with an explicit
"showing 5 of N" message when truncated.

**Why this priority**: The hard-skill tables are the first half of the
analysis output and the most concrete value of the feature.

**Independent Test**: Paste the draft's hard-skills example posting; verify
the exact Must/Should/Nice assignment (including "is a plus" overriding the
Requirements heading and the two BNPL rows), the verbatim evidence quotes,
the "one of" row, the counts line, and the display limit message when more
than 5 rows exist.

**Acceptance Scenarios**:

1. **Given** the example posting with Requirements / Required Tools /
   Preferred Qualifications sections, **When** the analysis runs, **Then**
   the rows land exactly as in the draft example (3 Must, 2 Should, 1 Nice)
   with priorities derived from the cascade.
2. **Given** an item "Familiarity with lending and BNPL concepts is a plus"
   inside the Requirements section, **When** prioritized, **Then** the row
   is Nice — the explicit word overrides the section heading.
3. **Given** "Power BI, Metabase, or Grafana" as one item, **When**
   extracted, **Then** it becomes one row labeled "One of: Power BI /
   Metabase / Grafana" typed "Hard (tool)".
4. **Given** two genuinely different skills that mention the same product
   (experience vs. conceptual familiarity), **When** extracted, **Then**
   they stay two rows.
5. **Given** a row whose proposed evidence does not appear verbatim in the
   cleaned text, **When** the report is built, **Then** the row is dropped
   and counted in the dropped-items message.
6. **Given** a table with 8 rows, **When** displayed, **Then** only the
   first 5 are shown with `Must: showing 5 of 8. Version 1 shows up to 5
   rows per table.` and the counts line still shows the real totals.
7. **Given** an empty priority group, **When** displayed, **Then** the group
   shows "—".

---

### User Story 3 - See the soft-skill table from the taxonomy (Priority: P2)

The tool matches soft skills strictly against the 56 skills in
`docs/soft-skills-taxonomy.json` — the skill name shown is exactly
`label_en`, no skill outside the file is ever created. A skill appears only
if the text contains evidence for it: **Explicit** when the posting names
the skill (a direct synonym of `label_en` or any of `alt_labels_en`), or
**Inferred** when it is drawn from responsibilities or requirements with a
one-sentence reason. Priority follows the same cascade as hard skills, based
on where the evidence appears. Inferring a skill from the company name,
industry, or job title alone is not allowed (e.g. "fintech" alone is not
evidence for attend-to-detail). The removal test applies: if a reader seeing
only the evidence would not arrive at that skill, the row is removed. Each
taxonomy skill has at most one row; multiple pieces of evidence merge and
the highest priority is kept. A posting concept with no close equivalent
creates no skill row and is listed on a separate "No taxonomy match" line.
The table shows columns Skill (`label_en`) | Group (`group_code`) |
Evidence | Priority | Certainty, ordered Must, Should, Nice and within each
level Explicit first then Inferred; at most the first 5 rows are displayed
with an explicit truncation message, while all rows are still stored in the
data. The ESCO `id` is stored in the data and never shown in the table.

**Why this priority**: The second half of the analysis output; depends on
the same cleaned text and gates as US2 but has its own data source.

**Independent Test**: Paste the draft's soft-skills example posting; verify
the exact rows (work in teams, make decisions, build networks as Inferred
with reason, comply with regulations), the "No taxonomy match" line for
"Excellent communication skills", that "fast-growing fintech" creates no
row, and the column set and ordering.

**Acceptance Scenarios**:

1. **Given** the example posting, **When** the analysis runs, **Then** the
   table contains exactly the draft's four rows with the shown groups
   (T4.3, T3.2, T4.3, T4.5), priorities, and certainty labels.
2. **Given** "Ability to manage stakeholders" with no direct taxonomy
   equivalent, **When** matched, **Then** "build networks" appears as
   Inferred with a one-sentence reason.
3. **Given** a company/industry sentence ("We are a fast-growing
   fintech."), **When** matched, **Then** it creates no skill row.
4. **Given** a posting concept with no close taxonomy equivalent ("Excellent
   communication skills"), **When** matched, **Then** the row
   "No taxonomy match: …" explains it instead of inventing a skill.
5. **Given** a soft skill with several evidence pieces, **When** merged,
   **Then** one row remains with the highest priority of its evidence.
6. **Given** more than 5 matching soft skills, **When** displayed, **Then**
   only the first 5 (Must → Should → Nice, Explicit before Inferred) are
   shown with the truncation message and all rows are stored.

---

### User Story 4 - Trustworthy, repeatable output with no free-form verdict (Priority: P3)

The tool never produces an open "matches / does not match" judgment: in
version 1 the output consists only of the tables from steps 1-a and 1-b and
their counts. Errors are separate from "mismatch": if the input does not
look like a job posting, an input-error message is shown; if extraction
yields zero skills, an extraction-failed message is shown; neither is ever
reported as a mismatch. Every extracted skill must carry evidence that
appears verbatim in the cleaned text, or the row is removed (with a dropped-
items count). The summary counts must equal the number of extracted rows
(displayed plus hidden by the display limit); if they differ, the tool shows
a consistency error instead of an inconsistent report. Running the same
posting 5 times in a row must produce identical skills and priorities in at
least 90% of cases. Both draft example postings are stored as fixed
regression samples with their expected outputs written down, and are rerun
after every change.

**Why this priority**: These guarantees make the output trustworthy; they
guard the whole feature but ship naturally after the tables exist.

**Independent Test**: Run the two stored regression samples 5 times each;
verify byte-identical tables across runs, count consistency, and the correct
error messages for a non-posting text and a zero-skill text.

**Acceptance Scenarios**:

1. **Given** any analysis, **When** the report is shown, **Then** it contains
   only the hard-skill tables, the soft-skill table, their counts, and stage
   messages — never a "matches / does not match" verdict.
2. **Given** text that is not a job posting (e.g. a letter), **When**
   submitted, **Then** the input-error message is shown and nothing is
   analyzed.
3. **Given** a valid posting from which no skills can be extracted, **When**
   the analysis runs, **Then** the extraction-failed message is shown —
   never a mismatch verdict.
4. **Given** the same posting, **When** analyzed 5 times in a row, **Then**
   the skills and priorities are identical in at least 90% of the runs.
5. **Given** stored counts that disagree with the extracted rows, **When**
   the report is built, **Then** the consistency-error message is shown
   instead of the report.

---

### Edge Cases

- **Unstructured posting** (no recognizable section headings and no explicit
  priority words): rows default to Must, marked "(default)".
- **Empty priority group**: displayed as "—" with the counts still accurate.
- **Scattered Persian names** inside an otherwise English posting: allowed;
  only the >10% letters rule rejects a posting.
- **Paste containing `<script>`/`<style>` blocks**: blocks removed with their
  content, reported, never executed; analysis continues on the rest.
- **Paste containing HTML tags**: tags removed, inner text kept, reported.
- **Paste with control characters or mixed line endings**: cleaned before
  word counting and analysis.
- **Zero skills extracted from a length-valid posting**: extraction-failed
  message; never reported as a mismatch.
- **Input that is not a job posting**: input-error message; never reported
  as a mismatch.
- **More than 5 rows in any table**: first 5 displayed with the truncation
  message; real totals always shown; all rows stored in the data.
- **Evidence longer than 12 words or not verbatim**: row dropped and counted
  in the dropped-items message.
- **Cancel at any stage**: returns to Paste; the cancelled stage's result is
  discarded; cancel at Paste exits the tool.
- **End-of-input instead of `END`** (e.g. Ctrl+D): accepted as the paste
  terminator.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST accept one complete multi-line pasted posting
  terminated by a line containing only `END` (or end-of-input), and MUST NOT
  require or process the paste line by line.
- **FR-002**: The system MUST treat the posting as data only: nothing in it
  is executed, no link is opened, and embedded instructions have no effect.
- **FR-003**: Before analysis the system MUST clean the text: remove control
  characters, normalize line endings, remove `<script>` and `<style>` blocks
  with all their content, and remove all other HTML tags while keeping the
  text inside them.
- **FR-004**: If anything was removed during cleaning, the system MUST show
  a short cleaning report (distinguishing script blocks, style blocks, and
  other HTML tags) and then continue; if nothing was removed, no cleaning
  message is shown.
- **FR-005**: The system MUST show the word count of the cleaned text
  before analysis begins.
- **FR-006**: The system MUST reject a posting whose letters are more than
  10% Persian/Arabic script, with the fixed Persian-input message; scattered
  Persian names inside English text MUST be allowed.
- **FR-007**: The system MUST reject cleaned text shorter than 100 words or
  longer than 1,500 words, with messages that include the actual count and
  the limit, and MUST NOT analyze out-of-range text.
- **FR-008**: The system MUST require an explicit `[Y] Continue` to advance
  from each stage (Review, Hard skills, Soft skills) and MUST support
  `[C] Cancel` at every stage; Cancel ALWAYS returns to the Paste stage and
  discards the cancelled stage's result; Cancel at the Paste stage exits the
  tool; an invalid key re-prompts with the fixed invalid-key message.
  **[Partially superseded on web by v2 (2026-11-09): the Review gate, the
  invalid-key message, and all Cancel/exit semantics stay exactly as
  written; the Hard-skills and Soft-skills stage gates are removed — one
  analyzing step replaces them.]**
- **FR-009**: The system MUST extract hard skills only in step 1-a and
  produce exactly three tables ordered Must, Should, Nice with columns
  Skill | Type | Evidence, rows in posting order, and "—" for an empty
  group. **[Superseded on web by v2 (2026-11-09) — the terminal keeps
  v1.]**
- **FR-010**: Priority MUST follow the fixed cascade: (1) explicit word on
  the same item (Must: must, required, mandatory, essential, at least,
  minimum; Should: preferred, desirable, ideally; Nice: plus, nice to have,
  bonus, advantage); (2) section heading (Responsibilities, Requirements,
  Required Tools → Must; Preferred Qualifications → Should); (3) default
  Must marked "(default)". An explicit word MUST override the section
  heading. **[Superseded on web by v2 (2026-11-09) — the terminal keeps
  v1.]**
- **FR-011**: Alternative tools ("X or Y") MUST become one row labeled
  "one of" typed "Hard (tool)"; a skill appearing in several places MUST
  become one row with the highest priority; genuinely different skills MUST
  remain separate rows. **[Superseded on web by v2 (2026-11-09) — the
  terminal keeps v1.]**
- **FR-012**: Every hard-skill row MUST carry an evidence quote of at most
  12 words that appears verbatim in the cleaned text; a row without such
  evidence MUST be dropped and counted in the dropped-items message.
  **[Superseded on web by v2 (2026-11-09): evidence is now witness
  sentences, verbatim under whitespace normalization — the terminal keeps
  v1.]**
- **FR-013**: Each table MUST display at most the first 5 rows; when
  truncated, the table MUST say so explicitly (e.g. `Must: showing 5 of 8.
  Version 1 shows up to 5 rows per table.`), and the final counts line
  (`Must: N · Should: N · Nice: N`) MUST always show the real totals.
  **[Superseded on web by v2 (2026-11-09): ALL rows are shown with
  per-bucket counts — the terminal keeps v1.]**
- **FR-014**: Soft skills MUST come only from the 56 skills in
  `docs/soft-skills-taxonomy.json`; the displayed skill name MUST be exactly
  `label_en`; no skill outside the file MUST ever be created.
  **[Superseded on web in FORM by v3 (2026-11-16): taxonomy names match
  label_en AND alt_labels_en and are canonicalized to label_en; an
  EXPLICIT soft skill outside the taxonomy is kept with the ad's own
  wording and `in_taxonomy: false` (an IMPLIED one is dropped) — the R2
  soft/trait typing is retired. The terminal keeps v1.]**
- **FR-015**: A soft skill appears only with evidence: Explicit (the posting
  names the skill via a direct synonym of `label_en` or `alt_labels_en`) or
  Inferred (drawn from responsibilities or requirements with a one-sentence
  reason). Inferring from company name, industry, or job title alone is
  forbidden, and the removal test applies: if a reader seeing only the
  evidence would not arrive at the skill, the row is removed.
  **[Superseded on web by v2 (2026-11-09): explicit/implied survive via the
  prompt method (implied items must cite a witness sentence); the
  alt-label/removal-test mechanics are model judgment — the terminal keeps
  v1.]**
- **FR-016**: Each taxonomy skill MUST have at most one row; multiple
  evidence pieces merge keeping the highest priority. A posting concept with
  no close equivalent MUST be listed on a separate "No taxonomy match" line
  instead of creating a skill. **[Superseded on web by v2 (2026-11-09):
  one-row-per-name is enforced by validator V2; the "No taxonomy match"
  line is removed — an unmatched concept produces no row, or a red flag
  when the pipeline says so. The terminal keeps v1.]**
- **FR-017**: The soft-skill table MUST show columns Skill | Group
  (`group_code`) | Evidence | Priority | Certainty (Explicit/Inferred),
  ordered Must, Should, Nice and within each level Explicit first then
  Inferred; at most the first 5 rows displayed with the truncation message;
  all rows stored in the data; the ESCO `id` stored and never shown in the
  table. **[Superseded on web by v2 (2026-11-09): buckets Must have /
  Preferred / Bonus per contract §6 — the terminal keeps v1.]**
- **FR-018**: The system MUST NOT produce any free-form "matches / does not
  match" verdict; the version 1 output consists only of the two analysis
  steps' tables, their counts, and the stage messages.
- **FR-019**: Input errors (text is not a job posting) and extraction
  failures (zero skills extracted) MUST each show their own fixed message
  and MUST NEVER be reported as a mismatch.
- **FR-020**: The summary counts MUST equal the number of extracted rows
  (displayed plus hidden by the display limit); on any disagreement the
  system MUST show the consistency-error message instead of the report.
  **[Superseded on web by v2 (2026-11-09): counts derive from the same
  arrays that render the rows — structurally consistent; no consistency
  error path on web. The terminal keeps v1.]**
- **FR-021**: Running the same posting 5 times in a row MUST produce
  identical skills and priorities in at least 90% of cases.
  **[Superseded on web by v2 (2026-11-09): the model judges (§14
  single-judge pattern); reliability = the output-contract validator
  (V1–V8) with retry-once → refusal, plus the event trail. The terminal
  keeps v1.]**
- **FR-022**: The two example postings from this specification MUST be
  stored as fixed regression samples with their expected outputs written
  down, and MUST be rerun after every change to the analysis.
  **[Superseded on web in FORM by v2 (2026-11-09): the two postings stay
  fixed INPUTS with hand-written valid/invalid v2 JSON fixtures checked
  against the validator; byte-golden expected outputs stay for the
  terminal.]**
- **FR-023**: The system MUST log the important matcher events (posting
  received, cleaned, analyzed, per-stage confirmations, errors) with
  timestamps, consistent with the project's measurement practice.
- **FR-024**: This feature's output REPLACES the 001 matcher output: no
  per-entry actions (Highlight / No change / Not relevant to this job) are
  produced anywhere in this flow, and no resume data is read.

### Out of Scope (this version)

Any resume interaction (resume report, per-entry recommendations, "bold /
unchanged / short" counts); any multilingual support beyond the English-only
rule (a second language awaits a product-owner announcement); Persian
postings (rejected, not translated); file upload or rich-text input; opening
links; a graphical interface; a free-form match verdict; skills outside the
hard-skill extraction and the 56-skill taxonomy.

### Key Entities *(include if feature involves data)*

- **JobPosting**: the pasted raw text and its cleaned form; word count of
  the cleaned text; cleaning report (script/style blocks and HTML tags
  removed); language check result.
- **HardSkillRow**: skill name; type (Hard / Hard (tool)); "one of" label
  when alternatives merged; priority (Must / Should / Nice, with
  "(default)" marker); evidence quote (≤ 12 words, verbatim in the cleaned
  text); posting order position.
- **SoftSkillRow**: taxonomy `label_en`; `group_code`; evidence; one-sentence
  reason when Inferred; priority; certainty (Explicit / Inferred); taxonomy
  `id` (stored, never displayed).
- **TaxonomySkill**: one of the 56 records in
  `docs/soft-skills-taxonomy.json` with fields used verbatim: `label_en`,
  `alt_labels_en`, `group_code`, `group_label`, `id`.
- **AnalysisReport**: the hard-skill tables, the soft-skill table, real-total
  counts, truncation notes, dropped-items count, and the consistency check
  result.
- **RunEvent**: timestamped matcher events (posting received, cleaned,
  analyzed, stage confirmations, errors) for measurement.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can complete one full flow (paste → review → hard
  skills → soft skills) with explicit confirmations, in a single session.
- **SC-002**: 100% of displayed rows carry evidence that appears verbatim in
  the cleaned text; rows without verbatim evidence are dropped and counted.
- **SC-003**: 100% of reports pass the consistency check: shown counts equal
  extracted rows (displayed plus hidden).
- **SC-004**: The same posting analyzed 5 consecutive times yields identical
  skills and priorities in at least 90% of cases.
- **SC-005**: The two stored regression samples reproduce their written
  expected outputs on every run after any change.
- **SC-006**: 100% of postings with more than 10% Persian/Arabic-script
  letters are rejected with the fixed message; scattered Persian names in
  English postings are accepted.
- **SC-007**: 0% of outputs contain a free-form match verdict; input errors
  and extraction failures are always reported with their own messages.
- **SC-008** (v3, owner acceptance): the Meta/fintech PM sample ad
  (EX-J001's ad, 284 words, bulleted, headings About the Role / Key
  Responsibilities / Requirements / Preferred Qualifications / Job
  Details) yields ~20+ skills; "Communication" and "Stakeholder
  management" appear as soft with `in_taxonomy: false` in must; "Agile/
  Scrum" is preferred; fintech and product-analytics tools are bonus.
- **SC-009** (v3): a failing stage surfaces its real error — never the
  generic "no skills" message (the taxonomy-failure masking bug is fixed
  by the bundled taxonomy + the distinct `ERR_MATCHER_TAXONOMY`
  message).
- **SC-010** (v3): with zero `status: final` few-shot examples the
  analysis works exactly as without them; draft and eval examples are
  never loaded into a prompt.

## Assumptions

- The taxonomy data source is `docs/soft-skills-taxonomy.json` (56 skills,
  version 0.1.0), used verbatim with the fields `label_en`, `alt_labels_en`,
  `group_code`, `group_label`, and `id` — verified in the repository
  2026-10-25.
- The fixed user-facing messages are exactly the English sentences proposed
  in the draft (input stage, cleaning report, gates, error messages,
  truncation notes).
- Section headings recognized for the priority cascade are at least:
  Responsibilities, Requirements, Required Tools (Must) and Preferred
  Qualifications (Should); additional synonymous headings may be recognized
  but never change the cascade order.
- Word counting operates on the cleaned text, splitting on whitespace.
- The 10% Persian/Arabic-script rule counts letters only (not digits or
  punctuation).
- "End-of-input" (Ctrl+D) is an accepted alternative terminator to the
  `END` line in terminals that support it.
- This feature supersedes the 001 matcher output; the follow-up amendments
  to 001 FR-021, docs/prd.md §8, and constitution P10 (posting language)
  are tracked separately and owned by the product owner. The constitution
  amendment itself was ratified as v3.0.0 on 2026-10-26.
- A pasted text is treated as "not a job posting" (FR-019) when it contains
  no recognized section heading, fewer than 3 list items, and no priority
  words; the detection rule is versioned with the matcher rules
  (`matcher-rules-1.0.0`).
- The `END` paste terminator is matched exactly (case-sensitive);
  surrounding whitespace on the line is tolerated.
- HTML entities (e.g. `&amp;`) are not unescaped in version 1; the cleaned
  text keeps them literally, and verbatim evidence matching therefore
  applies to that literal form (known v1 limitation).
- (v3) Few-shot selection is deterministic: examples are compared on
  `format_features` fields (heading overlap, bullets vs paragraphs,
  language, obligation words, length bucket) — no model call is spent on
  selection, and diversity is enforced by not picking two examples that
  share the same heading set.
- (v3) Whether a soft skill is explicit or implied is model judgment
  under the method; the owner remains the final judge against SC-008 on
  walkthrough (e.g. "Stakeholder management" drawn from the stakeholder
  sentences).
- (v3) The repository taxonomy copies have CRLF line endings and NO BOM
  (verified 2026-11-16; the owner prompt's BOM description does not match
  the files on disk). Any future merge tool (Task 4) must tolerate both
  BOM presence and absence.

## Change history

| Date | Decision | Recorded where |
|---|---|---|
| 2026-10-25 | v1 created: posting-only matcher, three hard tables + 56-skill ESCO soft table, deterministic rules (Clarifications Session 2026-10-25) | spec v1; commit 8fc361e/e63e60b |
| 2026-11-09 | v2 amendment (owner rulings): model-driven web-only analysis, ONE LLM call, SOFT_TAXONOMY = the 56-skill file, web only (terminal keeps v1), §15/§16 no-model UX; supersessions S1–S8; contract matcher-rules-2.0.0 | Clarifications 2026-11-09; plan v2; constitution v4.3.0 اصل ۲۲ |
| 2026-11-15/16 | Task 1 diagnosis + fixes (owner-approved via CHANGE GATE): FIX-1 taxonomy bundled at build time (Vercel ENOENT root-caused — the "no skills" message was a masked taxonomy failure); FIX-2 distinct ERR_MATCHER_TAXONOMY — real errors never masked | spec SC-009; plan Task-1 record; memory |
| 2026-11-16 | v3 amendment (owner Task 2 rulings): ten method deltas — no trait (R2 ARCHIVED, not deleted), in_taxonomy rule, alt labels return, 7 sections, about summary-only, weakening only lowers, repetition tightened, "Strong <skill>" = none, few-shot bank, matcher-rules-2.1.0 | Clarifications Session 2026-11-16; plan S9–S12; research R12–R19 |
| 2026-11-16 | R17 owner design: few-shot source of truth = JSON (EX-Jxxx.json, direct imports, no sync/loader/drift); EX-J001.yaml converted to json and removed | Clarifications; research R17; contract §2.3 |
| 2026-11-16 | R14 resolved + normalization bound: "Stakeholder management" EXPLICIT; V9 semantic normalization bound + new `ad_wording` field; closed list {management, communication, collaboration, coordination} | Clarifications; plan S13; data-model V9 |
| 2026-11-16 | Plan approved with conditions الف–هـ: (الف) R2 archived not deleted + affected tests/code list delivered before execution; (ب) V5 ambiguous-name precedence (exact label_en first; multi-record alt match reported — five verified cases); (ج) normalization bound + ad_wording; (د) weakening only lowers, repetition needs every witness ≥ preferred; (هـ) alt labels used again in matching | Clarifications 2026-11-16; plan S10 amendment; data-model V5; this table |
| 2026-11-16 | v3 implemented (T047–T062): few-shot JSON bank direct-imported (R17), V5/V9 enforced, prompt §2.1 v3, UI tag/ad_wording, SC-008 shape test; I-1 resolved via experimental.externalDir | tasks.md v3 addendum; plan Implementation record |
| 2026-11-16 | Prompt text SINGLE SOURCE (owner ruling, research R20): text only in web/data/matcher-prompt.json ({version, lines}, direct import); contract §2.1 = pointer + version pin; three-way version equality test-enforced; the "Read before Edit" working rule mandated | research R20; contract §2.1; plan Implementation record; this table |
