# Research: JD Matcher — model-driven analysis v2 (web only)

**Feature**: 002-jd-matcher | **Date**: 2026-11-09 | **Status**: COMPLETE
(external unknowns: none; all decisions are owner rulings from this session
plus repository-verified facts. This file REPLACES the v1 research of
2026-10-25 — the v1 decisions it recorded are superseded by the plan's
Supersession list where they conflict.)

**Input**: the owner's 7-step analysis pipeline (Persian, provided at plan
time): atomize → one-pass labeling → extraction (hard pass, then soft pass)
→ merge → prioritization → summary & red_flags → output + final validation.
Owner decisions taken 2026-11-09 (AskUserQuestion session):

1. **Engine**: ONE LLM call — the 7 steps are the model's internal method;
   the final JSON is the only output; deterministic code validates the
   output contract (retry once, then refuse) — the §14 single-judge pattern.
2. **SOFT_TAXONOMY**: comes from `docs/soft-skills-taxonomy.json` (the
   existing 56-skill ESCO file).
3. **Surface**: WEB ONLY — the terminal keeps v1 untouched; no terminal work
   in this feature.
4. **Model unavailable**: exactly the spec-004 §15/§16 failure UX as already
   implemented in the 001 step pages; v1 output is NOT a fallback.

---

## R1 — Execution engine: one model call, contract-validated

