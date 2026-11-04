# Bullet parser prompt — five-part framework (multi-model test document)

> **How to use this file:** paste everything from "Scope of Execution" down to the end of
> **Examples 1–6** as the prompt for the model under test, then paste ONE bullet from the
> "Test bullets" section at a time. The "Answer key" section is for the human tester only —
> never paste it to the model. Examples 1–3 are acceptance tests: the model's output for
> each must exactly match the example's output.

## Purpose (the goal every rule serves)

Every bullet must show problem-solving: the problem is stated first, then the
work done to fix it, then the result. Every rule in this document — and the
scoring of Role and Action Clarity — serves that one goal.

## Scope of Execution

- All examples in this section are illustrative only. Never use their content (experience titles, words, or numbers) during execution.
- The rules in this section apply to every bullet point added by the job seeker, across all experiences and regardless of the number of bullet points.
- If there is any ambiguity in identifying a section (e.g., whether a phrase represents a user need or a result, or whether a phrase falls between two sections), do not guess. Ask the job seeker a short question and then continue.
- If any rule in this document conflicts with another rule, ask the job seeker or the document author for clarification at that point. Do not make a decision on your own.
- Examples 1–6 are also acceptance tests: the tool's output for the input of each example must exactly match the output of that example.

## Section Display Rules (in-sentence bracket display)

- The display for each bullet is ONE continuous sentence. Only the bracket contents come from the job seeker's text. The connecting words outside the brackets are NEVER copied from an example and are NEVER free writing: they are a prediction from THIS bullet's own content, chosen from the closed variant set below (defined creativity). The examples teach the pattern, not the words:
  - Opening, before [user need or problem]:
    - "Research into" — when the need text starts with a problem-discovery verb (analyzed, researched, noticed, found, benchmarked, mapped, surveyed, audited, compared, evaluated, identified).
    - "Analysis of" — in every other case, including when the need is missing.
  - Before [feature name]:
    - "and collaboration with the product team on designing" — when the action text shows working with other people ("collaborated", "worked with", "partnered", "coordinated", "with … team / engineer / designer").
    - "and building of" — when the action names a delivery verb (built, designed, wrote, defined, rebuilt, launched, led, fixed, …) without a collaboration marker.
    - "and work on" — when the action exists but is vague ("worked on", no concrete delivery verb), and as the neutral fallback when the action is missing.
    - "and research into" — when the bullet has no action at all and the need starts with a discovery verb.
  - "through" before [specific action], "resulting in" before [result], and "and" before [metric] — always exactly these words.
  - If two variants seem possible, pick the more neutral one.
- The words inside each bracket must be taken verbatim and consecutively from the job seeker's text. Do not add, remove, or replace any words inside a bracket. Do not use "…" or any other symbol to indicate omitted words.
- Empty section: "[label – missing]" (for example "[user need or problem – missing]"). Ambiguous section: "[label: words – vague]" with the job seeker's exact words.
- If a product feature phrase appears in the middle of an action sentence, the "specific action" bracket contains the entire continuous sentence verbatim (including the feature phrase), while the "feature name" bracket contains only the feature phrase. This is the only permitted overlap. "User need or problem", "Specific action", "Result", and "Metric" must not share any words.
- The job seeker's own connecting words between sections (and, so, which, because, that, to) are not repeated in the frame and are not considered omitted; the predicted connecting words replace them.
- After the sentence, list "Filled correctly:" (each filled section as "Label: \"words\"") and "Still needs to be filled:" (each empty or ambiguous section with a one-sentence reason), exactly as in the examples.

## Section Identification Rules and Rationale (Fixing Common Errors)

### Problem 1: The Feature Is Not Recognized Within the Sentence

The model did not recognize "MVP scope (resume analysis and resume-to-job matching)" as a feature and marked it as "missing".

**Rule:**
- A feature is any specific name or description of a product component that the job seeker worked on: a page, flow, module, plugin, product scope, capability, or tool.
- A feature may appear in the middle of a long sentence or inside parentheses. Before marking it as "missing", review the entire sentence for the name of a product or product component.
- "missing" is only allowed when the entire bullet contains no name or description of a product component.
- A feature is a component of the product the job seeker worked on. The name of another company's product (for example, a competitor's site or app) is not the job seeker's feature. If a phrase describes a component but it is unclear whose product it belongs to, ask the job seeker a short question instead of guessing.
- A phrase inside a goal or intention clause ("to uncover friction in hiring and project-assignment flows") belongs to "Result" with the label "vague" and cannot itself be the "Product feature", unless the same feature phrase also appears inside the action sentence (the permitted overlap). Sections must not share words.

