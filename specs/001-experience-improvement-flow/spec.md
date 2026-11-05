# Feature Specification: Help Entry-Level Job Seekers Narrate Their Experience (Level 1 Prototype)

**Feature Branch**: `001-experience-improvement-flow`

**Created**: 2026-10-23

**Status**: Finalized — Five-Part Resume Bullet Rewriting Framework (2026-10-29); amended 2026-11-04 — rubric-3.1.0 parsing rules, result-score alignment, and the web prototype display/improvement loop (Phase 11); amended 2026-11-04 — chunk attribution (coverage record, diagnostic only) with quotation, status, and reason for every part and orphaned span (Phase 12, clarified 2026-11-04 — ready for planning); amended 2026-11-04 — hybrid entry: paste-and-split bullet shaping (Phase 13, web-only, clarified 2026-11-04 — ready for planning); amended 2026-11-05 — platform theme and voice (Phase 14, cross-cutting; complete web adoption, Tailwind-variant-only, clarified 2026-11-05 — ready for planning); amended 2026-11-05 — five-part analysis UX: glance row, underline sentence, focused one-question loop (Phase 15, clarified 2026-11-05 — ready for planning); amended 2026-11-05 — repository layout: two view editions, one governance root (Phase 16, clarified 2026-11-05 — root siblings, optional-skip parity, matcher/ deleted; ready for planning); amended 2026-11-05 — warm UX and voice wiring (Phase 17, light path, §11.5; owner look-and-feel groups accepted, implemented and gated)

**Input**: User description: "A text-flow prototype (no graphical interface) that guides an entry-level product manager job seeker through one complete path for improving a single experience entry. The user adds an experience entry (type: job, project, course, side work), a title, and 1–6 free‑text English bullets. The tool scores each bullet on three dimensions (Context, Specific Action, Result) and rewrites bullets using a five‑part framework (User Need → Product Feature → Action → Result → Metric)."

**Language note**: Version 1 is a text‑based terminal flow; all tool text is English at B1 level (prd §4/§6; spec‑original Specs 1–3). All user input — bullets, answers, and any metric values — must be in English; Persian input is rejected. Persian UI and Persian resumes are planned for later versions and are out of scope here.

**Implementation status note**: Phase 9 (the rubric-3.0.0 Specific Action scoring
checklist, `checklists/specific-action.md`) is implemented and tested (tasks
T045–T050). The five-part framework behavior specified below is the target
product; the remaining work is tasked in tasks.md Phase 10.

Phase 11 (rubric-3.1.0, implemented 2026-11-03, tasks recorded 2026-11-04) is
implemented and tested: the parsing corrections of §2.1, the result-score
alignment of §3, the model-rating instructions of §3.1, and the web
prototype's display and improvement loop (§5.1, §6.1). The web changes are
web + parser-doc scope only — the terminal's display (§5) and flow (§4.1) are
unchanged. Evidence: 216 pytest green, web↔Python parity gate PARITY OK, BYOK
tests green.

Phase 12 (chunk attribution, §2.2) is IMPLEMENTED 2026-11-04 (T095–T105;
pytest 227 green, parity PARITY OK incl. the orphan case, terminal display
untouched) and committed as 4b1b5be.

Phase 13 (hybrid entry — paste-and-split, §4.2) is specified 2026-11-04 and
NOT yet implemented; the three §4.2 clarifications were resolved the same day
(WEB-ONLY scope — terminal entry flow and display unchanged; new fields
stored+displayed with no analysis effect, dates as one free-text field;
non-achievement flag = no action verb + no parser marker + responsibility
opening, wrap continuations merge). Next: plan and tasks (T106+; T091/T092
remain open). Until it lands, the entry flow is unchanged.

Phase 14 (platform theme and voice, §11) is specified 2026-11-05 and NOT yet
implemented; the three fonts are already vendored (web/src/fonts/, with OFL
licenses). It is pending the two §11 clarifications, then plan and tasks
(T115+; T091/T092 remain open). Until it lands, the current look stands.

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

### 2.1 Extraction rules (rubric‑3.1.0, 2026‑11‑03)

How the five parts are identified from the bullet's own words (constitution
P1 — extraction never invents):

- **Research/mapping verbs are need signals, never actions.** `analyzed`,
  `researched`, `identified`, `noticed`, `found`, `benchmarked`, `mapped`,
  `surveyed`, `audited`, `compared`, `evaluated` (plus `had no`) mark the
  user_need part. Research never fills the action part; an all-research
  bullet leaves the action part empty and the tool asks for the delivery
  work. Action means product-changing/delivery work only (product-owner
  ruling 2026-11-03, after a rule-by-rule dispute over a research bullet).
