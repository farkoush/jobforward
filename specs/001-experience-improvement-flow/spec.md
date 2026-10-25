# Feature Specification: Help Entry-Level Job Seekers Narrate Their Experience (Level 1 Prototype)

**Feature Branch**: `001-experience-improvement-flow`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "A text-flow prototype (no graphical interface) that guides an entry-level product manager job seeker through one complete path for improving a single experience entry. The user adds an experience entry (type: job, project, course, side work; title; optional organization/context; optional start and end as written; and 1–6 free-text bullets) and may optionally draft each bullet with a context → action → result template that is only a writing aid. The tool scores each bullet on four dimensions (0/1/2), shows experience and overall scores independent of any job posting, asks 1–2 rejectable questions per improvable bullet, proposes rewrites built only from the bullet and the user's answers, replaces a bullet only on explicit approval (status 'edited', history retained), re-analyzes only new or edited bullets, shows before/after scores side by side, and warns about overlapping bullets (merge suggestion; no score impact; no merge without confirmation). Full acceptance criteria in this document and in the project constitution."

**Language note**: Version 1 is a text-based terminal flow and all tool text is
in English at B1 level (prd §4/§6; spec-original Specs 1–3). All user input —
including bullets and answers to questions — must be in English; Persian text
is not accepted and the tool does not translate. The resume target is English;
Persian-language UI and Persian resumes are planned for later versions and are
out of scope here.

## Clarifications

### Session 2026-10-23

- Q: After an approved rewrite and re-analysis, if the bullet still has room for
  improvement, does the tool open another question round for that bullet in the
  same run? → A: No. At most one question round per bullet per improvement run;
  after re-analysis the tool does NOT automatically re-ask the same bullet in
  the same run — the user can rerun the improvement path later.
- Q: Can the user directly edit an existing bullet's text themselves, or can
  text only change through an approved rewrite proposal? → A: The user can edit
  any bullet's text directly. A directly edited bullet is marked "edited" and
  re-analyzed exactly like an edit produced by an approved rewrite.
- Q: Can the user delete a bullet or a whole experience entry from saved data?
  → A: Yes, both — but only after an explicit confirmation step. Deleted items
  are excluded from all scores (including the overall average), the deletion is
  logged with a timestamp, and the rewrite history of surviving bullets stays
  intact. If deleting the last bullet leaves an entry with zero bullets, the
  entry reverts to draft treatment.
- Q: Which status label does a brand-new bullet carry right after its first
  successful scoring? → A: "new" exists only until the bullet's first successful
  analysis, after which it becomes "analyzed". A post-analysis change (an
  approved rewrite or a direct user edit) flips the label to "edited" until
  re-analysis completes, and "edited" returns to "analyzed" once re-analysis
  succeeds. If analysis fails or has not run, the bullet keeps "new" or
  whatever it had before the change.

### Session 2026-10-25

- Q: Are bullets drafted through separate context/action/result fields? → A:
  No. Bullets are free text. The "Context → Action → Result" pattern only
  guides sentence structure when the tool rewrites a bullet; it is not a
  stored field and the user never fills separate fields. The message "If you
  have real numbers, include them" is part of the Result question, not a
  separate field prompt (docs/prd.md §4.2, change log 2026-10-25).
- Q: How does the rewrite question flow work? → A: Analysis always runs before
  any questions. For each bullet the tool first asks "Do you want to rewrite
  this bullet to make your experience stronger?" (default: Yes). If yes, it
  asks exactly one question for each of the bullet's dimensions scoring 0 or 1
  — Context, Role and Action Clarity, Result — in that order: 0–3 questions
  total, and the user can skip any question (docs/prd.md §4.2; decision:
  per bullet, not per entry).
- Q: What happens when the user answers some questions but leaves others
  unanswered, or needs time to think? → A: The tool offers two options: save
  the whole work experience entry as a draft, or approve a rewrite using only
  the answers already provided. If the user does not answer or skips all
  questions, no rewrite is made (docs/prd.md §4.2).
