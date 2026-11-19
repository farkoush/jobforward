# Interface Contract: JD Matcher — model-driven analysis (web only; v3)

**Version**: `matcher-rules-2.1.0` | **Date**: 2026-11-16 | **Status**:
v3 draft for owner plan review (amends the 2026-11-09 v2.0.0 contract per
the owner's Task 2 rulings; frozen after approval — any change = version
bump)

One interface replaces the v1 web analysis pipeline (`contracts/matcher-pipeline.md`,
kept for the terminal's active v1 flow): the **model-driven analysis
contract** — one gateway call, one JSON output, one deterministic validator.
The v1 input-stage contract (paste → clean → language gate → word-count
gate → not-a-posting gate → review gate) is UNCHANGED and precedes this
contract; it runs entirely in deterministic code before any model contact.

---

## 1. Gateway task registration

`web/src/lib/llm/tasks.ts`:

```ts
matcher_analysis: "GEN", // documented reason: heavy structured generation of
// the full analysis document (summary + skill buckets + red flags) from a
// 100–1,500-word posting; quality of the GEN chain gates the whole step.
```

Call path: `POST /api/llm/gen`, NDJSON stream, request body
`{ task: "matcher_analysis", input: <cleaned posting text>, context: { system: <system prompt> } }`.
BYOK flows through the same route via `x-byok-key` / `x-byok-model`
headers. One call per analysis; the retry (§4) is a second call.

## 2. Prompt surface (`web/src/lib/byok/prompts.ts` — single surface for gateway + BYOK)

Exports:

- `BYOK_MATCHER_SYSTEM_PROMPT` — the exact text below (v3).
- `buildMatcherUserPrompt(postingText: string): string` — wraps the cleaned
  posting.
- `buildMatcherTaxonomyTable(entries: SoftTaxonomyEntry[]): string` —
  one line per skill: `<label_en> | <alt labels, comma-joined> |
  <group_code>` (alt labels RETURN — research R15).
- `buildMatcherSystemPrompt(taxonomyLines: string[], fewShotBlock: string): string`
  — injects the table at `<taxonomy table lines>` and the stage-2
  few-shot block at `<few-shot examples>` (empty string when zero final
  examples — SC-010).
- `buildMatcherFewShotBlock(examples: ParsedFewShotExample[]): string` —
  selection + injection per §2.3; returns "" when the list is empty.

### 2.1 System prompt — single source file (owner ruling 2026-11-16)

The prompt TEXT lives in exactly one place:
`web/data/matcher-prompt.json` — `{ "version": "...", "lines": [...] }`
— imported directly by `web/src/lib/byok/prompts.ts` (the R17 pattern:
no conversion, no sync, no generated file, no drift).

Two slot markers inside the lines are replaced at build-of-prompt time
by `buildMatcherSystemPrompt(taxonomyLines, fewShotBlock)`:
- `<few-shot examples>` → the stage-2 few-shot block (§2.3) — an empty
  string when zero `status: final` examples exist (SC-010);
- `<taxonomy table lines>` → the R15 table, one line per skill:
  `<label_en> | <alt labels comma-joined> | <group_code>`.

**Current version: matcher-rules-2.1.0.** The three-way equality — this
pointer's version == the json's `version` field == `MATCHER_RULES_V2` —
is enforced by `web/tests/engine/matcher2-v2/prompt-file.test.ts`.

Changing the prompt = edit the json lines + bump the json `version` +
update THIS pointer's version + a rules-version bump (owner approval
first — frozen artifact). The human-readable method description lives in
spec.md ("Version 2 — Model-Driven Analysis"); this contract documents
the machine contract.

### 2.2 User prompt

```text
Analyze the following job posting.

<posting>
{cleaned posting text}
</posting>
```

On the retry pass (§4), the same user prompt is extended with:
`Your previous answer was rejected. Fix exactly these problems: <failed
check list> and return the corrected JSON document only.`

### 2.3 Few-shot block (stage 2 only — research R17/R18)

- Source of truth: `specs/002-jd-matcher/few-shot/EX-Jxxx.json`, one file
  per example (JSON — no comments, so `why`/`rule`/`do_not_copy` are
  single strings). The code imports each file directly (bundler embeds
  them — no runtime path) via a small index module
  (`web/src/engine/matcher2/v2/fewshotIndex.ts`); adding a NEW example
  = one file + one import line; flipping an example to
  `status: final` = a data edit only. The runtime filter
  `status === "final" && split === "fewshot"` guarantees drafts and eval
  examples are never put into a prompt; zero finals ⇒ empty array ⇒ no
  few-shot block (SC-010).
- Selection (deterministic, research R18): score each final example
  against the current posting — heading overlap + bullets-vs-paragraphs
  match + language match + obligation-words match + length-bucket
  closeness (±150 words); skip candidates whose heading set is identical
  to an already-picked one; take the top 2.
