
## Spec 1: Job Description Matcher (JD Matcher)

**Goal:** By fully analyzing the job description and the candidate’s experience entries, assign one action to each entry: “Highlight,” “Keep as is,” or “Shorten,” with a one-line reason. The candidate decides whether to remove an entry; the tool does not recommend removing it.

### Acceptance Criteria

- When given a job description and experience entries, the output contains exactly one of the three actions—“Highlight / Keep as is / Shorten”—for every input entry, with no entry omitted. The action “Remove” does not exist.
- Each action has a one-line reason.
  - **“Highlight”:** The entry relates to a skill extracted from the job description and should be highlighted. The reason identifies the skill it refers to (type + priority).
  - **“Keep as is”:** The entry is relevant but does not need to be highlighted (for example, it is only partly related to a “Preferred” or “Bonus” skill). The reason explains why it is sufficient as written.
  - **“Shorten”:** The entry has little or no connection to the job description’s skills. A short reason is provided.
- The first stage is a full analysis of the job description, not just its hard skills and soft skills. Each skill is extracted and reported along two dimensions: type (hard skill or soft skill) and priority (Required / Preferred / Bonus, meaning must have / should have / nice to have). “Red line” requirements are grouped under “Required.”
- In the second stage, each action refers to a skill extracted in the first stage (using the type + priority pair), and the reason for the action refers to that skill.
- In V1, all tool text (reasons and messages) is in English at B1 level, and the flow runs in the terminal. Persian language support and a UI will be added in later versions.

### Out of Scope (Proposed)

- Rewriting experience entries (this is done only in Feature 3 and only after user approval).
- Scoring resume quality (belongs to Feature 3).
- Creating a final resume or submitting it to a job posting.

---

## Spec 2: Rewriting a Bullet Using the “Context → Action → Result” Pattern

**Goal:** Rewrite a bullet using only the user’s words, following the Context → Action → Result pattern to organize the sentence. A bullet is free text, and the user does not fill in separate fields.

### Acceptance Criteria

- First, the tool asks the candidate: “Do you want me to rewrite this bullet to make your experience stronger?” The default answer is “Yes.” If the answer is “No,” there are no questions and no rewrite.
- The tool reviews the bullet using the Context → Action → Result pattern and asks exactly one question for each missing part, in this order: context, action, result. The context question is asked when context is missing from the bullet. The action or result question is asked when the “Role and Action Clarity” or “Result” dimension (Spec 3) scores 0 or 1. Therefore, there are 0 to 3 questions.
- Question text:
  - **Context:** “What was the situation? For example, what project, team, or problem was it about?”
  - **Action:** “What exactly did you do? What was your role?”
  - **Result:** “What changed after your work? Who did it help, or what result did it lead to? If you have real numbers, include them.”
- The message “If you have real numbers, include them” is part of the result question, not a separate field prompt. The candidate can skip any question.
- If all three parts are complete (context is present, and both the action and result dimensions score 2), no questions are asked. The candidate is only asked to confirm the bullet at the end.
- If the candidate answers at least one question and leaves the others unanswered, or needs time to think, the tool offers two options: save the experience entry as a draft, or confirm a rewrite using the answers provided so far. Example message: “Do you want to save this entry as a draft, or confirm a rewrite with your answers so far?”
- A rewrite is made only after the candidate approves it and uses only their own words. The pattern only organizes the sentence; it does not add new content, numbers, or impact (the “no extra claims” rule in Feature 3).
- If the candidate does not answer or skips all questions, no rewrite is made.
- In V1, all tool text is in English at B1 level, and the flow runs in the terminal. Persian language support and a UI will be added in later versions.

### Out of Scope (Proposed)

- Scoring experience entries (Feature 3).
- Matching against a job description (Feature 1).
- Automatically suggesting a result or number.

---

## Spec 3: Smart Review and Clarity Score

**Goal:** The tool reads the resume and shows where each experience entry lacks context, where the action is unclear, and where the result is missing.

### Acceptance Criteria

#### Unit and Calculation

- The unit is a work experience entry containing 1 to 6 bullets. An entry with no bullets is a draft, is excluded from averages, and prompts the user to write a description.
- Each dimension score for an entry is the average of that dimension’s bullet scores. The entry score is the equally weighted average of the three dimensions. The overall score is the simple average of entries that contain bullets.
- Each bullet is assessed using a 0/1/2 checklist across three dimensions: context, role and action clarity, and result. The entry score is the simple average of the three dimensions.
- Entry and overall scores are calculated without using the job description and do not change when the job description changes.
- **Result dimension:** 0 means no result; 1 means vague or output-only; 2 means a clear impact (qualitative or numeric). The message “If you have real numbers, include them” is part of the result question (see the question text in Spec 2). Personal learning without an observable change (such as “I learned how it works”) scores 1. Examples of score 1:
  - Vague: “Improved performance”
  - Output only: “Built a dashboard” (without impact)
  - Personal learning: “Learned how data analysis works”