- Q: Which scoring dimensions does the rubric use? → A: Three equally weighted
  dimensions: Context, Role and Action Clarity, and Result (rubric_version 2).
  The dimensions "Product Manager Skill Evidence" and "Structure and
  Scannability" and the phrase "Weak for a Product Manager" were removed
  (docs/prd.md §4.3, change log 2026-10-25).
- Q: What replaces the old 5-points stability criterion? → A: Across 5
  consecutive runs on an unchanged entry, at least 90% of bullet-by-dimension
  scores must be exactly the same (docs/prd.md §5, change log 2026-10-24).
- Q: Does version 1 include the job description matcher? → A: Yes. The tool
  analyzes the full pasted job description, classifying each requirement by
  type (hard skill or soft skill) and priority (Required / Preferred / Bonus;
  any red-line requirement is classified as Required), and assigns exactly one
  entry-level action per experience entry: "Highlight", "No change", or "Not
  relevant to this job", each with a one-line reason. The actions "Remove" and
  "Shorten" do not exist, and the tool never recommends removing an entry
  (docs/prd.md §4.1; spec-original Spec 1; decision 2026-10-25 replacing
  "Shorten" with "Not relevant to this job").
- Q: What language does the tool and the user input use? → A: All tool text is
  in English at B1 level, and all user input (bullets, answers) must be in
  English; Persian input is not accepted and the tool does not translate
  (docs/prd.md §4/§6).
- Q: Does version 1 include PDF upload or email sign-in? → A: No — decision to
  keep this version local-only with manual entry; PDF upload with email
  sign-in is deferred to a later version (user decision 2026-10-25).
- Q: What does the overlap/merge warning compare? → A: Bullets within one
  experience entry (each new bullet is compared with all existing bullets; the
  warning appears at entry level). It does not compare whole entries
  (user decision 2026-10-25, per spec-original Spec 3).
- Q: Does an entry store organization and start/end fields? → A: No — decision
  to match the prd §4.4 field table: an entry has entry_type, title, bullets,
  plus automatic fields (source, status, entry score, rubric version, overlap
  warning). The optional organization and start/end fields were removed
  (user decision 2026-10-25).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record an Experience and See a Transparent Score (Priority: P1)

The user records one of their experiences for the job application: the
experience type (job, project, course, side work), a title, and 1 to 6
free-text bullets written entirely in English. Bullets are free text; the tool
never presents separate context/action/result fields. After recording, the
tool scores each bullet on three dimensions — Context, Role and Action
Clarity, Result — each 0, 1, or 2, and shows the per-dimension score of every
bullet, the entry score (0–100), and the overall score across the entries that
have at least one bullet and are not drafts.

**Why this priority**: Nothing else in the path works without an entry and a
transparent score: scoring is the input to questions, rewrites, and the
before/after comparison. This story alone is a usable MVP: the user records a
real experience and receives an explainable, posting-independent score.

**Independent Test**: Record one experience with two bullets and verify the
three per-dimension scores, the entry score, and the exact reproduction of the
reference example (83.33). Needs nothing else from later stories.

**Acceptance Scenarios**:

1. **Given** a fresh tool with no data, **When** the user records an experience
   with type, title, and 2 bullets, **Then** the per-dimension score of each
   bullet, the entry score computed by the fixed formula, and the overall
   score are displayed.
2. **Given** the reference example (two bullets with Role and Action Clarity
   (2,2), Result (2,1), Context (2,1)), **When** the score is computed,
   **Then** the entry score is exactly 83.33.
3. **Given** a fixed experience, **When** there is no job posting, or a job
   posting later changes, **Then** every displayed score stays identical.
4. **Given** a bullet the user wrote freely, **When** it is recorded, **Then**
   it is stored and displayed exactly as written, with no separate
   context/action/result fields and nothing filled in by the tool.
5. **Given** an entry saved with zero bullets, **Then** the entry is kept as a
   draft, is excluded from the overall score, and the tool suggests writing a
   description bullet.

---

### User Story 2 - Rewrite Gate, Questions, Proposed Rewrite, Explicit Approval (Priority: P2)

