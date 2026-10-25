**# Draft PRD: Helping Early-Career Job Seekers Tell Their Story and Choose Relevant Experience (Phase 1: Product Manager)**



**\*\*Status:\*\*** Draft 0.1, not a final document. October 23, 2026. Sections that do not yet have a final decision are marked “Proposed” and collected at the end of the document.



**## 1. Problem**



**\*\*Which user problem?\*\*** Job seekers do not know which parts of their experience to choose for a specific role or how to explain them clearly at a glance.



**\*\*What evidence supports this?\*\***



**\*\*Insight 3 (Storytelling):\*\*** Resumes and portfolios lack a clear story.



\- Parnaz says the biggest pain point is not presenting oneself and one's work well. The selected candidate's resume showed what they had done “in one scroll.”

\- Job seekers ask, “How can I explain it in a clear and impressive way?” (M13).

\- About 7 of 23 open-ended answers (about the hardest part of writing a resume) were about the “About me” section, skills, achievements, and skill level.



**\*\*Insight 4 (Selection):\*\*** Employers use different criteria (skills, university, or experience). Job seekers ask, “Which skill should I highlight?” (I19) and “Do I need to include all my experience?” (M19). Because the criteria vary, one standard guide cannot answer every case.



**\*\*Evidence limitation:\*\*** About 7 of 23 open-ended answers relate to these topics. The sample is small and qualitative, and some key claims come from only one or two interviews.



**## 2. Audience**



**\*\*Who is it for?\*\*** An early-career job seeker in product who wants a Product Manager role. “Early-career” means having no or limited experience in product; projects, courses, and side work also count as experience.



**\*\*In what situation?\*\***



\- They are preparing a resume for a specific job posting before the interview stage.

\- They do not have a personal advisor or professional feedback available.

\- Their resume is in English (version 1 accepts English resumes only).



**\*\*Reader of the output:\*\*** A hiring manager screening candidates who has only a few seconds. They are not a direct user of the product, but the output quality is judged from their point of view.



**## 3. Assumptions**



These assumptions are currently treated as true and need to be tested. Items 7–9 are hidden assumptions that had not been stated before.



\| # \| Assumption \| Current evidence \| Cheapest test \|

\|---\|---\|---\|---\|

\| 1 \| The user has experience (including projects, courses, and side work), and the main problem is lack of structure—not lack of experience or confidence. \| Weak evidence (about 7 of 23 answers). This is also in tension with the definition of early-career. \| Ask 8–10 early-career users to write 3 bullets for a job posting in 10 minutes and see how many cannot do it. \|

\| 2 \| Employer criteria can be extracted from the job posting. \| No evidence. The real criteria may not appear in the posting. \| Give 10 real job postings to 2 Product Managers, ask them to identify the actual criteria, and compare them with the tool's output. \|

\| 3 \| Job seekers are willing to enter their job posting and experience into the tool, and they enter good-quality data. \| No evidence. \| Run a manual test with 5 people and observe them. \|

\| 4 \| Automated feedback feels valid and trustworthy to users and helps them create a better resume without a coach. \| No evidence. \| After the test, ask how many suggestions they accepted and why. \|

\| 5 \| Resume feedback can be evaluated using a clear three-dimension rubric, and “clarity score” has an operational definition. \| Three dimensions have been defined, but their validity has not been tested. \| Have 3 Product Managers score 10 existing resumes using the rubric and measure agreement before building. \|

\| 6 \| The clarity score aligns with employers' judgments. \| No evidence. This has not been checked. \| Use the same test as assumption 5. \|

\| 7 \| (Hidden) The target job seeker can and wants to have an English resume, so blocking Persian resumes will not exclude a large part of the audience. \| No evidence. \| Ask 10 early-career users a short question: What language is your current resume in? \|

\| 8 \| (Hidden) Adding one bullet and accepting or rejecting its rewrite (or approving a complete bullet without questions) within the first 10 minutes is realistic. \| No evidence. \| Measure the time during the manual test for assumption 3. \|

