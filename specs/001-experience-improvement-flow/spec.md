# Feature Specification: Help Entry-Level Job Seekers Narrate Their Experience (Level 1 Prototype)

**Feature Branch**: `001-experience-improvement-flow`

**Created**: 2026-10-23

**Status**: Finalized — Five-Part Resume Bullet Rewriting Framework (2026-10-29)

**Input**: User description: "A text-flow prototype (no graphical interface) that guides an entry-level product manager job seeker through one complete path for improving a single experience entry. The user adds an experience entry (type: job, project, course, side work), a title, and 1–6 free‑text English bullets. The tool scores each bullet on three dimensions (Context, Specific Action, Result) and rewrites bullets using a five‑part framework (User Need → Product Feature → Action → Result → Metric)."

**Language note**: Version 1 is a text‑based terminal flow; all tool text is English at B1 level (prd §4/§6; spec‑original Specs 1–3). All user input — bullets, answers, and any metric values — must be in English; Persian input is rejected. Persian UI and Persian resumes are planned for later versions and are out of scope here.

**Implementation status note**: Phase 9 (the rubric-3.0.0 Specific Action scoring
checklist, `checklists/specific-action.md`) is implemented and tested (tasks
T045–T050). The five-part framework behavior specified below is the target
product; the remaining work is tasked in tasks.md Phase 10.

## 1. Goal

- Rewrite each resume bullet using only the candidate's own words.
- Use the **five-part framework** (User Need, Product Feature, Action, Result, Metric) to structure the sentence and ask targeted questions. The candidate never fills in the framework directly; they only answer the generated questions.
- Version 1: Text‑only terminal flow; English B1 tool text; Persian support and UI will be added in later versions.

## 2. Five‑Part Framework (Fields)

- **`user_need`** – The user's need or problem (required, highest priority).
- **`product_feature`** – The name of the product feature or component that addresses the need.
- **`action`** – The action taken.
- **`result`** – The outcome.
- **`metric`** – An optional measurement; guide‑only.

All five parts are stored separately and contain only the candidate's own words.

**Examples in this document** (the tool does not use these examples at runtime):

| Field | Example |
|---|---|
| `user_need` | New users could not find the items they saved. |
| `product_feature` | Saved items page |
| `action` | I wrote the requirements and worked with the design team to rebuild it. |
| `result` | More users came back to their saved items. |
| `metric` | Return visits grew by 15%. |

## 3. Scoring (Three Dimensions, 0/1/2)

- The framework has five parts, but scoring uses three dimensions.
- **Context** – Based on `user_need` and `product_feature`, with priority given to the need:
  - **0** – The need is missing, even if the feature is mentioned.
  - **1** – The need is general, or the need is specific but the feature is missing.
  - **2** – Both the specific need and the feature are present.
- **Specific Action** – Based on the `action` field. This replaces "Role and Action Clarity." The levels are defined in `checklists/specific-action.md`; the stored dimension key (`role_action_clarity`) remains unchanged for data compatibility.
- **Result** – Based on the `result` field. The metric adds detail to the result but does not affect the score:
  - A specific qualitative result receives a score of 2, even without a number.
  - If only a number is provided without a result (for example, "20% growth"), the result score is 1, and the tool asks what the number represents.
- The **experience score** is the simple average of the three dimensions. The bullet score calculation remains unchanged.
- `rubric_version` is now **3** because the Context definition changed. Prior scores (rubric_version 2) remain associated with their original version.

## 4. Data Model (Per Bullet)

- `id`, `text`
- `user_need`, `product_feature`, `action`, `result`, `metric` (text fields extracted automatically).
- `part_present {user_need, product_feature, action, result, metric}` – Five booleans (replaces `context_present`).
- "Vague" is determined by the relevant dimension score (0 or 1).
- `analysis_status`: New, edited, or analyzed. Only new or edited bullets are re‑analyzed.
- `dimension_scores {context, action, result}`
- `rubric_version` (now 3)
- `follow_up_questions` (0–5)
- `user_answers`, `rewrite_proposal`
- `rewrite_status`: Unanswered, draft, proposed, approved, or rejected.

## 4.1 Workflow

