# Feature Specification: Help Entry-Level Job Seekers Narrate Their Experience (Level 1 Prototype)

**Feature Branch**: `001-experience-improvement-flow`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "A text-flow prototype (no graphical interface) that guides an entry-level product manager job seeker through one complete path for improving a single experience entry. The user adds an experience entry (type: job, project, course, side work; title; optional organization/context; optional start and end as written; and 1–6 free-text bullets) and may optionally draft each bullet with a context → action → result template that is only a writing aid. The tool scores each bullet on four dimensions (0/1/2), shows experience and overall scores independent of any job posting, asks 1–2 rejectable questions per improvable bullet, proposes rewrites built only from the bullet and the user's answers, replaces a bullet only on explicit approval (status 'edited', history retained), re-analyzes only new or edited bullets, shows before/after scores side by side, and warns about overlapping bullets (merge suggestion; no score impact; no merge without confirmation). Full acceptance criteria in this document and in the project constitution."

**Language note**: The tool's interface and user-facing messages are in Persian
(constitution, Principle 10). Bullet text is stored and displayed exactly as the
user wrote it, in whatever language they chose; the resume itself is not targeted
to Persian (a Persian-language resume as target is out of scope for this version).
Statuses and entity names below give the Persian working term with the English
term in parentheses on first use.

## Clarifications

### Session 2026-10-23

- Q: After an approved rewrite and re-analysis, if the bullet still has room for
  improvement, does the tool open another question round for that bullet in the
  same run? → A: No. At most one question round (1–2 questions) per bullet per
  improvement run; after re-analysis the tool does NOT automatically re-ask the
  same bullet in the same run — the user can rerun the improvement path later
  (constitution, Principle 8).
- Q: Can the user directly edit an existing bullet's text themselves, or can
  text only change through an approved rewrite proposal? → A: The user can edit
  any bullet's text directly. A directly edited bullet is marked "edited" and
  re-analyzed exactly like an edit produced by an approved rewrite. This is part
  of "no text changes without the user's explicit confirmation": the user's own
  edit IS the explicit act; the tool still never changes text on its own.
- Q: Can the user delete a bullet or a whole experience entry from saved data?
  → A: Yes, both — but only after an explicit confirmation step. From the moment
  of deletion the deleted items are excluded from all scores (including the
  overall average), the deletion is logged with a timestamp, and the rewrite
  history of surviving bullets stays intact. If deleting the last bullet leaves
  an entry with zero bullets, the entry reverts to draft treatment (constitution,
  Principles 2 and 7).
- Q: Which status label does a brand-new bullet carry right after its first
  successful scoring — "analyzed" immediately, or "new" until user interaction?
  → A: "new" exists only until the bullet's first successful analysis, after
  which it becomes "analyzed". A post-analysis change (an approved rewrite or a
  direct user edit) flips the label to "edited" until re-analysis completes, and
  "edited" returns to "analyzed" once re-analysis succeeds. If analysis fails or
  has not run, the bullet keeps "new" or whatever it had before the change.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record an Experience and See a Transparent Score (Priority: P1)

The user records one of their experiences for the job application: the experience
type (job, project, course, side work), a title, an optional organization or
context, an optional start and end (stored exactly as written), and 1 to 6
free-text bullets. While writing, the user may optionally use the
"context → action → result" template as a writing aid: the tool never fills an
empty field, the final bullet stays free text, and next to the "result" field only
one message appears (in Persian): «اگر عدد واقعی داری، همان را اضافه کن».
After recording, the tool scores each bullet on four dimensions — role and action
clarity, outcome, evidence of product manager skills, structure and scannability —
each 0, 1, or 2, and shows the per-dimension score of every bullet, the experience
score (0–100), and the overall score across the entries that have bullets.

**Why this priority**: Nothing else in the path works without an entry and a
transparent score: scoring is the input to questions, rewrites, and the
before/after comparison. This story alone is a usable MVP: the user records a real
experience and receives an explainable, posting-independent score.