\| 9 \| (Hidden) Pilot evaluators represent real hiring managers who screen candidates. \| No evidence. \| Recruit 5 evaluators and record their hiring experience. \|



**## 4. Solution**



Three features will be built in version 1. They all work only on resumes and only on data entered by the user. Version 1 is a text-based terminal flow, and all tool text is in English at B1 level. The UI and Persian language will be added in later versions.



**### 4.1 Job Description Matcher (JD Matcher)**



**\*\*Input:\*\*** Job posting text (Persian or English, pasted text only) and the job seeker's experience.



**\*\*Process:\*\*** Two steps.



1\. Full job posting analysis: each skill is classified using two dimensions: type (hard or soft skill) and priority (Required / Preferred / Bonus; “red line” is grouped under “Required”).

2\. Experience filtering: each action refers to an extracted skill (type + priority).



**\*\*Output:\*\*** A list of “Highlight / No change / Shorten” actions, with a one-line reason for each work experience entry.



\- “Highlight”: the entry relates to an extracted skill and should be emphasized (the reason states which skill, including its type + priority).

\- “No change”: the entry is relevant but does not need to be highlighted, for example, it only partly relates to a “Preferred” or “Bonus” skill (the reason explains why it is fine as it is).

\- “Shorten”: the entry has little or no relevance (with a short reason).

\- The job seeker decides whether to remove it.



The matcher's output unit is the work experience entry, not the bullet.



**\*\*Boundary:\*\*** The clarity score is independent of the job posting. The tool does not suggest removing an experience entry or bullet.



**### 4.2 Rewriting a Bullet Using the “Context → Action → Result” Pattern**



A bullet is free text. The “Context → Action → Result” pattern only guides the model's sentence structure when rewriting; the user does not fill in separate fields.



First, the tool asks: “Do you want me to rewrite this bullet to make your experience stronger?” (Default: Yes). If the answer is yes, the tool reviews the bullet using the pattern and asks exactly one question for each missing part (Context, Action, Result), in that order. The Context question is asked when the bullet has no context. The Action or Result question is asked when the relevant dimension in section 4.3 scores 0 or 1. This means there are 0–3 questions, and the job seeker can skip any question. If the bullet is complete, no questions are asked; the tool only asks the user to confirm the bullet at the end. “If you have real numbers, include them” is part of the Result question.



\- **\*\*Context:\*\*** “What was the situation? For example, what project, team, or problem was it about?”

\- **\*\*Action:\*\*** “What exactly did you do? What was your role?”

\- **\*\*Result:\*\*** “What changed after your work? Who did it help, or what result did it lead to? If you have real numbers, include them.”



The tool does not invent numbers, impact, or claims. If the job seeker has no real impact to report, the tool does not make one up. The pattern only changes the sentence structure and does not add new content; this rule also applies when rewriting with the pattern. If the job seeker answers at least one question but leaves the others unanswered, or needs time to think, the tool offers two options: save the work experience entry as a draft, or approve a rewrite using only the answers already provided. Rewriting uses only the user's own words and happens only after their approval. If the user does not answer or skips all questions, no rewrite is made.



**### 4.3 Smart Review and Clarity Score**



The resume is reviewed, and the tool shows where each work experience entry lacks context, where the action is unclear, and where the result is missing.



**\*\*Scoring unit:\*\*** Each work experience entry is scored separately and has 1–6 bullets. An entry without a description is saved as a draft, is excluded from the average, and the user is asked to add a description (even one bullet).



**\*\*Three dimensions\*\*** (each uses a checklist scored 0, 1, or 2): Context, Role and Action Clarity, and Result. For Context: 0 means missing, 1 means general (“in an app”), and 2 means a specific situation (a specific project, team, or problem). The entry score is the simple average of the three equally weighted dimensions (0–100). The weights are not written as percentages. After the pilot, weights will be reviewed only using data, and any change will create a new rubric version.



For the Result dimension, a specific qualitative result scores 2 and a vague result scores 1. Personal learning without an observable change (such as “I learned how it works”) scores 1. Examples of score 1:



\- Vague: “Improved performance”

\- Output only: “Built a dashboard” (no impact)