Analysis runs before any questions. For each bullet, the tool first asks
whether the user wants a rewrite (default: Yes). If yes, it asks exactly one
question for each of that bullet's dimensions scoring 0 or 1 — Context, Role
and Action Clarity, Result, in that order — so 0 to 3 questions, and the user
can skip any question. The user can also reject the whole gate; then no
questions and no rewrite follow. If the user answers, the tool proposes a
rewrite for that bullet built only from the words and information in that
bullet and the user's answers — no invented numbers, impacts, or claims. With
no answer, or if every question is skipped, there is no rewrite and the
original bullet stays untouched. If the user answers some questions but leaves
others unanswered, or needs time to think, the tool offers two options: save
the whole experience entry as a draft, or approve a rewrite using only the
answers already provided. The proposal requires the user's explicit decision:
on approval the new bullet replaces the old one with status "edited" and the
previous bullet stays in history; on rejection nothing changes.

**Why this priority**: Improvement is the product's purpose. Without this loop
the tool is a scorer, not a coach. It depends on Story 1's scores but is fully
testable once Story 1 exists.

**Independent Test**: On a recorded experience, walk gate → question → answer
→ proposal → approve and verify the replaced bullet with status "edited" and
history retained; separately reject the gate, skip all questions, and answer
only part of the questions to verify no rewrite, no change, and the
draft-or-partial-approval option respectively.

**Acceptance Scenarios**:

1. **Given** a scored bullet, **When** the tool asks "Do you want to rewrite
   this bullet?", **Then** the default answer is Yes, and answering No leads
   to no questions and no rewrite.
2. **Given** a bullet with k dimensions scoring 0 or 1, **When** the user
   accepts the rewrite gate, **Then** the tool asks exactly k questions (0–3)
   in Context, Action, Result order, and each question can be skipped.
3. **Given** a skipped question, **Then** no rewrite covers that dimension and
   the bullet is unchanged by the skip itself.
4. **Given** the user's answers, **When** a rewrite is proposed, **Then** every
   number, impact, and claim in the proposal comes from the original bullet or
   the user's answers, and nothing else.
5. **Given** a proposed rewrite, **When** the user rejects it, **Then** the
   bullet text and its scores remain exactly as before.
6. **Given** a proposed rewrite, **When** the user approves it, **Then** the
   new bullet replaces the old one, its status becomes "edited", and the
   previous bullet is retained in the entry's history.
7. **Given** at least one answered question with the rest unanswered or the
   user needing time, **When** the tool responds, **Then** it offers saving
   the whole entry as a draft or approving a rewrite built from the answers
   provided so far.

---

### User Story 3 - Incremental Re-Analysis and Before/After Comparison (Priority: P3)

The tool re-analyzes only new or edited bullets; unchanged bullets keep their
previous score and status label (new / edited / analyzed). The tool can always
be run again on a fixed experience. The tool shows before and after scores
side by side so the effect of the user's decision is visible.

**Why this priority**: Keeps repeat runs cheap during iterated prototype
sessions with real users, and makes the improvement measurable.

**Independent Test**: Take an experience with 3 scored bullets, edit one, rerun,
and verify only the edited bullet is re-analyzed while the other two keep their
previous score and label; then verify the side-by-side before/after view.

**Acceptance Scenarios**:

1. **Given** a fixed experience, **When** it is run 5 consecutive times with no
   change, **Then** at least 90% of bullet-by-dimension scores are exactly the
   same across the runs, and no bullet is re-analyzed.
2. **Given** 3 scored bullets, **When** the user edits 1 and reruns, **Then**
   only that bullet is re-analyzed; the other 2 keep score and label.
3. **Given** at least one approved rewrite in an experience, **When** the
   results view is opened, **Then** before/after scores are displayed side by
   side.

---

### User Story 4 - Merge Warning for Overlapping Bullets (Priority: P4)

When two or more bullets in one experience overlap (the same subject is
repeated; each new bullet is compared with all existing bullets), the tool
shows a "merge" suggestion. The warning never affects any score, and nothing
is ever merged without the user's explicit confirmation.

**Why this priority**: A useful quality signal, but the smallest part of the
value loop; recording, scoring, and rewriting come first, so this can land last
in the iteration.