- Injection: when ≥1 example is selected, the block starts with the
  fixed wording `These examples show how ad formats differ. Do not copy
  their labels and do not treat them as rules. Analyze each ad on its
  own structure.` then, per example, its sentences with labels together
  with `why`, `rule`, `do_not_copy`. Draft and eval examples are NEVER
  loaded.

## 3. Output schema (the only accepted shape)

See data-model.md (`MatcherAnalysisV2`, `SkillItem`, `SummaryV2`,
`RedFlag`). Notes fixed by this contract:

- `rules_version` is stamped by code (`"matcher-rules-2.1.0"`), never by
  the model.
- `summary.role_nature` is exactly one of `executive | analytical |
  managerial` (single value — owner-approved 2026-11-09).
- Bucket ordering inside a bucket (display, R8): hard → soft; explicit
  before implied; otherwise posting order.
- Empty buckets are legal; an all-empty analysis is a failure (§5), not a
  result.

## 4. Deterministic validator (web engine, `web/src/engine/matcher2/v2/`)

Runs on the parsed model output on BOTH paths (gateway and BYOK) before
anything is displayed. Invariants V1–V8 as listed in data-model.md. The
validator returns the validated analysis, the list of failed checks
(each naming the offending item, e.g. `must[2].name`), or — when the
shape is valid but all three buckets are empty — the distinct
`zero_skills` outcome (§5: the extraction-failed message, no retry).

- Parse failure (no JSON) and schema-shape failure count as failed checks.
- On any failure: ONE retry call with the failed-check list (§2.2). A
  second failure → refusal `ERR_MATCHER_ANALYSIS_FAILURE`.
- The validator never re-derives prioritization (R5) and never edits the
  model's output — it accepts or rejects whole.
- The v3 normalization bound (V9, data-model.md) IS code-checkable: the
  closed generalization list is a versioned constant in the validator;
  adding a word requires owner approval and a rules-version bump.
- The refusal and all retries are logged (`matcher_v2_validation_retry`,
  `matcher_v2_refused`) and the dev-only `[llm]` console line shows the
  failed checks.

## 5. Failure mapping (§15/§16 UX — same structure as the 001 step pages)

| Situation | Error id | Failure class | UI |
|---|---|---|---|
| Provider 429/500/timeout mid-chain | gateway error ids | TRANSIENT | banner + Retry |
| Gateway unreachable from browser | gateway error ids | BROWSER_UNREACHABLE | banner + VPN wording + Retry |
| BYOK key/model errors | gateway error ids | OWN_KEY | banner + key guidance |
| All chains failed | gateway error ids | NO_WAY_FORWARD | explanation + return-to-origin + one-tap "Retry with your own key?" |
| Contract refused after retry | `ERR_MATCHER_ANALYSIS_FAILURE` | NO_WAY_FORWARD | same as NO_WAY_FORWARD; never rendered as a result |
| Valid contract, all buckets empty | `ERR_MATCHER_ZERO_SKILLS` | — (not a model failure) | fixed extraction-failed message; never a verdict |
| Input-stage rejection (language / length / not-a-posting) | existing v1 messages | — | unchanged v1 messages at the review gate |

The ModelBanner (source + color + in-place switching) and the 4-state
status stay as implemented (004 §15/§16); this step never blocks
navigation.

## 6. UI contract — result screen (English B1)

- Summary block: labels `Job title`, `Seniority`, `Work type`, `Domain`,
  `Role nature`, `Problem this role solves`.
- Three buckets in fixed order: `Must have`, `Preferred`, `Bonus`; each
  bucket header shows its real count; all rows shown (no truncation).
- Row: name; type chip (`Hard (category)` / `Soft`); for soft rows:
  `Explicit · High confidence`-style text and, when `in_taxonomy: false`,
  a short "not in the 56-skill list" tag; evidence sentences shown as
  quotes under the row.
- Red flags: list with a short kind label (`Conflict`, `Unrealistic`,
  `Several roles in one posting`, `Vague duties`, `Discriminatory
  phrasing`) and the quoted evidence.
- `Back` returns to the review gate (paste-first navigation rules, Phase
  18 pattern). Cancel semantics unchanged (back to paste; cancel at paste
  exits).

## 7. Events (P19)

`matcher_v2_requested`, `matcher_v2_result` (bucket counts + red-flag
count), `matcher_v2_validation_retry` (failed check count),
`matcher_v2_refused`, `matcher_v2_cancelled` — appended to the existing
client event log; gateway request-log lines are automatic.

## 8. Versioning

`matcher-rules-2.1.0` = system prompt method + output schema + validator
invariants + few-shot selection rules, taken together. Any change to any
of them bumps the version (patch for wording-only prompt edits, minor
otherwise). 2.0.0 (2026-11-09) is superseded by 2.1.0 (2026-11-16): trait
retired, `in_taxonomy` added, alt labels returned, weakening/repetition
rules corrected, few-shot bank added. The constant lives with the v2
engine module and is stamped into every result. Terminal v1 stays
`matcher-rules-1.0.0` — no shared constant.
