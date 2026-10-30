/**
 * Single source of truth for ALL user-facing strings (English, B1 level).
 *
 * Verbatim port of src/jobforward/messages.py — texts are byte-identical;
 * Python `{placeholder}` fields are kept as-is and filled with fmt().
 * No other module may contain user-facing strings (constitution P10).
 */

export function fmt(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match
  );
}

// --- Idle menu ---
export const MENU_IDLE = "What do you want to do? 1) Add an experience 2) Match a job posting 3) Exit";

// --- Entry collection (ADD_*) ---
export const ADD_TYPE = "Select experience type: 1) Job 2) Project 3) Course 4) Side work";
export const ADD_TITLE = "Enter the experience title:";
export const ADD_BULLET_PROMPT = "Write a bullet for this experience (1 to 6 items).";
export const ADD_BULLET_INPUT = "Bullet {n} (press Enter on an empty line to finish):";
export const ADD_BULLET_DONE = "Empty line: bullets finished.";
export const DRAFT_NOTICE = "The experience was saved as a draft (no bullets).";
export const DRAFT_SUGGESTION = "Suggestion: add at least one description bullet so this experience can be scored.";
export const ENTRY_SAVED_AS_DRAFT = "The whole experience was saved as a draft. You can finish it later.";

// --- Rewrite gate + questions (ASK_*, FR-009; finalized framework §6) ---
export const ASK_REWRITE_GATE =
  "Do you want me to rewrite this bullet to make your experience stronger? 1) Yes (default) 2) No";
export const ASK_NEED = "Who had a problem? What was the problem? 1) Answer 2) Skip";
export const ASK_FEATURE = "What was the feature or product part you worked on? 1) Answer 2) Skip";
export const ASK_ACTION = "What exactly did you do? What was your role? 1) Answer 2) Skip";
export const ASK_RESULT = "What changed after your work? Who did it help? 1) Answer 2) Skip";
export const ASK_METRIC = "Do you have a real number? If not, you can skip this. 1) Answer 2) Skip";
export const ASK_PART_INTRO = "Experience: {title} - Achievement {n} of {total} - {part}:";
export const ASK_ANSWER = ">";

// --- Framework display (spec §5; finalized five-part framework) ---
export const FRAMEWORK_HEADER = "Experience: {title} - Achievement {n} of {total}";
export const FRAMEWORK_ORIGINAL = 'Original: "{text}"';
export const FRAMEWORK_PART_OK = "[{label}: {words}]";
export const FRAMEWORK_PART_MISSING = "[{label} - missing]";
export const FRAMEWORK_PART_VAGUE = "[{label}: {words} - vague]";
export const FRAMEWORK_FILLED = "Filled correctly:";
export const FRAMEWORK_FILLED_LINE = "  {label}: {words}";
export const FRAMEWORK_NEEDS = "Still needs to be filled:";
export const FRAMEWORK_NEEDS_LINE = "  {label}";
export const PART_LABEL_NEED = "User need or problem";
export const PART_LABEL_FEATURE = "Product feature";
export const PART_LABEL_ACTION = "Action";
export const PART_LABEL_RESULT = "Result";
export const PART_LABEL_METRIC = "Metric";
export const PART_NAME_NEED = "Need";
export const PART_NAME_FEATURE = "Feature";
export const PART_NAME_ACTION = "Action";
export const PART_NAME_RESULT = "Result";
export const PART_NAME_METRIC = "Metric";

// --- Complete bullet confirmation (PRD §4.2) ---
export const BULLET_CONFIRM =
  "This bullet is complete as written. Keep it? 1) Keep (default) 2) I will edit it myself";

// --- Partial answers branch (FR-009) ---
export const DRAFT_OR_APPROVE =
  "Some questions were left unanswered. 1) Save this experience as a draft 2) Approve a rewrite using your answers so far";

