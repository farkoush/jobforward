**# Draft PRD: Helping Early-Career Job Seekers Tell Their Story and Choose Relevant Experience (Phase 1: Product Manager)**



**\*\*Status:\*\*** Draft 0.1, not a final document. October 23, 2026. Sections that do not yet have a final decision are marked “Proposed” and collected at the end of the document.

> **Update (November 8, 2026):** This document remains the product-level record of version 1, with dated update notes that supersede the original text (kept as history). The canonical, implementation-level specifications now live in `specs/` (`001-experience-improvement-flow`, `002-jd-matcher`, `004-llm-gateway`) under the project constitution (`.specify/memory/constitution.md`, currently v4.2.0). Where wording differs, the specs and the constitution govern; this file records the product decisions and their dates.



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



Three features will be built in version 1. They all work only on data entered by the user (updated October 30, 2026: the JD Matcher analyzes only the pasted job posting and never touches resumes — originally "only on resumes"). Version 1 is a text-based terminal flow, and all tool text is in English at B1 level. The UI and Persian language will be added in later versions.

> **Update (November 8, 2026 — editions, language, model access):**
> Since Phase 16 of feature `001-experience-improvement-flow` (November 5,
> 2026) the repository carries TWO VIEW EDITIONS of one engine: `terminal/`
> (Python "Terminal v1" — the original rule/test baseline, FROZEN; its
> display and flows never change) and `web/` (the product's continuation).
> Governance (`specs/`, `.specify/`, `docs/`) stays shared at the repository
> root. Version 1 remains English-only at B1 level — including error and
> limit messages (constitution v4.0.0 redefined the earlier plan for Persian
> error messages; the Persian UI stays a later-version item). On the web,
> model-based bullet scoring runs through the centralized LLM Gateway of
> feature `004-llm-gateway` (section 4.6 below) with the free path as the
> default; the JD matcher, all score arithmetic, and rewrite assembly stay
> deterministic code.



**### 4.1 Job Description Matcher (JD Matcher)**

> **Update (October 29, 2026; expanded October 30, 2026 after implementation):**
> Superseded by feature `002-jd-matcher` (constitution v3.0.0 P6; implemented
> October 30, 2026 under rules version `matcher-rules-1.0.0`). The matcher
> analyzes ONLY the pasted job posting — it never reads or touches resumes —
> and outputs skill tables only: three hard-skill tables (Must / Should /
> Nice) with verbatim evidence for every row, plus one soft-skill table drawn
> strictly from the 56-skill taxonomy (`docs/soft-skills-taxonomy.json`; the
> shown skill name is exactly `label_en` and the ESCO id is stored but never
> displayed). The flow is staged with an explicit gate at every stage
> (`[Y] Continue · [C] Cancel`; Cancel returns to the paste prompt and
> discards the stage result; Cancel at the paste prompt exits): paste the
> full posting in English, finished by a line containing only `END` (or
> end-of-input) → review the cleaning report and word count (the pasted text
> is cleaned of control characters, `<script>`/`<style>` blocks, and HTML
> tags — nothing in it is executed; 100–1,500 cleaned words are accepted) →
> hard-skill tables → soft-skill table. Priorities follow a fixed cascade
> (explicit priority word on the item > section heading > Must
> "(default)"); each table shows at most 5 rows while the counts line always
> shows the real totals; rows without verbatim evidence are dropped and
> counted. There is no free-form "matches / does not match" verdict: input
> errors (not a job posting) and extraction failures (zero skills) are
> reported with their own fixed messages and are never reported as a
> mismatch. The per-entry actions ("Highlight / No change / Shorten") are
> retired as product behavior, and postings must be English: a posting with
> more than 10% Persian/Arabic-script letters is rejected. The original
> two-step design below is kept as history.
>
> **Update (October 30, 2026 — web usability prototype):** A clickable web
> prototype of this tool was built for usability tests with 5 job seekers
> (`web/`, Next.js; prototype name "Job Forward"). It adds no new rules: the
> terminal's deterministic engine was ported line-for-line to TypeScript
> (verified output-identical against the Python engine on cleaning, both
> skill extractions, scoring, question conditions, rewrite assembly and the
> reference fixture), no model is called, and all tool texts are the
> terminal's. Web-only decisions recorded by the product owner: (1) in the
> web matcher the SOFT-skill table is displayed BEFORE the hard-skill
> tables — a deliberate deviation from the terminal order hard → soft,
> recorded in the stage-gate logs under their true stage names; (2) the web
> flow covers ONE experience entry per session, with a "Restart session"
> control between participants; (3) Features 2–3 texts and the staged
> gates are unchanged. Session state lives in the browser (localStorage),
> event logs are JSONL behind a replaceable storage adapter (secrets
> stripped), and access is behind a shared-password gate with a per-session
> rate limit. This prototype is a test instrument only; the "UI and Persian
> language in later versions" decision for the product is unchanged.

**\*\*Input:\*\*** Job posting text (English only; a posting with more than 10% Persian/Arabic-script letters is rejected — updated October 29, 2026; originally Persian or English, pasted text only) and the job seeker's experience.



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



**### 4.2 Rewriting a Bullet Using the Five‑Part Framework (User Need → Product Feature → Action → Result → Metric)**

> **Update (October 29, 2026):** Finalized as the five‑part framework
> (rubric_version 3). The five parts (`user_need`, `product_feature`,
> `action`, `result`, `metric`) are extracted automatically and contain
> only the candidate's own words; the candidate never fills in the
> framework directly — they only answer the generated questions. The
> question flow changed from 0–3 to 0–5 questions as described below. The
> Context → Action → Result pattern remains the sentence structure for
> rewrites.

> **Update (November 3 → November 8, 2026):** Two amendments to how the five
> parts are identified, both in feature `001-experience-improvement-flow`:
> (1) **rubric-3.1.0** (November 3, 2026, Phase 11) tightened the extraction
> rules — research/mapping verbs (analyzed, researched, benchmarked, …) are
> need signals and never fill the action part; an infinitive purpose clause
> ("to uncover …") is a vague result; no word appears in two parts (the
> single exception: a feature name inside the action sentence); `flow(s)` is
> a feature marker and `had no` a need marker; whitespace is normalized
> before extraction, so a multi-line bullet extracts exactly like its
> single-line equivalent. (2) **Single-source scoring output** (§14,
> November 8, 2026): when a bullet is rated by a model, the five parts are
> NOT a separate judgment — the rating output carries, alongside the 0/1/2
> ratings, one verbatim quotation per part (Context carries two: need and
> feature), and the five parts, their presence flags, and their
> missing/vague/complete statuses are filled and derived from those quotes.
> A model output that breaks the score-quote invariants (a 2 without its
> required quote(s), a 1 with an empty need/action/result quote, a 0 with a
> quoted need, or a quote that is not a whitespace-normalized verbatim
> substring of the bullet) is INVALID — retried once through the existing
> loop, then refused with the user's data intact and no silent fallback. The
> deterministic engine is byte-identical to before (its quotes are its
> extraction results); the rubric stays rubric-3.1.0 because no scoring
> criterion changed. The question flow of this section (0–5 questions, the
> question texts, and the conditions: Need/Action/Result when their
> dimension scores 0 or 1; Feature/Metric when the field is empty) is
> UNCHANGED by both amendments.

A bullet is free text. The framework only organizes the questions and the rewritten sentence; the user does not fill in separate fields.

First, the tool asks: “Do you want me to rewrite this bullet to make your experience stronger?” (Default: Yes). If the answer is yes, the tool asks exactly one question for each missing or vague part, in this order: Need, Feature, Action, Result, Metric. A part is missing when it is empty or vague; “vague” is determined by the relevant dimension score in section 4.3 (0 or 1). The Need, Action, and Result questions are asked when their dimension scores 0 or 1; the Feature and Metric questions are asked when the field is empty. This means there are 0–5 questions, and the job seeker can skip any question. Before each question, the tool identifies the achievement and the part being discussed. If the bullet is complete (Context, Specific Action, and Result all score 2), no questions are asked; the tool only asks the user to confirm the bullet at the end. The metric is optional and never blocks completeness.

\- **\*\*Need:\*\*** “Who had a problem? What was the problem?”

\- **\*\*Feature:\*\*** “What was the feature or product part you worked on?”

\- **\*\*Action:\*\*** “What exactly did you do? What was your role?”

\- **\*\*Result:\*\*** “What changed after your work? Who did it help?”

\- **\*\*Metric:\*\*** “Do you have a real number? If not, you can skip this.”

The tool does not invent numbers, impact, or claims. If the job seeker has no real impact to report, the tool does not make one up. Rewriting rules (WORDING): keywords — nouns, verbs, tool names, numbers, results, product names — stay unchanged; allowed changes are grammar, spelling, verb tense, short linking words (and, to, with, by, for), and word order; forbidden are replacing keywords (even synonyms), adding new nouns/verbs/tools/numbers/results, and overstating or understating the role. If a rewrite would require a new keyword, the relevant part stays empty and the tool asks a question. If the job seeker answers at least one question but leaves the others unanswered, or needs time to think, the tool offers two options: save the work experience entry as a draft, or confirm a rewrite using only the answers already provided. Rewriting uses only the user's own words and happens only after their approval. If the user does not answer or skips all questions, no rewrite is made.



**### 4.3 Smart Review and Clarity Score**



The resume is reviewed, and the tool shows where each work experience entry lacks context, where the action is unclear, and where the result is missing.



**\*\*Scoring unit:\*\*** Each work experience entry is scored separately and has 1–6 bullets. An entry without a description is saved as a draft, is excluded from the average, and the user is asked to add a description (even one bullet).



**\*\*Three dimensions\*\*** (each uses a checklist scored 0, 1, or 2): Context, Specific Action (replacing “Role and Action Clarity” — updated October 29, 2026; the stored key `role_action_clarity` is unchanged), and Result. The framework's five parts (`user_need`, `product_feature`, `action`, `result`, `metric`) are extracted automatically and contain only the candidate's own words; `part_present` (five booleans) replaced `context_present` (updated October 29, 2026). For Context (based on `user_need` and `product_feature`, priority given to the need): 0 means the need is missing, even if the feature is mentioned; 1 means the need is general, or the need is specific but the feature is missing; 2 means both the specific need and the feature are present. The exact 0/1/2 levels for Specific Action are defined in the scoring checklist (`specs/001-experience-improvement-flow/checklists/specific-action.md`). The entry score is the simple average of the three equally weighted dimensions (0–100). After the pilot, weights will be reviewed only using data, and any change will create a new rubric version.

For the Result dimension, a specific qualitative result scores 2 even without a number, and a vague result scores 1. If only a bare number is supplied without a result (for example, “20% growth”), the result score is 1 and the tool asks what the number represents. The metric adds detail to the result but never changes its score. Personal learning without an observable change (such as “I learned how it works”) scores 1. Examples of score 1:

\- Vague: “Improved performance”

\- Output only: “Built a dashboard” (no impact)

\- Personal learning: “Learned how data analysis works”

\- Bare number only: “20% growth”

**\*\*Score:\*\*** The entry score is the equal average of the three equally weighted dimensions on a 0–100 scale (equal weights — the “25%” wording was a leftover and was corrected on October 29, 2026). The overall score is the simple average of entries that have bullets. Both the overall score and sub-scores are shown. After the pilot, weights will be reviewed only using data, and any change will create a new rubric version. `rubric_version` is now 3 because the Context definition changed; prior scores remain associated with their original rubric versions.

> **Update (November 3 → November 8, 2026; feature `001-experience-improvement-flow`):**
> - **Rubric version:** since November 3, 2026 the version of record is the
>   semver string **rubric-3.1.0**, stored with every new score (the numeric
>   "version 3" above is the historical name). rubric-3.1.0 changed no
>   dimension weights; it aligned the result dimension — a present-but-vague
>   result scores 1 and 0 is reserved for a missing result — and tightened
>   the extraction rules (section 4.2 note). Prior scores keep their stored
>   version.
> - **Coverage record (Phase 12, November 4, 2026):** before any part
>   receives its status, the engine runs a diagnostic coverage pass; every
>   word of the bullet that no framework part claims appears in exactly one
>   "orphaned" span with a reason, and each part carries quotation, status,
>   and reason. The record is stored with the analysis and rendered on the
>   web (a neutral gray "Not attributed to the framework" block); it has NO
>   effect on scores, questions, or completeness.
> - **Single-source scoring output (§14, November 8, 2026):** for a
>   model-rated bullet the ratings and the five-part template come from ONE
>   output — ratings plus verbatim per-part quotes (section 4.2 note); the
>   displayed status per part derives from score + quote only (missing =
>   empty quote; vague = quote present and dimension below 2; complete =
>   quote present and dimension 2). Scores are never patched per dimension:
>   after answers, the improved bullet is re-scored through the same single
>   pass as a first-time bullet, and a rewritten bullet re-extracts its
>   parts fresh (a stale-stored-parts bug was fixed 2026-11-08).
> - **Web display superseded (Phase 15, November 5, 2026):** the web
>   prototype no longer uses the bracket format — it shows a five-cell
>   status row (Complete / Vague / Missing, text and weight only, no icons),
>   the framework as ONE sentence with soft underlines (status colors kept)
>   and dotted placeholders for missing parts, and a focused
>   one-question-at-a-time improvement loop (missing parts first, then
>   vague, Metric last; typing updates the sentence live; complete bullets
>   skip the loop). The terminal's bracket display and list format are
>   unchanged (frozen).
> - **Model banner superseded (spec-004 §15/§16, November 7, 2026):** the
>   Phase-11 disclosure banner (shown only on screens where a model call can
>   happen) was upgraded to a persistent header banner on EVERY screen,
>   showing the active answering source ("Default free" / "My key") and the
>   connection color state, with in-place source switching (section 4.6).

An overlap warning suggests merging overlapping bullets within an experience entry and does not affect the score (corrected October 29, 2026: the overlap unit is the bullet, not the entry).

**\*\*Feedback flow:\*\*** Bullet → extraction of the five parts and analysis of the three dimensions → framework display (header, `Original:` line, bracketed parts with `missing`/`vague` notes, `Filled correctly` and `Still needs to be filled` lists) → “Do you want a rewrite?” question (default: Yes) → 0–5 questions in Need, Feature, Action, Result, Metric order (only for missing or vague parts, each skippable) → user answers → (if any part is unanswered: save as a draft or confirm a rewrite using the existing answers) → rewrite suggestion → user approves or rejects → new bullet marked “edited” → re-analysis. A complete bullet only requires final confirmation. When all bullets are approved or left unchanged, the final text is shown without brackets, inside a code block, one bullet per line prefixed with “- ”, with a notice that the candidate can copy it.



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

\| Framework parts \| `user_need`, `product_feature`, `action`, `result`, `metric` \| Text, extracted automatically \| Automatic \| The five parts contain only the candidate's own words (updated October 29, 2026). \|

\| Part presence \| `part_present` \| Five booleans \| Automatic \| Replaces `context_present` (updated October 29, 2026). \|

\| Dimension scores \| `dimension_scores {context, action, result}` \| Three values: 0, 1, or 2 \| Automatic \| Context, Specific Action, Result. \|

\| Rubric version \| `rubric_version` \| Number \| Automatic \| Stored with each score; current version 3. \|

\| Tool questions \| `follow_up_questions` \| List \| Automatic \| 0–5 questions. \|

\| User answers \| `user_answers` \| Free text, one per question \| Automatic \| \|

\| Rewrite proposal \| `rewrite_proposal` \| Text \| Automatic \| \|

\| Rewrite status \| `rewrite_status` \| No response, draft, proposed, approved, or rejected \| Automatic \| \|



The overall score is not stored on a work experience entry; it is the simple average of the scores for entries that have bullets. Each entry score and the overall score are independent of the job posting.

> **Update (November 4 → 8, 2026; feature `001-experience-improvement-flow`):**
> - New per-bullet field **`coverage`** (Phase 12): the chunk-attribution
>   record — one entry per part (`{quote, part, status, reason}`) plus one
>   per orphaned span — diagnostic only (section 4.3 note).
> - `part_present` is now defined as quote presence (§14): a part with no
>   quotation is missing, never vague; "vague" additionally requires the
>   dimension score to be 0 or 1.
> - For a model-rated bullet the five part fields are populated from the
>   rating output's verbatim quotes (§14, section 4.2 note); the storage
>   shape is unchanged.
> - Entry-level fields (Phase 13, November 4, 2026): `company`, `dates`,
>   `product_domain` — optional and additive; old documents load unchanged.
>   Phase 18 (November 6, 2026, web-only) supersedes the entry-time form:
>   these become per-part review fields after the paste, and `dates` becomes
>   structured start/end year–month (`start_date`, `end_date`) with an
>   "I still work here" ongoing flag — still optional and additive.
> - **Bullet cap:** the 1–6 bullets-per-entry rule is the TERMINAL rule and
>   stays frozen there; the web prototype REMOVED the upper cap (Phase 18,
>   product-owner decision 2026-11-06): zero confirmed achievements saves a
>   draft; one or more saves the entry with no upper cap.



**### 4.5 Data Entry**



**\*\*Manual flow (required).\*\*** The user adds work experience entries one by one. Each entry is scored when added or edited, and the user uses the ready entries in their own resume. The output format is copied text for each entry.

> **Update (November 4 → 8, 2026; feature `001-experience-improvement-flow`):**
> The manual flow's WEB implementation changed twice, and the PDF option was
> deferred:
> - **PDF upload and email sign-in are DEFERRED to the next version**
>   (constitution, additional constraints; never built in version 1). The
>   PDF subsection below is kept as the recorded design for that version.
> - **Phase 13 (November 4, 2026, web-only): paste-and-split entry** — the
>   entry screen collects one job's whole experience at once (short fields
>   for title, company, dates, product domain + one achievement box); the
>   tool splits the paste into candidate bullets, flags responsibility-style
>   lines, and every keep/discard/merge/split/delete decision is the user's.
>   Text is only moved or re-joined, never rewritten.
> - **Phase 18 (November 6, 2026, web-only) supersedes that entry form:**
>   after the experience-type selection, ONE paste box for the whole text of
>   ONE experience; the split segments appear on one review screen with
>   fixed per-type section labels and move by DRAG-AND-DROP (only the first
>   non-marker line auto-places into Title; the tool never guesses —
>   automatic attribution was explicitly rejected by the product owner); a
>   type switcher swaps only the labels; structured year–month start/end
>   dates with an "I still work here" option; the merge/split/delete and
>   keep/discard buttons are gone — the found achievements are plain
>   editable text, and cleared rows drop at confirm; a no-change re-confirm
>   skips re-analysis; every stage has a Back control that never wipes
>   answers; the separate score screen is merged into the bullet-list review
>   page (Experience score with a progress ring; the per-bullet 0/1/2
>   ratings are displayed in both places — owner decision 2026-11-07). The
>   pasted original text stays visible during each bullet's analysis.
> - The terminal's bullet-by-bullet entry flow and display are unchanged
>   (frozen baseline).



