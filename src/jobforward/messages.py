"""Single source of truth for ALL user-facing strings (English, B1 level).

Constitution Principle 10 (v2.0.0): all tool text is English at B1 level; all
user input — bullets and answers — must be English (pasted posting text is the
one exemption, FR-021). No other module may contain user-facing strings; the
CLI imports prompts from here and never hardcodes them.

Prompt-id categories (contracts/interface-contracts.md):
  ADD_*        - entry field collection (type, title, bullets)
  ASK_*        - rewrite gate + per-dimension questions with numbered choices
  DRAFT_OR_APPROVE - partial-answers branch (save draft | approve from answers)
  PROPOSAL_*   - proposed rewrite + numbered approve/reject
  MERGE_WARN   - overlap warning + numbered merge/no-merge
  CONFIRM_DELETE_* - deletion confirmations
  MATCH_*      - posting paste + per-entry matcher actions
  COPY_*       - non-mutating copy-text output
  SCORE_*      - per-dimension per-bullet, entry, overall display
  ERR_*        - explicit errors; data survives every error
"""

# --- Idle menu ---
MENU_IDLE = "What do you want to do? 1) Add an experience 2) Match a job posting 3) Exit"

# --- Entry collection (ADD_*) ---
ADD_TYPE = "Select experience type: 1) Job 2) Project 3) Course 4) Side work"
ADD_TITLE = "Enter the experience title:"
ADD_BULLET_PROMPT = "Write a bullet for this experience (1 to 6 items)."
ADD_BULLET_INPUT = "Bullet {n} (press Enter on an empty line to finish):"
ADD_BULLET_DONE = "Empty line: bullets finished."
DRAFT_NOTICE = "The experience was saved as a draft (no bullets)."
DRAFT_SUGGESTION = "Suggestion: add at least one description bullet so this experience can be scored."
ENTRY_SAVED_AS_DRAFT = "The whole experience was saved as a draft. You can finish it later."

# --- Rewrite gate + questions (ASK_*, FR-009) ---
ASK_REWRITE_GATE = (
    "Do you want me to rewrite this bullet to make your experience stronger? "
    "1) Yes (default) 2) No"
)
ASK_CONTEXT = (
    "What was the situation? For example, what project, team, or problem was it about? "
    "1) Answer 2) Skip"
)
ASK_ACTION = (
    "What exactly did you do? What was your role? 1) Answer 2) Skip"
)
ASK_RESULT = (
    "What changed after your work? Who did it help, or what result did it lead to? "
    "If you have real numbers, include them. 1) Answer 2) Skip"
)
ASK_ANSWER = ">"

# --- Complete bullet confirmation (PRD §4.2: a complete bullet is only
# confirmed at the end; no questions are asked) ---
BULLET_CONFIRM = (
    "This bullet is complete as written. Keep it? 1) Keep (default) 2) I will edit it myself"
)

# --- Partial answers branch (FR-009) ---
DRAFT_OR_APPROVE = (
    "Some questions were left unanswered. "
    "1) Save this experience as a draft 2) Approve a rewrite using your answers so far"
)

# --- Proposal (PROPOSAL_*, FR-011) ---
PROPOSAL_SHOW = (
    "Proposed rewrite for the bullet above:\n{proposal}\n"
    "1) Approve and replace 2) Reject and keep unchanged"
)
PROPOSAL_ACCEPTED = "Rewrite approved; the previous bullet is kept in history."
PROPOSAL_REJECTED = "Rewrite rejected; text and scores stay unchanged."
NO_REWRITE = "No rewrite was made for this bullet."

# --- Merge warning (MERGE_WARN, FR-013) ---
MERGE_WARN = (
    "Two or more bullets in this experience overlap. Scores are not affected. "
    "1) Merge 2) Do not merge and continue"
)
MERGE_DECLINED = "No merge was made; all bullets are unchanged."