- **An infinitive purpose clause is a vague result.** "to uncover …" /
  "to deliver …" / "to improve …" belongs to the result part (a vague
  result), taken from the intention marker onward. It is carved out of the
  need clause when that clause carries no action verb; otherwise it is taken
  only from a clause that fills neither the action nor a metric. A need
  phrase that ends in "to" ("no way to", "needed to", "hard to") is never
  read as a purpose clause.
- **No word appears in two parts.** The single permitted overlap is a feature
  name inside the action sentence (feature-inside-action). A feature marker
  inside a purpose clause belongs to the vague result, not the feature part.
- **`flow(s)` is a feature marker** (a named flow is a product component);
  `had no` is a need marker.
- **Whitespace is normalized before extraction**, so a bullet containing line
  breaks extracts exactly like its single-line equivalent.

Normative parsing contract: `specs/001-experience-improvement-flow/few-shot/parser-prompt.md` (rules, Problems
1–6, display rules, Examples 1–6, test bullets T1–T10, answer key) with the
machine-readable companion `specs/001-experience-improvement-flow/few-shot/parser-samples.json` (v1.3.0).
Examples 1–6 and T1–T10 are acceptance tests: the engine must reproduce the
documented outputs. The pasted format demo that historically sat at the top
of that document was FORMAT DEMO ONLY — not normative (product-owner decision
2026-11-04); the demo no longer appears in the document.

### 2.2 Chunk attribution before status assignment (Phase 12, 2026-11-04)

Before any part receives its status (filled / vague / missing), the engine
performs a **coverage pass** over the bullet's own words (constitution P1 —
extraction never invents). The pass does NOT re-segment the bullet: the five
parts are extracted exactly as before (§2.1), and the words no part claims —
each **maximal contiguous unclaimed span** — are marked **orphaned**: text
that belongs to none of the five parts (for example a connector run with no
framework meaning, or a fragment with no need, feature, action, outcome, or
metric signal). A word is claimed only when the engine assigns it to a part
(verbatim after whitespace normalization, §2.1); no word is claimed by two
parts — the single §2.1 exception (a feature name inside the action sentence)
is claimed by the action and is never orphaned — and every unclaimed word
appears in exactly one orphaned span.