// --- Proposal (PROPOSAL_*, FR-011) ---
export const PROPOSAL_SHOW =
  "Proposed rewrite for the bullet above:\n{proposal}\n1) Approve and replace 2) Reject and keep unchanged";
export const PROPOSAL_ACCEPTED = "Rewrite approved; the previous bullet is kept in history.";
export const PROPOSAL_REJECTED = "Rewrite rejected; text and scores stay unchanged.";
export const NO_REWRITE = "No rewrite was made for this bullet.";

// --- Merge warning (MERGE_WARN, FR-013) ---
export const MERGE_WARN =
  "Two or more bullets in this experience overlap. Scores are not affected. 1) Merge 2) Do not merge and continue";
export const MERGE_DECLINED = "No merge was made; all bullets are unchanged.";

// --- Delete confirmation (CONFIRM_DELETE_*) ---
export const CONFIRM_DELETE_BULLET = "Delete this bullet? 1) Yes, delete it 2) No";
export const CONFIRM_DELETE_ENTRY = "Delete this whole experience? 1) Yes, delete it 2) No";
export const DELETED_BULLET = "Bullet deleted. It is excluded from all scores from now on.";
export const DELETED_ENTRY = "Experience deleted.";
export const DRAFT_REVERTED = "The experience has no bullets left, so it is a draft again.";

// --- Matcher v1 — JD Matcher, posting-only skill analysis (002) ---
// Fixed texts from specs/002-jd-matcher/contracts/matcher-pipeline.md §1;
// reproduce them character-for-character (tasks.md T002).
export const MATCH_PROMPT_PASTE =
  "Paste the full job posting in English. When you're done, type END on its own line (or press Ctrl+D).";
export const MATCH_ERR_PERSIAN =
  "Persian input isn't supported yet. Please paste the job posting in English.";
export const MATCH_ERR_TOO_SHORT =
  "Your text has only {count} words. A job posting needs at least {limit} words. Please paste the full job posting.";
export const MATCH_ERR_TOO_LONG =
  "Your text has {count} words. A job posting can have at most {limit} words. Please paste a shorter posting.";
export const MATCH_CLEAN_SCRIPT_ONE =
  "I removed 1 script block from your text. I did not run it.";
export const MATCH_CLEAN_BLOCKS =
  "I removed {scripts} script blocks and {styles} style blocks from your text. I did not run them.";
export const MATCH_CLEAN_TAGS = "I removed HTML tags from your text. The text inside them was kept.";
export const MATCH_WORD_COUNT = "Word count: {count}";
export const MATCH_GATE = "Review the result above. [Y] Continue · [C] Cancel";
export const MATCH_CANCELLED = "Cancelled. Going back to the start. Paste the job posting again.";
export const MATCH_CANCELLED_EXIT = "Cancelled. Exiting.";
export const MATCH_ERR_INVALID_KEY = "Please type Y to continue or C to cancel.";
export const MATCH_ERR_NOT_A_POSTING =
  "This doesn't look like a job posting, so I didn't analyze it. Please paste the full text of a job posting.";
export const MATCH_ERR_ZERO_SKILLS =
  "I couldn't extract any skills from this text. Nothing was analyzed.";
export const MATCH_ERR_CONSISTENCY =
  "The report failed its consistency check, so I'm not showing it. Please run the analysis again.";
export const MATCH_DROPPED =
  "I left out {count} item(s) because I couldn't find supporting text in the posting.";
export const MATCH_LIMIT_HARD =
  "{priority}: showing {shown} of {total}. Version 1 shows up to 5 rows per table.";
export const MATCH_LIMIT_SOFT =
  "Showing {shown} of {total} soft skills. Version 1 shows up to 5 rows.";
