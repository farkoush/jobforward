# Phase 1 Data Model: Experience Improvement Flow (Level 1 Prototype)

Resolves entities from `spec.md` (clarified 2026-10-25) into concrete Python
dataclasses (storage layout is a single local JSON document; see contracts for
the evaluator output, matcher output, and CLI session contracts). Rubric
version in force: **"rubric-2.0.0"** — three dimensions: context,
role_action_clarity, result.

## Entities

### ExperienceEntry

| Field | Type | Rules |
|---|---|---|
| id | int | unique within the document; never reused after deletion; allocator reads the persisted maximum (no restart duplicates) |
| type | enum | one of: `job`, `project`, `course`, `side_work` |
| title | str | non-empty, trimmed for no whitespace (text itself verbatim after trim) |
| bullets | list[Bullet] | length 1–6 enforced by FR-001/FR-002; no organization/start/end fields exist (decision 2026-10-25) |
| draft | bool | true iff `len(bullets) == 0` OR the user chose "save as draft" (FR-003); excluded from the overall average either way |
| draft_reason | enum \| null | `no_bullets` / `user_saved` / null — records why an entry is a draft |
| source | enum | `manual` (PDF upload deferred; field exists for schema stability) |
| entry_score | float \| null | only when the entry has bullets and all are scored |
| rubric_version | str \| null | stored next to the entry score (constitution P4) |
| match_action | MatchAction \| null | latest matcher output for this entry (recomputable; never affects scores) |
| deleted | bool | tombstone after user-confirmed deletion (FR-020) |

Invariant: draft entries are excluded from the overall average (FR-003);
deleted entries are excluded from everything (FR-020).

### Bullet

| Field | Type | Rules |
|---|---|---|
| id | int | unique within the entry |
| text | str | EXACTLY as written by the user; English-only input enforced at the boundary; never reshaped (P10) |
| status | enum | `new` → `analyzed` → `edited` → `analyzed` (see Status State Machine) |
| ratings | Ratings \| null | final adopted set: three per-dimension scores, written by evaluator adapter |
| rating_pending | Ratings \| null | a failed or not-yet-run analysis leaves ratings null; bullet keeps previous status label (FR-014) |
| rubric_version | str | recorded after every successful scoring (P4) |
| history | list[BulletHistory] | previous bullets preserved on every approved replacement |
| questions | list[QuestionRecord] | full gate/answer/skip trail (FR-009) |
| proposals | list[ProposalRecord] | final text + decision + timestamp |
| merge_warned | bool | any time ≥ 2 bullets overlap; cleared only when gone/fixed |

### Ratings (rubric-2.0.0)

- `context`: int ∈ {0, 1, 2} — 0 missing, 1 generic ("in an app"), 2 specific
  situation (specific project, team, or problem)
- `role_action_clarity`: int ∈ {0, 1, 2}
- `result`: int ∈ {0, 1, 2} — 2 specific qualitative/numeric result; 1 vague
  result, output-only, or personal learning without observable change; 0 none
- produced by an evaluator adapter, then ALL arithmetic downstream is
  deterministic (`scoring/metrics.py`) — never by the adapter/LLM itself.

### QuestionRecord

| Field | Type | Rules |
|---|---|---|
| gate_answer | enum | `accepted` / `rejected` (the per-bullet "Do you want to rewrite…?" gate; default accepted when the user confirms) |
| dimension | enum \| null | `context` / `role_action_clarity` / `result` — which deficient dimension this question covers |
| text | str | fixed English B1 question text from messages.py; "If you have real numbers, include them" is part of the Result question |
| round | int | hard limit 1 round per bullet per improvement run |
| answer | str \| null | null unless / until the user submits an answer (English-only) |
| skipped | bool | when the user skips the question |
| answered_at / skipped_at | ISO-8601 \| null | each timestamps the log event |

Invariant: when the gate is rejected, all questions are skipped, or no answer
is given, no rewrite exists for that bullet; the flow continues normally. When
≥ 1 question is answered and others are unanswered, the tool offers
save-as-draft (whole entry) or approve-rewrite-from-answers-so-far (FR-009).

