**Spec 1: Job Posting Matcher (JD Matcher)**
Goal: By analyzing the job posting and the job seeker's experiences, determine for each experience whether it should be bolded, shortened, or removed, with a one-line reason.

Acceptance criteria
- Given a posting and experiences, the output has exactly one of the three actions "Bold it / Shorten it / Remove it" for each input experience, and no experience is left out.
- Each action has a one-line reason.
- In the first stage, only the character and soft skills of the posting are extracted and reported.
- In the second stage, the required skills, optional skills, and red lines are inferred from the posting. Each one is a filter factor, and the reason for each action refers to one of these factors.

Out of scope (suggested)
- Rewriting the text of experiences (only in Feature 3 and after user confirmation).
- Scoring resume quality (belongs to Feature 3).
- Building the final resume or sending it to the posting.

**Spec 2: Structured "Context → Action → Result" Template**
Goal: Each experience is filled in with three fixed fields (context, action, result), and the output is one coherent paragraph or bullet.

Acceptance criteria
- Each experience has three fixed fields: context, action, result.
- The output is one coherent paragraph or one coherent bullet in which all three fields are present.
- The output text comes only from the content of the fields the user filled in and is finalized with their confirmation. No new numbers or impact are added (suggestion, aligned with the "no extra claims" rule in Feature 3).
- An empty field is not filled in with a guess; its absence is shown to the user (suggestion).

Out of scope (suggested)
- Scoring experiences (Feature 3)
- Matching against the posting (Feature 1)
- Automatic suggestion of results or numbers

**Spec 3: Smart Review and Clarity Score**
Goal: The resume is read and, with a score independent of the posting, shows where each experience is vague, where it has no result, and which part is weak for a product manager.

Acceptance criteria

Unit and calculation:
- The unit is a work experience with 1 to 6 bullets. An experience without bullets is a draft, is not included in the average, and receives a suggestion to write a description.
- The score of each dimension in an experience is the average of the bullet scores. The experience score is the equal-weighted average of the four dimensions. The overall score is the simple average of the experiences that have bullets.
- Each dimension is measured with a 0/1/2 checklist: role and action clarity, outcome, product manager skill evidence, and structure and scannability.
- The experience score and the overall score are also calculated without a posting and do not change when the posting changes.
- Outcome dimension: 0 means none, 1 means vague or output only, 2 means a specific impact (qualitative or numerical). Next to the result field, the message "If you have a real number, add it" is displayed. Personal learning without an observable change is level 1.

Feedback: For each bullet, at least 1 and at most 2 questions are asked, and the user can reject any question. No number or impact is fabricated. If the job seeker answers, the rewrite is made only with the user's own words and after their confirmation. Question: "Did this project change something in an output or for someone?"

Without an answer, or if the question is rejected, there is no rewrite. Sample question: "Did this project change something in an output or for someone?"

Re-analysis and overlap:
- Only a new or edited bullet is re-analyzed, and the rubric version is stored next to each score.
- An overlap warning at the experience level is displayed with a "merge" suggestion and has no effect on the score. A new bullet is compared with all existing bullets.

Quality, on the experience score and the overall score:
- Correlation with raters ≥ 0.6
- Reliability ≤ 5 points
- Score improvement on the same experience after revision
- 0% extra claims in questions and rewrite suggestions

Calculating the number 100:
Dimension score = sum of bullet scores ÷ (2 × number of bullets) × 100, and the experience score is the average of the four dimensions.

Example: an experience with two bullets.

| Dimension | Bullet A | Bullet B | Dimension score |
|---|---|---|---|
| Role and action clarity | 2 | 2 | (2+2)/4 = 100% |
| Outcome | 2 | 1 | (2+1)/4 = 75% |
| Product manager skill evidence | 2 | 0 | (2+0)/4 = 50% |
| Structure and scannability | 2 | 2 | 100% |

Experience score = (100 + 75 + 50 + 100) / 4 = 81.25

Out of scope
- "Low data" label
- "Low confidence" threshold
- "Remove it" message