1. Score the three dimensions and detect the presence of all five parts.
2. Display the list of bullets with their scores.
3. Candidate selects a bullet.
4. Display the framework (Section 5).
5. Ask: "Do you want me to rewrite this bullet to make your experience stronger?" (default Yes). If the candidate answers **No**, no questions are asked and no rewrite occurs.
6. Ask exactly one question for each missing or vague part, in the order **Need → Feature → Action → Result → Metric**.
7. Collect the candidate's answers.
8. If any part remains unanswered, allow the candidate to **save a draft** or **confirm a rewrite** using the answers provided so far.
9. Show the rewrite proposal.
10. Candidate approves or rejects the proposal.
11. Save the new bullet with status "edited" and re‑analyze it.
12. Return to the bullet list.
13. When all bullets are approved or left unchanged, show the final text (Section 8).

## 5. Framework Display

Each bullet message starts with:

```
Experience: <title> – Achievement <n> of <total>
Original: "<bullet text>"
```

The candidate's words must appear exactly inside the brackets for each relevant part. No words may be added, removed, or changed.

- Empty parts shown as `[missing]` (for example: `[User need or problem – missing]`).
- Vague parts shown with the candidate's exact words and the note `vague`.

Below the framework, list:

- **Filled correctly** – part name and exact words.
- **Still needs to be filled** – names of missing or vague parts.

## 6. Questions

Ask one question per missing/vague part (order above). Before each question, the tool identifies the achievement and the part being discussed. The candidate can skip any question; each bullet has 0–5 questions. Conditions:

- **Need, Action, Result** – ask when the corresponding dimension score is 0 or 1.
- **Feature, Metric** – ask when the field is empty.

Questions:

- **Need** – "Who had a problem? What was the problem?"
- **Feature** – "What was the feature or product part you worked on?"
- **Action** – "What exactly did you do? What was your role?"
- **Result** – "What changed after your work? Who did it help?"
- **Metric** – "Do you have a real number? If not, you can skip this."

**Metric rules**: The metric is optional, asked once at the end, and does not prevent a bullet from being complete. The candidate is not required to enter a number, and the tool must never invent one. If the candidate has a real number, they should enter it.

A bullet is **complete** when Context, Specific Action, and Result all score 2. Metric is optional. No questions are asked; only a final confirmation is required.

## 7. Rewriting Rules (WORDING)

These rules apply only during the rewriting stage; when displaying the framework, the candidate's words remain exactly as written.

- **Keywords that must stay unchanged**: nouns, verbs, tool names, numbers, results, product names.
- **Allowed changes**: grammar, spelling, verb tense, short linking words (`and`, `to`, `with`, `by`, `for`), word order.
- **Forbidden changes**: replacing keywords (even synonyms), adding new nouns/verbs/tools/numbers/results, overstating or understating the role.
- If a rewrite would require a new keyword, the relevant part stays empty and the tool asks a question.
- The rewrite is applied only after explicit user approval. If the candidate provides no answers or skips all questions, no rewrite is made.
- Example message for a partial response: "Do you want to save this entry as a draft, or confirm a rewrite with your answers so far?"

## 8. Final Output

- After each bullet is processed, the candidate returns to the bullet list.
- When all bullets are approved or left unchanged, the tool outputs the final text **without brackets**, inside a code block, one bullet per line prefixed with `- `. The tool tells the candidate they can copy the text.
- Bullets that were not improved retain their original wording.

## 9. Testable Acceptance Criteria

- Every bullet message starts with the correct header (title, `n`, and `total`) followed by the `Original` line.
- The framework preserves the candidate's exact words. No words are added, removed, or changed.
- Missing parts are marked `missing`; vague parts are marked `vague`. The `Filled correctly` and `Still needs to be filled` lists are populated correctly.
- Questions are asked only for missing/vague parts, in the order Need, Feature, Action, Result, Metric.
- Complete bullets receive no questions, only a confirmation prompt.
- The tool never invents a number when the candidate has not provided one.
- No new or changed keywords appear in rewritten bullets.
- The final text is provided without brackets, inside a code block, with a copy notice.
- Each bullet's score is stored with `rubric_version = 3`.

## 10. Open Items for Planning

- Keep the first success criterion in the PRD (10 min) and assumption 8 unchanged. Timing must be measured during the pilot because up to five questions may be asked.
- ~~Define the exact 0/1/2 scoring levels for the **Specific Action** dimension~~ — **DONE 2026-10-29**: `checklists/specific-action.md` (rubric-3.0.0), implemented and tested (Phase 9, T045–T050).
- Review dimension weights after pilot data; any change creates a new rubric version.