**Independent Test**: Take an experience with two overlapping bullets, verify the
warning appears, verify all scores are unchanged, and verify that rejecting (or
ignoring) the merge leaves both bullets intact.

**Acceptance Scenarios**:

1. **Given** an experience with two overlapping bullets, **When** it is analyzed,
   **Then** a merge warning is displayed.
2. **Given** a merge warning, **Then** no bullet score, entry score, or
   overall score changes because of it.
3. **Given** a merge warning, **When** the user does not confirm a merge, **Then**
   no bullet text or history changes.

---

### User Story 5 - Match Experience Entries Against a Pasted Job Description (Priority: P2)

The user pastes a job description (Persian or English text). The tool fully
analyzes the posting, classifying each extracted requirement by type (hard
skill or soft skill) and priority (Required / Preferred / Bonus; any red-line
requirement is classified as Required). It then assigns exactly one action to
each experience entry — "Highlight", "No change", or "Not relevant to this
job" — each with a one-line reason that references the extracted skill (type +
priority) the action is based on. The actions "Remove" and "Shorten" do not
exist; the tool never recommends removing an entry, and the job seeker decides
what to do. Matcher output has zero effect on any clarity score.

**Why this priority**: The matcher answers the selection problem ("which
experience matters for this posting?") and is independent of the improvement
loop; it consumes recorded entries but needs no scores.

**Independent Test**: Paste a fixed posting with known hard/soft and
Required/Preferred/Bonus requirements against two prepared entries and verify
every entry receives exactly one action with a reason citing a skill's type +
priority, and that all clarity scores are unchanged.

**Acceptance Scenarios**:

1. **Given** a pasted job description and recorded entries, **When** the
   matcher runs, **Then** every entry receives exactly one of "Highlight" /
   "No change" / "Not relevant to this job", with no entry omitted, and
   neither "Remove" nor "Shorten" ever appears.
2. **Given** a "Highlight" action, **Then** the reason identifies the extracted
   skill it refers to, including its type and priority.
3. **Given** a "No change" action, **Then** the reason explains why the entry
   is sufficient as written (for example, it only partly relates to a
   "Preferred" or "Bonus" skill).
4. **Given** a "Not relevant to this job" action, **Then** a short reason is
   provided, and the tool does not suggest removing the entry.
5. **Given** any matcher output, **Then** no clarity score (bullet, entry, or
   overall) changes because of it.

---

### Edge Cases

- **More than 6 bullets**: not accepted; an explicit English message asks the
  user to reduce and combine bullets; nothing is scored until the count is ≤ 6.
- **Zero bullets**: entry stays a draft, is excluded from the overall score, and
  the tool suggests writing a description bullet.
- **Incomplete answers or user needs time**: after at least one answered
  question, the tool offers saving the whole entry as a draft or approving a
  rewrite from the answers provided so far; nothing is invented.
- **Invalid or incomplete scoring output**: the tool rejects that output, shows
  a clear English message, keeps the user's data intact, retries the scoring,
  and only reports a persistent failure explicitly; nothing is scored from
  invalid or partially missing data.
- **Non-English input**: bullets or answers containing Persian (or other
  non-English text) are not accepted; the tool shows an explicit English
  message and never translates on the user's behalf.
- **Unchanged bullet text**: the text is stored, displayed, and scored exactly as
  written — no reshaping, even after later steps in the flow.
- **Overall score with no eligible entries**: if no experience has bullets, the
  overall score is not displayed rather than shown as a misleading zero.
- **Session interrupted mid-path**: the user can stop at any point; the entry and
  its state survive locally as-is, and the session is logged as incomplete with a
  timestamp (start is logged, no completion event).
- **Bullet still improvable after its one question round**: after re-analysis
  the bullet keeps its status label and current scores; the tool does not
  automatically re-ask it in the same run; running the improvement path again
  later resumes with fresh questions, as allowed for any analyzed bullet.
- **Deleted bullets or entries**: after confirmation, deleted items disappear
  from all future scores and the overall average; a surviving entry that drops
  to zero bullets is treated as a draft again; already-published rewrite history
  of surviving bullets is untouched.
- **Job posting absent or changed**: shown/hidden/modified postings have zero
  effect on any displayed clarity score; only matcher actions change.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let the user record an experience entry with a
  type (job, project, course, or side work), a title, and 1 to 6 free-text
  bullets. An entry stores no organization or start/end fields.
- **FR-002**: The system MUST refuse to record an entry with more than 6 bullets
  and show an explicit English message asking the user to reduce or combine
  them.
- **FR-003**: The system MUST treat an entry with zero bullets as a draft, AND
  MUST let the user save the whole entry as a draft when they need time to
  think or have answered questions only partially. Drafts MUST be excluded
  from the overall score, and the tool MUST suggest writing a description
  bullet for a zero-bullet entry.
- **FR-004**: Bullets MUST be free text stored exactly as the user wrote them.
  The "Context → Action → Result" pattern MUST be used only to organize the
  sentence structure of a proposed rewrite; it MUST NOT appear as stored
  fields, and the tool MUST never fill or invent content for any part of a
  bullet. The message "If you have real numbers, include them" MUST be part of
  the Result question, not a separate prompt.
- **FR-005**: The system MUST score each bullet on the three fixed dimensions —
  Context, Role and Action Clarity, Result — on a 0/1/2 scale, and MUST show
  the per-dimension score of each bullet, the entry score (0–100), and the
  overall score. For the Result dimension, a specific qualitative result
  scores 2 and a vague result scores 1; personal learning without an
  observable change scores 1.
- **FR-006**: Scoring MUST be fully independent of any job posting: no part of
  the scoring path (evaluator or numeric computation) may receive a job
  posting as input, and displayed scores MUST NOT change when a posting is
  added, changed, or removed.
- **FR-007**: Scores MUST follow the fixed formula: dimension score = sum of
  the bullet scores in that dimension ÷ (2 × number of bullets) × 100; entry
  score = average of the three dimension scores (equally weighted); overall
  score = simple average of the entries that contain at least one bullet and
  are not drafts. The reference example (two bullets: Role and Action Clarity
  (2,2), Result (2,1), Context (2,1) → 83.33) MUST reproduce exactly.
- **FR-008**: All score arithmetic MUST be computed by deterministic code, never
  delegated to the evaluator model; the model returns only the 0/1/2 rating per
  dimension per bullet. The rubric version MUST be recorded next to every
  displayed score; any rubric change MUST produce a new rubric version (the
  three-dimension rubric is rubric_version 2).
- **FR-009**: Analysis MUST run before any questions. For each bullet the
  system MUST first ask "Do you want to rewrite this bullet to make your
  experience stronger?" with default answer Yes. If the user accepts, the
  system MUST ask exactly one question for each of that bullet's dimensions
  scoring 0 or 1 (Context, Role and Action Clarity, Result, in that order) —
  0 to 3 questions — and the user MUST be able to skip any question. If the
  user answers some but not all questions, or needs time to think, the system
  MUST offer saving the whole entry as a draft or approving a rewrite built
  only from the answers already provided. Rejection of the gate, skipping all
  questions, or giving no answer MUST NOT block the flow and MUST result in no
  rewrite for that bullet. The tool MUST open at most one question round per
  bullet per improvement run, and MUST NOT automatically start another round
  for the same bullet after an approved rewrite and re-analysis.
- **FR-010**: Every proposed rewrite MUST be built only from the words and
  information of the original bullet and the user's answers. A rewrite MUST NOT
  contain any number, impact, or claim that is not present in the original
  bullet or the user's answers. No answer or rejected question MUST result in
  no rewrite. This rule applies equally when the rewrite follows the
  Context → Action → Result pattern.
- **FR-011**: The system MUST replace a bullet only on the user's explicit
  approval; on approval the new bullet carries status "edited" and the previous
  bullet MUST be retained in that entry's history; on rejection nothing changes.
  No text may change without explicit user confirmation.
- **FR-012**: The system MUST re-analyze only new or edited bullets; unchanged
  bullets MUST keep their previous score and status label (new / edited /
  analyzed), with these exact label semantics: "new" exists only until the
  bullet's first successful analysis, after which it becomes "analyzed"; a
  post-analysis change (approved rewrite or direct user edit) flips the label
  to "edited" until re-analysis completes, and "edited" returns to "analyzed"
  once re-analysis succeeds; if analysis fails, the bullet keeps its prior
  label. The user MUST be able to edit the text of an existing bullet
  directly; a directly edited bullet MUST carry the status "edited" and be
  re-analyzed exactly like an edit produced by an approved rewrite. The results
  view MUST show before and after scores side by side.
- **FR-013**: When two or more bullets in an entry overlap (each new bullet is
  compared with all existing bullets), the system MUST show a merge warning.
  The warning MUST NOT affect any score, and no merge may happen without the
  user's explicit confirmation.
- **FR-014**: When scoring output is invalid or incomplete, the system MUST
  reject it, show a clear English message, keep all user data intact, and
  retry; if it still fails, it MUST report the problem instead of scoring
  silently. User data MUST never be lost.
- **FR-015**: The system MUST log all important events with timestamps: path
  start, completion of an entry analysis, acceptance of a suggestion,
  rejection of a suggestion, score before, and score after.
- **FR-016**: The system MUST support repeated runs on a fixed experience:
  across 5 consecutive runs on an unchanged entry, at least 90% of
  bullet-by-dimension scores MUST be exactly the same.
- **FR-017**: All tool text MUST be in English at B1 level. All user input —
  including bullets and answers to questions — MUST be in English; the system
  MUST NOT accept Persian input and MUST NOT translate user text. Bullet text
  MUST be stored and displayed exactly as written, unchanged.
- **FR-018**: The system MUST store all user data locally; MUST NOT require
  login, uploading of files, or any transmission of user data to an external
  service in this version. PDF upload with email sign-in is explicitly
  deferred to a later version (decision 2026-10-25).
- **FR-019**: The system MUST offer only text copying for the individual
  experience (no resume file export), and MUST NOT include any out-of-scope
  capability: PDF upload, email login, portfolio, sending to employers or ATS,
  a graphical interface, non-product-management fields, or creating
  experiences or numbers on behalf of the user.
- **FR-020**: The system MUST let the user delete individual bullets and whole
  entries, but only after an explicit confirmation step. From the moment of
  deletion, deleted bullets and entries MUST be excluded from experience scores,
  the overall score, and the merge analysis; each deletion MUST be logged with a
  timestamp, and the rewrite history of surviving bullets MUST remain intact.
  An entry that loses its last bullet through deletion MUST revert to draft
  treatment.
- **FR-021**: The system MUST accept a pasted job description (Persian or
  English text) and fully analyze it, classifying each extracted requirement
  by type (hard skill or soft skill) and priority (Required / Preferred /
  Bonus); any red-line requirement MUST be classified as Required.
- **FR-022**: The matcher MUST assign exactly one action per experience entry —
  "Highlight", "No change", or "Not relevant to this job" — each with a
  one-line reason referring to an extracted skill (type + priority). The
  actions "Remove" and "Shorten" MUST NOT exist, the tool MUST NOT recommend
  removing an entry, and matcher output MUST have zero effect on any clarity
  score.

### Out of Scope (this version)

UI and Persian interface (version 1 is an English text-based terminal flow;
both are planned for later versions); Persian resumes and Persian user input;
PDF upload and email sign-in (deferred to a later version by decision
2026-10-25); portfolio; sending to employers or ATS; resume file export (only
copying the text of each experience is allowed); fields other than product
management; creating experience or numbers for the user; interview stage and
practice; human advisors or coaching. "Remove" and "Shorten" matcher actions
do not exist in this version.

### Key Entities *(include if feature involves data)*

- **Experience entry (ExperienceEntry)**: One experience the user is narrating.
  Attributes: type (job / project / course / side work), title, 1 to 6
  free-text English bullets, draft flag (no bullets, or user saved as draft →
  excluded from average), entry score and the rubric version it was computed
  with, source (manual in this version), and overlap-warning state.
- **Bullet (Bullet)**: One numbered free-text description point of an
  experience. Attributes: exact text as written; three per-dimension ratings
  (context, role_action_clarity, result) with their rubric version; status
  (new = captured, awaiting first successful analysis / edited = changed after
  an earlier analysis, awaiting re-analysis / analyzed = current analysis
  reflected in scores); the questions asked with answer or skip and
  timestamps; the rewrite proposals with their decision (approved / rejected)
  and timestamps; a history entry preserved for every replaced bullet.
- **Suggestion (Suggestion)**: One recommendation shown to the user: type
  (rewrite / merge / matcher action), displayed content, decision (approved /
  rejected / awaiting / unanswered), and decision timestamp.
- **Job requirement (JobRequirement)**: One skill extracted from the pasted
  posting: text, type (hard / soft skill), priority (Required / Preferred /
  Bonus; red-line grouped under Required).
- **Match action (MatchAction)**: The per-entry matcher output: exactly one of
  Highlight / No change / Not relevant to this job, a one-line reason citing a
  JobRequirement (type + priority), and the entry it applies to.
- **Log event (LogEvent)**: One important system event: event type (path start,
  analysis completion, suggestion accepted / rejected, score before / after),
  ISO-8601 timestamp, and details (which entry / bullet, numeric before-after
  scores) — structured so PRD metrics can be computed later without a rewrite.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A real entry-level job seeker can complete one full improvement
  path (record → score → gate → question/answer → approved rewrite →
  incremental re-analysis) in a single session; the session is measurable
  end-to-end from the logged events.
- **SC-002**: For the reference example — two bullets with Role and Action
  Clarity (2,2), Result (2,1), Context (2,1) — the entry score equals exactly
  83.33, and stays exactly 83.33 on every run under rubric_version 2.
- **SC-003**: Across 5 consecutive runs on an unchanged experience, at least
  90% of bullet-by-dimension scores are exactly the same (verified from
  recorded runs).
- **SC-004**: 100% of approved rewrites contain no number, impact, or claim that
  is absent from the original bullet plus the user's answers (zero-tolerance
  check; any violation is classified as a bug, not a weakness).