**\*\*English PDF upload (optional).\*\***



\- Only PDF files and English text are accepted. The resume language is declared during upload, and Persian resumes are blocked.

\- Work experience entries are extracted from the PDF text and saved in the structure above without any content changes. The tool only splits the text; it does not rewrite, summarize, or correct spelling.

\- Before scoring, the user reviews and confirms how the entries were split and can edit all fields. If an entry has more than 6 bullets, all text is retained, and scoring can happen after the user reduces it to 6 bullets.

\- The full resume text is also stored unchanged in a separate field, along with the file name and upload date. In version 1, this field is only stored so later versions can use it without requiring another upload.

\- If text cannot be extracted from the PDF (for example, a scanned file), the tool explains this and suggests the manual flow.

\- Upload is available only to users signed in with email.

\- Each account can upload a resume no more than twice in version 1.

\- A new resume upload replaces the previous resume.



**### 4.6 LLM Gateway and Model Access (added November 7, 2026; feature `specs/004-llm-gateway/`)**

> The web prototype's model scoring runs through ONE centralized LLM
> Gateway — the only component allowed to contact a model provider
> (constitution P12). Feature `004-llm-gateway` was created and clarified
> November 6, 2026 and implemented November 6–8, 2026; the summary below
> records the product-level decisions. Spec 004 is the PRIMARY spec for
> everything model-related (a separate error-UX spec, 005, was created and
> retired the same day, absorbed into spec-004 §15).
>
> **Two task categories.** Every model request declares GEN (heavy
> generation) or FAST (lightweight, low-latency); each category has one
> primary model plus an ordered, configurable fallback list. A failure is a
> rate-limit error, server error, timeout, empty response, or invalid
> response; the next fallback is tried in order and the first success is
> returned. Invalid operator keys and invalid inputs are configuration/input
> errors and never trigger fallback; a "model not found" class answer goes
> straight to the next fallback.
>
> **Free path is the default.** The user works without entering any key; the
> provider key (NVIDIA) is held only server-side by the operator.
>
> **Limits (all env-configurable; defaults):** per-user daily 15 GEN and 50
> FAST requests; global daily 250 GEN and 600 FAST; 3 requests/minute per
> user on the free path; a global provider limiter of 30 calls/minute (~75%
> of the key's ~40 rpm) that counts every actual provider call — including
> retries and fallback attempts — with a ~5-second queue before a "service
> busy" rejection; a cap of 4 provider calls per request (persistent 429s
> end in the typed RATE_LIMITED result with a retry-after); BYOK 10
> requests/minute; input up to ~8,000 characters; output up to ~2,000 (GEN)
> / ~500 (FAST) tokens. The quota day is the calendar day in UTC, and the
> limit message shows the UTC reset time. Daily quotas count user-visible
> tasks; internal retries and fallbacks count only against the per-minute
> provider limiter.
>
> **Access without accounts.** First-time access is gated by one shared
> gateway password (read only from server-side environment configuration);
> on success the server sets a signed, httpOnly, ~30-day anonymous identity
> cookie that keys the per-user quotas. There are no accounts, registration,
> or user-side password changes in this version; clearing cookies starts a
> fresh quota — an accepted residual risk, backstopped by the global quotas
> and the per-minute limiters.
>
> **Input and data safety.** The user's in-progress input is persisted
> durably before it is sent and cleared only after a fully successful
> response; in EVERY failure or rejection mode the input stays intact,
> partially streamed text is preserved, and Retry resends it without
> retyping (a reload recovers the draft). The user's data (entries, bullets,
> answers, drafts, history) NEVER depends on LLM success — a model failure
> can never cause data loss or block access to saved data (constitution
> P18). GEN responses stream; a stream cut midway offers ONE "continue"
> action that appends to the preserved text. The gateway never surfaces an
> unhandled crash: it always returns a structured outcome (success, failure
> reason, retry-ability, suggested wait, source).
>
> **BYOK (bring your own key).** Optional, in a fully independent "LLM
> settings" section reachable from everywhere (menu, header banner, failure
> paths, plus a quick save modal from the header). The key is used only for
> the request it was entered with and is never stored, logged, or displayed.
> A failed user-key request NEVER falls back to the free path automatically
> — it shows its own message, and an explicit button offers resending that
> same request with the default free combo. BYOK requests consume no free
> quota and stay fully independent of the free-path configuration (a broken
> operator config never blocks a valid user key). Displayed provider:
> EXACTLY ONE — Google AI Studio (OpenAI-compatible endpoint); the other
> registry providers (OpenRouter, Ollama, …) are hidden from the UI, not
> deleted — re-activating one is a config-level change.
>
> **Error honesty and status (§15).** Every failure maps to one class —
> TRANSIENT, NO-WAY-FORWARD, BROWSER-UNREACHABLE, or OWN-KEY — and that
> mapping is the single source for messages, guidance, and actions. A broken
> gate configuration shows a gate-specific message and NEVER AI-outage
> wording (the live-deployment mislabel diagnosed November 7, 2026: the gate
> screen showed "AI unavailable" for a missing gate configuration variable —
> no AI was involved). Every AI failure at an analysis stage shows an
> in-page guidance box at that stage; VPN advice appears ONLY for
> browser-unreachable failures (a user-side VPN cannot fix the
> server-to-provider link). When the whole free chain fails, the transfer to
> the LLM settings is preceded by a short explanation (why, where, promise
> of return), and after saving a key the user returns to the exact origin
> stage with ONE one-tap ask: "Retry with your own key?" — confirming runs
> the failed action once with the own key. Provider contact happens only at
> analysis actions, plus ONE content-free background connection check per
> session from the menu screen (owner-approved exception) with a 20-second
> client timeout and a restore-only-if-available saved status, so a stale or
> stuck banner cannot happen; explicit re-checks are always available. The
> connection status shows four truthful states — checking, available
> (green), needs-retry (yellow), unavailable (red) — and never blocks or
> delays navigation.
>
> **Persistent banner.** One header banner on every screen (from the menu
> onward, and the BYOK entry on ALL screens including the gate) shows the
> active answering source ("Default free" / "My key") and the connection
> color state, and switches the source in place — no reload, no lost place.
>
> **Diagnostics and operations (§13/§14/§16; constitution P19–P21).** Every
> request writes a privacy-safe JSONL log entry (category, the model that
> responded, whether fallback was used and its depth, token counts, timing,
> final status) — never prompt content or keys. Every failed attempt also
> logs a server-terminal line (model, HTTP status, error class, truncated
> error body ~300 chars, attempt number) and, in development only, a
> sanitized browser-console summary. Server startup echoes the resolved
> model chains (ids only, no provider contact) and warns about duplicate
> `.env.local` variables with line numbers (env hygiene: one definition per
> variable — Next.js takes the last). Operator tools: `npm run check:models`
> (chain validation), `check:connection` (timings + per-model 1-token live
> smoke), `test:live`, and `probe:rate-limit`; a dev-only mock mode
> (`LLM_MOCK=true`, header `x-mock-error`) simulates every failure class.
> Symptoms → causes → fixes are recorded in `docs/llm-gateway-runbook.md`.
>
> **What the model does and does not do.** The model supplies only the
> per-bullet 0/1/2 ratings plus the verbatim quotes each rating is based on
> (constitution P4 as amended v4.2.0; spec-001 §14). All score arithmetic,
> the JD matcher, and rewrite assembly stay deterministic code. The
> terminal's opt-in LLM adapter follows the same output contract.

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