# --- Delete confirmation (CONFIRM_DELETE_*, Clarification Q3) ---
CONFIRM_DELETE_BULLET = "Delete this bullet? 1) Yes, delete it 2) No"
CONFIRM_DELETE_ENTRY = "Delete this whole experience? 1) Yes, delete it 2) No"
DELETED_BULLET = "Bullet deleted. It is excluded from all scores from now on."
DELETED_ENTRY = "Experience deleted."
DRAFT_REVERTED = "The experience has no bullets left, so it is a draft again."

# --- Matcher (MATCH_*, FR-021/FR-022) ---
MATCH_POSTING = (
    "Paste the job description (Persian or English), then press Enter on an "
    "empty line to finish:"
)
MATCH_ACTION_HEADER = "Match results for this posting:"
MATCH_ACTION = "Experience '{title}': {action} - {reason}"
MATCH_ACTIONS_LEGAL = "Actions: Highlight / No change / Not relevant to this job."

# --- Copy text (COPY_*, FR-019) ---
COPY_BEGIN = "----- COPY FROM HERE -----"
COPY_END = "----- COPY TO HERE -----"

# --- Scores (SCORE_*, FR-005/FR-008) ---
SCORE_BULLET_HEADER = "Scores for experience '{text}' (rubric version {rubric}):"
SCORE_BULLET_LINE = "Bullet {n}: {text}"
SCORE_DIMENSION = "  {dimension}: {value}/2"
SCORE_EXPERIENCE = "Experience score: {value}/100 (rubric version {rubric})"
SCORE_OVERALL = "Overall score: {value}/100 (rubric version {rubric})"
SCORE_OVERALL_HIDDEN = (
    "Overall score: not shown yet (no experience with scored bullets)."
)
SCORE_BEFORE_AFTER = "Before: {before}  ->  After: {after} (rubric version {rubric})"
SCORE_STATUS = "  Status: {status}"
SCORE_DIMENSION_CONTEXT = "Context"
SCORE_DIMENSION_ACTION = "Role and Action Clarity"
SCORE_DIMENSION_RESULT = "Result"
SCORE_DRAFT_LINE = "Draft experience - excluded from the overall score."
SCORE_MERGE_LINE = "Overlap warning active for this experience."

# --- Edit bullet (SCORE_SHOWN menu) ---
EDIT_BULLET_PROMPT = "Which bullet do you want to edit? Enter the bullet number:"
EDIT_BULLET_TEXT = "Write the new text for this bullet (English only):"
EDIT_BULLET_DONE = "Bullet updated. It is marked 'edited' and will be re-analyzed."

# --- SCORE_SHOWN menu ---
MENU_SCORE_SHOWN = (
    "What next? 1) Edit a bullet 2) Delete a bullet 3) Delete this experience "
    "4) Copy this experience 5) Continue (finish this experience)"
)

# --- Exit / session ---
GOODBYE = "Session ended. All data stays on this computer."
PROMPT_CONTINUE = ">"

# --- Errors (ERR_*, FR-014/FR-002/FR-017) ---
ERR_TOO_MANY_BULLETS = (
    "An experience can have at most 6 bullets. Please reduce or combine them."
)
ERR_NON_ENGLISH_INPUT = (
    "Only English text is accepted here. Please write your bullet or answer in English."
)
ERR_INVALID_EVALUATOR = (
    "The analysis returned an invalid result. Your data is safe; the tool will retry once."
)
ERR_EVALUATOR_FAILURE = (
    "The analysis failed after one retry. Your data is unchanged. Please try again later."
)
ERR_MATCHER_FAILURE = (
    "The job description analysis failed after one retry. Your data is unchanged."
)
ERR_INVALID_TITLE = "The title cannot be empty."
ERR_ENV = "Environment error (for example, PYTHONUTF8 is disabled)."
ERR_NO_ENTRY = "There is no experience to work with yet."
ERR_INVALID_CHOICE = "That was not a valid choice. Please pick one of the numbers shown."
