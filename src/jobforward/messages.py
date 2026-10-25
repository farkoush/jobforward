"""Single source of truth for all user-facing English strings.

No other module may contain user-facing English strings. The CLI imports prompts
from here and never hardcodes English. Every prompt id is printed alongside its
interaction so logs and tests stay comparable (research R-5).

Prompt-id categories (contracts/interface-contracts.md):
  ADD_*        - entry field collection (type, title, org, start, end, bullets)
  Q_RESULT_HINT- text shown next to the result field (FR-004)
  ASK_*        - question prompt + numbered answer/reject/skip choices (FR-009)
  PROPOSAL_*   - proposed rewrite + numbered approve/reject (FR-011)
  MERGE_WARN   - overlap warning + numbered merge/no-merge (FR-013)
  CONFIRM_DELETE_* - deletion confirmation (Clarification Q3)
  SCORE_*      - per-dimension per-bullet, experience, overall display (FR-005/FR-008)
  ERR_*        - explicit error prompts; data survives every error (FR-014)
"""

# --- Entry collection (ADD_*) ---
ADD_TYPE = "Select experience type: 1) Job 2) Project 3) Course 4) Side work"
ADD_TITLE = "Enter experience title:"
ADD_ORG = "Organization name (optional, leave blank if none):"
ADD_START = "Start date (exact text you wrote, optional):"
ADD_END = "End date (exact text you wrote, optional):"
ADD_BULLET_PROMPT = "Write a bullet for this experience (maximum 6 items):"
ADD_BULLET_DONE = "Finish entering bullets and continue to scores."

# --- Result field hint (Q_RESULT_HINT, FR-004) ---
Q_RESULT_HINT = "If you have a real number, add it here"

# --- Questions (ASK_*, FR-009, Clarification Q1) ---
ASK_RESULT_IMPACT = "Did this project/work create an impact? (1) Answer and continue 2) Reject question 3) Reject and continue"
ASK_SKILL_RELEVANCE = "What skill is demonstrated here? (1) Answer and continue 2) Reject question 3) Reject and continue"

# --- Proposal (PROPOSAL_*, FR-011) ---
PROPOSAL_SHOW = "Proposed change for the bullet above:\n{proposal}\n(1) Approve and replace 2) Reject and keep unchanged"
PROPOSAL_ACCEPTED = "Change approved; previous text kept in history."
PROPOSAL_REJECTED = "Change rejected; text and scores remain unchanged."

# --- Merge warning (MERGE_WARN, FR-013) ---
MERGE_WARN = "Two or more bullets overlap. Scores are not affected. (1) Merge 2) Do not merge and continue"

# --- Delete confirmation (CONFIRM_DELETE_*, Clarification Q3) ---
CONFIRM_DELETE_BULLET = "Are you sure you want to delete this bullet? (1) Yes, delete it 2) No"
CONFIRM_DELETE_ENTRY = "All bullets in this experience were deleted. Experience returns to draft state."

# --- Scores (SCORE_*, FR-005/FR-008) ---
SCORE_BULLET_HEADER = "Scores for bullet «{text}» (rubric version {rubric}):"
SCORE_DIMENSION = "  {dimension}: {value}/2"
SCORE_EXPERIENCE = "Experience score: {value}/100"
SCORE_OVERALL = "Overall score: {value}/100"
SCORE_BEFORE_AFTER = "Before: {before}  ->  After: {after}"

# --- Errors (ERR_*, FR-014) ---
ERR_TOO_MANY_BULLETS = "Maximum 6 bullets allowed. Please shorten the list."
ERR_INVALID_EVALUATOR = "Evaluator response is invalid; will retry once, then report error. Your data will not change."
ERR_EVALUATOR_FAILURE = "Evaluator failed after one attempt; error reported to user. Saved document remains unchanged."
ERR_ENV = "Environment error (for example, PYTHONUTF8 is disabled)."
