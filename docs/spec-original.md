
## Spec 1: Job Description Matcher (JD Matcher)

> **Update (October 29, 2026):** This spec is SUPERSEDED by feature
> `002-jd-matcher` (specs/002-jd-matcher/spec.md, constitution v3.0.0 P6).
> The matcher now analyzes ONLY the pasted job posting — it never reads or
> touches resumes — and outputs skill tables only: three hard-skill tables
> (Must / Should / Nice) with verbatim evidence plus one soft-skill table
> drawn strictly from the 56-skill taxonomy. The per-entry actions
> ("Highlight / Keep as is / Shorten" — implementation naming: Highlight /
> No change / Not relevant) are retired as product behavior. Postings must
> be English; a posting with more than 10% Persian/Arabic-script letters is
> rejected. The text below is kept as the historical original.

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

## Spec 2: Rewriting a Bullet Using the Five‑Part Framework (User Need → Product Feature → Action → Result → Metric)

**Goal:** Rewrite a bullet using only the user’s words, structured by the five‑part framework (User Need → Product Feature → Action → Result → Metric). A bullet is free text; the candidate never fills in the framework directly — they only answer the generated questions.

> **Update (October 29, 2026):** Finalized as the five‑part framework
> (rubric_version 3). The three‑question Context/Action/Result flow below was
> replaced by five questions in the order Need → Feature → Action → Result →
> Metric; the question texts and conditions changed accordingly. The text
> below reflects the finalized version.

### Acceptance Criteria

- First, the tool asks the candidate: “Do you want me to rewrite this bullet to make your experience stronger?” The default answer is “Yes.” If the answer is “No,” there are no questions and no rewrite.
- The tool reviews the bullet and asks exactly one question for each missing or vague part, in this order: Need, Feature, Action, Result, Metric. A “missing part” is a part that is empty or vague; “vague” is determined by the relevant dimension score (0 or 1). Conditions: the Need, Action, and Result questions are asked when their dimension scores 0 or 1; the Feature and Metric questions are asked when the field is empty. Therefore, there are 0 to 5 questions, and the candidate can skip any question. Before each question, the tool identifies the achievement and the part being discussed.
- Question text:
  - **Need:** “Who had a problem? What was the problem?”
  - **Feature:** “What was the feature or product part you worked on?”
  - **Action:** “What exactly did you do? What was your role?”
  - **Result:** “What changed after your work? Who did it help?”
  - **Metric:** “Do you have a real number? If not, you can skip this.”
- The metric is optional, asked once at the end, and does not prevent a bullet from being complete. The tool must never invent a number. If the candidate has a real number, they should enter it.
- If the bullet is complete (Context, Specific Action, and Result all score 2), no questions are asked — the metric is not required. The candidate is only asked to confirm the bullet at the end.
- If the candidate answers at least one question and leaves the others unanswered, or needs time to think, the tool offers two options: save the experience entry as a draft, or confirm a rewrite using the answers provided so far. Example message: “Do you want to save this entry as a draft, or confirm a rewrite with your answers so far?”
- Rewriting rules (WORDING): keywords — nouns, verbs, tool names, numbers, results, product names — must stay unchanged. Allowed: grammar, spelling, verb tense, short linking words (and, to, with, by, for), word order. Forbidden: replacing keywords (even synonyms), adding new nouns/verbs/tools/numbers/results, overstating or understating the role. If a rewrite would require a new keyword, the relevant part stays empty and the tool asks a question.
- A rewrite is applied only after the candidate approves it and uses only their own words. If the candidate does not answer or skips all questions, no rewrite is made.
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

> **Update (October 29, 2026):** Finalized as the five‑part framework
> (rubric_version 3): the framework has five parts, but scoring uses three
> dimensions — Context (from `user_need` + `product_feature`), Specific
> Action (replacing “Role and Action Clarity”; stored key
> `role_action_clarity` unchanged), and Result. The five parts
> (`user_need`, `product_feature`, `action`, `result`, `metric`) are
> extracted automatically and contain only the candidate’s own words;
> `part_present` (five booleans) replaced `context_present`. The text below
> reflects the finalized version.