export const MATCH_NO_TAXONOMY_MATCH = "No taxonomy match: {text}";
export const MATCH_COUNTS = "Must: {must} · Should: {should} · Nice: {nice}";
export const MATCH_TABLE_HARD_HEADER = "Skill | Type | Evidence";
export const MATCH_TABLE_SOFT_HEADER = "Skill | Group | Evidence | Priority | Certainty";
export const MATCH_EMPTY_GROUP = "—";
export const MATCH_TYPE_HARD = "Hard";
export const MATCH_TYPE_HARD_TOOL = "Hard (tool)";
export const MATCH_ROW_HARD = "{skill} | {type} | {evidence}";
export const MATCH_ROW_HARD_DEFAULT = "{skill} (default) | {type} | {evidence}";
export const MATCH_ROW_SOFT = "{skill} | {group} | {evidence} | {priority} | {certainty}";

// --- Copy text (COPY_*, FR-019; finalized final output §8) ---
export const COPY_BEGIN = "----- COPY FROM HERE -----";
export const COPY_END = "----- COPY TO HERE -----";
export const COPY_NOTICE = "You can copy the text above.";

// --- Scores (SCORE_*, FR-005/FR-008) ---
export const SCORE_BULLET_HEADER = "Scores for experience '{text}' (rubric version {rubric}):";
export const SCORE_BULLET_LINE = "Bullet {n}: {text}";
export const SCORE_DIMENSION = "  {dimension}: {value}/2";
export const SCORE_EXPERIENCE = "Experience score: {value}/100 (rubric version {rubric})";
export const SCORE_OVERALL = "Overall score: {value}/100 (rubric version {rubric})";
export const SCORE_OVERALL_HIDDEN =
  "Overall score: not shown yet (no experience with scored bullets).";
export const SCORE_BEFORE_AFTER =
  "Before: {before}  ->  After: {after} (rubric version {rubric})";
export const SCORE_STATUS = "  Status: {status}";
export const SCORE_DIMENSION_CONTEXT = "Context";
export const SCORE_DIMENSION_ACTION = "Role and Action Clarity";
export const SCORE_DIMENSION_RESULT = "Result";
export const SCORE_DRAFT_LINE = "Draft experience - excluded from the overall score.";
export const SCORE_MERGE_LINE = "Overlap warning active for this experience.";

// --- Edit bullet (SCORE_SHOWN menu) ---
export const EDIT_BULLET_PROMPT = "Which bullet do you want to edit? Enter the bullet number:";
export const EDIT_BULLET_TEXT = "Write the new text for this bullet (English only):";
export const EDIT_BULLET_DONE = "Bullet updated. It is marked 'edited' and will be re-analyzed.";

// --- SCORE_SHOWN menu ---
export const MENU_SCORE_SHOWN =
  "What next? 1) Edit a bullet 2) Delete a bullet 3) Delete this experience 4) Copy this experience 5) Continue (finish this experience)";

// --- Exit / session ---
export const GOODBYE = "Session ended. All data stays on this computer.";
export const PROMPT_CONTINUE = ">";

// --- Errors (ERR_*, FR-014/FR-002/FR-017) ---
export const ERR_TOO_MANY_BULLETS =
  "An experience can have at most 6 bullets. Please reduce or combine them.";
export const ERR_NON_ENGLISH_INPUT =
  "Only English text is accepted here. Please write your bullet or answer in English.";
export const ERR_INVALID_EVALUATOR =
  "The analysis returned an invalid result. Your data is safe; the tool will retry once.";
export const ERR_EVALUATOR_FAILURE =
  "The analysis failed after one retry. Your data is unchanged. Please try again later.";
export const ERR_MATCHER_FAILURE =
  "The job description analysis failed after one retry. Your data is unchanged.";
export const ERR_INVALID_TITLE = "The title cannot be empty.";
export const ERR_ENV = "Environment error (for example, PYTHONUTF8 is disabled).";
export const ERR_NO_ENTRY = "There is no experience to work with yet.";
export const ERR_INVALID_CHOICE =
  "That was not a valid choice. Please pick one of the numbers shown.";