### Problem 2: The Wrong Action Is Identified

The model identified "Analyzed…" as the action, whereas the main action was "collaborated with the product team to define the MVP scope through 6 job-seeker interviews and a 30-respondent questionnaire".

**Rule:**
- Problem-discovery verbs (analyzed, researched, identified, noticed, found) establish the need and context and belong in the "User need" section.
- Verbs that describe studying, comparing, or mapping users, competitors, or journeys (for example: benchmarked, mapped, surveyed, audited, compared, evaluated) are also problem-discovery verbs and belong in the "User need" section, even though they are not in the list above.
- If a verb is in neither list and you cannot tell whether it describes research or product delivery, ask the job seeker a short question instead of guessing.
- The action is what the job seeker did to change or deliver the product, such as define, build, design, write, rebuild, lead, or collaborate. The role and method (such as interviews or questionnaires) also remain part of the action.
- If a bullet contains multiple verbs, identify the action from the verb that describes the job seeker's main work, not the problem-discovery verb.
- If every verb in the bullet is a research or discovery verb, the research phrase goes in "User need" — without a label when it names who had which problem, and with the label "vague" when it only describes what was studied. The research phrase never goes in "Action"; mark the action as "vague" or "missing".

### Problem 3: The Same Phrase Is Used in Two Sections

The model included the exact same phrase in both "User need" and "Action".

**Rule:**
- Except for the permitted overlap of a feature within the action (as described above), each word from the job seeker's text must appear in only one section.
- If a phrase has two meanings (e.g., "reduced drop-off by 18%"), assign the result phrase to "Result" and the number to "Metric".

### Problem 4: An Intended Goal Is Accepted as a Result

The model either failed to recognize "aiming to deliver value without depending on employers" as a result or treated it as a complete result.

**Rule:**
- Expressions of goals and intentions ("aiming to", "in order to", "so that", "to deliver", "planned to") are not results. Include them in "Result" with the label "vague".
- A "Result" is complete only when it describes what changed after the job seeker's work and who benefited. If it only describes a goal, mark it as "vague". If there is no result at all, mark it as "missing".
- No content-bearing phrase from the original text should be left out. If a phrase does not fit any section, include it in the closest section with the label "vague".
- Numbers that describe the type and volume of research (e.g., "6 interviews", "30 respondents") belong to "Action", not "Metric". A "Metric" is a number that demonstrates the impact of the work.

### Problem 5: The Rationale for "vague" and "missing" Is Unclear

**Rule:** For every empty or ambiguous section, provide a reason in the "Still needs to be filled" list:
- The section name and status ("vague" or "missing").
- A one-sentence reason in English (consistent with the rest of the display).
- For "vague": Quote the job seeker's exact words in quotation marks and explain why they are insufficient.
- For "missing": State what is absent from the bullet.
- The reason must not introduce any new words or claims into the bullet.

### Problem 6: The Display and the Score Disagree

The model rated the result dimension 2/2 while the five-part display showed the result as "missing" (or showed a result that does not exist in the text).

**Rule:**
- The five-part display and the rubric score must agree about what counts as a result, because they judge the same bullet.
- A "Result" marked "missing" (no outcome phrase in the bullet) means a result score of 0.
- A "Result" marked "vague" (a goal, intention, or output-only phrase) means a result score of 1.
- Only a complete "Result" (what changed after the work and who benefited) can receive a result score of 2.
- A goal or purpose phrase ("to uncover…", "in order to…", "aiming to…", "so that…") is never a complete result, in either stage.

### Fixed Rules

- Questions are asked only for empty or ambiguous sections, one at a time, in the order specified above. Completed sections do not require questions.
- The metric is optional and must be asked about only once, at the very end.
- If the experience title is unknown, the header must use "[title not provided]", and the tool must ask the job seeker for the title.

## Examples (acceptance tests)

### Example 1: a bullet with a goal instead of a result

Experience: Product Analyst Intern – Achievement 1 of 1
Original: “Analyzed job seekers’ needs and the absence of a talent pool and job postings, and collaborated with the product team to define the MVP scope (resume analysis and resume-to-job matching) through 6 job-seeker interviews and a 30-respondent questionnaire, aiming to deliver value without depending on employers”

Research into [user need or problem: Analyzed job seekers’ needs and the absence of a talent pool and job postings – vague] and collaboration with the product team on designing [feature name: the MVP scope (resume analysis and resume-to-job matching)] through [specific action: collaborated with the product team to define the MVP scope (resume analysis and resume-to-job matching) through 6 job-seeker interviews and a 30-respondent questionnaire], resulting in [result: aiming to deliver value without depending on employers – vague] and [metric – missing].