\- Personal learning: “Learned how data analysis works”



**\*\*Score:\*\*** The entry score is the equal average of the three dimensions (each weighted at 25%, to be revised after the pilot) on a 0–100 scale. The overall score is the simple average of entries that have bullets. Both the overall score and sub-scores are shown. In version 1, the three dimensions have equal weights (25% each). After the pilot, weights will be reviewed only using data, and any change will create a new rubric version.



An overlap warning suggests merging work experience entries and does not affect the score.



**\*\*Feedback flow:\*\*** Bullet → analysis of the three dimensions and detection of context_present → “Do you want a rewrite?” question (default: Yes) → 0–3 questions in Context, Action, Result order (only for missing parts) → user answers → (if any part is unanswered: save as a draft or approve using the existing answers) → rewrite suggestion → user approves or rejects → new bullet marked “edited” → re-analysis. A complete bullet only requires final confirmation.



Only new or edited bullets are analyzed again, and the rubric version is stored with each score.



**### 4.4 Work Experience Structure**



Each work experience entry is saved using the same fields, whether entered manually or imported from a PDF.



\| Field \| English name (snake_case) \| Type \| Required \| Description \|

\|---\|---\|---\|---\|---\|

\| Entry type \| `entry_type` \| One of: job, project, course, side work \| Yes \| Early-career users with no work experience can add something other than a job. \|

\| Title \| `title` \| Text \| Yes \| Role, project name, or course name. \|

\| Bullets \| `bullets` \| List of 1–6 items \| Yes, for scoring \| Each bullet is free text. \|

\| Source \| `source` \| Manual or PDF upload \| Automatic \| \|

\| Status \| `status` \| Draft or ready \| Automatic \| An entry without bullets is a draft, is excluded from the overall average, and the user is asked to add a description. \|

\| Entry score \| `entry_score` \| 0–100 \| Automatic \| Average of the three equally weighted dimensions. \|

\| Rubric version \| `rubric_version` \| Number \| Automatic \| Stored with each score. \|

\| Overlap warning \| `overlap_warning` \| Merge suggestion \| Automatic \| Does not affect the score. \|



**\*\*Structure of each bullet:\*\***



\| Field \| English name (snake_case) \| Type \| Required \| Description \|

\|---\|---\|---\|---\|---\|

\| Bullet ID \| `id` \| \| Automatic \| \|

\| Bullet text \| `text` \| Text \| Yes \| Free-text bullet. \|

\| Analysis status for each bullet \| `analysis_status` \| New, edited, or analyzed \| Automatic \| Only new or edited bullets are analyzed again. \|

\| Analysis output \| `context_present` \| Boolean \| Yes \| Yes or no; analysis output. \|

\| Dimension scores \| `dimension_scores {context, action, result}` \| Three values: 0, 1, or 2 \| Automatic \| Context, Role and Action Clarity, Result. \|

\| Rubric version \| `rubric_version` \| Number \| Automatic \| Stored with each score. \|

\| Tool questions \| `follow_up_questions` \| List \| Automatic \| 0–3 questions. \|

\| User answers \| `user_answers` \| Free text, one per question \| Automatic \| \|

\| Rewrite proposal \| `rewrite_proposal` \| Text \| Automatic \| \|

\| Rewrite status \| `rewrite_status` \| No response, draft, proposed, approved, or rejected \| Automatic \| \|



The overall score is not stored on a work experience entry; it is the simple average of the scores for entries that have bullets. Each entry score and the overall score are independent of the job posting.



**### 4.5 Data Entry**



**\*\*Manual flow (required).\*\*** The user adds work experience entries one by one. Each entry is scored when added or edited, and the user uses the ready entries in their own resume. The output format is copied text for each entry.



**\*\*English PDF upload (optional).\*\***



\- Only PDF files and English text are accepted. The resume language is declared during upload, and Persian resumes are blocked.

\- Work experience entries are extracted from the PDF text and saved in the structure above without any content changes. The tool only splits the text; it does not rewrite, summarize, or correct spelling.