### ProposalRecord

| Field | Type | Rules |
|---|---|---|
| text | str | the assembled rewrite (passed the no-extra-claims validator before display) |
| decision | enum | `approved` / `rejected` / `awaiting` |
| decided_at | ISO-8601 \| null | required when approved/rejected (log, P7) |

### BulletHistory (for every replaced bullet)

- text, ratings, rubric_version, replaced_at (ISO-8601)

### JobRequirement (matcher stage 1 output)

| Field | Type | Rules |
|---|---|---|
| id | int | unique within the posting analysis run |
| text | str | the requirement as extracted from the pasted posting (posting text may be Persian or English; never modified) |
| skill_type | enum | `hard` / `soft` |
| priority | enum | `required` / `preferred` / `bonus`; any red-line requirement MUST be classified `required` |

### MatchAction (matcher stage 2 output; persisted on the entry)

| Field | Type | Rules |
|---|---|---|
| entry_id | int | the experience entry this action applies to (entry level, never bullet level) |
| action | enum | `highlight` / `no_change` / `not_relevant` — the ONLY allowed values; `remove` and `shorten` do not exist |
| reason | str | one line, must cite the referenced requirement's skill_type + priority |
| requirement_id | int | the JobRequirement the action is based on |
| rubric_version | str | matcher rules live under the same rubric versioning |
| analyzed_at | ISO-8601 | timestamp of the matcher run |

Invariant: exactly one MatchAction per entry per matcher run; matcher output
has zero effect on any score (P3/P6) and never mutates entry/bullet text.

### MergeSuggestion (not persisted as data; rendered + logged)

- trigger: overlap across ≥ 2 bullets in one entry (each new bullet compared
  with all existing bullets; warning surfaces at entry level)
- effect: none on any score; no merge happens without explicit user
  confirmation (FR-013). Overlap threshold lives in the rubric version, so
  the merge warning carries the rubric version too.

### LogEvent (storage only as JSONL, never kept in resume.json)

| Field | Type |
|---|---|
| ts | ISO-8601 UTC timestamp |
| type | enum: `path_start`, `analysis_completed`, `proposal_accepted`, `proposal_rejected`, `question_rejected`, `question_skipped`, `entry_saved_as_draft`, `bullet_deleted`, `entry_deleted`, `score_before`, `score_after`, `posting_analyzed`, `match_action_assigned`, `evaluator_invalid_output`, `evaluator_retry` |
| context | object: entry_id / bullet_id / rubric_version / numeric before-after scores / posting stats |

## Status State Machine (locked by spec Clarification Q4, session 2026-10-23)

```text
         captured
             │ (successful analysis)
             ▼
   new ─────────────► analyzed
                          │  (approved rewrite OR direct user edit)
                          ▼
                       edited ───► analyzed   (re-analysis completes)
                          ▲
         (no change)      │ (failed analysis: stays, keeps previous scores)
```

- `new`: exists only until the bullet's first successful analysis.
- `edited`: a post-analysis change (approved rewrite or direct user edit)
  awaiting re-analysis.
- `analyzed`: the current stored ratings belong to the current text.
- failed or non-run analysis does NOT change the label (FR-014).

## Storage Layout (data/resume.json, illustrative)

```json
{
  "document_version": 2,
  "rubric_version": "rubric-2.0.0",
  "entries": [
    {
      "id": 1,
      "type": "job",
      "title": "…",
      "bullets": [
        {
          "id": 1,
          "text": "…",
          "status": "analyzed",
          "ratings": {"context": 2, "role_action_clarity": 2, "result": 1},
          "rubric_version": "rubric-2.0.0",
          "history": [],
          "questions": [],
          "proposals": [],
          "merge_warned": false
        }
      ],
      "draft": false,
      "draft_reason": null,
      "source": "manual",
      "match_action": null,
      "deleted": false
    }
  ]
}
```

## Validation Rules (from spec requirements, applied at boundaries)