Filled correctly:
- Feature name: “the MVP scope (resume analysis and resume-to-job matching)”
- Specific action: “collaborated with the product team to define the MVP scope (resume analysis and resume-to-job matching) through 6 job-seeker interviews and a 30-respondent questionnaire”

Still needs to be filled:
- User need or problem (vague): “Analyzed job seekers’ needs” says what you studied, but not who had which problem. “The absence of a talent pool and job postings” describes a limit of the product, not a problem of the job seeker.
- Result (vague): “aiming to deliver value” is a goal. It does not say what changed after your work or who it helped.
- Metric (missing, optional): “6 job-seeker interviews” and “a 30-respondent questionnaire” describe your research, so they stay in Action.

Do you want me to rewrite this bullet to make your experience stronger? (Default: yes)

First question after “yes”:
> Achievement 1 of 1 – User need or problem: Who had a problem? What was the problem?

### Example 2: a bullet with a vague action and a missing need

Experience: UX Designer – Achievement 2 of 3
Original: “Worked on the onboarding flow and made it better, which reduced drop-off by 18% in the first week”

Analysis of [user need or problem – missing] and work on [feature name: the onboarding flow] through [specific action: Worked on the onboarding flow and made it better – vague], resulting in [result: reduced drop-off] and [metric: by 18% in the first week].

Filled correctly:
- Feature name: “the onboarding flow”
- Result: “reduced drop-off”
- Metric: “by 18% in the first week”

Still needs to be filled:
- User need or problem (missing): The bullet does not say who struggled or what went wrong.
- Action (vague): “Worked on” and “made it better” do not say what you did or what your role was.

Do you want me to rewrite this bullet to make your experience stronger? (Default: yes)

Questions after “yes”, in this order:
> Achievement 2 of 3 – User need or problem: Who had a problem? What was the problem?
> Achievement 2 of 3 – Action: What exactly did you do? What was your role?

No Feature question (Feature is filled) and no Metric question (a metric already exists).

### Example 3: a complete bullet

Experience: Product Manager – Achievement 1 of 3
Original: “New users could not find the items they saved, so I wrote the requirements and worked with the design team to rebuild the saved items page, and return visits grew by 15%”

Analysis of [user need or problem: New users could not find the items they saved] and collaboration with the product team on designing [feature name: the saved items page] through [specific action: I wrote the requirements and worked with the design team to rebuild the saved items page], resulting in [result: return visits grew] and [metric: by 15%].

Filled correctly:
- User need or problem: “New users could not find the items they saved”
- Feature name: “the saved items page”
- Specific action: “I wrote the requirements and worked with the design team to rebuild the saved items page”
- Result: “return visits grew”
- Metric: “by 15%”

Still needs to be filled:
- None

No question is asked. Only the job seeker’s confirmation is requested at the end of the bullet.

### Example 4: a complete bullet with the feature inside the action sentence and a "from X to Y" metric

Experience: Frontend Engineer – Achievement 1 of 2
Original: “Candidates could not upload their portfolios on mobile, so I rebuilt the upload page for small screens, and completion rose from 41% to 68%”

Analysis of [user need or problem: Candidates could not upload their portfolios on mobile] and building of [feature name: the upload page] through [specific action: I rebuilt the upload page for small screens], resulting in [result: completion rose] and [metric: from 41% to 68%].

Filled correctly:
- Feature name: “the upload page” (it appears inside the action sentence, so the permitted overlap applies)
- Specific action: “I rebuilt the upload page for small screens”
- Result: “completion rose”
- Metric: “from 41% to 68%”

Still needs to be filled:
- None

No question is asked. Only the job seeker’s confirmation is requested at the end of the bullet.

### Example 5: a feature described in an appositive, with the result and metric missing

Experience: Backend Developer – Achievement 2 of 3
Original: “Hiring managers spent hours screening resumes by hand, and I built (with one backend engineer) the screening filter, a rule-based resume ranking tool”

Analysis of [user need or problem: Hiring managers spent hours screening resumes by hand] and collaboration with the product team on designing [feature name: the screening filter, a rule-based resume ranking tool] through [specific action: I built (with one backend engineer) the screening filter, a rule-based resume ranking tool], resulting in [result – missing] and [metric – missing].

Filled correctly:
- Feature name: “the screening filter, a rule-based resume ranking tool” (a feature may be a description, not only a page name)
- Specific action: “I built (with one backend engineer) the screening filter, a rule-based resume ranking tool” (the permitted overlap applies)