\- Before scoring, the user reviews and confirms how the entries were split and can edit all fields. If an entry has more than 6 bullets, all text is retained, and scoring can happen after the user reduces it to 6 bullets.

\- The full resume text is also stored unchanged in a separate field, along with the file name and upload date. In version 1, this field is only stored so later versions can use it without requiring another upload.

\- If text cannot be extracted from the PDF (for example, a scanned file), the tool explains this and suggests the manual flow.

\- Upload is available only to users signed in with email.

\- Each account can upload a resume no more than twice in version 1.

\- A new resume upload replaces the previous resume.



**## 5. Success Metrics**



Pilot period: 6 weeks with 30 early-career product job seekers and 5 evaluators. These numbers are proposed targets. There is no current baseline; it will be measured in week 1 of the pilot. Offline metrics will be measured before the pilot starts.



\| Metric \| Target \| Deadline \| Evidence source \|

\|---\|---\|---\|---\|

\| Add one bullet and accept or reject its rewrite (or approve a complete bullet without questions) within the first 10 minutes \| ≥ 60% of users \| 6 weeks \| Product logs (timed start and completion events) \|

\| An evaluator can say what the job seeker did for the role within 10 seconds \| ≥ 70% of evaluators \| 6 weeks \| Recorded evaluator assessment form \|

\| Five-second test with 10 Product Managers or employers: identify the main role and result \| ≥ 70% correct answers, new version versus old version \| 6 weeks \| Recorded test with answer key \|

\| Correlation between tool scores and evaluator scores (entry level and overall score) \| ≥ 0.6 \| Offline, before the pilot, and repeated during the pilot \| Tool scores and independent scores from 5 evaluators for the same entries \|

\| Score stability: 5 consecutive runs on the same unchanged entry \| In 5 consecutive runs, at least 90% of bullet-dimension scores must be exactly the same \| Offline \| Recorded tool runs \|

\| Improvement on the same entry after review \| Proposed: at least one dimension improves by one level in ≥ 60% of edited entries, and evaluators prefer the later version in a blind comparison \| 6 weeks \| Before-and-after scores, plus evaluator comparison \|

\| Extra claims made by the tool \| 0% in the reviewed sample \| 6 weeks \| Evaluator compares each rewrite sentence with the original bullet + user answers \|



**\*\*Why 0.6?\*\*** This value is commonly considered the threshold for a moderate-to-strong correlation. The tool should not agree more with evaluators than evaluators agree with each other. Before the pilot, agreement between evaluators will also be measured. If it is below 0.6, the threshold will be lowered to that level. This threshold will remain in version 1 and be reviewed after the pilot.



**## 6. Out of Scope**



This version intentionally does not include:



\- Fields other than Product Manager

\- Portfolio (version 1 supports resumes only)

\- Persian resumes; uploads are blocked

\- Job posting input by link or file (pasted text only)