- The unit is a work experience entry containing 1 to 6 bullets. An entry with no bullets is a draft, is excluded from averages, and prompts the user to write a description.
- Each dimension score for an entry is the average of that dimension’s bullet scores. The entry score is the equally weighted average of the three dimensions. The overall score is the simple average of entries that contain bullets.
- Each bullet is assessed using a 0/1/2 checklist across three dimensions: Context, Specific Action, and Result.
  - **Context** (from the extracted parts, priority given to the need): 0 — the need is missing, even if the feature is mentioned; 1 — the need is general, or the need is specific but the feature is missing; 2 — both the specific need and the feature are present. The exact 0/1/2 levels for Specific Action are defined in the scoring checklist (`specs/001-experience-improvement-flow/checklists/specific-action.md`): 2 = action verb with a concrete object or quantified scope; 1 = generic action; 0 = no action.
  - **Result:** 0 means no result; 1 means vague or output-only; 2 means a clear impact. A specific qualitative result scores 2 even without a number. If only a bare number is supplied without a result (for example, “20% growth”), the result score is 1 and the tool asks what the number represents. The metric adds detail to the result but never changes its score. Personal learning without an observable change (such as “I learned how it works”) scores 1. Examples of score 1:
    - Vague: “Improved performance”
    - Output only: “Built a dashboard” (without impact)
    - Personal learning: “Learned how data analysis works”
    - Bare number only: “20% growth”
- Entry and overall scores are calculated without using the job description and do not change when the job description changes.
- `rubric_version` is now 3 because the Context definition changed. Prior scores (rubric_version 2) remain associated with their original version.

#### Feedback

- First, the candidate is asked whether they want a rewrite (default: “Yes”). Then, exactly one question is asked for each missing or vague part, in the order Need → Feature → Action → Result → Metric. Therefore, each bullet has 0 to 5 questions, and the user can skip any question. No numbers or impact are invented.
- If the bullet is complete (Context, Specific Action, and Result all score 2), no questions are asked. The candidate is asked to confirm the bullet at the end.
- If the candidate answers at least one question and leaves the others unanswered, or needs time to think, the tool offers the option to save the bullet as a draft or confirm a rewrite using the answers provided so far.
- A rewrite is made only with the user’s own words and only after the user approves it. Keywords stay unchanged (see the rewriting rules in Spec 2).
- If the user does not answer or skips all questions, no rewrite is made.
- The text of the five questions (Need, Feature, Action, Result, Metric) is provided in Spec 2. Every message about a bullet starts with the framework header and `Original` line; the final text is provided without brackets, inside a code block, one bullet per line prefixed with “- ”, with a notice that the candidate can copy it.
- In V1, all tool text is in English at B1 level, and the flow runs in the terminal. Persian language support and a UI will be added in later versions.

#### Re-analysis and Overlap

- Only new or edited bullets are analyzed again, and the rubric version is stored alongside each score.
- An overlap warning is shown at the experience-entry level, suggesting a merge of the overlapping bullets. It does not affect the score. Each bullet is compared with all existing bullets.

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
| Specific Action | 2 | 2 | (2+2)/4 = 100% |
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
- October 29, 2026: Final decision: Spec 2 and Spec 3 finalized as the five‑part framework (rubric_version = 3). Questions changed from 0–3 (Context → Action → Result) to 0–5 in the order Need → Feature → Action → Result → Metric (Need/Action/Result asked when their dimension scores 0 or 1; Feature/Metric when the field is empty); question texts updated; Specific Action replaced “Role and Action Clarity” (stored key `role_action_clarity` unchanged); the five parts are extracted automatically with only the candidate’s own words and `part_present` (five booleans) replaced `context_present`; the Context definition now derives from `user_need` + `product_feature`; a bare-number-only result scores 1; rewriting rules pin keywords (nouns, verbs, tool names, numbers, results, product names) as unchanged; the final output is a copyable code block with “- ” lines.
- October 29, 2026: Final decision: Spec 1 superseded by feature `002-jd-matcher` (constitution v3.0.0 P6): the matcher analyzes only the pasted posting and outputs skill tables only; the per-entry actions (“Highlight / Keep as is / Shorten”) are retired. Postings must be English (>10% Persian/Arabic-script letters rejected).