Still needs to be filled:
- Result (missing): The bullet does not say what changed after the filter was built or who it helped.
- Metric (missing, optional): “one backend engineer” describes the team, not the impact of the work.

Do you want me to rewrite this bullet to make your experience stronger? (Default: yes)

First question after “yes”:
> Achievement 2 of 3 – Result: What changed after your work? Who did it help?

(The Metric question is asked once, at the very end, after the Result question.)

### Example 6: an output-only result marked as vague

Experience: Product Designer – Achievement 1 of 2
Original: “Job seekers needed a one-page resume, so I designed the print layout, delivering a one-page PDF export”

Analysis of [user need or problem: Job seekers needed a one-page resume] and building of [feature name: the print layout] through [specific action: I designed the print layout], resulting in [result: delivering a one-page PDF export – vague] and [metric – missing].

Filled correctly:
- Feature name: “the print layout”
- Specific action: “I designed the print layout”

Still needs to be filled:
- Result (vague): “delivering a one-page PDF export” describes what you produced, not what changed for the job seeker or who benefited.
- Metric (missing, optional): The bullet contains no number that demonstrates the impact of the work.

Do you want me to rewrite this bullet to make your experience stronger? (Default: yes)

First question after “yes”:
> Achievement 1 of 2 – Result: What changed after your work? Who did it help?

## Test bullets for model evaluation

Feed these to the model under test one at a time, after the rules and Examples 1–6.
T9 is a trap on purpose; see the answer key.

- T1: “New visitors abandoned the sign-up form halfway, so I simplified the sign-up form to three fields, and sign-ups grew by 25%”
- T2: “Worked on the search filters and improved them, which increased searches by 9%”
- T3: “Noticed employers were ignoring long resumes, so I led the rewrite of the resume summary section to make resumes easier to scan”
- T4: “Students were dropping out of long courses, so I defined the course progress bar (milestones and badges) through 5 interviews, and course completions grew by 15%”
- T5: “Researched why new hires quit within their first year”
- T6: “2,000 job seekers complained the app kept crashing, so I fixed the upload flow, and support tickets about uploads fell by 40%”
- T7: “Small shop owners could not sell outside their city, so I scoped and launched the marketplace listings tool (bulk upload and pricing rules), and seller signups grew by 22%”
- T8: “Job seekers could not see where their resumes stood, so I built the application tracker, and weekly active users rose 30%”
- T9: “Employers took too long to pick candidates, so I worked on the review queue so that picking would take minutes instead of hours”
- T10: “Users could not find their past orders, so I designed the order history page, which made reordering easy”

Suggested titles when the model needs one (the tester supplies them, the model never invents them):
T1 Growth PM, T2 UX Designer, T3 Content Lead, T4 Learning PM, T5 People Researcher, T6 Mobile Engineer, T7 Marketplace PM, T8 Full-stack Engineer, T9 Recruiting Tools PM, T10 Web Developer.

## Answer key (for the human tester — never paste this to the model)

A model passes a bullet when every bracket matches the key verbatim, the notes match in meaning, and the question behavior matches.

### T1 — complete bullet (positive control)

Analysis of [user need or problem: New visitors abandoned the sign-up form halfway] and building of [feature name: the sign-up form] through [specific action: I simplified the sign-up form to three fields], resulting in [result: sign-ups grew] and [metric: by 25%].

Filled correctly:
- User need or problem: “New visitors abandoned the sign-up form halfway”
- Feature name: “the sign-up form”
- Specific action: “I simplified the sign-up form to three fields”
- Result: “sign-ups grew”
- Metric: “by 25%”

Still needs to be filled: None. No question; confirmation only.

### T2 — missing need and vague action (Example 2 pattern)

Analysis of [user need or problem – missing] and work on [feature name: the search filters] through [specific action: Worked on the search filters and improved them – vague], resulting in [result: increased searches] and [metric: by 9%].

Filled correctly:
- Feature name: “the search filters”
- Specific action: “Worked on the search filters and improved them”
- Result: “increased searches”
- Metric: “by 9%”

Questions after “yes”, in this order: User need or problem, then Action. No Feature question, no Metric question.

### T3 — goal instead of result (Example 1 pattern)

Research into [user need or problem: Noticed employers were ignoring long resumes] and building of [feature name: the resume summary section] through [specific action: I led the rewrite of the resume summary section], resulting in [result: to make resumes easier to scan – vague] and [metric – missing].

Filled correctly:
- User need or problem: “Noticed employers were ignoring long resumes”
- Feature name: “the resume summary section”
- Specific action: “I led the rewrite of the resume summary section”
- Result: “to make resumes easier to scan”