- VR-1: 1 ≤ bullets ≤ 6 per entry; >6 → explicit rejection message (FR-002).
- VR-2: overall score drawn ONLY from entries with ≥1 scored bullet that are
  not drafts and not deleted (FR-003, FR-005; FR-007).
- VR-3: dimension/entry/overall arithmetic ONLY in metrics.py
  (FR-007/FR-008); rubric_version "rubric-2.0.0" written next to every score.
- VR-4: every mutation (rewrite approval, direct edit, delete, merge,
  draft-save) ends via explicit user action; no silent change (FR-009,
  FR-011, Clarifications Q2/Q3).
- VR-5: deletions leave previous bullet data intact for surviving bullets
  (FR-020); entry dropping to 0 bullets returns to draft.
- VR-6: the no-extra-claims validator runs on the FINAL assistant-assembled
  text before any proposal is shown (FR-010 violation = bug).
- VR-7: timestamps written for every listed event (FR-015), format ISO-8601.
- VR-8: bullet and answer input is English-only at the boundary; posting text
  is exempt (FR-017, FR-021). Bullet text is stored verbatim regardless.
- VR-9: matcher output must satisfy the matcher contract exactly (one action
  per entry, allowed action enum, reason cites skill_type + priority);
  invalid output is rejected, retried once, then reported (FR-021/FR-022).

---

## Addendum: rubric-3.1.0 (2026-11-04) — display & improvement-loop state

No new persisted entities; Phase 11 refines the states below (spec §3, §5.1,
§6.1).

### BulletRating — result floor + version string

- result dimension: a PRESENT but vague result part scores ≥1 (rubric-3.1.0);
  0 is reserved for a MISSING result. Missing result still scores 0.
- `rubric_version`: the semver string stored with every score; new scores
  carry `rubric-3.1.0` (constitution v3.1.0 P4). Older scores keep their
  stored version and are never rewritten.

### PartDisplayState (per part, transient — web display layer)

| State | Meaning | Web rendering |
|---|---|---|
| filled | non-empty extracted or confirmed words | emerald bracket "[label: words]" |
| vague | non-empty words rated < 2 | amber bracket "[label: words – vague]" |
| missing | empty words (ALWAYS, regardless of rating) | red bracket "[label – missing]" |

Validation: vague requires non-empty words — an empty part is never vague
(frameworkRows fix, T073).

### ImprovedBullet record (extends the existing history/proposals records)

- improved text: assembled ONLY from confirmed/typed answers as plain prose
  ("need, so action, and result metric."); feature used only if the action is
  missing; metric appended to the result segment; fallback = verbatim
  original.
- status: `edited` (existing value), with before/after scores where the
  after-score comes from the SAME first-time pipeline (fresh extraction +
  ratings), stored with `rubric-3.1.0`.

### BYOK state (browser, opt-in — drives §3.1 and the disclosure banner)

- providerId / model / useForScoring / key-presence: the banner
  "Model in use on this screen: {provider}: {model}" renders only when
  useForScoring AND key AND model are set AND the screen can call a model;
  the key itself never leaves the browser (masked display only).

## Addendum: Phase 12 coverage record (2026-11-04, diagnostic only)

Spec §2.2. Optional per-bullet field; documents saved before Phase 12 load
unchanged (field absent by default; never backfilled — P5 incremental).

### CoverageEntry

| Field | Type | Rules |
|---|---|---|
| quote | str | verbatim substring of the bullet (whitespace-normalized matching, §2.1); empty ONLY for a missing part |
| part | enum | one of `user_need`, `product_feature`, `action`, `result`, `metric`, `orphaned` |
| status | enum | `filled` / `vague` / `missing` for the five parts (same states as PartDisplayState); `orphaned` for spans |
| reason | str | English B1: why the words satisfy the part (filled), why the rating made it vague, why no words were found (missing), or why the span belongs to no part (orphaned) |

Ordering: the five part entries first (Need → Feature → Action → Result →
Metric), then orphaned spans in text order.

Invariants (validated by tests, not enforced at parse time):

