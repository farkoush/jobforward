# Interface Contracts: Experience Improvement Flow

Three external interfaces exist in this project:

1. The **human CLI session** (the product itself — an English B1 text-flow
   terminal "chat" loop).
2. The **evaluator port** (how an adapter — local heuristic or LLM —
   returns structured 0/1/2 ratings on three dimensions).
3. The **matcher port** (how an analyzer returns posting requirements and
   per-entry actions).

All tool text is English at B1 level. All user input is English-only, with
the single exception of pasted job-description text (may be Persian or
English, FR-021).

---

## 1. CLI Session Contract (`contracts/cli-session.md`)

Entry point: `python -m jobforward` (run from the repository root with
`PYTHONUTF8=1`; see quickstart.md).

### Session states (one complete improvement path + matcher, spec main flow)

```text
IDLE ──add-entry──► ENTRY_FILLED ──auto-score──► SCORE_SHOWN
SCORE_SHOWN ──rewrite gate (per bullet, default Yes)──► AWAITING_QUESTION_ANSWER
AWAITING_QUESTION_ANSWER ──answer submitted──► REWRITE_AWAITING_APPROVAL
AWAITING_QUESTION_ANSWER ──reject gate / skip all──► SCORE_SHOWN (no rewrite)
AWAITING_QUESTION_ANSWER ──partial answers──► DRAFT_OR_APPROVE (save entry as
                                              draft | approve from answers so far)
REWRITE_AWAITING_APPROVAL ──approve──► SCORE_SHOWN (entry re-scored, edited
                                                  bullet re-analyzed)
REWRITE_AWAITING_APPROVAL ──reject──► SCORE_SHOWN
SCORE_SHOWN ──edit-bullet / delete(=confirm) / merge-decision / copy-text /
              match-posting──► (respective handlers → SCORE_SHOWN)
any state ──exit──► IDLE (state persisted atomically)
```

### Prompt rules (enforceable in `tests/contract/test_cli_session.py`)

- Every visible prompt / message is English at B1 level, taken from
  `messages.py` (constitution Principle 10, v2.0.0).
- Every question, confirmation, and prompt is answerable with a numbered
  choice; a rejection/skip choice is ALWAYS offered where rejection is allowed
  (FR-009: the gate and every question can be rejected/skipped).
- Reading a bullet back always shows its text verbatim (no reshaping).
- Required prompt ids (session running contract):
  - `ADD_TYPE`, `ADD_TITLE`, `ADD_BULLET_*` — entry collection
  - `ASK_REWRITE_GATE` — "Do you want me to rewrite this bullet to make your
    experience stronger?" (default Yes) + numbered Yes/No
  - `ASK_CONTEXT`, `ASK_ACTION`, `ASK_RESULT` — the three fixed question
    texts (PRD §4.2) + numbered Answer / Skip choices; `ASK_RESULT` ends with
    "If you have real numbers, include them."
  - `DRAFT_OR_APPROVE` — save entry as draft vs. approve rewrite from answers
    so far
  - `PROPOSAL_*` — the proposed rewrite + numbered approve/reject
  - `MERGE_WARN` — warning + numbered merge/no-merge (FR-013)
  - `CONFIRM_DELETE_*` — deletion confirmation (Clarification Q3)
  - `MATCH_POSTING`, `MATCH_ACTION_*` — paste posting, then per-entry
    Highlight / No change / Not relevant to this job with reason (FR-022);
    "Remove" and "Shorten" never appear
  - `COPY_*` — non-mutating copy-text output (FR-019)
  - `SCORE_*` — per-dimension per-bullet, entry, overall display; any approved
    rewrite side also shows BEFORE vs AFTER side by side (FR-012)
  - `ERR_*` — invalid evaluator output, >6 bullets, non-English input,
    command-specific mistakes; data survives every error (FR-014, FR-002,
    FR-017); tests assert the state is unchanged after each error

### Exit codes

- 0 on normal exit
- 2 on evaluator- or matcher-reported failure (after one retry) — data
  intact, only message differs; 1 only for coroutine/env errors (e.g.,
  missing PYTHONUTF8).

---

## 2. Evaluator Output Contract (`contracts/evaluator-output.schema.json`)

A rating call receives: (a) the prompt bundle: bullet text verbatim, and when
applicable the user's answers; (b) the rubric version. It must return EXACTLY:

```json
{
  "rubric_version": "rubric-2.0.0",
  "ratings": [
    {
      "bullet_index": 0,
      "context": 2,
      "role_action_clarity": 1,
      "result": 0
    }
  ],
  "notes": null
}
```

- `ratings[*].{context, role_action_clarity, result}` are integers ∈ {0,1,2}
  for the three dimensions of that bullet, same order as the request's bullet
  list.
- The adapter may add human-readable `notes` (English B1) but MUST NOT return
  any aggregated score, percentage, or change of the written text
  (constitution Principle 4: no arithmetic generated inside the adapter;
  numeric values limited to the 0/1/2 ratings it is asked for).
- Validity check performed by the consumer before ANY arithmetic:
  schema match, all three keys present, all ints within {0,1,2}, one entry
  per bullet in the request. Invalid → reject, retry once (adapter-internal),
  then hand the failure to `path_service` to show `ERR_*` and protect user
  data (FR-014). The failure/event lines `evaluator_invalid_output`,
  `evaluator_retry` go to the JSONL log (FR-015).

---

## 3. Matcher Output Contract (`contracts/matcher-output.schema.json`)

A matcher call receives: (a) the pasted posting text (verbatim; Persian or
English); (b) the user's current non-deleted entries (id + title + bullet
texts); (c) the rubric version. Stage 1 must return EXACTLY:

```json
{
  "rubric_version": "rubric-2.0.0",
  "requirements": [
    {"id": 0, "text": "3+ years of SQL experience", "skill_type": "hard", "priority": "required"},
    {"id": 1, "text": "clear written communication", "skill_type": "soft", "priority": "preferred"}
  ],
  "notes": null
}
```

- `requirements[*].skill_type` ∈ {"hard", "soft"}; `priority` ∈
  {"required", "preferred", "bonus"}; any red-line requirement MUST be
  classified "required".
- Stage 2 (`matcher/actions.py`) must return EXACTLY one action per entry:

```json
{
  "actions": [
    {"entry_id": 1, "action": "highlight", "requirement_id": 0,
     "reason": "Matches required hard skill: 3+ years of SQL experience."}
  ]
}
```

- `action` ∈ {"highlight", "no_change", "not_relevant"} — exactly one per
  non-deleted entry, no entry omitted. "remove" and "shorten" are illegal
  values and MUST be treated as invalid output.
- `reason` is one B1-English line citing the referenced requirement's
  skill_type + priority.
- Validity check: schema match, allowed enums, one action per entry, reason
  non-empty and referencing an existing requirement id. Invalid → reject,
  retry once (adapter-internal), then hand the failure to `path_service` to
  show `ERR_*` (exit code 2; data intact). Events `posting_analyzed` and
  `match_action_assigned` go to the JSONL log (FR-015).
- The matcher NEVER mutates entry or bullet text and its output has zero
  effect on any score (constitution P3/P6).