**Independent Test**: Record one experience with two bullets and verify the
four per-dimension scores, the experience score, and the exact reproduction of the
constitutional reference example (81.25). Needs nothing else from later stories.

**Acceptance Scenarios**:

1. **Given** a fresh tool with no data, **When** the user records an experience
   with type, title, and 2 bullets, **Then** the per-dimension score of each
   bullet, the experience score computed by the fixed formula, and the overall
   score are displayed.
2. **Given** the constitutional reference example (two bullets with scores
   (2,2), (2,1), (2,0), (2,2)), **When** the score is computed, **Then** the
   experience score is exactly 81.25.
3. **Given** a fixed experience, **When** there is no job posting, or a job
   posting later changes, **Then** every displayed score stays identical.
4. **Given** the user drafts a bullet with the writing template and leaves the
   "result" field empty, **Then** the tool fills nothing, invents nothing, and the
   final bullet remains free text exactly as the user wrote it.
5. **Given** an entry saved with zero bullets, **Then** the entry is kept as a
   draft, is excluded from the overall score, and the tool suggests writing a
   description bullet.

---

### User Story 2 - Question, Answer, Proposed Rewrite, Explicit Approval (Priority: P2)

For each bullet with room for improvement, the tool asks 1 to 2 questions (for
example: "Did this project change something in an output or for someone?").
The user can reject any question. If the user answers, the tool proposes a rewrite
for that bullet built only from the words and information in that bullet and the
user's answers — no invented numbers, impacts, or claims. With no answer, or if
the question is rejected, there is no rewrite and the original bullet stays
untouched. The proposal requires the user's explicit decision: on approval the
new bullet replaces the old one with status "edited" and the previous bullet stays
in history; on rejection nothing changes.

**Why this priority**: Improvement is the product's purpose. Without this loop the
tool is a scorer, not a coach. It depends on Story 1's scores but is fully testable
once Story 1 exists.

**Independent Test**: On a recorded experience, walk question → answer → proposal
→ approve and verify the replaced bullet with status "edited" and history
retained; separately walk a rejected question and verify nothing changed.

**Acceptance Scenarios**:

1. **Given** a recorded experience, **When** a bullet has room for improvement,
   **Then** the tool asks 1 to 2 questions for that bullet, and at most 2 for any
   single bullet.
2. **Given** a question, **When** the user rejects it, **Then** no rewrite is
   proposed, the bullet is unchanged, and the tool continues the path without
   logging this as an error.
3. **Given** a question left unanswered, **Then** no rewrite is proposed and the
   bullet is unchanged.
4. **Given** the user's answer, **When** a rewrite is proposed, **Then** every
   number, impact, and claim in the proposal comes from the original bullet or
   the user's answers, and nothing else.
5. **Given** a proposed rewrite, **When** the user rejects it, **Then** the bullet
   text and its scores remain exactly as before.
6. **Given** a proposed rewrite, **When** the user approves it, **Then** the new
   bullet replaces the old one, its status becomes "edited", and the previous
   bullet is retained in the entry's history.

---

### User Story 3 - Incremental Re-Analysis and Before/After Comparison (Priority: P3)

The tool re-analyzes only new or edited bullets; unchanged bullets keep their
previous score and status label (new / edited / analyzed). The tool can always be
run again on a fixed experience. The tool shows before and after scores side by
side so the effect of the user's decision is visible.

**Why this priority**: Keeps repeat runs cheap during iterated prototype sessions
with real users, and makes the improvement measurable (supports constitution
Principles 5 and 7).

**Independent Test**: Take an experience with 3 scored bullets, edit one, rerun,
and verify only the edited bullet is re-analyzed while the other two keep their
previous score and label; then verify the side-by-side before/after view.

**Acceptance Scenarios**:

