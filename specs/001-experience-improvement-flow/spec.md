# Feature Specification: Help Entry-Level Job Seekers Narrate Their Experience (Level 1 Prototype)

**Feature Branch**: `001-experience-improvement-flow`

**Created**: 2026-10-23

**Status**: Finalized — Five-Part Resume Bullet Rewriting Framework (2026-10-29); amended 2026-11-04 — rubric-3.1.0 parsing rules, result-score alignment, and the web prototype display/improvement loop (Phase 11)

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
- "Vague" is determined by the relevant dimension score (0 or 1).
- `analysis_status`: New, edited, or analyzed. Only new or edited bullets are re‑analyzed.
- `dimension_scores {context, action, result}`
- `rubric_version` (rubric-3.1.0 as of 2026-11-03; §3)
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

Web prototype rendering: steps 5–10 are replaced by the single-screen
improvement loop (§6.1) with the same decisions — the user confirms every
replacement and zero answers means no rewrite. The terminal keeps steps 5–10
as written.

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
- The web display renders the one-sentence format of §5.1 with the closed connector set, and the sentence never contradicts the score.
- Every submitted improvement yields a before/after score pair computed by the same pipeline as first-time scoring.
- The model disclosure banner appears exactly on the screens where a model call can happen while model scoring is active, and never otherwise.

## 10. Open Items for Planning

- Keep the first success criterion in the PRD (10 min) and assumption 8 unchanged. Timing must be measured during the pilot because up to five questions may be asked.
- ~~Define the exact 0/1/2 scoring levels for the **Specific Action** dimension~~ — **DONE 2026-10-29**: `checklists/specific-action.md` (rubric-3.0.0), implemented and tested (Phase 9, T045–T050).
- Review dimension weights after pilot data; any change creates a new rubric version.
- ~~Correct the five-part parsing (research verbs → need; intention clause → vague result; no shared words; `flow(s)`; multi-line normalization) and align the result score (present-but-vague = 1)~~ — **DONE 2026-11-03** as rubric-3.1.0 (Phase 11, T063–T092; 216 pytest green, parity OK; constitution amended to v3.1.0 on 2026-11-04).
- ~~Web prototype: in-sentence display, inline improvement loop with grounded suggestions, copy, model disclosure banner, BYOK prompt calibration~~ — **DONE 2026-11-03** (Phase 11; web + parser-doc scope only; terminal display unchanged). Open follow-ups remain in tasks.md Phase 11 (doc answer-key alignment; OpenRouter CORS retry).