For every orphaned chunk the engine reports a **reason** — why no part claims
it (for example: "connecting words with no framework meaning", "fragment — no
need, feature, action, outcome, or metric signal"). The reason cites the
chunk's own words.

The attribution record mirrors status assignment: each part entry carries the
same filled/vague/missing status the engine derives (§5), and the displayed
statuses must be exactly the statuses derivable from the record. Output rule:
for **all five parts AND every orphaned span**, the analysis carries three
things — the **quotation** (the exact words; empty for a missing part), the
**status**, and the **reason** (why filled words satisfy the part, why a
vague/missing status applies, or why an orphaned span belongs to no part).

The coverage record is stored with the analysis (§4) and rendered in the web
prototype (§5.1); the terminal display (§5) stays unchanged — Phase 12 is web
+ data scope only.

[RESOLVED 2026-11-04, product-owner answer]: coverage scope — the coverage
record is **diagnostic only**. Orphaned spans have NO effect on scores,
question generation, completeness, or the improvement loop. The record exists
so the product owner can inspect how the engine attributes the bullet's words
("how the model thinks"); it may be removed again later without a rubric
change. The rubric stays rubric-3.1.0 (constitution gate 5 is not triggered —
no scoring criterion changes).

[RESOLVED 2026-11-04, product-owner answer]: chunk granularity — **only the
unclaimed words**. No new segmentation: whatever extraction (§2.1) leaves
outside all five parts is listed as orphaned spans, each with a reason; the
claimed part quotations come from the existing extraction unchanged.

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
  - A result that is present but vague — for example only a purpose phrase ("to uncover friction in …") — scores **1**; **0 is reserved for a missing result** (rubric-3.1.0: the deterministic engine previously scored a present-but-vague extracted result 0 and was aligned with constitution P4).
- The **experience score** is the simple average of the three dimensions. The bullet score calculation remains unchanged.
- `rubric_version` is now **3** because the Context definition changed. Prior scores (rubric_version 2) remain associated with their original version. As of 2026-11-03 the version of record is the semver string **rubric-3.1.0** stored with every new score (constitution v3.1.0, P4 as amended 2026-11-04); rubric-3.0.0-era scores keep their stored string.

### 3.1 Model rating instructions (when a model rates bullets)

When bullet ratings come from a model (opt-in BYOK), the model's instructions
MUST state the governing goal — every bullet should show problem-solving: the
problem first, then the work done to fix it, then the result — and MUST carry
calibration few-shot examples with expected ratings: an actual outcome = 2; a
goal/purpose phrase ("to uncover …", "in order to …", "aiming to …", "so that
…") = 1, never 2; no outcome phrase = 0. All numeric computation stays in
deterministic code (constitution P4); the model returns only 0/1/2 ratings.

## 4. Data Model (Per Bullet)

- `id`, `text`
- `user_need`, `product_feature`, `action`, `result`, `metric` (text fields extracted automatically).
- `part_present {user_need, product_feature, action, result, metric}` – Five booleans (replaces `context_present`).
- `coverage` (chunk-attribution record, §2.2, diagnostic only) – ordered entries: one per part (`{quote, part, status, reason}` — the part's exact extracted words, empty quote for a missing part) plus one per orphaned span (`{quote, part: "orphaned", status, reason}` — each maximal contiguous span of the bullet that no part claims, with the reason no part claims it).
- "Vague" is determined by the relevant dimension score (0 or 1).
- `analysis_status`: New, edited, or analyzed. Only new or edited bullets are re‑analyzed.
- `dimension_scores {context, action, result}`
- `rubric_version` (rubric-3.1.0 as of 2026-11-03; §3)
- `follow_up_questions` (0–5)
- `user_answers`, `rewrite_proposal`
- `rewrite_status`: Unanswered, draft, proposed, approved, or rejected.
- Entry-level (Phase 13, §4.2): `company`, `dates`, `product_domain` — short separate fields collected on the entry screen; optional and additive so old documents load unchanged.

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

Web prototype rendering: steps 5–10 are replaced by the single-screen
improvement loop (§6.1) with the same decisions — the user confirms every
replacement and zero answers means no rewrite. The terminal keeps steps 5–10
as written.

### 4.2 Entry recording — paste-and-split (Phase 13, 2026-11-04)

The entry screen collects one job's whole experience at once; the five-part
analysis then runs bullet by bullet. This stage PRECEDES the §4.1 workflow
and produces its bullet list.
[RESOLVED 2026-11-04, product-owner answer]: Phase 13 is WEB-PROTOTYPE scope
only — the terminal's entry flow and display are unchanged (the same pattern
as Phases 11–12; `messages.py` untouched). The terminal keeps its
bullet-by-bullet entry.

Entry fields (each a short separate input):

- **Job title**, **company**, **dates** — collected for role level and
  context. [RESOLVED 2026-11-04, product-owner answer]: stored AND displayed,
  with no effect on any analysis or suggestion logic in this phase ("do not
  change the five-part analysis logic" holds; using them in suggestions is a
  future decision); "dates" is a single free-text field (e.g. "2022–2024").
- **Product domain** (for example fintech, healthcare, e-commerce) — so
  suggestions align with the user's actual work.
- **Achievement text** — one large text box with the instruction "Write each
  achievement on a separate line, starting with - or •"; a short example of
  a good bullet below the box; and a SOFT limit: when the text exceeds 8
  lines the tool shows "Put your best achievements first; you can add the
  rest later." and NEVER blocks longer input.

Split stage (segmentation only — the tool never rewrites or invents text,
constitution P1):

1. The user pastes the entire work experience for one job, exactly as it
   appears in their resume.
2. The tool splits the pasted text into candidate bullets and shows the list:
   "I found 4 achievements. Is that correct?"
3. Lines that are not achievements (such as "Responsible for weekly
   meetings") are flagged and the user chooses keep or discard per line.
   [RESOLVED 2026-11-04, product-owner answer]: a line is flagged as "not an
   achievement" when it has NO action verb, NO marker from the existing
   parser lists (need / feature / result / metric / number), AND opens with
   a responsibility-style phrase ("Responsible for…", "Duties included…") —
   the user then chooses keep or discard. Marker-less lines that are natural
   wrap continuations of the previous line (they do not match the flag rule)
   merge into the previous bullet instead of being flagged.
4. A line that contains two achievements (for example joined by "and also")
   is suggested for splitting into two; the user decides.
5. The user can merge two bullets, split one bullet into two, or delete a
   bullet; every edit is the user's action (P2) and text is only moved or
   re-joined, never rewritten.
6. After the user confirms the list, the confirmed bullets enter the §4.1
   workflow unchanged — extraction, scoring, questions, rewrite, and the
   coverage record (§2.2) are untouched by this phase ("Achievement 2 of 4"
   style progress stays with the bullet).

During each bullet's analysis the user's original pasted text stays visible
at the top of the page, so the user never feels their text was lost.

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

### 5.1 Web prototype rendering (rubric‑3.1.0 — web + parser‑doc scope only)

The web prototype renders the same framework as ONE continuous sentence; the
terminal keeps the list format above. Product-owner decision 2026-11-03.

- Only the candidate's verbatim words sit inside brackets, colored by status:
  filled (emerald), vague (amber), missing (red). Labels read "Feature name"
  and "Specific action"; the bullet's own text is labeled "Job seeker's
  original text".
- Missing → `[label – missing]`; vague → `[label: words – vague]`.
- The connecting words outside the brackets are a content-based prediction
  from a CLOSED variant set (defined creativity — never copied from an
  example, never free writing):
  - Opening: "Research into" when the need starts with a problem-discovery
    verb, otherwise "Analysis of" (also when the need is missing).
  - Feature segment: "and collaboration with the product team on designing"
    (collaboration markers) / "and building of" (a delivery verb — "improved"
    alone stays vague) / "and work on" (vague action or the neutral fallback)
    / "and research into" (no action at all + a discovery-verb need).
  - Fixed: "through" before the action, ", resulting in" before the result,
    "and" before the metric.
  - The result segment is ALWAYS ", resulting in [result …]" — including for
    vague results (product-owner ruling; "aiming to …" was overruled).
  - If two variants seem possible, pick the more neutral one.
- A research-only bullet therefore never fabricates a collaboration claim
  (constitution P1): it renders "Research into […] and research into […]".
- The web "Still needs to be filled" list additionally shows, per part, the
  ambiguity reason quoting the candidate's words and grounded suggestions
  (§6.1); the terminal list stays names-only as above.
- The web prototype also renders the coverage record (§2.2): every part shows
  quotation, status, and reason, and orphaned chunks are listed with their
  quotation and reason.
[RESOLVED 2026-11-04, product-owner answer]: orphan presentation — a
separate **"Not attributed to the framework" block under the display
sentence**: one row per orphaned chunk with its quotation and reason, in a
neutral (gray) style that never reuses the filled/vague/missing colors. The
terminal display (§5) is unchanged.

### 5.2 Warm analysis display (Phase 15 — supersedes §5.1's bracket format on the web)

Product-owner UX review 2026-11-05 (items 1–2 of eight): the web's display
drops the bracket format and becomes glanceable. The terminal (§5) is
UNTOUCHED — its §5 list format and brackets stay exactly as they are.

- **Five-cell status row** above the sentence: one cell per part (Need,
  Feature, Action, Result, Metric), three states — **Complete**, **Vague**,
  **Missing** (English B1 labels; the owner's Persian examples were tone
  references only — P10 decision 2026-11-05). States differ by TEXT and
  weight only — never colored icons or emoji (§11.1 rule 1).
- **The sentence without brackets**: filled/vague parts show the
  candidate's verbatim words with a **soft underline**; missing parts render
  a **dotted placeholder gap** in their slot so the sentence still reads
  naturally. Every §5.1 CONTENT rule still holds — verbatim words only, the
  closed connector variant set, ", resulting in" always, the sentence never
  contradicts the score, the research-only rendering — ONLY the presentation
  changes from brackets to underlines/placeholders.
- The gray coverage block (§2.2) stays under the sentence unchanged.
[RESOLVED 2026-11-05, product-owner answer]: status colors — the sentence
underlines KEEP the three status colors (themed emerald/amber/red, §5.1's
palette now on the warm scales): color is fast status recognition and does
not violate §11.1 rule 1 (a color is not a colored icon). The five-cell row
is text+weight only regardless.

[RESOLVED 2026-11-05, product-owner answer]: the "Still needs to be filled"
list is SUPERSEDED on the web — the five-cell row + the focused question
loop replace it, and the ambiguity reason moves INSIDE the open question.
The terminal list (§5) stays names-only as before.

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

### 6.1 Improvement loop (web prototype rendering)

The web prototype replaces the separate question screens (§4.1 steps 5–10)
with ONE screen; the decisions are identical (the user confirms every
replacement; zero answers means no rewrite; the tool never invents content).

- For each missing or vague part the screen shows one block: the part's
  status headline, the ambiguity reason quoting the candidate's own words
  (for vague parts), a **grounded suggested answer** predicted from the
  bullet's own words (editable; generic fill-ins only as fallback; metric
  suggestions use an "x" placeholder and stress that a real number matters),
  an always-editable input, and a **Confirm** button.
- Confirm replaces that part in the display sentence and applies light
  phrasing repair (collapse spaces, capitalize, add "I " to a subject-less
  delivery-verb action, dedupe "the the"); when the text changed, the input
  shows "Improved phrasing: …". Confirmed parts stay visible and editable
  with a "(filled)" headline.
- Submitting with **zero** answers → the final confirmation for a complete
  bullet, otherwise no rewrite (original bullet untouched).
- Submitting with **one or more** confirmed answers (partial allowed) → the
  improved bullet is assembled as plain prose ONLY from the confirmed
  answers ("need, so action, and result metric."), recorded in the bullet's
  history with status "edited", and **re-scored through the same pipeline as
  a first-time bullet** (fresh extraction + ratings), showing before/after
  scores.
- A **copy** action writes the improved bullet as plain prose — no brackets,
  labels or status markers (feature used only if the action is missing;
  metric appended to the result segment; falls back to the verbatim original
  when nothing improved exists) — with a visible confirmation.

### 6.2 Focused question loop (Phase 15 — supersedes §6.1's all-at-once form on the web)

Product-owner UX review 2026-11-05 (item 3 of eight): the web improvement
loop shows ONE question at a time. Every §6.1 DECISION is unchanged —
confirm per part, zero confirmed answers means no rewrite, grounded
suggestions from the bullet's own words, the tool never invents content,
re-submission re-scores through the same first-time pipeline.

- **Order**: missing parts first, then vague parts (each group in the fixed
  Need → Feature → Action → Result order), the Metric LAST.
- Exactly **one question is expanded** at a time; the others are collapsed.
  **Next** advances to the next question; **clicking a sentence fragment**
  opens that part's question; confirmed parts stay visible as filled in the
  row (§5.2) and the sentence and remain clickable to reopen.
- The **active fragment is highlighted** in the sentence, and typing
  updates the sentence **live** (the confirmed word appears immediately).
- Already-complete bullets (2/2/2) **skip the loop entirely** —
  confirmation only, as §6 defines.
- The existing **question texts (§6) are unchanged** — the program reads
  exactly those strings (product-owner note).
- The terminal steps 5–10 (§4.1) are unchanged.

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
- Each bullet's score is stored with its rubric version string (`rubric-3.1.0` as of 2026-11-03; §3).
- Research/mapping verbs fill the need part and never the action part; an all-research bullet leaves the action part empty (e.g., "Benchmarked 7 competitors and mapped … to uncover friction in hiring and project-assignment flows.": need = the research phrase, feature = the named flows, action = empty, result = "to uncover …" marked vague).
- A purpose clause is a vague result; a need phrase ending in "to" is never read as a result.
- No word appears in two framework parts (the feature-inside-action overlap excepted); a multi-line bullet extracts exactly like its single-line equivalent.
- A present-but-vague result scores 1 and a missing result scores 0; an empty part never displays as vague.
- The web display renders the one-sentence format of §5.1 with the closed connector set, and the sentence never contradicts the score. **Phase 15 (§5.2): on the web the parts render as soft underlines with dotted placeholders for missing slots (no brackets), a five-cell status row (Complete/Vague/Missing, text+weight only, no icons) sits above the sentence, and the coverage block (§2.2) is unchanged; the terminal keeps §5 exactly.**
- Every submitted improvement yields a before/after score pair computed by the same pipeline as first-time scoring.
- **Phase 15 (§6.2): exactly one question is expanded at a time in the order missing → vague → metric (fixed part order within each group); Next and fragment-click navigation work; typing updates the sentence live; confirmed parts remain visible and clickable; complete bullets skip the loop (confirmation only); zero confirmed answers still means no rewrite.**
- The model disclosure banner appears exactly on the screens where a model call can happen while model scoring is active, and never otherwise.
- The platform theme (§11) renders on every web screen with the three vendored fonts and no external font requests, and the tone guard test passes (no emoji in message strings; key tokens present).
- Coverage (§2.2): the coverage record lists, per part, its exact extracted words with status and reason, and every word of the bullet that no part claims appears in exactly one orphaned span with a reason; no word is claimed by two parts (the §2.1 feature-inside-action overlap excepted — such words are claimed by the action and never orphaned) and orphaned spans never change scores, questions, or statuses.
- The coverage record (§4) carries quotation, status, and reason for all five parts and every orphaned chunk; a missing part's quotation is empty and its reason states why the part is missing.
- The statuses shown for the five parts are exactly the statuses derivable from the coverage record (the record is the input to status assignment, §2.2), and the web display of the record (§5.1) matches it.
- Paste-and-split (§4.2): a pasted experience is split into candidate bullets, the count is confirmed with the user ("I found 4 achievements. Is that correct?"), and every keep/discard, merge, split, and delete decision is the user's; splitting never rewrites text — every confirmed bullet is a verbatim line from the paste or a verbatim re-join of lines.
- The confirmed bullet list feeds the §4.1 workflow unchanged; analyzing a bullet through paste-and-split produces exactly the same analysis, scores, questions, and coverage as entering the same text bullet by bullet.
- The new entry fields (`company`, `dates`, `product_domain`) are optional and additive — documents saved before Phase 13 load unchanged — and text beyond 8 lines shows the soft-limit message without ever blocking input; the original pasted text stays visible during every bullet's analysis.

## 10. Open Items for Planning

- Keep the first success criterion in the PRD (10 min) and assumption 8 unchanged. Timing must be measured during the pilot because up to five questions may be asked.
- ~~Define the exact 0/1/2 scoring levels for the **Specific Action** dimension~~ — **DONE 2026-10-29**: `checklists/specific-action.md` (rubric-3.0.0), implemented and tested (Phase 9, T045–T050).
- Review dimension weights after pilot data; any change creates a new rubric version.
- ~~Correct the five-part parsing (research verbs → need; intention clause → vague result; no shared words; `flow(s)`; multi-line normalization) and align the result score (present-but-vague = 1)~~ — **DONE 2026-11-03** as rubric-3.1.0 (Phase 11, T063–T092; 216 pytest green, parity OK; constitution amended to v3.1.0 on 2026-11-04).
- ~~Web prototype: in-sentence display, inline improvement loop with grounded suggestions, copy, model disclosure banner, BYOK prompt calibration~~ — **DONE 2026-11-03** (Phase 11; web + parser-doc scope only; terminal display unchanged). Open follow-ups remain in tasks.md Phase 11 (doc answer-key alignment; OpenRouter CORS retry).
- Chunk attribution before status assignment (§2.2, Phase 12) — spec'd and clarified 2026-11-04 (diagnostic-only scope; orphaned = unclaimed remainder spans; separate gray web block under the sentence); then plan and tasks from T093 (T091/T092 remain open). **DONE 2026-11-04** — implemented and gated (T095–T105; pytest 227 green, PARITY OK, terminal untouched).
- Hybrid entry — paste-and-split bullet shaping (§4.2, Phase 13) — spec'd and clarified 2026-11-04 (WEB-ONLY scope, terminal unchanged; fields stored+displayed, dates free-text; combined flag rule + wrap-merge); then plan and tasks from T106 (T091/T092 remain open). **DONE 2026-11-04** — implemented and gated (T106–T114; test:engine 11/11, PARITY OK, terminal untouched), committed as c56e574.
- Platform theme and voice (§11, Phase 14) — spec'd and clarified 2026-11-05 (COMPLETE web adoption; Tailwind-variant-only — raw pack stays outside the repo; fonts vendored locally); then plan and tasks from T115 (T091/T092 remain open). **DONE 2026-11-05** — implemented and gated (T115–T120; test:engine 17/17 incl. theme guard, tsc clean, next build exit 0, PARITY OK, pytest 227), committed as cbf7ae8.
- Five-part analysis UX — glance row + underline sentence + focused one-question loop (§5.2/§6.2, Phase 15) — spec'd and clarified 2026-11-05 (items 1–3; status colors stay on underlines; needs list superseded on the web; items 4–8 DEFERRED below); then plan and tasks from T121 (T091/T092 remain open).
- DEFERRED UX items (owner's review 2026-11-05, not in Phase 15 — candidates for later phases): (4) fewer/better suggestions — grounded suggestion first, generic under "other suggestion", cursor to the first "…" gap; (5) one-line warm ambiguity reason with the fuller guidance hidden behind "Why?"; (6) metric without pressure — a clear "I don't have a number" skip + an encouraging line + a gentle "is this a measured number?" check on guess-like input ("about", "roughly"); (7) progress line "N of 5 complete" next to "Achievement n of total" + a final clean card with the improved sentence beside the original text (copy/continue exist); (8) Enter-to-next, a Back button that never wipes answers, and auto-saved answers across refreshes.
- Repository layout — two view editions, one governance root (§12, Phase 16) — spec'd and clarified 2026-11-05 (root siblings; optional-skip parity; matcher/ + its two legacy tests deleted); **executes BEFORE the pending Phase 15 implementation per product-owner priority**; then plan and tasks from T127 (T091/T092 remain open).
- Warm UX & voice (§11.5, Phase 17) — owner look-and-feel review 2026-11-05, all four accepted groups; LIGHT PATH (no spec-kit commands, owner-approved before/after tone table); **DONE 2026-11-05** — implemented and gated (pytest 213 from terminal/, test:engine 23/23, tsc clean, next build exit 0, PARITY OK), committed as e69186c, f93965a, d926dda, fab9ee4, 5f5b1af.

## 12. Repository Layout: Two View Editions, One Governance Root (Phase 16, 2026-11-05)

The product has TWO VIEW EDITIONS of one engine — the **Terminal** (Python
v1, the original rule/test baseline) and the **Web** (the product's
continuation) — and the repository must make that legible while keeping ONE
governance root: `specs/`, `.specify/`, and `docs/` stay at the repository
root, shared by both editions and owned by neither.

### 12.1 Edition folders

- **terminal/** — ALL Python-side assets move here: `pyproject.toml`,
  `src/jobforward/**`, `tests/**`, and the terminal's runtime data folder.
  Package internals are unchanged; the CLI runs standalone from this folder.
  terminal/ carries its own README declaring the edition: Terminal v1 — the
  original baseline, FROZEN (product updates continue on the web edition).
- **web/** — unchanged in place; already runtime-independent (verified
  2026-11-05: the web imports nothing from the Python side; the only
  cross-coupling was the dev-time parity harness).

### 12.2 Independence guarantee

Removing terminal/ must not break web in any way. Web runtime has no Python
dependency; the parity gate (a dev-time release gate) becomes OPTIONAL: with
the terminal engine present it runs exactly as today (PARITY OK required as
before); with terminal/ absent it skips gracefully with a clear message and
never fails the web build/test gates.
[RESOLVED 2026-11-05, product-owner answer]: optional-skip parity confirmed —
the owner now knows the gate's purpose (the twin-drift oracle: it proves the
web's TS engine still matches the Python reference engine byte-for-byte on
the shared corpus). With the terminal engine present the gate runs exactly
as today (PARITY OK required); with terminal/ absent it skips gracefully
with a clear message and never fails the web gates.

### 12.3 Live data

The user's real resume data moves WITH the terminal folder (root `data/` →
`terminal/data/`), preserved byte-for-byte (constitution data rules); the
web prototype's own data (`web/data/`) does not move.

### 12.4 Superseded package cleanup

The retired `matcher/` package (replaced by `matcher2/`, no production
importers — verified 2026-11-05) plus its two legacy tests are candidates
for removal in this phase.
[RESOLVED 2026-11-05, product-owner answer]: DELETED in this phase —
`matcher/` + `tests/unit/test_matcher.py` +
`tests/contract/test_matcher_output.py` (verified: no production importers;
the retired 001 matcher is fully superseded by matcher2/).

### 12.5 Documentation truthfulness

A one-time path-update pass over the records: LIVING and forward-looking
sections (plan structure, quickstart commands, READMEs, task execution
notes) describe the new layout; HISTORICAL task lines keep their old paths
AS RECORDS, with the mapping note (`src/jobforward/…` →
`terminal/src/jobforward/…` etc.) in the Phase 16 execution note (research
D28 — rewriting historical lines would falsify what was done when). The
execution note also records that Phase 16 runs BEFORE the pending Phase 15
implementation (owner priority). Moves use `git mv` so history follows the
renames.

### 12.6 Acceptance criteria

- The repository root contains only the two edition folders (`terminal/`,
  `web/`), the shared governance (`specs/`, `.specify/`, `docs/`), and repo
  meta (`.git`, `.gitignore`, `.zcode/`, README).
- Web gates all green with terminal present (parity PARITY OK) AND with
  `terminal/` temporarily absent (parity reports the skip, nothing fails).
- pytest from `terminal/` passes at the same count (minus the legacy
  matcher tests if deletion is confirmed); the live resume data is intact
  in `terminal/data/` and never left the machine.
- `terminal/README.md` states the frozen-baseline status; a root README
  carries the repo map.
[RESOLVED 2026-11-05, product-owner answer]: ROOT SIBLINGS confirmed —
`terminal/` + `web/` at the repository root, beside the shared governance
(`specs/`, `.specify/`, `docs/`); `web/` stays exactly where it is
(minimal churn).

## 11. Platform Theme and Voice (Phase 14, 2026-11-05)

The product owner delivered a theme pack ("Job Forward — Warm Theme",
reviewed 2026-11-04): warm palette, typography, shape, layout, and component
styling, plus four VOICE/TONE rules. The theme is a CROSS-CUTTING concern:
the tone rules bind every project surface; the visual implementation lives
on the web prototype, the only graphical surface. The terminal already
complies with the tone rules (English B1, ASCII — no emoji possible) and its
display is FROZEN — this phase never touches it. The five-part analysis
logic (§2–§3, §6), the entry flow (§4.2), and all flow behavior are
untouched: theme is presentation only (P1/P2 hold unchanged).

### 11.1 Voice and tone rules (all surfaces)

1. No colored icons or emoji anywhere, buttons included — text only.
2. Brand red is for primary buttons and emphasis, never for long text.
3. Errors use the warm orange-red, never the brand red (an error must never
   read as emphasis).
4. Body text stays at 18px for readability.

All tool text stays English at B1 (P10). The emoji-free rule is enforced by
an automated guard (§11.3).

### 11.2 Theme tokens (web prototype)

Adopted from the pack's Tailwind variant, whose component class names
already match the app (btn-primary, btn-secondary, text-input, card,
tech-tag, pulse-dot):

- Colors (oklch tokens; hex references): brand #942B2B (hover #7A2020),
  background cream #FAF9F5, card #FEFDFB, secondary #F0EEE5, text #141413,
  muted #59554E, input border #CBC3B6, error #C33C00 with its lighter
  background/text pair, success #5E713C with its pair, accent #FBE2D9, a
  warm neutral ramp, and a chart palette.
- Typography: body Source Sans 3, 18px, line height 1.65; headings Fraunces
  (500/600); mono JetBrains Mono for small tech touches only (version tags,
  step numbers, code). All three fonts are VENDORED in the repository with
  their OFL licenses (product-owner decision 2026-11-05 — no external font
  requests at runtime, P8).
- Shape: 14px base radius (10px small, 18px large, pill-shaped buttons) and
  a soft warm shadow. Layout: one 680px content column.
- The tokens live in exactly ONE file — the global stylesheet is the single
  source of truth; screens consume them via the shared component classes
  and the themed utility scale. No screen defines its own colors.
- Light mode only: the pack defines a dark-variant hook but no dark values
  (ASSUMPTION — dark mode is out of scope unless the product owner says
  otherwise).

The current monochrome look (black buttons, default sans font, 17px body,
square-ish corners) transitions to the warm theme; every screen keeps its
layout, content, and texts unchanged — only colors, type, radii, shadows,
and message styling change.

### 11.3 Theme guard (automated)

A new engine test enforces the enforceable tone rules: (a) no emoji
codepoints in any user-facing message string; (b) the token file still
defines the theme's key tokens (a guard against silent drift). The
visual-only rules (brand red usage, error color separation) are documented
here and reviewed by walkthrough.

### 11.4 Acceptance criteria (theme)

- Every web screen renders with the warm tokens: cream background, brand
  red-brown pill primary buttons, Fraunces headings, Source Sans 3 18px
  body (adoption depth pending the clarification below).
- Errors render in the warm orange-red pair and never in the brand red;
  success renders in the olive-green pair.
- No runtime request reaches any font service: the three fonts load from
  the vendored files only, and no external font link exists.
- The theme guard test passes: zero emoji in the message strings; the key
  tokens are present.
- Layout, flow, and analysis behavior are unchanged: the same screens and
  texts, and all standing gates stay green (tsc, test:engine including the
  new guard, PARITY OK on the unchanged corpus, test:byok 23/24 baseline,
  scan, pytest 227).

[RESOLVED 2026-11-05, product-owner answer]: adoption depth — COMPLETE
replacement: every web screen renders with the warm tokens (cream
background, brand red-brown pill primary buttons, Fraunces headings, Source
Sans 3 18px body); no web surface stays monochrome. Consistent with the
product owner's "apply the theme to the whole project".

[RESOLVED 2026-11-05, product-owner answer]: raw pack files — the repository
adopts ONLY the Tailwind variant into the global stylesheet; the raw
standalone files (jobforward-theme.css jbf-*, preview.html, fonts.html)
stay outside the repo with the product owner. The global stylesheet remains
the single source of truth (no duplicate token sets to keep in sync).

### 11.5 Warm UX and voice wiring (Phase 17, light path, 2026-11-05)

Product-owner look-and-feel review 2026-11-05 (warm first-person voice
model; all four accepted groups). Binding outcome of the light-path
implementation (commits e69186c … 5f5b1af):

- Color notes: already satisfied by the §11.2 tokens — warm black on cream;
  the brand red only on the primary button and emphasis; errors in the warm
  orange-red, never the brand red; success in the olive green. No change.
- Stage progress bar at the top of the page: warm segments + a
  "Step n of N" caption mapped from the screen state (add flow: Details /
  Achievements / Questions / Result; match flow: Paste / Review / Hard
  skills / Soft skills); no bar on gate/welcome/menu/settings. Text and
  segments only — no icons (§11.1 rule 1).
- The overall score renders as a progress ring with the number (JetBrains
  Mono digits, brand red stroke on the warm neutral track — emphasis use,
  §11.1 rule 2); all score numbers render in JetBrains Mono.
- The busy status shows the blinking pulse-dot next to "Analyzing…"; the
  hard/soft skill names render as mono tech-tag chips.
- Warm voice pass (P10 lockstep — texts byte-identical in messages.py and
  messages.ts): the ERR_* family, ADD_* prompts, DRAFT_*, GOODBYE,
  EDIT_BULLET_DONE, ADD_PASTE_EMPTY, and the split-confirm CTA rewritten to
  the warm first-person B1 tone from the owner-approved before/after table.
  MATCH_* (002 contract, pinned verbatim) and ASK_* (§6 texts) untouched.
- Encouragement lines and title/company field hints are WEB-ONLY strings in
  messages.ts (terminal display frozen — the §5.2 divergence pattern):
  ENCOURAGE_SCORED on the score screen, ENCOURAGE_STRONGER before the
  before/after line after an inline improvement.
- Gates as run 2026-11-05: pytest 213 from terminal/, test:engine 23/23
  (theme guard included), tsc clean, next build exit 0, PARITY OK.

[RESOLVED 2026-11-05, product-owner answer]: encouragement coverage — the TWO
placements above (the score screen line and the post-improvement line) are
the accepted final interpretation of "a short encouraging sentence after
each stage"; no additional transitions get encouragement lines. More
placements remain a future decision through a new phase.
