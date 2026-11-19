# Phase 1 Data Model: JD Matcher — model-driven analysis (web only; v3, 2026-11-16)

Resolves the pipeline (owner's 7-step method, amended 2026-11-16 by the
Task 2 rulings — Clarifications Session 2026-11-16 in spec.md) into
concrete TypeScript types on the web surface. This feature persists no new
application state in Task 2 (taxonomy-candidates / example-candidates
storage is Task 4 and gets its own amendment); the analysis events extend
the existing client event log and the gateway's own request log. The
contract is versioned as **`matcher-rules-2.1.0`** (v2.0.0 superseded:
trait retired, in_taxonomy added, alt labels returned, prioritization
rules corrected).

The v1 data model (three deterministic tables) is superseded on web; the
v1 entities remain in the codebase (dormant) and in the terminal (active).
Entities below are the v2 contract; TS types land in
`web/src/engine/matcher2/v2/types.ts`.

## Entities

### CleanedPosting (existing, unchanged — `web/src/engine/matcher2/posting.ts`)

| Field | Type | Rules |
|---|---|---|
| raw_text | string | exactly as pasted |
| cleaned_text | string | control chars removed, line endings normalized, `<script>`/`<style>` blocks removed with content, other HTML tags removed keeping inner text |
| script_blocks_removed / style_blocks_removed / html_tags_removed | number | counts for the cleaning report |
| word_count | number | whitespace-split count of `cleaned_text`; must be 100–1,500 |

Input-stage gates (language >10% Persian/Arabic letters → reject; word
count out of range → reject; not-a-posting heuristic `looksLikePosting` →
input error) are unchanged and run before any model contact. The cleaned
text is the `input` sent to the model.

### SoftTaxonomyEntry (v3 view over the 56-skill ESCO file)

| Field | Type | Rules |
|---|---|---|
| label_en | string | the canonical skill name; soft items that match the taxonomy record THIS name |
| alt_labels_en | string[] | alternative labels — injected into the prompt so the model can RECOGNIZE the skill; never recorded as the item name |
| group_code | string | taxonomy group (T2.1…T4.5); displayed nowhere in v3 results |

The R2 soft/trait typing is retired (research R13): no `type` field. The
ESCO `id` and `description_en` are never sent to the model and never
displayed (v1 rule carried over).

### SkillItem (one row in any bucket; v3)

| Field | Type | Rules |
|---|---|---|
| type | `"hard" \| "soft"` | NO trait (retired, R13) |
| name | string | hard: the skill as the ad names it; soft: the canonical taxonomy `label_en` when the skill matches the taxonomy (by label_en or any alt label), else the ad's own wording with `in_taxonomy: false` |
| category | `"technical" \| "tool" \| "experience" \| "domain" \| null` | non-null only when `type === "hard"` |
| evidence | string[] | ≥ 1 witness sentence, each verbatim in the cleaned posting (whitespace-normalized containment) |
| source | `"explicit" \| "implied"` | hard items are always `"explicit"`; implied only from the soft pass |
| confidence | `"high" \| "medium" \| "low" \| null` | non-null only for `soft`; merged item keeps the highest witness confidence (pipeline step 4) |
| in_taxonomy | boolean \| null | soft only: `true` when the name matched the taxonomy (label_en or any alt label) and the name is canonicalized to `label_en`; `false` legal ONLY with `source === "explicit"` (an implied out-of-taxonomy soft skill is dropped by the model); hard items `null` |
| ad_wording | string \| null | soft only: REQUIRED (non-empty) when `in_taxonomy === false` — the ad's original phrase, whitespace-normalized verbatim inside one of the evidence sentences (V9); `null` otherwise |

### MatcherAnalysisV2 (the full result, `matcher-rules-2.1.0`)

| Field | Type | Rules |
|---|---|---|
| summary | SummaryV2 | six non-empty fields, all derived from the posting only |
| must / preferred / bonus | SkillItem[] | each name unique across ALL three buckets and across types; a soft item in `must` must have `confidence === "high"` |
| red_flags | RedFlag[] | may be empty; never reported as "no match" |
| rules_version | `"matcher-rules-2.1.0"` | stamped by code, not by the model |

### SummaryV2 (pipeline step 6)

| Field | Type | Rules |
|---|---|---|
| job_title | string | as the ad states it |
| seniority | string | e.g. "senior", "mid-level"; "unspecified" allowed when the ad does not say |
| work_type | string | e.g. "full-time", "contract" |
| domain | string | product/industry area named in the ad |
| role_nature | `"executive" \| "analytical" \| "managerial"` | single value (open point flagged for owner review in the contract) |
| problem_solved | string | 1–2 sentences: the problem this position solves, from the ad only (P1: no outside knowledge claims) |

### RedFlag (pipeline steps 5–6)

| Field | Type | Rules |
|---|---|---|
| kind | `"conflict" \| "unrealistic" \| "multi_role" \| "vague" \| "discriminatory"` | conflict = step-5 conflict rule outcome; the rest are step-6 judgments |
| text | string | one sentence, English B1, describing the flag |
| evidence | string[] | ≥ 1 witness sentence verbatim in the cleaned posting |

Taste-based or potentially discriminatory phrases ("young and energetic")
are recorded ONLY here — never as skills (pipeline step 6 rule).