Questions after “yes”, in this order: Result, then Metric (once, at the very end).

### T4 — research number stays in Action; feature includes the parenthetical

Analysis of [user need or problem: Students were dropping out of long courses] and building of [feature name: the course progress bar (milestones and badges)] through [specific action: I defined the course progress bar (milestones and badges) through 5 interviews], resulting in [result: course completions grew] and [metric: by 15%].

Filled correctly:
- User need or problem: “Students were dropping out of long courses”
- Feature name: “the course progress bar (milestones and badges)”
- Specific action: “I defined the course progress bar (milestones and badges) through 5 interviews”
- Result: “course completions grew”
- Metric: “by 15%”

Still needs to be filled: None. “5 interviews” stays in Action (research volume, not impact).

### T5 — only a discovery verb

Research into [user need or problem: Researched why new hires quit within their first year] and research into [feature name – missing] through [specific action – missing], resulting in [result – missing] and [metric – missing].

Filled correctly:
- User need or problem: “Researched why new hires quit within their first year”

The need is filled (it names who — new hires — and the problem — quitting in the first year); the discovery verb belongs in the need. Questions after “yes”, in this order: Product feature, Action, Result, Metric.

### T6 — a number in the need is not the metric (trap)

Analysis of [user need or problem: 2,000 job seekers complained the app kept crashing] and building of [feature name: the upload flow] through [specific action: I fixed the upload flow], resulting in [result: support tickets about uploads fell] and [metric: by 40%].

Filled correctly:
- User need or problem: “2,000 job seekers complained the app kept crashing”
- Feature name: “the upload flow”
- Specific action: “I fixed the upload flow”
- Result: “support tickets about uploads fell”
- Metric: “by 40%”

Traps to check: “2,000” must stay inside the need (it sizes the problem, not the impact of the work), and “the app” from the need must not be reused as the feature (sections must not share words; the feature comes from the action sentence through the permitted overlap). Still needs to be filled: None.

### T7 — a capability/scope counts as a feature (Problem 1)

Analysis of [user need or problem: Small shop owners could not sell outside their city] and building of [feature name: the marketplace listings tool (bulk upload and pricing rules)] through [specific action: I scoped and launched the marketplace listings tool (bulk upload and pricing rules)], resulting in [result: seller signups grew] and [metric: by 22%].

Filled correctly:
- User need or problem: “Small shop owners could not sell outside their city”
- Feature name: “the marketplace listings tool (bulk upload and pricing rules)”
- Specific action: “I scoped and launched the marketplace listings tool (bulk upload and pricing rules)”
- Result: “seller signups grew”
- Metric: “by 22%”

Still needs to be filled: None.

### T8 — a metric without “by” (complete bullet)

Analysis of [user need or problem: Job seekers could not see where their resumes stood] and building of [feature name: the application tracker] through [specific action: I built the application tracker], resulting in [result: weekly active users rose] and [metric: 30%].

Filled correctly:
- User need or problem: “Job seekers could not see where their resumes stood”
- Feature name: “the application tracker”
- Specific action: “I built the application tracker”
- Result: “weekly active users rose”
- Metric: “30%”

Still needs to be filled: None. A model that writes “rose 30%” entirely in Result and leaves Metric missing fails this test.

### T9 — intention phrasing in the result (trap)

Analysis of [user need or problem: Employers took too long to pick candidates] and work on [feature name: the review queue] through [specific action: I worked on the review queue – vague], resulting in [result: picking would take minutes instead of hours – vague] and [metric – missing].

Filled correctly:
- User need or problem: “Employers took too long to pick candidates”
- Feature name: “the review queue”
- Specific action: “I worked on the review queue”
- Result: “picking would take minutes instead of hours”

Traps to check: the second “so that” phrase is an intention, so the result is “vague” (Problem 4) — a model that presents it as a complete result fails. A model that is unsure must ask a short question about the result instead of guessing. Questions after “yes”, in this order: Action, Result, then Metric (once, at the very end).

### T10 — only the metric question (question-discipline test)

Analysis of [user need or problem: Users could not find their past orders] and building of [feature name: the order history page] through [specific action: I designed the order history page], resulting in [result: made reordering easy] and [metric – missing].

Filled correctly:
- User need or problem: “Users could not find their past orders”
- Feature name: “the order history page”
- Specific action: “I designed the order history page”
- Result: “made reordering easy”

Behavior check: the only question is the Metric question, asked once, at the very end. A model that also asks about the need, the feature, or the action fails this test.
