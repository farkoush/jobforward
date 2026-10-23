# Draft PRD: Helping Entry-Level Job Seekers Narrate and Select Their Experience (Phase 1: Product Manager)

Status: Draft 0.1, not a final document. October 23, 2026. Parts that do not yet have a final decision are marked with the word "suggested" and are collected at the end of the document.

## 1. Problem

Which user problem? The job seeker doesn't know which part of their experience to select for a specific position, or how to state it in a way that is understandable at a glance.

With what evidence?

Insight 3 (narrative): The resume and portfolio have no narrative structure.
- Parnaz says the most important pain point is not presenting oneself and one's work properly. The selected candidate's resume showed "in one scroll" what they had done.
- Job seekers ask, "How do I explain it logically and impressively?" (M13).
- About 7 of 23 open-question responses (the most mental energy spent on writing a resume) were about "About me," abilities, achievements, and skill level.

Insight 4 (selection): Each employer's criteria differ (skills, university, or experience). Job seekers ask, "Which skill should I bold?" (I19) and "Do all experiences have to be included?" (M19). Because the criteria are heterogeneous, a single standard guide doesn't work.

Evidence limitation: About 7 of 23 open-question responses go back to these topics. The sample is small and qualitative, and several key claims came from only one or two interviews.

## 2. Audience

For whom? An entry-level job seeker in the product field whose goal is a product manager role. "Entry-level" means zero or little experience in product; projects, courses, and side work are also accepted as experience.

In what situation?
- Before the interview gate, preparing a resume for a specific job posting.
- Has no personal mentor or professional feedback available.
- Their resume is in English (the first version accepts only English resumes).

Reader of the output: The employer doing screening, who has a few seconds. They are not a direct user of the product, but the quality of the output is measured from their perspective.

## 3. Assumptions

Assumptions that have so far been assumed true and must be tested. Items 7 to 9 are hidden assumptions that had not been stated until now.

| # | Assumption | Current evidence | Cheapest test |
|---|---|---|---|
| 1 | Experience (including projects, courses, and side work) exists, and the main problem is the lack of structure, not the lack of experience or confidence | Weak evidence (about 7 of 23 responses). Also in tension with the definition of entry-level | Ask 8 to 10 entry-level people to write 3 experiences relevant to a job posting in 10 minutes and see how many can't |
| 2 | The employer's criteria can be extracted from the job posting text | No evidence. The real criteria may not be in the posting | Give 10 real postings to 2 product managers to state the real criteria and compare with the tool's output |
| 3 | The job seeker is willing to enter the posting and their experiences into the tool and enters the data quality correctly | No evidence | Manual test with 5 people and observation |
| 4 | Automated feedback is valid and trustworthy for them and leads to a better resume even without a mentor | No evidence | After the test, ask how many suggestions were accepted and why |
| 5 | Feedback about the product manager role can be evaluated with a specific rubric, and the "clarity score" has an operational definition | A four-dimension rubric is defined, but its validity has not been tested | Have 3 product managers score 10 existing resumes with the rubric and measure the correlation before building |
| 6 | The clarity score is aligned with the employer's judgment | No evidence. Not examined | Same test as assumption 5 |
| 7 | (Hidden) The target job seeker can and wants to have an English resume, so blocking Persian resumes does not lose a large part of the audience | No evidence | Short question to 10 entry-level people: what language is your current resume in? |
| 8 | (Hidden) Completing one experience in the first 10 minutes is realistic | No evidence | Timing in the manual test for assumption 3 |
| 9 | (Hidden) The pilot raters are representative of real screening employers | No evidence | Introduce 5 raters and record their hiring history |

## 4. Solution

Three features are built in the first version. All of them work only on the resume and only on data the user has entered themselves.

### 4.1 Job Posting Matcher (JD Matcher)

Input: The job posting text (Persian or English, pasted text only) and the job seeker's experiences.
Process: Two stages, posting analysis and then filtering experiences.
Output: A list of "Bold it / Shorten it / Remove it" with a one-line reason for each item.
Boundary: The "Remove it" message exists only in the matcher. The clarity score is independent of the posting.

### 4.2 Structured "Context → Action → Result" Template

Each experience is filled in with fixed fields, and the output is one coherent paragraph or bullet.
For each bullet the tool asks 1 to 2 questions and can suggest the template itself. and can suggest the template itself. Next to the "result" field, only this encouragement appears: "If you have a real number, add it."
The tool does not fabricate a number, impact, or claim. If the job seeker has no real impact, the tool does not write one for them. After the user's answer, the tool proposes a rewrite using only the user's own words. The rewrite is made only with the user's own words and after their confirmation. If the user doesn't answer or rejects the question, there is no rewrite.

### 4.3 Smart Review and Clarity Score

The resume is read and the tool shows where it is vague, where it has no result, and which part is weak for a product manager.

Scoring unit: Each work experience separately, with 1 to 6 bullets. An experience without a description is saved as a draft, is not included in the average, and the job seeker is advised to write a description (even one bullet).