### MatchFailure (error result, mapped to §15 failure classes)

| Field | Type | Rules |
|---|---|---|
| error | `"ERR_MATCHER_INPUT" \| "ERR_MATCHER_ANALYSIS_FAILURE" \| "ERR_MATCHER_ZERO_SKILLS" \| "ERR_MATCHER_CONSISTENCY" \| gateway error ids` | input errors keep their own fixed messages and are never shown as mismatch |
| failure_class | `"TRANSIENT" \| "NO_WAY_FORWARD" \| "BROWSER_UNREACHABLE" \| "OWN_KEY"` | from the shared `failure-class.ts` taxonomy (004 §15) |
| detail | string | dev-facing only; never fabricated into user text |

Persistent output-contract failure after the one retry maps to
NO_WAY_FORWARD (with Retry visible and the BYOK transfer path), per §15.

## Validation invariants (validator = the only gate before display)

1. **V1 evidence**: every item and red flag has ≥ 1 evidence sentence;
   every sentence passes whitespace-normalized containment in the cleaned
   posting. Violation → the item is invalid (retry lists it by name).
2. **V2 uniqueness**: no `name` in two buckets; no `name` with two
   different `type` values.
3. **V3 must-gate**: a `soft` item in `must` must have
   `confidence === "high"`.
4. **V4 field rules**: `category` non-null ⇔ `type === "hard"`;
   `confidence` non-null ⇔ `type === "soft"`; `in_taxonomy` non-null ⇔
   `type === "soft"`; hard ⇒ `source === "explicit"`.
5. **V5 taxonomy rule (v3; ambiguous-name precedence added 2026-11-16)**:
   matching precedence for a soft name — (1) EXACT case-insensitive
   `label_en` match → that record wins, `in_taxonomy === true`, name
   canonicalized; (2) alt-label match to EXACTLY ONE record → that
   record, same canonicalization; (3) alt-label match to MULTIPLE
   records (known today: "demonstrate commitment" → meet
   commitments|show commitment; "demonstrate enthusiasm" → show
   commitment|show determination; "guide others" → advise others|lead
   others) → the check FAILS naming the candidates; the model must use
   one candidate's exact label_en or record the skill with
   `in_taxonomy === false` + `ad_wording`; (4) no match →
   `in_taxonomy === false` AND `source === "explicit"` (implied + no
   match is invalid — the model should have dropped it). Known ambiguous
   set (owner-verified 2026-11-16): show commitment, demonstrate
   loyalty, demonstrate commitment, demonstrate enthusiasm, guide
   others — the first two resolve by rule (1).
6. **V6 enums**: `category` ∈ fixed set when non-null; `source`,
   `confidence`, `kind`, `role_nature` in their sets.
7. **V7 summary**: all six fields present; `problem_solved` non-empty.
8. **V8 non-empty analysis**: if all three buckets are empty →
   `ERR_MATCHER_ZERO_SKILLS` (extraction failure — never a verdict).
9. **V9 normalization bound (v3, owner ruling 2026-11-16)**: for a soft
   item with `in_taxonomy === false`: (a) `ad_wording` is non-empty and
   whitespace-normalized verbatim inside one of its evidence sentences;
   (b) every significant word of the name is covered by the witness
   words ∪ the CLOSED generalization list
   `{management, communication, collaboration, coordination}`
   (case-insensitive, singular-tolerant). This accepts "stakeholder
   management" (stakeholder ∈ witness; management ∈ list) and rejects
   fabricated skills ("leadership" from an ownership sentence). Adding a
   word to the closed list requires owner approval and is a
   rules-version change. Forbidden (model rules, prompt-encoded):
   adding a concept absent from the sentence, merging two different
   skills into one name, changing the nature (hard↔soft).

Any violation → retry once with the failed-check list → refusal
(`ERR_MATCHER_ANALYSIS_FAILURE`). The refusal is an error, never rendered
as a result.

## State transitions (web JD step)

```
paste → [clean → language gate → word-count gate → not-a-posting gate]
      → review gate (cleaning report + word count + [Y]/[C])
      → analyzing (one matcher_analysis call; spinner; cancellable)
      → result screen (summary + must/preferred/bonus + red_flags; Back)
      ↘ any failure → §15/§16 failure UX at this stage (banner + guidance +
        Retry / Retry with your own key), navigation never blocked
```

Cancel at any stage discards that stage's result and returns to paste;
cancel at paste exits the flow (v1 behavior carried over).

## Relationships

- `CleanedPosting 1—1 MatcherAnalysisV2` (one analysis per confirmed
  posting; re-analysis allowed by re-confirming at the review gate).
- `SoftTaxonomyEntry 56—* SkillItem` (each in-taxonomy soft item names
  exactly one taxonomy entry via `in_taxonomy: true`; out-of-taxonomy
  explicit soft items carry `in_taxonomy: false` and are the future
  taxonomy-candidates of Task 4; V2 forbids the same name twice).
- `MatcherAnalysisV2 1—* RedFlag` (ordered as the pipeline produces them).
- v1 entities (`HardSkillRow`, `SoftSkillRow`, `AnalysisReport` of tables)
  are superseded on web: dormant in code, active in the terminal, removed
  from no v2 path.