\- Persian resumes; uploads are blocked (pasted job postings in Persian are rejected too — see section 4.1)

\- Job posting input by link or file (pasted text only)

\- A free-form "matches / does not match" verdict from the JD Matcher (the output is skill tables and their counts only — see section 4.1)

\- Skills outside the hard-skill extraction and the 56-skill soft-skill taxonomy (`docs/soft-skills-taxonomy.json`)

\- Generating fake experience or numbers for the job seeker (the tool only works with the user's own data)

\- Sending applications directly to employers or an ATS

\- Human advisors or coaching

\- Visual design of resume and portfolio templates

\- Interview stage and interview practice

\- UI and Persian interface (version 1 is an English text-based terminal flow; UI and Persian will be added in later versions)

> **Update (November 6 → 8, 2026):** additional out-of-scope items from
> spec-004 and the constitution: full authentication, user accounts, and
> registration (the web prototype uses the shared gateway password plus an
> anonymous persistent cookie instead — section 4.6); payments, usage plans,
> and a cost dashboard; additional BYOK providers (exactly one is displayed
> — Google AI Studio; the others are hidden, not deleted); the auxiliary
> per-IP daily cap and the 10-minute model-unavailability marking (both
> deferred by product decision, spec-004 FR-35/FR-33); PDF upload and email
> sign-in (deferred to the next version — see section 4.5). The PDF and
> UI/Persian items above remain recorded as the design for later versions.



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

\- **\*\*Job posting input:\*\*** Pasted text only, in English. A posting with more than 10% Persian/Arabic-script letters is rejected; scattered Persian names inside English text are allowed (updated October 29, 2026; originally Persian or English).

\- **\*\*Data structure:\*\*** Each work experience entry has at least 1 and at most 6 bullets. An entry without a description is a draft.

\- **\*\*Incremental analysis:\*\*** Only new or edited bullets are analyzed again, and the rubric version is stored with each score.

\- **\*\*Score independence from job posting:\*\*** The clarity score never uses the job posting.

\- **\*\*Tool behavior:\*\*** The tool asks questions and suggests a rewrite after the user answers. It never invents numbers, impact, or claims, and never changes anything without approval.

\- **\*\*Email sign-in:\*\*** Resume upload is possible only after signing in with email.

\- **\*\*Upload limit:\*\*** Each account can upload no more than two resumes in version 1. This limit must be enforced on the server for each account, not only in the interface.

\- **\*\*Replacement:\*\*** A new resume upload replaces the previous resume.

\- **\*\*Language and interface for version 1:\*\*** Text-based terminal flow. All tool text is in English at B1 level. UI and Persian language will be added in later versions.

\- **\*\*Matcher actions:\*\*** Retired October 29, 2026: superseded by feature `002-jd-matcher` (constitution v3.0.0 P6). The matcher analyzes only the pasted posting and outputs skill tables only (three Must/Should/Nice hard-skill tables with verbatim evidence + one soft-skill table from the 56-skill taxonomy); no per-entry actions are produced. Implemented October 30, 2026 (spec `specs/002-jd-matcher/`, rules version `matcher-rules-1.0.0`) as a staged paste → review → hard skills → soft skills flow with per-stage `[Y]/[C]` gates, a 100–1,500-word gate on the cleaned text, a 5-row display limit with real-total counts, and no free-form verdict. Historically: “Highlight / No change / Shorten,” each linked to an extracted skill (type + priority), with no “Remove” action.

\- **\*\*Rubric version:\*\*** Version 3 (October 29, 2026): the five-part framework (parts extracted automatically, only the candidate's own words), Context derived from `user_need` + `product_feature`, and Specific Action replacing “Role and Action Clarity” (stored key `role_action_clarity` unchanged). Prior scores keep their original rubric version.

- **\*\*Rubric version of record (updated November 3, 2026):\*\*** Since November 3, 2026 the version stored with every score is the semver string `rubric-3.1.0` (spec-001 Phase 11): parsing corrections (research/mapping verbs are need signals and never actions; infinitive purpose clauses are vague results; no word in two parts except feature-inside-action; multi-line normalization) and the result-dimension alignment (present-but-vague = 1; 0 reserved for missing). No dimension weights changed.
- **\*\*Single-source scoring output (November 8, 2026):\*\*** A model returns the 0/1/2 ratings PLUS the verbatim quotes each rating is based on; the five framework parts and their missing/vague/complete statuses are derived from that one output; an output that breaks the score-quote invariants is retried once and then refused (user data intact, no silent fallback). All score arithmetic stays in deterministic code (constitution v4.2.0, P4; spec-001 §14).
- **\*\*Centralized LLM gateway (November 6–8, 2026):\*\*** All model calls go through one gateway (constitution P12); model names, base URLs, and operator keys are env-only (P13); keys never appear in client code or logs (P14, with the bounded BYOK user-key exception). Free path default; optional BYOK with memory-only keys and no automatic fallback to the free path; user data never depends on LLM success (P18). See section 4.6 and `docs/llm-gateway-runbook.md`.
- **\*\*Access without accounts (November 6, 2026):\*\*** The web prototype is gated by one shared gateway password (env-only) and identifies testers with a signed, httpOnly, ~30-day anonymous cookie; full authentication stays out of scope.
- **\*\*English-only version 1 (constitution v4.0.0, November 6, 2026):\*\*** All interface text — including error and limit messages — is English at B1; the earlier plan for Persian error messages was superseded; the Persian UI is a later-version item.
- **\*\*Two editions (November 5, 2026):\*\*** `terminal/` is the frozen Python baseline ("Terminal v1"); `web/` is the product's continuation; `specs/`, `.specify/`, `docs/` are shared governance. Web-only phases never change the terminal's display or flows.
- **\*\*Web presentation decisions (November 3–7, 2026):\*\*** Warm theme with vendored fonts and zero external font requests; no emoji or colored icons anywhere; errors in the warm orange-red, never the brand red (Phase 14); the web analysis display uses the glance row + underline sentence and a focused one-question loop, superseding brackets on the web only (Phase 15); paste-first entry with drag-and-drop segment review, structured year–month dates, merged score panel, and Back on every stage; per-bullet 0/1/2 ratings displayed (Phase 18; owner decision 2026-11-07).



**### Measurement Requirements**



\- Event logs with timestamps: start, bullet added, each question answered or skipped, work experience saved as a draft, complete bullet approved, rewrite accepted or rejected, before-and-after scores.

\- Matcher event logs with timestamps (updated October 30, 2026): posting received, cleaned, rejected for language or length, not a job posting, analyzed (with the rules version and skill counts), extraction failed, consistency failed, stage confirmed, stage cancelled.

- LLM request logs with timestamps (added November 7, 2026; spec-004 FR-08): one privacy-safe JSONL entry per model request — category (GEN/FAST), the model that actually responded, whether fallback was used and its depth, token counts, response time, and final status; never prompt content or keys. Every failed attempt additionally produces a per-attempt server-terminal line for diagnosis (spec-004 FR-56).
- Web usability-survey events: `survey_submitted {ease, useful, comment}` recorded in `web/data/events.log.jsonl`.

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

> **Update (November 8, 2026):** PDF upload and email sign-in are deferred to the next version (section 4.5 note); these open questions carry over to that version's planning.



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



\- **\*\*Adding a “Remove” action after the pilot:\*\*** ~~Decide based on filtering accuracy on real job postings.~~ Updated October 30, 2026: moot for the current matcher — feature `002-jd-matcher` produces no per-entry filtering, so there is no “Remove” decision to base on it. The question would only return if a future version reintroduces per-entry actions. Until then, the job seeker decides what to remove.



**## Change History**



\- October 24, 2026: Created this document from the uploaded file (draft 0.1); no content changes were made.

\- October 24, 2026: Final decision: the score stability metric changed from “maximum minus minimum ≤ 5 points” to “at least 90% of bullet-dimension scores must be exactly the same across 5 consecutive runs” (option B). Applied in section 5 (success metrics), risk 11, and open question 1 for the technical team.

\- October 25, 2026: Final decision: section 4.2 changed from a “fixed-field template” to “rewriting a bullet using the Context → Action → Result pattern.” A bullet is free text and the pattern only guides sentence structure. Flow: ask “Do you want a rewrite?” (default Yes), then ask one question for each missing part (0–3 questions, skippable); a complete bullet only needs final confirmation; for incomplete answers, offer a draft or approval of a rewrite using the answers already provided. The `template`, `context`, `action`, and `result` fields were removed from the table in section 4.4. The “no extra claims” rule was also extended to rewrites using the pattern.

\- October 25, 2026: Final decision: the first success metric (section 5) was redefined as “add one bullet and accept or reject its rewrite (or approve a complete bullet without questions) within the first 10 minutes.” Two open decisions about the template (“definition of completing an experience” and “relationship between the template and the bullet”) were closed and removed, and risk 5 was rewritten.

\- October 25, 2026: Final decision: “If you have real numbers, include them” was moved into the Result question. The sentence “personal learning without an observable change scores 1” and three examples of score 1 (vague, output only, personal learning) were added to section 4.3.

\- October 25, 2026: Final decision: section 4.1 uses a two-step process with full job posting analysis (type: hard or soft; priority: Required, Preferred, Bonus; “red line” grouped under “Required”). Actions became “Highlight / No change / Shorten,” and “Remove” was removed. The open decision about adding “Remove” after the pilot was recorded.

\- October 25, 2026: Final decision: version 1 is a text-based terminal flow. All tool text is in English at B1 level. UI and Persian language will be added in later versions.

\- October 25, 2026: Final decision: the rubric changed from four dimensions to three equally weighted dimensions (Context, Role and Action Clarity, Result). “Product Manager skill evidence,” “Structure and scannability,” and the phrase “Weak for a Product Manager” were removed. `context_present` is no longer needed; the Context score replaces it. A new rubric version was recorded (`rubric_version = 2`).

\- October 29, 2026: Final decision: section 4.2 finalized as the five‑part framework (`user_need`, `product_feature`, `action`, `result`, `metric`, extracted automatically with only the candidate's own words). Questions changed from 0–3 (Context, Action, Result) to 0–5 in the order Need, Feature, Action, Result, Metric (Need/Action/Result when their dimension scores 0 or 1; Feature/Metric when the field is empty; each skippable; a complete 2/2/2 bullet gets no questions). Rewriting rules pin keywords (nouns, verbs, tool names, numbers, results, product names) as unchanged. The final output is a copyable code block with “- ” lines.

\- October 29, 2026: Final decision: section 4.3 updated for rubric_version 3 — Specific Action replaced “Role and Action Clarity” (stored key `role_action_clarity` unchanged; levels defined in the scoring checklist), Context now derives from `user_need` + `product_feature` (need missing → 0 even with a feature), a bare-number-only result scores 1, and `part_present` (five booleans) replaced `context_present`. The leftover “25% each” weight wording was corrected to equal weights (1/3 each), the overlap unit was corrected to bullets (not entries), and the follow-up question range in section 4.4 changed to 0–5.

\- October 29, 2026: Final decision: section 4.1 superseded by feature `002-jd-matcher` (constitution v3.0.0 P6): the matcher analyzes only the pasted posting and outputs skill tables only; the per-entry actions (“Highlight / No change / Shorten”) are retired. Job posting input changed to English only (>10% Persian/Arabic-script letters rejected), aligning with constitution v3.0.0 P10.

\- October 30, 2026: Final decision: section 4.1 aligned with the implemented JD Matcher v1 (feature `002-jd-matcher`, rules version `matcher-rules-1.0.0`): the supersession note now records the implemented flow — `END`-terminated one-shot paste, cleaning of control characters / `<script>`/`<style>` blocks / HTML tags, the 100–1,500-word gate on the cleaned text, the staged `[Y]/[C]` gates, the fixed priority cascade, the 5-row display limit with real-total counts, verbatim-evidence-only rows, `label_en`-verbatim soft-skill names with the ESCO id stored but never shown, and the no-verdict guarantee with fixed input-error and extraction-failure messages. The section 4 preamble no longer says all features work “only on resumes” (the matcher never touches resumes). Section 6 gained two out-of-scope items (free-form verdict; skills outside the taxonomy) and the Persian-posting rejection. Section 8 “Matcher actions” records the October 30 implementation with the staged flow, and the measurement requirements now list the ten matcher event types.

- October 30, 2026: Web usability prototype recorded (section 4.1 update): a `web/` Next.js prototype was built on a line-for-line TypeScript port of the deterministic engine (no model calls; parity with the Python engine verified). Product-owner decisions: the web matcher shows the soft-skill table before the hard-skill tables (web-only deviation from the terminal order), the web flow covers one experience entry per session with a restart control, session state is held in the browser, event logs are JSONL behind a storage adapter, and access is gated by a shared password with a per-session rate limit. The prototype is a test instrument; the “UI in later versions” decision for the product is unchanged.
- November 2, 2026: BYOK (Bring Your Own Key) feature recorded: an opt-in, advanced-user path was added to the web prototype (`web/src/lib/byok/`) letting a user run the bullet scoring with their own model API key, called directly from the browser — the key never reaches the server, logs, or URLs. The earlier "no model calls" rule was lifted for this feature only, with product-owner decisions: English-only UI (Persian/RTL remains out of scope), the model may ONLY replace the per-bullet 0/1/2 ratings (the matcher stays deterministic under `matcher-rules-1.0.0`, all arithmetic stays in code), and the default deterministic path is untouched behind a toggle that is off by default. Providers: Gemini, OpenRouter, local Ollama complete; Groq and Mistral are disabled pending real browser CORS tests (`docs/byok-cors-results.md`). Model output is untrusted and is validated against the terminal's evaluator schema (zod + the shared validity check) with one retry, then refusal (FR-014). Strict CSP (nonce + strict-dynamic) applies; no third-party scripts exist in the app.

- November 3, 2026: rubric-3.1.0 implemented (spec-001 Phase 11; the standalone rubric-parity feature was merged into 001): parsing corrections (research/mapping verbs are need signals and never actions; infinitive purpose clauses are vague results; no word appears in two parts except a feature name inside the action sentence; `flow(s)`/`had no` markers; multi-line normalization), result-score alignment (present-but-vague = 1; 0 reserved for missing), and the web prototype's display and improvement loop upgraded (in-sentence format, grounded suggestions, copy action, model disclosure banner, BYOK prompt calibration). The stored rubric version is the semver string `rubric-3.1.0` from this date; the terminal display is unchanged.
- November 4, 2026: Phase 12 — chunk attribution: a diagnostic coverage record (per-part quotation/status/reason plus orphaned spans with reasons) is stored with every analysis and rendered on the web in a neutral gray block; it never affects scores or questions. Phase 13 — paste-and-split entry (web-only): one paste per experience, split into candidate bullets with user-controlled keep/discard/merge/split/delete; optional new entry fields `company`/`dates`/`product_domain`.
- November 5, 2026: Constitution v3.2.0 added P11 (every new item goes through the spec-kit flow; the light path only with explicit owner approval plus mandatory backfill). Four spec-001 phases implemented the same day: Phase 14 — the "Job Forward — Warm Theme" platform theme (warm oklch tokens; Fraunces / Source Sans 3 / JetBrains Mono vendored with zero external font requests; 18px body; no emoji anywhere; an automated theme-guard test); Phase 15 — the five-part analysis UX (five-cell status row; underline sentence keeping status colors; focused one-question-at-a-time loop; the "Still needs to be filled" list superseded on the web; owner-review items 4–8 deferred); Phase 16 — repository layout: two view editions (`terminal/` frozen baseline + `web/` continuation) with one shared governance root; the live resume data moved byte-for-byte to `terminal/data/`; the retired `matcher/` package deleted; Phase 17 — warm voice and wiring (stage progress bar, score progress ring, JetBrains Mono digits, pulse-dot, tech-tag chips, two encouragement placements, warm first-person B1 texts byte-identical across py+ts).
- November 6, 2026: Constitution v3.3.0 added P12–P17 (centralized LLM gateway; env-only model configuration; no keys in client code/logs; error-path test coverage; simple user-facing error messages; TypeScript strict), and v4.0.0 (MAJOR) redefined version 1 as English-only including error messages (P16), added P18 (user data never depends on LLM success), and recorded the bounded BYOK user-key exception in P13/P14. Phase 18 — entry and review UX simplification (web-only): paste-first entry for ONE experience; drag-and-drop segment review with first-line-only auto-place (automatic attribution rejected by the owner); structured year–month dates with "I still work here"; plain editable achievements review with ALL shaping buttons removed; the 1–6 bullet cap REMOVED on the web (terminal keeps 1–6); the score panel merged into the bullet-list review page; Back on every stage that never wipes answers; no-change re-confirm skips re-analysis. Feature `004-llm-gateway` specified and clarified the same day (shared gateway password; anonymous persistent cookie identity; UTC quota day; GEN/FAST chains with fallback; usage limits; draft preservation; English B1 messages; free path default; BYOK constraints).
- November 7, 2026: spec-004 implemented and committed: the centralized gateway (fallback chains, usage limits, privacy-safe JSONL logging), the gate route hardened to return typed JSON on operator errors, §13 (model-ID validation + dev-only mock mode with `x-mock-error` scenarios) and §14 (audit remediation: chain pruning, forbidden non-chat patterns, oversized-FAST warning, empty-200 classification, fallback transparency with depth, provider-call cap 4 with typed RATE_LIMITED handling, `probe:rate-limit`). §15 added (error honesty: failure-class taxonomy as the single UI source; gate errors never AI-worded; a guidance box at the failing stage with VPN wording only for browser-unreachable failures; no-way-forward transfer with advance explanation and the one-tap "Retry with your own key?" return; four-state connection status that never blocks navigation; the model banner upgraded to a persistent header; BYOK as a fully independent LLM settings section; preflight decoupling so BYOK works with a broken free-path config) and §16 added (per-attempt failure logging with truncated body; dev-only browser-console summary; startup config echo + `.env.local` duplicate warning with line numbers; `test:live` and `check:connection` per-model live smoke; BYOK quick access from every page with the header labels "Default free"/"My key" and a quick modal; explicit resend-with-default after a BYOK failure; displayed BYOK provider = Google AI Studio, others hidden not deleted). The same day: a separate error-UX spec (005) was briefly created and RETIRED — its content was absorbed into spec-004 §15, and spec 004 was declared the PRIMARY spec for everything model-related. Constitution v4.1.0 added the operational principles P19 (diagnosability), P20 (model servability), P21 (env completeness) with the companion runbook `docs/llm-gateway-runbook.md`. Deployment incidents diagnosed and recorded in the runbook: the Vercel gate screen showed the AI-outage text for a gate configuration error (no AI involved — fixed by §15 FR-47), and the local 403 root cause is NVIDIA's edge geo-block for the operator's egress IP (identical 403 with and without a key; a VPN is needed for live checks). §16.1 approved cleanup executed (leftover temp file deleted; `/node_modules/` git-ignored; nothing else removed). Per-bullet 0/1/2 ratings restored to display in both places (owner decision; spec-001 §13.3).
- November 8, 2026: Single-source scoring output (spec-001 §14, owner decision): the three-dimension rating output is the ONLY judge — it carries verbatim per-part quotes; the five parts and their statuses are filled/derived from those quotes; score-quote invariants are enforced on every MODEL output (retry once, then refuse with user data intact); the deterministic engine is byte-identical (quotes = extraction echo) and the rubric stays rubric-3.1.0. Known residual reported, not changed: the deterministic engine's raw-text fallback can still yield a dimension score ≥ 1 with an empty part — eliminating it requires a NEW rubric version (owner decision, later). Constitution v4.2.0 (MINOR): P4 amended — the model returns the ratings plus the verbatim quotes; no score arithmetic moves to the model. A stale-stored-parts bug in the re-analysis path was fixed (a rewritten bullet re-extracts fresh). Client connection-check resilience added (spec-004 FR-64: 20-second client timeout + restore-only-if-available auto re-check). This §14 implementation and the v4.1.0/v4.2.0 constitution amendments were uncommitted at the time of this writing, pending owner review.