Four dimensions (each a 0, 1, and 2 checklist): role and action clarity, outcome, product manager skill evidence, structure and scannability. In the "outcome" dimension, a specific qualitative outcome gets 2 and a vague outcome gets 1.

Score: The experience score is the equal-weighted average of the four dimensions (25% weight each, revised after the pilot) on a scale of 0 to 100. The overall score is the simple average of the experiences that have bullets. The overall score and the sub-scores are both displayed. In the first version, the weights of the four dimensions are equal (25% each). After the pilot, the weights are revised only with data, and any change creates a new rubric version.

The overlap warning at the experience level suggests merging and has no effect on the score.

Feedback flow: bullet → 1 to 2 questions → user's answer → rewrite suggestion → user approval or rejection → new bullet with the status "edited" → re-analysis.
Only new or edited bullets are re-analyzed, and the rubric version is stored next to each score.

### 4.4 Experience Structure

Each experience is stored with these fields, whether created manually or imported from a PDF.

| Field | English name (snake_case) | Type | Required | Description |
|---|---|---|---|---|
| Experience type | entry_type | One of: job, project, course, side work | Yes | An entry-level person with zero experience can record things other than "job" |
| Title | title | Text | Yes | Role, or project or course name |
| Organization or context | organization | Text | No | Company, university, or platform |
| Start and end | end_date, start_date | Text or "to date" | No | Stored as the user wrote it or as it appears in the PDF and is not reformatted |
| Bullets | bullets | List of 1 to 6 items | Yes, for getting a score | Each bullet is free text |
| Rewrite template for work experience, including: context, action, result | template: { context, action, result } | Three texts for each bullet | No | Three fixed fields: context, action, result; only when the user uses the template; the tool does not fill them in. The content of each field can be empty. |
| Source | source | Manual or PDF upload | Automatic | |
| Status | status | Draft or ready | Automatic | An experience without bullets is a draft, is excluded from the overall average, and the user is advised to write a description |
| Analysis status of each bullet | analysis_status | New, edited, or analyzed | Automatic | Only a new or edited bullet is re-analyzed |
| Dimension scores | dimension_scores { role_action_clarity, result, pm_skill_evidence, structure_scannability } | Four values of 0, 1, and 2 | Automatic | Role and action clarity, outcome, product manager skill evidence, structure and scannability |
| Experience score | entry_score | 0 to 100 | Automatic | Equal-weighted average of the four dimensions |
| Rubric version | rubric_version | Number | Automatic | Stored next to each score |
| Tool questions | follow_up_questions | List | Automatic | 1 to 2 questions |
| User answers | user_answers | Free text, per question | Automatic | |
| Rewrite suggestion | rewrite_proposal | Text | Automatic | |
| Rewrite status | rewrite_status | No answer, proposed, approved, or rejected | Automatic | |
| Overlap warning | overlap_warning | Merge suggestion | Automatic | Has no effect on the score |

The overall score is not stored on the experience and is the simple average of the scores of experiences that have bullets. Each experience's score and the overall score are independent of the posting.

### 4.5 Data Entry

Manual path (required). The user adds experiences one by one. Each experience gets a score upon being added or edited, and the user applies ready experiences in their own resume. The output format is copying the text of each experience.

English PDF upload (optional).
- Only PDF and only English. The resume language is declared at upload, and a Persian resume is blocked.
- Experiences are separated from the PDF text and stored without any change to the content in the same structure above. The tool only splits and does not rewrite, summarize, or correct spelling.
- Before scoring, the user sees the split of experiences and confirms it, and can edit all fields. If an experience has more than 6 bullets, all the text is kept, and scoring happens after the user themselves reduces it to 6 bullets.
- The full resume text is also stored unchanged in a separate field, along with the file name and upload date. In the first version, this field is only stored so that later versions can use it without re-uploading.
- If text could not be extracted from the PDF (for example, a scanned file), the tool says so and suggests the manual path.
- Upload is only for a user who has logged in with email.
- In the first version, each account can upload a resume at most twice.
- A new resume replaces the previous resume.

## 5. Success Criteria

Pilot period: 6 weeks with 30 entry-level product job seekers and 5 raters. The numbers are suggested targets. We have no current baseline, and it will be measured in the first week of the pilot. Offline criteria are measured before the pilot starts.

| Metric | Target | Deadline | Citable source |
|---|---|---|---|
| Completing at least one experience in the structured template in the first 10 minutes | ≥ 60% of users | 6 weeks | Product log (start and completion events with timestamps) |
| A rater who in 10 seconds says what the job seeker has done for this role | ≥ 70% of raters | 6 weeks | Raters' recorded evaluation sheet |
| 5-second test with 10 product managers or employers: stating the role and main outcome | ≥ 70% correct answers, new version versus old | 6 weeks | Recorded test with answer key |
| Correlation of the tool's score with the raters' scores (experience level and overall score) | ≥ 0.6 | Offline, before the pilot, and repeated in the pilot | The tool's score and the independent score of 5 raters for the same experiences |
| Score stability: 5 consecutive runs on an unchanged experience | Max minus min ≤ 5 points | Offline | Recorded tool runs |
| Improvement on the same experience after review | Suggested: in ≥ 60% of edited experiences at least one dimension goes up one level, and raters, in a comparison blind to order, judge the later version better | 6 weeks | Before and after scores, plus the raters' comparison |
| Extra claims from the tool | 0% in the reviewed sample | 6 weeks | The rater compares each sentence of the rewrite suggestion with "original bullet + user's answers" |

