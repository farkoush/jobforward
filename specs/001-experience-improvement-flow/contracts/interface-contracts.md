# Interface Contracts: Experience Improvement Flow

Two external interfaces exist in this project:

1. The **human CLI session** (the product itself — a Persian text-flow
   terminal "chat" loop).
2. The **evaluator port** (how an adapter — local heuristic or LLM —
   returns structured 0/1/2 ratings).

---

## 1. CLI Session Contract (`contracts/cli-session.md`)

Entry point: `python -m jobforward` (run from the repository root with
`PYTHONUTF8=1`; see quickstart.md).

### Session states (one complete improvement path, spec main flow)

```text
IDLE ──add-entry──► ENTRY_FILLED ──auto-score──► SCORE_SHOWN
SCORE_SHOWN ──questions(auto)──► AWAITING_QUESTION_ANSWER
AWAITING_QUESTION_ANSWER ──answer submitted──► REWRITE_AWAITING_APPROVAL
AWAITING_QUESTION_ANSWER ──reject / skip──► SCORE_SHOWN          (no rewrite)
REWRITE_AWAITING_APPROVAL ──approve──► SCORE_SHOWN (entry re-scored, edited bullet re-analyzed)
REWRITE_AWAITING_APPROVAL ──reject──► SCORE_SHOWN
SCORE_SHOWN ──edit-bullet / delete(=confirm) / merge-decision / copy-text──► (respective handlers → SCORE_SHOWN)
any state ──exit──► IDLE (state persisted atomically)
```

### Prompt rules (enforceable in `tests/contract/test_cli_session.py`)

- Every visible prompt / message is Persian, taken from `messages.py`
  (constitution Principle 10).
- Every question, confirmation, and prompt is answerable with a numbered
  choice; a rejection/skip choice is ALWAYS offered where rejection is allowed
  (FR-009: rejecting any question must be possible).
- Reading a bullet back always shows its text verbatim (no reshaping).
- Required prompt ids (session running contract):
  - `ADD_TYPE`, `ADD_TITLE`, `ADD_ORG`, `ADD_START`, `ADD_END`, `ADD_BULLET_*`
  - `Q_RESULT_HINT` — only text next to the result field (FR-004):
    «اگر عدد واقعی داری، همان را اضافه کن»
  - `ASK_*` — question prompt + numbered reply/reject/skip choices
  - `PROPOSAL_*` — the proposed rewrite + numbered approve/reject
  - `MERGE_WARN` — warning + numbered merge/no-merge (FR-013)
  - `CONFIRM_DELETE_*` — deletion confirmation (Clarification Q3)
  - `SCORE_*` — per-dimension per-bullet, experience, overall display;
    any approved rewrite side also shows BEFORE vs AFTER side by side (FR-012)- Errors: invalid evaluator output, >6 bullets, command-specific mistakes →
  explicit Persian error prompt id `ERR_*`; data survives every error
  (FR-014, FR-002); tests assert the state is unchanged after each error.

### Exit codes

- 0 on normal exit
- 2 on evaluator-reported failure (after one retry) — data intact, only message
  differs; 1 only for coroutine/env errors (e.g., missing PYTHONUTF8).

---

## 2. Evaluator Output Contract (`contracts/evaluator-output.schema.json`)

A rating call receives: (a) the prompt bundle: bullet text verbatim, and when
applicable the user's answers; (b) the rubric version. It must return EXACTLY:

```json
{
  "rubric_version": "rubric-1.0.0",
  "ratings": [
    {
      "bullet_index": 0,
      "role_action_clarity": 0,
      "outcome": 1,
      "skill_evidence": 2,
      "structure_scannability": 1
    }
  ],
  "notes": null
}
```

- `ratings[*].{role_action_clarity, outcome, skill_evidence,
  structure_scannability}` are integers ∈ {0,1,2} representing the four
  dimensions for that bullet, same order as the request's bullet list.
- The adapter may add human-readable `notes` (Persian) but MUST NOT return any
  aggregated score, percentage, or change of the written text (constitution
  Principle 4: no arithmetic generated inside the adapter; numeric values
  limited to the 0/1/2 ratings it is asked for).
- Validity check performed by the consumer before ANY arithmetic:
  schema match, all four keys present, all ints within {0,1,2}, one entry per
  bullet in the request. Invalid → reject, retry once (adapter-internal), then
  hand the failure to `path_service` to show `ERR_*` and protect user data
  (FR-014). The failure/event lines `evaluator_invalid_output`,
  `evaluator_retry` go to the JSONL log (FR-015).
