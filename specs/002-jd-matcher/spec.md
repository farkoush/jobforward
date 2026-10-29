# Feature Specification: JD Matcher — Job Posting Skill Analysis (Version 1)

**Feature Branch**: `002-jd-matcher`

**Created**: 2026-10-25

**Status**: Draft

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
- **FR-009**: The system MUST extract hard skills only in step 1-a and
  produce exactly three tables ordered Must, Should, Nice with columns
  Skill | Type | Evidence, rows in posting order, and "—" for an empty
  group.
- **FR-010**: Priority MUST follow the fixed cascade: (1) explicit word on
  the same item (Must: must, required, mandatory, essential, at least,
  minimum; Should: preferred, desirable, ideally; Nice: plus, nice to have,
  bonus, advantage); (2) section heading (Responsibilities, Requirements,
  Required Tools → Must; Preferred Qualifications → Should); (3) default
  Must marked "(default)". An explicit word MUST override the section
  heading.
- **FR-011**: Alternative tools ("X or Y") MUST become one row labeled
  "one of" typed "Hard (tool)"; a skill appearing in several places MUST
  become one row with the highest priority; genuinely different skills MUST
  remain separate rows.
- **FR-012**: Every hard-skill row MUST carry an evidence quote of at most
  12 words that appears verbatim in the cleaned text; a row without such
  evidence MUST be dropped and counted in the dropped-items message.
- **FR-013**: Each table MUST display at most the first 5 rows; when
  truncated, the table MUST say so explicitly (e.g. `Must: showing 5 of 8.
  Version 1 shows up to 5 rows per table.`), and the final counts line
  (`Must: N · Should: N · Nice: N`) MUST always show the real totals.
- **FR-014**: Soft skills MUST come only from the 56 skills in
  `docs/soft-skills-taxonomy.json`; the displayed skill name MUST be exactly
  `label_en`; no skill outside the file MUST ever be created.
- **FR-015**: A soft skill appears only with evidence: Explicit (the posting
  names the skill via a direct synonym of `label_en` or `alt_labels_en`) or
  Inferred (drawn from responsibilities or requirements with a one-sentence
  reason). Inferring from company name, industry, or job title alone is
  forbidden, and the removal test applies: if a reader seeing only the
  evidence would not arrive at the skill, the row is removed.
- **FR-016**: Each taxonomy skill MUST have at most one row; multiple
  evidence pieces merge keeping the highest priority. A posting concept with
  no close equivalent MUST be listed on a separate "No taxonomy match" line
  instead of creating a skill.
- **FR-017**: The soft-skill table MUST show columns Skill | Group
  (`group_code`) | Evidence | Priority | Certainty (Explicit/Inferred),
  ordered Must, Should, Nice and within each level Explicit first then
  Inferred; at most the first 5 rows displayed with the truncation message;
  all rows stored in the data; the ESCO `id` stored and never shown in the
  table.
- **FR-018**: The system MUST NOT produce any free-form "matches / does not
  match" verdict; the version 1 output consists only of the two analysis
  steps' tables, their counts, and the stage messages.
- **FR-019**: Input errors (text is not a job posting) and extraction
  failures (zero skills extracted) MUST each show their own fixed message
  and MUST NEVER be reported as a mismatch.
- **FR-020**: The summary counts MUST equal the number of extracted rows
  (displayed plus hidden by the display limit); on any disagreement the
  system MUST show the consistency-error message instead of the report.
- **FR-021**: Running the same posting 5 times in a row MUST produce
  identical skills and priorities in at least 90% of cases.
- **FR-022**: The two example postings from this specification MUST be
  stored as fixed regression samples with their expected outputs written
  down, and MUST be rerun after every change to the analysis.
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