**Decision**: one `matcher_analysis` call per analysis. The 7 steps are
encoded as the method section of the system prompt; the model returns only
the final JSON (step 7's schema). A deterministic validator in the web
engine checks the output contract; on any violation the failed checks are
appended and the model gets exactly one retry; a second failure is a
refusal (`ERR_MATCHER_ANALYSIS_FAILURE`).

**Rationale**: the judgment-bearing steps (tone-implied soft skills,
problem-solved summary, red-flag detection, synonym merging) cannot be done
deterministically; multi-call staging multiplies cost and latency and
collides with the gateway's provider-call cap (4); the 001 §14 precedent
(model = only judge, code = contract checker, retry-once → refusal) is
already proven, tested, and familiar to the owner.

**Alternatives considered**:
- *Staged multi-call pipeline* (one call per step/group): more traceable,
  but 4–7× calls per analysis, hits the provider-call cap, slower UX, and
  intermediate schemas would need their own validators — rejected.
- *Hybrid deterministic+LLM* (steps 1/4/5/7 in code, 2/3/6 to the model):
  requires per-stage intermediate schemas and merging logic; the owner's
  pipeline defines steps as strictly sequential consumers of each other,
  which one call satisfies natively — rejected as complexity without a
  product gain.

## R2 — SOFT_TAXONOMY: source file and the soft/trait typing

> **ARCHIVED 2026-11-16 (Task 2 amendment):** the soft/trait typing and
> its per-skill exceptions were retired by owner ruling (no "trait" type
> exists in the method). This decision survives only as history; the
> source-file choice (the 56-skill ESCO file) still stands. See R13/R14.

**Decision**: `docs/soft-skills-taxonomy.json` is the SOFT_TAXONOMY source
(owner ruling 2). The file has no soft/trait field, so the typing is a
**static, versioned mapping in code** (group-level default + per-skill
exceptions), drafted here and approved by the owner at plan review:

| Default by group | Type | Groups |
|---|---|---|
| Default | `soft` | T2.1, T2.2, T2.3, T2.4, T3.1, T3.2, T3.4, T4.1, T4.2, T4.3, T4.4 |
| Default | `trait` | T3.3 (attitudes under pressure), T4.5 (character/compliance dispositions) |
| Per-skill exception | `trait` | `show commitment` (T3.2), `show empathy` (T4.2) |

Rule of thumb used: dispositions of character or affect ("show/demonstrate
X", coping attitudes) are `trait`; learnable capabilities are `soft`.

**Rationale**: reuses the owner-owned, verified 56-skill file (continuity
with FR-014's "only these skills" rule — no new skill list is invented); a
group-level map plus two exceptions is reviewable in one glance; the map
lives in code (not in the owner's data file — the docs file is never
modified), covered by a test that every one of the 56 `label_en` values is
typed exactly once.

**Alternatives considered**:
- *Owner provides a new list*: waiting on data blocks the feature; the
  owner pointed at the existing file — rejected.
- *New smaller curated list*: would retire the 56-skill file for this
  feature — an unapproved removal — rejected.
- *Typing inside the data file*: modifies owner-owned data — rejected
  (env-file-hygiene spirit).

## R3 — Prompt surface and taxonomy injection

> **SUPERSEDED 2026-11-16 (Task 2 amendment):** alt_labels_en RETURN to
> the prompt table (owner ruling: soft names match label_en AND
> alt_labels_en) — see R15. The single-surface rule itself still stands.

**Decision**: the matcher prompt lives in
`web/src/lib/byok/prompts.ts` (the established single prompt surface for
gateway + BYOK): `BYOK_MATCHER_SYSTEM_PROMPT` (the 7-step method, English)
plus `buildMatcherUserPrompt(postingText)`. The taxonomy is injected into
the system prompt as a condensed table — one line per skill:
`label_en | type | group_code` — built from the file + the R2 mapping.
`alt_labels_en` and descriptions are NOT injected.

**Rationale**: the model's job is semantic mapping of posting concepts onto
canonical taxonomy names, not string matching, so alt-label lists cost
tokens without changing behavior; 56 short lines keep the system prompt
compact and stable across calls; one prompt surface keeps gateway and BYOK
byte-identical (001 §15 rule).

**Alternatives considered**:
- *Full record dump* (id, description, alt labels): ~4× tokens, no
  behavioral gain for a semantic matcher — rejected.
- *No taxonomy in prompt* ("just name soft skills"): violates the
  SOFT_TAXONOMY contract (names must come from the fixed list) — rejected.

## R4 — Gateway task registration: `matcher_analysis` = GEN

**Decision**: register `matcher_analysis: "GEN"` in
`web/src/lib/llm/tasks.ts` with a documented reason, called through the
existing `POST /api/llm/gen` NDJSON route (the same route serves BYOK via
`x-byok-key`/`x-byok-model` headers — no new route).

**Rationale**: the tasks.ts policy says GEN needs "an explicit, documented
reason (heavy, high-quality generation of user-visible text)" — this
qualifies: a single structured document (summary + up to dozens of skill
rows + red flags) produced by multi-step reasoning over a 100–1,500-word
posting; output quality gates the whole step. The GEN chain is the
high-quality chain. The call is one per analysis, so the provider-call cap
is respected.

**Alternatives considered**:
- *FAST* (`runFastGateway`): classification-oriented, weaker chain; a
  long structured document from the weaker chain risks contract failures
  and retries — rejected.
- *New route*: P12 centralization — everything goes through the gateway
  routes; adding a route duplicates auth/session/mock plumbing — rejected.

## R5 — Validation layer: what code checks vs what the model judges

**Decision**: the validator (web engine, `web/src/engine/matcher2/v2/`)
enforces ONLY structural invariants; prioritization quality (weakening
words, conflict→red_flag, repetition upgrade, main-duty tie) is model
judgment verified by walkthrough, not re-derived in code. Invariants
(detailed in contracts/matcher-pipeline-v2.md §4): verbatim evidence,
taxonomy-name membership, bucket/type field rules, no cross-bucket or
cross-type name duplication, no low-confidence soft/trait in `must`,
summary completeness, red-flag shape. Retry once with the failed checks;
then refuse. Verbatim check = whitespace-normalized containment in the
cleaned posting (same normalization rule as §14 quotes).

**Rationale**: re-deriving prioritization in code would re-implement the
whole pipeline deterministically — exactly what R1 rejected; §14
established the "model judges, code validates structure" split and its
retry-once-then-refusal mechanics, including the refusal never being
shown as a "no match" verdict (FR-018 carries over).

**Alternatives considered**: full deterministic re-check of bucket
placement — rejected (R1); no validation at all (trust the model) —
violates P1 and P19 diagnosability — rejected.

## R6 — No-model path: §15/§16 failure UX, no v1 fallback

**Decision**: when the model is unreachable or the contract persistently
fails, the JD analysis screen shows exactly the spec-004 §15/§16 UX
already implemented on the 001 step pages: failure-class banner
(TRANSIENT / NO-WAY-FORWARD / BROWSER-UNREACHABLE / OWN-KEY), guidance box
at the failing stage, one-tap "Retry with your own key?" (auto-enable
use-my-key on the failure path only), 4-state banner that never blocks
navigation. The v1 deterministic output is never shown on the web active
path (owner ruling 4).

**Rationale**: one failure-class taxonomy = one UI source (§15 decision);
no second output source means no second maintenance path and no
"which analysis am I looking at" ambiguity; P18 is satisfied because the
user's data (entries, scores, drafts) never depended on this call.

**Alternatives considered**: v1 as labeled fallback — two output sources
(the owner declined); v1 kept dormant — see R7.

## R7 — Web-only scope; terminal untouched; v1 web code dormant, not deleted

**Decision**: v2 touches only the web surface. The terminal (`matcher2/`
v1, CLI flow, messages) is untouched — a deliberate, owner-approved P4
exception recorded in the plan gate table; no new Python code, no parity
extension for v2, and the existing parity sections for v1 stay green
because the v1 web engine functions (`extractHardSkills`, `matchSoftSkills`,
`buildReport`) remain in place. The active web path stops calling them and
stops calling `POST /api/matcher` (route kept, dormant — not deleted);
deleting v1 web code is a separate future owner decision, listed as an
open item in the plan.

**Rationale**: owner ruling 3 ("web only"); the no-feature-removal rule —
dormant-keep is reversible and the deletion question stays with the owner;
parity gates stay meaningful (v1 remains locked py↔ts).

**Alternatives considered**: delete v1 web code now — an unrequested
removal — rejected for this feature; extend v2 to the terminal — outside
the owner's ruling — rejected.

## R8 — Display: no 5-row truncation on the web v2 result screen

**Decision**: the v2 result screen shows ALL rows grouped
Must → Preferred → Bonus (within a bucket: hard first, then soft, then
trait; explicit before implied), plus the summary block and the red-flags
list. The v1 5-row display limit and "showing 5 of N" message are
superseded for this step on web (terminal v1 keeps its rule; web never had
the cap for other steps — "no 1–6 cap on web").

**Rationale**: the old limit was a terminal-width constraint carried into
web v1; the owner's later web direction (Phase 18, no caps on web) removed
display caps elsewhere; hidden rows weaken the evidence-first product.

**Alternatives considered**: keep 5-row cap + counts line — inconsistent
with the current web direction and hides evidence — rejected.

## R9 — Events and diagnosability (P19)

**Decision**: v2 adds matcher events to the existing client event log:
`matcher_v2_requested`, `matcher_v2_result` (bucket counts),
`matcher_v2_validation_retry`, `matcher_v2_refused`, `matcher_v2_cancelled`,
plus the gateway's own request-log lines (automatic, body ≤ 300 chars) and
dev-only `[llm]` console lines. No new log destinations.

**Rationale**: P19 diagnosability and the established 001/004 logging
practice; the retry/refusal events make contract-failure rates measurable,
which is the new risk this feature introduces.

**Alternatives considered**: new dedicated log file — rejected (existing
stores suffice; 004's llm-requests log already captures raw calls).

## R10 — Rules versioning

**Decision**: `matcher-rules-2.0.0` — the version of (system prompt method
+ output schema + validator invariants) taken together. It is returned in
the API response and stored with the result. Any change to the prompt's
method, the schema, or an invariant bumps it. The v1 constant
(`matcher-rules-1.0.0`) is untouched.

**Rationale**: same pattern as `rubric-3.1.0` for scoring: outputs are only
comparable within one rules version; the terminal keeps 1.0.0 so the two
surfaces' versions diverge honestly instead of pretending parity.

**Alternatives considered**: reuse 1.0.0 — would claim equivalence with a
different pipeline — rejected.

## R11 — Project-wide rule: one fixed model algorithm, governed by spec-004

**Decision** (owner ruling, 2026-11-09, after the plan draft): model-combo
(chain) review and BYOK handling are governed JOINTLY across the whole
project by spec-004. Every future spec that uses a model for analysis or
any work runs the ONE fixed algorithm: register the task in the gateway
task registry → the registry maps it to a category chain → call through
the existing gateway routes (BYOK via the same route and headers) →
deterministic output-contract validation (retry once → refusal, the §14
pattern) → §15/§16 failure UX. No feature builds its own model plumbing,
chain decision, or failure UX.

**Impact on this plan**: confirms R4 and R6 as designed —
`matcher_analysis` registers in the task registry, rides the GEN chain,
and consumes 004's combo/BYOK/failure machinery unchanged. 002 makes NO
chain or combo decision: if the walkthrough shows the GEN chain ill-suited
for `matcher_analysis`, the fix is a spec-004 chain/config change, never a
002-local mechanism. The walkthrough therefore includes verifying
`matcher_analysis` over the active GEN chain (004 §13 validation already
covers servability).

**Alternatives considered**: per-feature model plumbing — rejected by the
owner (this ruling); a new dedicated category/chain for the matcher —
rejected (combo decisions live in spec-004 only).

---

# Task 2 amendment decisions (owner zcode prompt §4, 2026-11-16)

## R12 — Method-alignment source and the diff resolution

**Decision**: the owner's zcode prompt §4 (decisions "already made",
two marked owner-approved) is the authoritative method source for this
amendment; the spec is the governing document and now carries all ten
deltas (Clarifications Session 2026-11-16). The reference labeling for
the sample ad is `specs/002-jd-matcher/few-shot/EX-J001.yaml` (owner's
hand labels, 21 sentences) — its S12/S18 rows demonstrate the corrected
weakening direction and zone precedence.

**Rationale**: the prompt postdates the approved contract and contains
explicit owner approvals; EX-J001 is the owner's own ground truth.

**Alternatives considered**: treating §4 as a misremembering of the
contract — rejected (EX-J001 + SC-008 acceptance only make sense under
§4); keeping trait alongside the new rules — rejected (no trait in §4,
EX-J001, or the acceptance criteria).

## R13 — Trait retirement

**Decision**: `type` is `"hard" | "soft"` everywhere: the system prompt
(§2.1), the zod schema, validator invariants (V3/V4/V6), the R2 typing
code, and the UI (no Trait chip; dispositions are plain soft rows).
`confidence` becomes soft-only.

**Rationale**: owner ruling 1 of Task 2; EX-J001 has no trait concept.

**Alternatives considered**: keep trait as a UI-only grouping — rejected
(two type systems would drift; the method is single-source).

## R14 — in_taxonomy: explicit out-of-taxonomy soft skills kept

**Decision**: the output schema gains `in_taxonomy` (soft only). For a
soft item: if its name matches the taxonomy (label_en OR any
alt_labels_en, case-insensitive) the item MUST have `in_taxonomy: true`
and the name canonicalizes to `label_en`; if it does NOT match,
`in_taxonomy: false` is legal ONLY with `source: "explicit"` and the
name is the ad's own wording; an implied out-of-taxonomy soft skill is
dropped by the model. Validator V5 enforces exactly this.

**Rationale**: owner ruling 2; makes the acceptance criteria achievable
("Communication", "Stakeholder management" appear as soft with
in_taxonomy:false in must — these have no 56-skill equivalent); it also
seeds Task 4's taxonomy-candidates store (explicit in_taxonomy:false
items become candidates).

**Alternatives considered**: reject out-of-taxonomy names outright
(v1/V5 behavior) — rejected: it is exactly what dropped "communication"
on the sample ad; allow implied out-of-taxonomy — rejected by owner
(fabrication risk, P1).

**Open judgment point (walkthrough)**: whether a near-named skill
("Stakeholder management" from stakeholder sentences) counts as explicit
is model judgment; SC-008 is the owner's bar — the owner decides on
walkthrough, per the spec assumption.

## R15 — alt_labels_en return to the prompt table

**Decision**: the prompt taxonomy table becomes
`label_en | alt_labels | group_code` (alt labels comma-joined, lowercased
as in the file). The model matches a name OR any alt label but always
records the canonical `label_en`. Token cost grows (~3× for the table
block) and is accepted.

**Rationale**: owner ruling 3; alt labels materially improve explicit
matching recall ("attend to detail" ← "attention to detail").

**Alternatives considered**: keep alt labels out and rely on semantics —
superseded by the ruling.

## R16 — Weakening direction + repetition tightening (prompt rules)

**Decision**: step-5 rules in the prompt change to: a weakening word
caps that witness at preferred and may only LOWER a level, never raise
it (bonus_zone + weak stays bonus); repetition requires ≥2 independent
sections (title counts, about never), no conflict, AND every witness at
least preferred — a bonus witness blocks promotion, promotion is exactly
one level. "Strong <skill>" is signal none. These are prompt-encoded
model rules, verified by walkthrough against EX-J001's labels (S12 →
preferred, S18 → bonus) and SC-008; no code re-derivation (R5 stands).

**Rationale**: owner rulings 6/7/8 with the approved example; the current
prompt text ("at most preferred") would wrongly RAISE a weak bonus-zone
witness to preferred.

**Alternatives considered**: deterministic re-check of these rules in
the validator — rejected (R5: prioritization is model judgment).

## R17 — Few-shot bank mechanics (JSON source of truth, direct import)

**Decision** (owner ruling 2026-11-16, superseding the yaml+sync draft):
the few-shot examples are **JSON files** — `EX-Jxxx.json`, one file per
example, same fields as the old EX-J001.yaml — living in
`specs/002-jd-matcher/few-shot/`. The program imports them DIRECTLY
(bundler embeds them — the FIX-1 philosophy: no runtime path, nothing to
lose). **No sync script, no yaml loader, no drift test.** Known costs,
owner-accepted: JSON has no comments and no multiline blocks, so `why`,
`rule` and `do_not_copy` become single (long) strings; and since a
bundler cannot glob a folder, each NEW example file needs one import
line in a small index module (`fewshotIndex.ts`) — changing an existing
example's `status` to `final` is a data edit only, never code. All
example files are bundled (drafts included) but the runtime filter
`status === "final" && split === "fewshot"` guarantees drafts and eval
examples are NEVER put into a prompt; zero finals ⇒ empty array ⇒ no
few-shot block (SC-010).

**Rationale**: one artifact (the json), one import path, zero conversion
step, zero drift risk; bundler-native like the taxonomy import.

**Alternatives considered**: yaml + sync script + generated mirror —
superseded by this ruling; js-yaml dependency — rejected (P8, and now
unneeded); runtime fs read — rejected (Task 1 ENOENT lesson).

## R18 — Few-shot selection algorithm (deterministic, ≤2, diverse)

**Decision**: selection is a pure deterministic function over
`format_features` of final examples vs the current posting: score =
heading overlap (fraction of the ad's recognized headings the example
also has) + bullets-vs-paragraphs match + language match + explicit
obligation-words match + length-bucket closeness (±150 words). Sort by
score; enforce diversity by skipping a candidate whose heading set is
identical to an already-picked one; take the top 2 (SC-010: fewer/zero
when the bank is small). The fixed wording ("These examples show how ad
formats differ. …") is always prepended when ≥1 example is injected,
together with why/rule/do_not_copy per example.

**Rationale**: owner ruling (similarity by format_features, diverse set,
start with at most 2); deterministic = testable + free (no model call
for selection).

**Alternatives considered**: model-based similarity — rejected (spends a
call on a mechanical match); inject all finals — rejected by the owner
(at most 2).

## R19 — Sample-ad acceptance testing without an ad fixture file

**Decision**: the owner removed the standalone `sample-job-ad.txt`
fixture; the acceptance test (SC-008, ~20+ skills) reconstructs the
sample ad text by joining EX-J001's `sentences[].text` in id order under
their headings — the yaml is the single source. Validator fixtures use
validDocA/B patterns extended with `in_taxonomy` fields.

**Rationale**: owner ruling (examples live in few-shot yaml); avoids a
duplicate copy of the ad text in the repo.

**Alternatives considered**: keep an ad fixture file — rejected by the
owner.

## R20 — Prompt text single source: one JSON file, contract = pointer + version pin

**Decision** (owner ruling 2026-11-16, resolving the "why two copies?"
question): the prompt text lives in EXACTLY one file —
`web/data/matcher-prompt.json` (`{ "version": "matcher-rules-2.1.0",
"lines": [...] }`) — imported directly by prompts.ts (`lines.join("\n")`;
the R17 pattern applied to the last remaining dual text). Contract §2.1
no longer carries the text: it POINTS at the file, documents the two slot
markers, and records the version. A tiny test pins the THREE-WAY version
equality (contract pointer == json.version == MATCHER_RULES_V2) plus
content sanity (slots present, data-only rule, no trait). Changing the
prompt = edit the json lines + bump its version + update the contract
pointer + a rules bump — the test is the drift guard.

**Rationale**: the v2 contract carried the full text AND the code carried
the same text with only a "character-for-character" instruction binding
them — unenforceable, and a near-miss during implement (an Edit composed
from the contract's text against the not-yet-updated code file) exposed
the risk. Version comparison is mechanical and can never break silently.

**Alternatives considered**: drift-guard test comparing the two texts
(works, but keeps the duplication); generation from the contract
markdown (rejected — a fragile §-anchor parser, and runtime extraction
would re-introduce the Vercel ENOENT class; also re-creates the
sync/generated-file pattern the owner removed in R17).

**Working rule born with this decision**: always Read the target region
immediately before composing an Edit; never build old_string from memory
of another artifact (owner-mandated, recorded in memory).