1. **Given** a fixed experience, **When** it is run 5 consecutive times with no
   change, **Then** the maximum minus minimum overall score across the runs is
   at most 5 points, and no bullet is re-analyzed.
2. **Given** 3 scored bullets, **When** the user edits 1 and reruns, **Then**
   only that bullet is re-analyzed; the other 2 keep score and label.
3. **Given** at least one approved rewrite in an experience, **When** the results
   view is opened, **Then** before/after scores are displayed side by side.

---

### User Story 4 - Merge Warning for Overlapping Bullets (Priority: P4)

When two or more bullets in one experience overlap (the same subject is
repeated), the tool shows a "merge" suggestion. The warning never affects any
score, and nothing is ever merged without the user's explicit confirmation.

**Why this priority**: A useful quality signal, but the smallest part of the
value loop; recording, scoring, and rewriting come first, so this can land last
in the iteration.

**Independent Test**: Take an experience with two overlapping bullets, verify the
warning appears, verify all scores are unchanged, and verify that rejecting (or
ignoring) the merge leaves both bullets intact.

**Acceptance Scenarios**:

1. **Given** an experience with two overlapping bullets, **When** it is analyzed,
   **Then** a merge warning is displayed.
2. **Given** a merge warning, **Then** no bullet score, experience score, or
   overall score changes because of it.
3. **Given** a merge warning, **When** the user does not confirm a merge, **Then**
   no bullet text or history changes.

---

### Edge Cases

- **More than 6 bullets**: not accepted; an explicit Persian message asks the
  user to reduce and combine bullets; nothing is scored until the count is ≤ 6.
- **Zero bullets**: entry stays a draft, is excluded from the overall score, and
  the tool suggests writing a description bullet.
- **Invalid or incomplete scoring output**: the tool rejects that output, shows a
  clear Persian message, keeps the user's data intact, retries the scoring, and
  only reports a persistent failure explicitly; nothing is scored from invalid
  or partially missing data.
- **Empty optional fields** (organization, dates, template fields): remain
  visibly empty as-is; they are never guessed and never filled with invented data.
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
  effect on any displayed score.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let the user record an experience entry with a type
  (job, project, course, or side work), a title, an optional organization or
  context, an optional start and end stored exactly as written, and 1 to 6
  free-text bullets.
- **FR-002**: The system MUST refuse to record an entry with more than 6 bullets
  and show an explicit Persian message asking the user to reduce or combine them.
- **FR-003**: The system MUST keep an entry with zero bullets as a draft, exclude
  it from the overall score, and suggest writing a description bullet.
- **FR-004**: The system MUST offer the "context → action → result" template as an
  optional writing aid only. The tool MUST NOT fill any empty field. The final
  bullet MUST remain free text stored exactly as the user wrote it. Next to the
  "result" field, exactly one message MUST appear: «اگر عدد واقعی داری، همان را
  اضافه کن».
- **FR-005**: The system MUST score each bullet on the four fixed dimensions —
  role and action clarity, outcome, evidence of product manager skills, structure
  and scannability — on a 0/1/2 scale, and MUST show the per-dimension score of
  each bullet, the experience score (0–100), and the overall score.
- **FR-006**: Scoring MUST be fully independent of any job posting: no part of the
  scoring path (evaluator or numeric computation) may receive a job posting as
  input.
- **FR-007**: Scores MUST follow the fixed constitution formula: dimension score
  = sum of the bullet scores in that dimension ÷ (2 × number of bullets) × 100;
  experience score = equal-weighted average of the four dimensions; overall score
  = simple average of the experiences that have bullets. The reference example
  ((2,2), (2,1), (2,0), (2,2) → 81.25) MUST reproduce exactly.
- **FR-008**: All score arithmetic MUST be computed by deterministic code, never
  delegated to the evaluator model; the model returns only the 0/1/2 rating per
  dimension per bullet (constitution, Principle 4). The rubric version MUST be
  recorded next to every displayed score; any rubric change MUST produce a new
  rubric version.