Why 0.6? This value is usually the boundary between moderate and strong correlation. The tool should not agree more than the raters themselves agree with each other. Before the pilot, the correlation of raters with each other is also measured, and if it is less than 0.6, the threshold is lowered to that value. This threshold stays in the first version and is reviewed after the pilot.

## 6. Out of Scope

This version intentionally does not build these:
- Fields other than product manager
- Portfolio (the first version is resume only)
- Persian resume; its upload is blocked
- Job posting input from a link or file (text only)
- Generating fake experience or numbers for the job seeker (the tool works only on the user's own data)
- Sending a request directly to the employer or ATS
- Human mentor or coaching
- Visual design of resume and portfolio templates
- The interview stage and practicing it

## 7. Risks

| # | What could go wrong | Response or risk mitigation |
|---|---|---|
| 1 | Wrong or generic feedback: if the clarity score doesn't match the raters' opinion, trust is lost | Offline validation with real product managers and comparison of the score with raters' judgment in the pilot |
| 2 | Over-matching: all resumes become alike, or the job seeker says something that isn't true | The tool asks questions, and the rewrite uses only the user's words, after their answer and confirmation |
| 3 | Weak input data: a vague posting or incomplete experiences give weak output | Clear message to the user and saving as a draft |
| 4 | Little evidence: the 23-person sample may not be generalizable | Tests of assumptions 1, 2, and 5 before building |
| 5 | Lack of experience: the template stays empty for someone with no product experience | Accepting projects, courses, and side work as experience |
| 6 | Privacy: storing resumes and postings is sensitive | A clear data retention and deletion policy before the pilot |
| 7 | Limited evidence: several key claims came from only one or two interviews | Supplementary interviews before building |
| 8 | Fabricated number by the job seeker: the job seeker enters a false number for their experiences. The tool cannot verify it | Conscious acceptance of the risk. The tool itself does not make up numbers and only encourages a real number |
| 9 | Gaming the score: the score goes up without the resume actually getting better | Raters' comparison of the before and after versions, blind to order |
| 10 | Extra claims from the tool (it says something the job seeker didn't say) | The 0% criterion with manual review of a sample and the rule "no adding facts to the rewrite" |
| 11 | Score instability: one text gets two different scores in two runs | Stability criterion ≤ 5 points before the pilot |

## 8. Technical Constraints

Recorded decisions
- Resume language: English only. It is declared at upload, and uploading a Persian resume is blocked. Resume language detection must be coordinated with the technical team.
- Job posting input: pasted text only, Persian or English.
- Data structure: each experience has at least 1 and at most 6 bullets. An experience without a description is a draft.
- Incremental analysis: only new or edited bullets are re-analyzed, and the rubric version is stored next to each score.
- Score independence from the posting: the clarity score never uses the posting.
- Tool behavior: it asks questions and, after the user's answer, proposes a rewrite; it never fabricates a number, impact, or claim and doesn't change anything without confirmation.
- Email login: resume upload is possible only after logging in with email.
- Upload cap: at most two uploads per account in the first version. This cap must be enforced server-side and per account, not only in the interface.
- Replacement: a new upload replaces the previous resume.

Measurement requirements
- Event log with timestamps: start, experience completion, acceptance and rejection of a suggestion, score before and after.
- A tool for collecting raters' scores and the answers of the 5-second test.
- The ability to run repeatedly on a fixed experience for the stability test.

Open questions for the technical team
1. Is scoring done by a language model or rule-based? How is stability ≤ 5 points guaranteed?
2. What are the cost and latency of each analysis? The 10-minute target depends on this.
3. Is resume input manual or PDF? What is the field schema?
4. How are extra claims detected automatically, or do we only have human review?
5. Data retention and deletion, user consent, and possible use of data for model evaluation.
6. Behavior on failure: vague posting, empty experience, incomplete output.
7. In what format is the final output (template design is out of scope, but exporting is needed)?

PDF input and scoring (additional open questions)
- Should scoring be instant after adding each experience or with a "Review" button? Instant is smoother but has more cost and latency. The technical team should estimate both.
- Which tool extracts the PDF text, and what is the failure rate on two-column or scanned PDFs?
- How is it verified that the text of the entered experience is exactly identical to the PDF text? (For example, automatic comparison)
- Full resume text field: maximum size, encoding, retention, and deletion.
- What is the maximum number of experiences per resume?