#### Feedback

- First, the candidate is asked whether they want a rewrite (default: “Yes”). Then, exactly one question is asked for each missing part (context, action, result), in that order. Therefore, each bullet has 0 to 3 questions, and the user can skip any question. No numbers or impact are invented.
- If the bullet is complete (context is present, and both the action and result dimensions score 2), no questions are asked. The candidate is asked to confirm the bullet at the end.
- If the candidate answers at least one question and leaves the others unanswered, or needs time to think, the tool offers the option to save the bullet as a draft or confirm a rewrite using the answers provided so far.
- A rewrite is made only with the user’s own words and only after the user approves it.
- If the user does not answer or skips all questions, no rewrite is made.
- The text of the three questions (context, action, result) is provided in Spec 2.
- In V1, all tool text is in English at B1 level, and the flow runs in the terminal. Persian language support and a UI will be added in later versions.

#### Re-analysis and Overlap

- Only new or edited bullets are analyzed again, and the rubric version is stored alongside each score.
- An overlap warning is shown at the experience-entry level, with the suggestion “Merge.” It does not affect the score. Each new bullet is compared with all existing bullets.

#### Quality (Entry Score and Overall Score)

- Correlation with evaluators ≥ 0.6.
- Reliability: across 5 consecutive runs, at least 90% of bullet-by-dimension scores must be exactly the same.
- Score improvement for the same entry after revision.
- 0% extra claims in questions and rewrite suggestions.

#### Calculating the Score out of 100

Dimension score = Total bullet scores ÷ (2 × Number of bullets) × 100, and the entry score is the average of the three dimensions.

- **Entry dimension score** = Total score for that dimension across all bullets ÷ (2 × Number of bullets) × 100.
- **Entry score** = (Context score + Action score + Result score) ÷ 3.
- **Overall score** = Average score of “Ready” entries that contain bullets.

**Example:** An entry with two bullets.

| Dimension | Bullet A | Bullet B | Dimension score |
|---|---:|---:|---:|
| Role and Action Clarity | 2 | 2 | (2+2)/4 = 100% |
| Result | 2 | 1 | (2+1)/4 = 75% |
| Context | 2 | 1 | (2+1)/4 = 75% |

Entry score = (75 + 100 + 75) / 3 = 83.33

### Out of Scope

- “Low data” label.
- “Low confidence” threshold.

---

## Change History

- October 24, 2026: Created the document from the uploaded file; no content changes were made.
- October 24, 2026: Final decision: The reliability criterion in Spec 3 (“Quality” section) changed from “≤ 5 points” to “across 5 consecutive runs, at least 90% of bullet-by-dimension scores must be exactly the same” (Option B).
- October 25, 2026: Final decision: Spec 2 changed from a “template with three fixed fields” to “rewriting a bullet using the Context → Action → Result pattern.” A bullet is free text, and the pattern only organizes the sentence. Flow: ask “Do you want a rewrite?” (default: Yes), then ask one question for each missing part (0 to 3 questions; skippable). A complete bullet only needs final confirmation. If the answer is incomplete, offer the option to save a draft or confirm a rewrite using the answers provided so far.
- October 25, 2026: Final decision: The message “If you have real numbers, include them” was moved from beside the result field into the result question. Three score-1 examples (vague, output only, personal learning) were added to the Result dimension. The “Remove” message was removed from the Out of Scope section.
- October 25, 2026: Final decision: Spec 1 became a two-stage process with full job-description analysis (type: hard or soft; priority: Required, Preferred, Bonus; red-line requirements grouped under “Required”). Actions became “Highlight / Keep as is / Shorten,” and “Remove” was removed.
- October 25, 2026: Final decision: V1 is a text-based terminal flow. All tool text (Specs 1–3) is in English at B1 level. Persian language support and a UI will be added in later versions.
- October 25, 2026: Final decision: The rubric changed from four dimensions to three equally weighted dimensions (Context, Role and Action Clarity, Result). The dimensions “Product Manager Skill Evidence” and “Structure and Scannability,” and the phrase “Weak for a Product Manager,” were removed. `context_present` is no longer needed; the Context score replaces it. The new rubric version was recorded (`rubric_version = 2`).