- **SC-005**: In 100% of rejected-gate / skipped-question / no-answer scenarios,
  the bullet text and scores are byte-identical before and after (verified from
  logs and stored text).
- **SC-006**: 100% of unchanged bullets keep their previous score and status
  label across re-runs; 0 unchanged bullets are re-analyzed (verified from
  logs).
- **SC-007**: For every approved rewrite, the score after is recorded and
  displayed next to the score before under the same rubric version, making the
  numeric effect of the user's decision visible.
- **SC-008**: 100% of important events (start, completion, suggestion acceptance
  and rejection, score before and after) are logged with timestamps; a missing
  event type in the log means the feature is treated as incomplete.
- **SC-009**: For every matched experience entry, the matcher output contains
  exactly one action with a reason citing an extracted skill (type + priority);
  no clarity score changes because of matcher output.

## Assumptions

- The user is the sole operator; all data stays local, with no login and no
  network dependency in this version (PDF upload and email sign-in are
  deliberately deferred).
- The interface and all user input are English (B1-level tool text); the
  Persian UI and Persian resumes are later-version work.
- "A question is needed" for a bullet is defined, under rubric_version 2, as:
  the bullet's Context, Role and Action Clarity, or Result dimension scores 0
  or 1 — exactly one question per deficient dimension, 0–3 per bullet, asked
  in Context, Action, Result order. This definition is part of the rubric and
  recorded in the rubric version shown next to scores.
- Overlap detection for the merge warning is a reviewer-style judgment captured
  during scoring; its exact threshold is a planning-phase decision and, once
  fixed, lives in the rubric version (a threshold change then requires a new
  rubric version).
- Timestamps are ISO 8601, so PRD metrics can be computed later without a
  rewrite.
- The scoring formula and the 83.33 reference example are fixed while
  rubric_version 2 is unchanged; any formula or rubric change requires a new
  rubric version recorded next to scores.
- Matcher requirement extraction and action assignment are language-model
  assisted but their output (types, priorities, actions, reasons) is
  validated, structured data; the matcher never modifies entry or bullet text.