- **FR-009**: For each bullet with room for improvement the system MUST ask 1 to
  2 questions, and the user MUST be able to reject any question. Rejection or no
  answer MUST NOT block the flow, and MUST result in no rewrite for that bullet.
  The tool MUST open at most one question round per bullet per improvement run,
  and MUST NOT automatically start another round for the same bullet after an
  approved rewrite and re-analysis.
- **FR-010**: Every proposed rewrite MUST be built only from the words and
  information of the original bullet and the user's answers. A rewrite MUST NOT
  contain any number, impact, or claim that is not present in the original bullet
  or the user's answers. No answer or rejected question MUST result in no rewrite.
- **FR-011**: The system MUST replace a bullet only on the user's explicit
  approval; on approval the new bullet carries status "edited" and the previous
  bullet MUST be retained in that entry's history; on rejection nothing changes.
  No text may change without explicit user confirmation.
- **FR-012**: The system MUST re-analyze only new or edited bullets; unchanged
  bullets MUST keep their previous score and status label (new / edited /
  analyzed), with these exact label semantics: "new" exists only until the
  bullet's first successful analysis, after which it becomes "analyzed"; a
  post-analysis change (approved rewrite or direct user edit) flips the label to
  "edited" until re-analysis completes, and "edited" returns to "analyzed" once
  re-analysis succeeds; if analysis fails, the bullet keeps its prior label.
  The user MUST be able to edit the text of an existing bullet
  directly; a directly edited bullet MUST carry the status "edited" and be
  re-analyzed exactly like an edit produced by an approved rewrite. The results
  view MUST show before and after scores side by side.
- **FR-013**: When two or more bullets in an experience overlap, the system MUST
  show a merge warning. The warning MUST NOT affect any score, and no merge may
  happen without the user's explicit confirmation.
- **FR-014**: When scoring output is invalid or incomplete, the system MUST reject
  it, show a clear Persian message, keep all user data intact, and retry; if it
  still fails, it MUST report the problem instead of scoring silently. User data
  MUST never be lost.
- **FR-015**: The system MUST log all important events with timestamps: path
  start, completion of an experience analysis, acceptance of a suggestion,
  rejection of a suggestion, score before, and score after.
- **FR-016**: The system MUST support repeated runs on a fixed experience; 5
  consecutive runs on an unchanged experience MUST differ by at most 5 points
  (max minus min).
- **FR-017**: All interface and user-facing messages MUST be in Persian; the
  bullet text MUST be stored and displayed exactly as written, unchanged.
- **FR-018**: The system MUST store all user data locally; MUST NOT require login,
  uploading of files, or any transmission of user data to an external service
  (constitution, Principle 8).
- **FR-019**: The system MUST offer only text copying for the individual
  experience (no resume file export), and MUST NOT include any out-of-scope
  capability: posting matching or analysis, PDF upload, email login, portfolio,
  sending to employers or ATS, a graphical interface, non-product-management
  fields, or creating experiences or numbers on behalf of the user.
- **FR-020**: The system MUST let the user delete individual bullets and whole
  entries, but only after an explicit confirmation step. From the moment of
  deletion, deleted bullets and entries MUST be excluded from experience scores,
  the overall score, and the merge analysis; each deletion MUST be logged with a
  timestamp, and the rewrite history of surviving bullets MUST remain intact.
  An entry that loses its last bullet through deletion MUST revert to draft
  treatment.

### Out of Scope (this version)

Matching against job postings and job posting analysis; PDF upload; email login;
portfolio; Persian-language resume as a target; sending to employers or ATS;
resume file export (only copying the text of each experience is allowed);
graphical interface; fields other than product management; creating experience
or numbers for the user. Building any of these requires a constitution revision
first.

### Key Entities *(include if feature involves data)*