- every `quote` appears verbatim in the bullet; a word is claimed by at most
  one part quotation — the §2.1 feature-inside-action overlap is claimed by
  the action and never orphaned;
- the union of part quotations and orphaned spans covers the whole bullet
  (after whitespace normalization);
- orphaned entries never change scores, questions, or statuses (D11) — the
  record is derived output recomputed on every analysis of that bullet;
- `coverage` may be removed in a later change without a document migration
  (self-contained optional field).

## Addendum: Phase 13 hybrid entry (2026-11-04, web-only)

Spec §4.2. The web entry gains three optional entry fields; everything else
about persisted shapes is unchanged. Old documents and old localStorage
sessions load unchanged (fields absent by default; never backfilled — P5).

### ExperienceEntry (web engine) — new optional fields

| Field | Type | Rules |
|---|---|---|
| company | str \| null | displayed only; no analysis effect this phase (D15) |
| dates | str \| null | ONE free-text field (e.g. "2022–2024"); displayed only |
| product_domain | str \| null | e.g. fintech / healthcare / e-commerce; displayed only |

`AddEntryRequestSchema` accepts them as optional strings; `addEntry` passes
them through (VR-1 1–6 bullets and VR-8 English boundary UNCHANGED — D17).

### Session-only (not persisted to the entry)

- `sourceText` (session): the user's original pasted text, kept verbatim so
  it stays visible at the top of every analysis screen (§4.2). Display-only;
  it is not written to the stored entry and never parsed after the split.

### SplitCandidate (transient UI stage — not persisted)

| Field | Type | Rules |
|---|---|---|
| text | str | verbatim line(s) from the paste; the leading `-`/`•` marker is stripped as formatting; wrap continuations re-join with a single space — text is never rewritten (P1) |
| flagged | bool | flag rule (D16): no action verb AND no parser signal AND responsibility-style opening |
| splitSuggested | bool | the line contains " and also " (split point at the connector; the user decides) |

Confirm produces the final `bullets: string[]` (1–6, VR-1) which enters the
EXISTING per-bullet pipeline unchanged; analysis output for a given bullet
text is identical whether it came from paste-and-split or one-by-one entry.

## Addendum: Phase 18 entry UX (2026-11-06, web-only)

Spec §13. The web entry gains structured date fields; everything else
persisted is unchanged. Old documents and old localStorage sessions load
unchanged (fields absent by default; never backfilled — P5).

### ExperienceEntry (web engine) — new optional fields

| Field | Type | Rules |
|---|---|---|
| start_date | str \| null | `YYYY-MM`; filled only from a segment the USER drags into the Dates section on an exact pattern match, else empty (never parsed from unparsed paste text — P1) |
| end_date | str \| null | `YYYY-MM`; null when `ongoing` |
| ongoing | bool | "I still work here" — true removes the end date (display "… – present") |

- The legacy free-text `dates` field is RETAINED: (a) the load-compat
  fallback for pre-Phase-18 documents; (b) the holder for pasted date
  text that does not parse to `YYYY-MM` (nothing the user pasted is
  dropped — P1).
- Display rule: when the structured fields are present, dates render as
  "start – end" or "start – present"; otherwise the legacy string renders
  verbatim.
- `AddEntryRequestSchema` accepts them as optional (`start_date`/`end_date`
  regex `^\d{4}-(0[1-9]|1[0-2])$`, `ongoing` boolean) plus an optional
  entry id so a Back-and-reconfirm UPDATES the stored entry instead of
  duplicating it (§13.4, D34). VR-8 (English boundary) UNCHANGED; the
  1–6 bullet cap is REMOVED on the web (min 1; 0 = draft) per the owner
  clarify 2026-11-06 — the terminal's VR-1 stays frozen.

### Transient (not persisted)

- `parsePastedExperience` output (fields + achievements text) is
  session-only review state; only what the user confirms is stored.
- `SplitCandidate.flagged`/`splitSuggested` keep existing in the engine
  type but no longer drive any UI control (D30).
