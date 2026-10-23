# Phase 1 Data Model: Experience Improvement Flow (Level 1 Prototype)

Resolves entities from `spec.md` (Key Entities) into concrete Python dataclasses
(storage layout is a single local JSON document; see contracts for the
evaluator output and CLI session contracts).

## Entities

### ExperienceEntry

| Field | Type | Rules |
|---|---|---|
| id | int/large int | unique within the document; never reused after deletion |
| type | enum | one of: `job`, `project`, `course`, `side_work` |
| title | str | non-empty, trimmed for no whitespace (text itself verbatim after trim) |
| organization | str \| null | optional; empty stays absent (never guessed; blanks show) |
| start | str \| null | optional; verbatim "as written" (no parsing) |
| end | str \| null | optional; verbatim "as written" |
| bullets | list[Bullet] | length 1–6 enforced by FR-001/FR-002 |
| draft | bool | true iff `len(bullets) == 0` (after bullet deletion reverts, FR-020) |
| overall_score | float \| null | only when the entry has bullets and all are scored |
| rubric_version | str \| null | stored next to the entry score (constitution P4) |
| deleted | bool | tombstone after user-confirmed deletion (FR-020) |

Invariant: draft entries (0 bullets) are excluded from the overall average
(FR-003); deleted entries are excluded from everything (FR-020).

### Bullet

| Field | Type | Rules |
|---|---|---|
| id | int | unique within the entry |
| text | str | EXACTLY as written by the user; never reshaped (P10) |
| status | enum | `new` → `analyzed` → `edited` → `analyzed` (see Status State Machine) |
| ratings | list[Ratings] \| null | final adopted set: four per-dimension scores per bullet, written by evaluator adapter |
| rating_pending | Ratings \| null | a failed or not-yet-run analysis leaves the field null; bullet keeps previous status label (FR-014) |
| rubric_version | str | recorded after every successful scoring (P4) |
| history | list[BulletHistory] | previous bullets preserved on every approved replacement |
| questions | list[QuestionRecord] | full Q/A/reject trail (FR-009, FR-012) |
| proposals | list[ProposalRecord] | final text + decision + timestamp |
| merge_warned | bool | any time ≥ 2 bullets overlap; cleared only when gone/fixed |

### Ratings (per analysis run)

- `role_action_clarity`: int ∈ {0, 1, 2}
- `outcome`: int ∈ {0, 1, 2}
- `skill_evidence`: int ∈ {0, 1, 2}
- `structure_scannability`: int ∈ {0, 1, 2}
- produced by an evaluator adapter, then ALL arithmetic downstream is
  deterministic (`scoring/metrics.py`) — never by the adapter/LLM itself.

### QuestionRecord

| Field | Type | Rules |
|---|---|---|
| text | str | Persian; 1–2 per bullet with room for improvement (FR-009) |
| round | int | hard limit 1 round per bullet per improvement run (Clarification Q1) |
| answer | str \| null | null unless / until the user submits an answer |
| rejected | bool | when the user rejects the question |
| answered_at / rejected_at | ISO-8601 \| null | each timestamps the log event |

Invariant: when the question is rejected or left unanswered, no rewrite exists
for that bullet; the flow continues normally.

### ProposalRecord

| Field | Type | Rules |
|---|---|---|
| text | str | the assembled rewrite |
| decision | enum | `approved` / `rejected` / `awaiting` |
| decided_at | ISO-8601 \| null | required when approved/rejected (log, P7) |

### MergeSuggestion (not persisted as data; rendered + logged)

- trigger: overlap across ≥ 2 bullets in one entry
- effect: none on any score; no merge happens without explicit user confirmation
  (FR-013). Overlap threshold lives in the rubric version (planning phase),
  so the merge warning itself carries the rubric version too.
- merge, when executed at all, always ends with the user's explicit
  confirmation step (FR-013).

### BulletHistory (for every replaced bullet)

- text, ratings, rubric_version, replaced_at (ISO-8601)

### LogEvent (storage only as JSONL, never kept in resume.json)

| Field | Type |
|---|---|
| ts | ISO-8601 UTC timestamp |
| type | enum: `path_start`, `analysis_completed`, `proposal_accepted`, `proposal_rejected`, `question_rejected`, `bullet_deleted`, `entry_deleted`, `score_before`, `score_after`, `evaluator_invalid_output`, `evaluator_retry` |
| context | object: entry_id / bullet_id / rubric_version / numeric before-after scores |

## Status State Machine (locked by Clarification Q4)

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
- failed or non-run analysis does NOT change the label (FR-014 + Clarification Q4).

## Storage Layout (data/resume.json, illustrative)

```json
{
  "document_version": 1,
  "rubric_version": "rubric-1.0.0",
  "entries": [
    {
      "id": 1,
      "type": "job",
      "title": "…",
      "organization": null,
      "start": null,
      "end": null,
      "bullets": [
        {
          "id": 1,
          "text": "…",
          "status": "analyzed",
          "ratings": {"role_action_clarity": 2, "outcome": 1,
                      "skill_evidence": 1, "structure_scannability": 2},
          "rubric_version": "rubric-1.0.0",
          "history": [],
          "questions": [],
          "proposals": [],
          "merge_warned": false
        }
      ],
      "draft": false,
      "deleted": false
    }
  ]
}
```

## Validation Rules (from spec requirements, applied at boundaries)

- VR-1: 1 ≤ bullets ≤ 6 per entry; >6 → explicit rejection message (FR-002).
- VR-2: overall score drawn ONLY from entries with ≥1 scored bullet (FR-003,
  FR-005; drafts and deleted excluded).
- VR-3: dimension/experience/overall arithmetic ONLY in metrics.py
  (FR-007/FR-008); rubric_version written next to every score.
- VR-4: every mutation (rewrite approval, direct edit, delete, merge) ends via
  explicit action; no silent change (FR-011, Clarifications Q2/Q3).
- VR-5: deletions leave previous bullet data intact for surviving bullets
  (FR-020); entry dropping to 0 bullets returns to draft.
- VR-6: the no-extra-claims validator runs on the FINAL assistant-assembled
  text before any proposal is shown (FR-010 violation = bug).
- VR-7: timestamps written for every listed event (FR-015), format ISO-8601.