\- Generating fake experience or numbers for the job seeker (the tool only works with the user's own data)

\- Sending applications directly to employers or an ATS

\- Human advisors or coaching

\- Visual design of resume and portfolio templates

\- Interview stage and interview practice

\- UI and Persian interface (version 1 is an English text-based terminal flow; UI and Persian will be added in later versions)



**## 7. Risks**



\| # \| What could go wrong \| Response or risk reduction \|

\|---\|---\|---\|

\| 1 \| Incorrect or generic feedback: if the clarity score does not match evaluators' views, trust will be lost. \| Offline validation with real Product Managers and comparison of scores with evaluator judgments during the pilot. \|

\| 2 \| Overfitting the resume: all resumes start to look alike, or the job seeker claims something untrue. \| The tool asks questions, and rewriting uses only the user's words after their answers and approval. \|

\| 3 \| Poor input data: an unclear job posting or incomplete experience leads to weak output. \| Give the user a clear message and save the entry as a draft. \|

\| 4 \| Limited evidence: the 23-person sample may not be generalizable. \| Test assumptions 1, 2, and 5 before building. \|

\| 5 \| Lack of experience: a job seeker with no product experience may not answer the questions, leaving the bullet weak. \| Accept projects, courses, and side work as experience; allow each question to be skipped and save the bullet as a draft. \|

\| 6 \| Privacy: storing resumes and job postings is sensitive. \| Define a clear data retention and deletion policy before the pilot. \|

\| 7 \| Limited evidence: several key claims come from only one or two interviews. \| Conduct more interviews before building. \|

\| 8 \| Fake numbers entered by the job seeker: a user may enter false numbers for their experience. The tool cannot verify them. \| Accept this risk knowingly. The tool does not create numbers and only encourages the use of real numbers. \|

\| 9 \| Gaming the score: the score improves without the resume actually getting better. \| Have evaluators compare before-and-after versions without knowing their order. \|

\| 10 \| Extra claims by the tool (saying something the job seeker did not say). \| Set a 0% target and manually review a sample, using the rule “do not add facts when rewriting.” \|

\| 11 \| Score instability: the same text receives different scores in different runs. \| Apply the stability metric (at least 90% of bullet-dimension scores must be exactly the same across 5 consecutive runs) before the pilot. \|



**## 8. Technical Constraints**



**### Recorded Decisions**



\- **\*\*Resume language:\*\*** English only. The language is declared during upload, and Persian resume uploads are blocked. Resume language detection must be coordinated with the technical team.

\- **\*\*Job posting input:\*\*** Pasted text only, in Persian or English.

\- **\*\*Data structure:\*\*** Each work experience entry has at least 1 and at most 6 bullets. An entry without a description is a draft.

\- **\*\*Incremental analysis:\*\*** Only new or edited bullets are analyzed again, and the rubric version is stored with each score.

\- **\*\*Score independence from job posting:\*\*** The clarity score never uses the job posting.

\- **\*\*Tool behavior:\*\*** The tool asks questions and suggests a rewrite after the user answers. It never invents numbers, impact, or claims, and never changes anything without approval.

\- **\*\*Email sign-in:\*\*** Resume upload is possible only after signing in with email.

\- **\*\*Upload limit:\*\*** Each account can upload no more than two resumes in version 1. This limit must be enforced on the server for each account, not only in the interface.

\- **\*\*Replacement:\*\*** A new resume upload replaces the previous resume.

\- **\*\*Language and interface for version 1:\*\*** Text-based terminal flow. All tool text is in English at B1 level. UI and Persian language will be added in later versions.

\- **\*\*Matcher actions:\*\*** “Highlight / No change / Shorten,” each linked to an extracted skill (type + priority). There is no “Remove” action.



**### Measurement Requirements**



\- Event logs with timestamps: start, bullet added, each question answered or skipped, work experience saved as a draft, complete bullet approved, rewrite accepted or rejected, before-and-after scores.

\- A tool to collect evaluator scores and answers to the five-second test.

\- Ability to run the tool repeatedly on the same fixed work experience entry to test stability.



**### Open Questions for the Technical Team**



\- Will scoring use a language model or rules? How will stability be ensured (at least 90% of bullet-dimension scores exactly the same across 5 consecutive runs)?

\- What are the cost and delay of each analysis? The 10-minute target depends on this.

\- Is resume input manual or by PDF? What is the field schema?

\- How will extra claims be detected automatically, or will this only be checked by people?

\- Data retention and deletion, user consent, and possible use of data for model evaluation.

\- Failure behavior: unclear job posting, empty work experience entry, incomplete output.

\- What is the final output format? (Template design is out of scope, but exporting output is required.)



**### Additional Open Questions on PDF Input and Scoring**



\- Should scoring happen immediately after each entry is added or after clicking a “Review” button? Immediate scoring is smoother but costs more and adds delay. The technical team should estimate both options.

\- Which tool will extract PDF text, and how often does it fail on two-column or scanned PDFs?

\- How will we confirm that the text of an imported entry exactly matches the PDF text? (For example, automatic comparison.)

\- Full resume text field: maximum size, encryption, retention, and deletion.

\- What is the maximum number of entries per resume?



**### Open Decisions**



\- **\*\*Target for “improvement on the same entry”:\*\*** The 60% target in section 5 is proposed and requires your approval.

\- **\*\*Tolerance for extra claims:\*\*** Should the 0% target with no tolerance remain? With manual review, it can only be proven for the reviewed sample.

\- **\*\*Definition of “old version” in the five-second test:\*\*** The proposal is to use the job seeker's original resume before using the tool.

\- **\*\*Evidence source for metric 2:\*\*** Changed from “product logs” to “recorded evaluator assessment form” because evaluators are not product users. Your approval is required.

\- **\*\*Upload with more than 6 bullets in one entry:\*\*** Content will not be deleted. Final decision: keep all text, show a warning, and allow scoring only after the user reduces it to 6 bullets.

\- **\*\*Confirming upload segmentation:\*\*** Final decision: before scoring, the user reviews and confirms how entries were split. A new resume upload replaces the previous resume (final decision).

\- **\*\*Output format for “use in resume” (D10):\*\*** Final decision: copy the text of each entry (not the full file).

\- **\*\*Manual flow without sign-in?\*\*** If the user is not signed in, where are their entries stored, and will they remain after the page is closed? No decision has been made.

\- **\*\*What does replacement change?\*\*** Proposal: replace only the full resume text and entries whose source is “upload”; leave manually entered entries unchanged. Before replacement, warn that edits and scores for the previous uploaded entries will be lost.

\- **\*\*What counts toward the two-upload limit?\*\*** Proposal: count only uploads that were extracted successfully, so a technical failure does not use up the user's quota.

\- **\*\*Rewrite cost:\*\*** Rewriting requires one additional model call. What are its cost and delay, and how will it affect the 10-minute target?



\- **\*\*Adding a “Remove” action after the pilot:\*\*** Decide based on filtering accuracy on real job postings. Until then, the job seeker decides what to remove.



**## Change History**



\- October 24, 2026: Created this document from the uploaded file (draft 0.1); no content changes were made.

\- October 24, 2026: Final decision: the score stability metric changed from “maximum minus minimum ≤ 5 points” to “at least 90% of bullet-dimension scores must be exactly the same across 5 consecutive runs” (option B). Applied in section 5 (success metrics), risk 11, and open question 1 for the technical team.

\- October 25, 2026: Final decision: section 4.2 changed from a “fixed-field template” to “rewriting a bullet using the Context → Action → Result pattern.” A bullet is free text and the pattern only guides sentence structure. Flow: ask “Do you want a rewrite?” (default Yes), then ask one question for each missing part (0–3 questions, skippable); a complete bullet only needs final confirmation; for incomplete answers, offer a draft or approval of a rewrite using the answers already provided. The `template`, `context`, `action`, and `result` fields were removed from the table in section 4.4. The “no extra claims” rule was also extended to rewrites using the pattern.

\- October 25, 2026: Final decision: the first success metric (section 5) was redefined as “add one bullet and accept or reject its rewrite (or approve a complete bullet without questions) within the first 10 minutes.” Two open decisions about the template (“definition of completing an experience” and “relationship between the template and the bullet”) were closed and removed, and risk 5 was rewritten.

\- October 25, 2026: Final decision: “If you have real numbers, include them” was moved into the Result question. The sentence “personal learning without an observable change scores 1” and three examples of score 1 (vague, output only, personal learning) were added to section 4.3.

\- October 25, 2026: Final decision: section 4.1 uses a two-step process with full job posting analysis (type: hard or soft; priority: Required, Preferred, Bonus; “red line” grouped under “Required”). Actions became “Highlight / No change / Shorten,” and “Remove” was removed. The open decision about adding “Remove” after the pilot was recorded.

\- October 25, 2026: Final decision: version 1 is a text-based terminal flow. All tool text is in English at B1 level. UI and Persian language will be added in later versions.

\- October 25, 2026: Final decision: the rubric changed from four dimensions to three equally weighted dimensions (Context, Role and Action Clarity, Result). “Product Manager skill evidence,” “Structure and scannability,” and the phrase “Weak for a Product Manager” were removed. `context_present` is no longer needed; the Context score replaces it. A new rubric version was recorded (`rubric_version = 2`).