- **Experience entry (ExperienceEntry)**: One experience the user is narrating.
  Attributes: type (job / project / course / side work), title, organization or
  context (optional), start and end (optional, as written), 1 to 6 free-text
  bullets, draft flag (no bullets → draft, excluded from average), overall score
  and the rubric version it was computed with.
- **Bullet (Bullet)**: One numbered free-text description point of an experience.
  Attributes: exact text as written; four per-dimension ratings with their rubric
  version; status (new = captured, awaiting first successful analysis /
  edited = changed after an earlier analysis, awaiting re-analysis /
  analyzed = current analysis reflected in scores); the questions asked with answer or
  rejection and timestamps; the rewrite proposals with their decision (approved /
  rejected) and timestamps; a history entry preserved for every replaced bullet.
- **Suggestion (Suggestion)**: One recommendation shown to the user: type
  (rewrite / merge), displayed content, decision (approved / rejected / awaiting /
  unanswered), and decision timestamp.
- **Log event (LogEvent)**: One important system event: event type (path start,
  analysis completion, suggestion accepted / rejected, score before / after),
  ISO-8601 timestamp, and details (which entry / bullet, numeric before-after
  scores) — structured so PRD metrics can be computed later without a rewrite.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A real entry-level job seeker can complete one full improvement
  path (record → score → question/answer → approved rewrite → incremental
  re-analysis) in a single session; the session is measurable end-to-end from
  the logged events.
- **SC-002**: For the reference example — two bullets scored (2,2), (2,1),
  (2,0), (2,2) — the experience score equals exactly 81.25, and stays exactly
  81.25 on every run under the same rubric version.
- **SC-003**: Across 5 consecutive runs on an unchanged experience, the maximum
  minus minimum overall score is at most 5 points (verified from logged scores).
- **SC-004**: 100% of approved rewrites contain no number, impact, or claim that
  is absent from the original bullet plus the user's answers (zero-tolerance
  check; any violation is classified as a bug, not a weakness).
- **SC-005**: In 100% of rejected-question / no-answer scenarios, the bullet text
  and scores are byte-identical before and after (verified from logs and stored
  text).
- **SC-006**: 100% of unchanged bullets keep their previous score and status
  label across re-runs; 0 unchanged bullets are re-analyzed (verified from logs).
- **SC-007**: For every approved rewrite, the score after is recorded and
  displayed next to the score before under the same rubric version, making the
  numeric effect of the user's decision visible.
- **SC-008**: 100% of important events (start, completion, suggestion acceptance
  and rejection, score before and after) are logged with timestamps; a missing
  event type in the log means the feature is treated as incomplete (constitution,
  Principle 7).

## Assumptions

- The user is the sole operator; all data stays local, with no login and no
  network dependency (constitution, Principle 8).
- The interface language is Persian; bullet text may be in any language and is
  stored and displayed exactly as written (Persian-language resume as a target
  is out of scope for this version).
- "Room for improvement" for question selection is defined, for Level 1, as: a
  bullet whose "outcome" dimension is below 2 (vague or absent outcome), or whose
  "evidence of product manager skills" dimension is below 2. This definition is
  part of the rubric and recorded in the rubric version shown next to scores.
- The concurrent question cap per bullet is 1–2 questions; which questions are
  asked is determined from the same rubric that produced the scores (e.g., an
  outcome gap asks a result-impact question, a skills gap asks a relevance
  question); exact question wording is generated at run time in Persian.
- Overlap detection for the merge warning is a reviewer-style judgment captured
  during scoring; its exact threshold is a planning-phase decision and, once
  fixed, lives in the rubric version (a threshold change then requires a new
  rubric version).
- Timestamps are ISO 8601, so PRD metrics can be computed later without a
  rewrite (constitution, Principle 7).
- The scoring formula and the 81.25 reference example are fixed while the rubric
  version is unchanged; any formula or rubric change requires a new rubric
  version recorded next to scores (constitution, Principles 4 and 9).
