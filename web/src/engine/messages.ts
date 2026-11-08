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
export const MENU_IDLE = "What would you like to do today? 1) Add an experience 2) Match a job posting 3) Finish for now";

// --- Entry collection (ADD_*) ---
export const ADD_TYPE = "What kind of experience is this? 1) Job 2) Project 3) Course 4) Side work";
export const ADD_TITLE = "Give this experience a short title:";
export const ADD_BULLET_PROMPT = "Now your achievements - write 1 to 6 bullets for this experience.";
export const ADD_BULLET_INPUT = "Bullet {n} (press Enter on an empty line when you're done):";
export const ADD_BULLET_DONE = "Got it - your bullets are in.";

// --- Phase 13 (spec §4.2): hybrid entry — paste-and-split (web-only; the
// terminal's ADD_* texts above stay as they are) ---
export const ADD_FIELDS_TITLE = "Enter the experience details:";
export const ADD_FIELD_COMPANY = "Company:";
export const ADD_FIELD_DATES = "Dates (e.g. 2022-2024):";
export const ADD_FIELD_DOMAIN =
  "Product domain (e.g. fintech, healthcare, e-commerce):";
export const ADD_PASTE_LABEL = "Paste this experience:";
export const ADD_PASTE_INSTRUCTION =
  "Paste the whole experience exactly as it appears in your resume: the title, the company, the dates, and each achievement on its own line (start achievements with - or •).";
export const ADD_PASTE_EXAMPLE =
  "Example: New users could not find the items they saved, so I rebuilt the saved items page, resulting in more users coming back.";
export const ADD_PASTE_EMPTY = "Looks like the text box is still empty - paste your experience and we'll take it from there.";
export const ADD_PASTE_SPLIT = "Split into achievements";
export const SOFT_LIMIT_NOTE =
  "Put your best achievements first; you can add the rest later.";
export const SPLIT_FOUND = "I found {n} achievements. Is that correct?";
export const SPLIT_NOT_FOUND =
  "Those words are not in this line — check and try again.";
export const SPLIT_CONFIRM = "Let's see what we get";
// --- Phase 18 (spec §13, clarified 2026-11-06): paste-first entry with a
// drag-and-drop review — WEB-ONLY strings (terminal display frozen; the
// same divergence pattern as the Phase 13/15 sections above). The shaping
// buttons (merge/split/delete/keep/discard) are REMOVED per the owner's
// decision; their strings are gone with them. ---
export const ADD_PASTE_HEADING = "Add your experience";
export const REVIEW_HEADING =
  "Check the parts below - drag each line to the right place.";
export const REVIEW_TYPE_LABEL = "Experience type:";
export const REVIEW_SECTION_TITLE = "Title:";
export const REVIEW_SECTION_ACHIEVEMENTS = "Achievements";
export const ORG_LABEL_JOB = "Company:";
export const ORG_LABEL_PROJECT = "Project name:";
export const ORG_LABEL_COURSE = "Provider:";
export const ORG_LABEL_SIDE_WORK = "Client:";
export const FIELD_START_DATE = "Start (YYYY-MM):";
export const FIELD_END_DATE = "End (YYYY-MM):";
export const FIELD_ONGOING = "I still work here";
export const ERR_DATE_FORMAT = "Use the year and month, like 2022-04.";
export const BACK = "Back";
export const PANEL_SCORE = "Experience score: {value}/100";
// Phase 19 (spec §15.5): RATING_CELL (" · {value}/2") was REMOVED — the
// five-cell row keeps state text only; the ratings render as the ONE
// score line above the analysis (SCORE_DIMENSION reuse).
export const STAGE_EXPERIENCE = "Experience";
export const STAGE_REVIEW = "Review";
export const STAGE_ACHIEVEMENTS = "Achievements";
export const STAGE_RESULT = "Result";
export const SOURCE_PASTE_TITLE = "Your original text";
export const DRAFT_NOTICE = "Saved as a draft for now (no bullets) - you can finish it anytime.";
export const DRAFT_SUGGESTION = "Add at least one bullet and I can score this experience.";
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

// --- Framework display (spec §5; five-part framework) ---
// WEB-ONLY display update 2026-11-03 (user decision): the five parts are
// shown as ONE continuous sentence with in-sentence brackets; the terminal
// (messages.py) still uses the list format, so these strings intentionally
// diverge from the Python port.
export const FRAMEWORK_HEADER = "Experience: {title} - Achievement {n} of {total}";
export const FRAMEWORK_ORIGINAL = "Job seeker's original text: \"{text}\"";
export const FRAMEWORK_SENTENCE =
  "Analysis of {need} and collaboration with the product team on designing {feature} through {action}, resulting in {result} and {metric}.";
// Connecting words are a CONTENT-BASED PREDICTION with defined creativity
// (user decision 2026-11-03): never copied from an example, chosen from this
// closed variant set by the bullet's own content — see page.tsx selector.
export const FRAMEWORK_CONN_ANALYSIS = "Analysis of";
export const FRAMEWORK_CONN_RESEARCH = "Research into";
export const FRAMEWORK_CONN_COLLAB =
  "and collaboration with the product team on designing";
export const FRAMEWORK_CONN_BUILD = "and building of";
export const FRAMEWORK_CONN_WORK = "and work on";
export const FRAMEWORK_CONN_RESEARCH_SEG = "and research into";
export const FRAMEWORK_CONN_THROUGH = "through";
export const FRAMEWORK_CONN_RESULTING = ", resulting in";
export const FRAMEWORK_CONN_AND = "and";
export const FRAMEWORK_PART_OK = "[{label}: {words}]";
export const FRAMEWORK_PART_MISSING = "[{label} - missing]";
export const FRAMEWORK_PART_VAGUE = "[{label}: {words} - vague]";
export const FRAMEWORK_FILLED = "Filled correctly:";
export const FRAMEWORK_FILLED_LINE = "{label}: \"{words}\"";
export const FRAMEWORK_NEEDS = "Still needs to be filled:";
export const FRAMEWORK_NEEDS_LINE = "{label}";
export const FRAMEWORK_NEEDS_ITEM_MISSING = "{label} (missing)";
export const FRAMEWORK_NEEDS_ITEM_VAGUE = "{label} (vague)";
export const FRAMEWORK_NEEDS_ITEM_FILLED = "{label} (filled)";
// Phase 12 (spec §2.2): heading of the diagnostic gray block that lists the
// bullet's orphaned spans (maximal unclaimed runs) under the sentence.
export const COVERAGE_TITLE = "Not attributed to the framework";

// --- Phase 15 (spec §5.2/§6.2): glance row + focused question loop ---
export const STATUS_COMPLETE = "Complete";
export const STATUS_VAGUE = "Vague";
export const STATUS_MISSING = "Missing";
export const QUESTION_NEXT = "Next";
export const QUESTION_COLLAPSED = "{label} — {state}";
export const QUESTION_COUNTER = "Question {n} of {total}";
export const QUESTION_OPEN = "Open";

// --- Still-needs-to-be-filled detail (user decision 2026-11-03): vague
// items show the ambiguity reason first, then two medium-creativity
// suggestions; missing items show two suggestions. Metric suggestions use
// "x" as the number placeholder and stress that a REAL number matters. ---
export const NEEDS_REASON_NEED_VAGUE =
  "\u201c{words}\u201d says what you studied, but not who had which problem.";
export const NEEDS_REASON_ACTION_VAGUE =
  "\u201c{words}\u201d does not say what you did or what your role was.";
export const NEEDS_REASON_RESULT_VAGUE =
  "\u201c{words}\u201d does not say what changed after your work or who it helped.";
export const SUGGEST_NEED_MISSING_1 =
  "Start with the group who had the problem — users, customers, agents — and name them.";
export const SUGGEST_NEED_MISSING_2 =
  "Say what went wrong for that group in one sentence, before your work.";
export const SUGGEST_FEATURE_MISSING_1 =
  "Name the exact product part you worked on — a page, tool, flow, or module.";
export const SUGGEST_FEATURE_MISSING_2 =
  "If the part has no name, describe it in a few words — for example: \u201cthe review queue\u201d.";
export const SUGGEST_ACTION_MISSING_1 =
  "Say what you did to change the product — use a delivery verb: built, designed, wrote, led.";
export const SUGGEST_ACTION_MISSING_2 =
  "Add your role and method — for example: \u201cI led \u2026\u201d, \u201cI collaborated with the design team to \u2026\u201d.";
export const SUGGEST_RESULT_MISSING_1 =
  "Say what changed after your work — an outcome, not a plan.";
export const SUGGEST_RESULT_MISSING_2 =
  "Say who benefited from the change.";
export const SUGGEST_METRIC_MISSING_1 =
  "A real number matters here. If you have one, add it — for example: \u201cby x%\u201d.";
export const SUGGEST_METRIC_MISSING_2 =
  "If you measured before and after, use a range — for example: \u201cfrom x% to y%\u201d. A real number matters more than a guess.";
export const SUGGEST_NEED_VAGUE_1 =
  "Add who had the problem — the group inside your research (the users or teams you studied).";
export const SUGGEST_NEED_VAGUE_2 =
  "State the problem itself in one sentence before your work — what was wrong for them.";
export const SUGGEST_ACTION_VAGUE_1 =
  "Replace the vague wording with a delivery verb — built, designed, wrote, led.";
export const SUGGEST_ACTION_VAGUE_2 =
  "Add your role and scope — for example: \u201cI led the redesign of \u2026\u201d.";
export const SUGGEST_RESULT_VAGUE_1 =
  "Say the change that happened — an outcome, not a plan or a deliverable.";
export const SUGGEST_RESULT_VAGUE_2 =
  "Name who benefited — and if you have a number, add it (a real number matters).";

// --- Inline improvement form (user decision 2026-11-03): the bullet-gate
// screen asks each unfilled/vague part inline — clean question text (no
// terminal 1) 2) suffix), a suggestion dropdown with editable fill-in
// starters, and a live-updating sentence. ---
export const INLINE_Q_CONTEXT = "Who had a problem? What was the problem?";
export const INLINE_Q_FEATURE = "What was the feature or product part you worked on?";
export const INLINE_Q_ACTION = "What exactly did you do? What was your role?";
export const INLINE_Q_RESULT = "What changed after your work? Who did it help?";
export const INLINE_Q_METRIC = "Do you have a real number? If not, you can skip this part.";
export const NEEDS_WHY_TITLE = "Why this is unclear:";
export const METRIC_REAL_NUMBER_NOTE =
  "A real number matters here — replace x with your real number if you have one. If you don't have one, you can skip this part.";
export const STARTER_PLACEHOLDER = "Choose a suggestion…";
export const STARTER_INPUT_PLACEHOLDER = "Or write your own answer here";
export const STARTER_CONFIRM = "Confirm";
export const NEEDS_IMPROVED_NOTE = "Improved phrasing:";
// Phase 19 (spec §15.5): the bullet-screen Copy button was REMOVED —
// COPY_BUTTON/COPY_TOOLTIP deleted (the §8 final-output screen keeps its
// own Copy control, rendered inline).
export const STARTER_NEED_MISSING_1 = "Users could not …, and this made … hard for them.";
export const STARTER_NEED_MISSING_2 = "… struggled to … because … .";
export const STARTER_NEED_VAGUE_1 = "Users could not …";
export const STARTER_NEED_VAGUE_2 = "… struggled to … because … .";
export const STARTER_FEATURE_1 = "the … page";
export const STARTER_FEATURE_2 = "the … tool";
export const STARTER_ACTION_MISSING_1 = "I built …";
export const STARTER_ACTION_MISSING_2 = "I collaborated with the design team to …";
export const STARTER_ACTION_VAGUE_1 = "I built …";
export const STARTER_ACTION_VAGUE_2 = "I led …";
export const STARTER_RESULT_MISSING_1 = "… improved for …";
export const STARTER_RESULT_MISSING_2 = "… grew for …";
export const STARTER_RESULT_VAGUE_1 = "… changed for …";
export const STARTER_RESULT_VAGUE_2 = "… dropped for …";
export const STARTER_METRIC_1 = "by x%";
export const STARTER_METRIC_2 = "from x% to y%";
// Content-grounded starters (user decision 2026-11-03): each suggestion is a
// real answer to the part's question, predicted from the ORIGINAL bullet's
// own words ({core} = the problem-area phrase taken from the bullet).
export const STARTER_GROUND_NEED_1 = "Users faced {core}.";
export const STARTER_GROUND_NEED_2 = "Users struggled with {core} because … .";
export const STARTER_GROUND_FEATURE_1 = "the {core}";
export const STARTER_GROUND_FEATURE_2 = "the {core} — the part you improved";
export const STARTER_GROUND_ACTION_1 = "I redesigned the {core}.";
export const STARTER_GROUND_ACTION_2 = "I built a fix for the {core}.";
export const STARTER_GROUND_RESULT_1 = "{Core} dropped for users.";
export const STARTER_GROUND_RESULT_2 = "Users no longer face {core}.";
export const PART_LABEL_NEED = "User need or problem";
export const PART_LABEL_FEATURE = "Feature name";
export const PART_LABEL_ACTION = "Specific action";
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
// Phase 18 (spec §13.3): the "Overall score" label and the rubric-version
// header are retired from DISPLAY (the rubric version string stays STORED
// with every score, §3); the panel shows the Experience score only.
export const SCORE_BULLET_LINE = "Bullet {n}: {text}";
export const SCORE_DIMENSION = "  {dimension}: {value}/2";
export const SCORE_OVERALL_HIDDEN =
  "Experience score: not shown yet (no experience with scored bullets).";
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
export const EDIT_BULLET_DONE = "Bullet updated - I'll re-analyze it now.";

// --- SCORE_SHOWN menu ---
export const MENU_SCORE_SHOWN =
  "What next? 1) Edit a bullet 2) Delete a bullet 3) Delete this experience 4) Copy this experience 5) Continue (finish this experience)";

// --- Exit / session ---
export const GOODBYE = "That's it for now. All your data stays on this computer.";
export const PROMPT_CONTINUE = ">";

// --- Errors (ERR_*, FR-014/FR-002/FR-017) ---
export const ERR_TOO_MANY_BULLETS =
  "An experience can hold up to 6 bullets. Keep your best ones - delete or combine the rest.";
export const ERR_NON_ENGLISH_INPUT =
  "This part works in English only - write your answer in English and we'll keep going.";
export const ERR_INVALID_EVALUATOR =
  "Something went wrong on my side. Your data is safe - let me try once more.";
export const ERR_EVALUATOR_FAILURE =
  "I tried twice, but the analysis didn't go through. Your data is unchanged - please try again a bit later.";
export const ERR_MATCHER_FAILURE =
  "I couldn't finish the job-posting analysis this time. Your data is unchanged - please try again later.";
export const ERR_INVALID_TITLE = "Looks like the title is missing - add a short title and we'll continue.";
export const ERR_ENV = "Environment error (for example, PYTHONUTF8 is disabled).";
export const ERR_NO_ENTRY = "We don't have an experience yet - let's add your first one.";
export const ERR_INVALID_CHOICE =
  "That didn't match one of the options - pick one of the numbers shown.";

// --- W4 warm UX (owner look-and-feel 2026-11-05): WEB-ONLY strings — the
// terminal display is frozen, so these intentionally have no Python twin
// (same divergence pattern as the Phase 13/15 sections above). ---
export const ENCOURAGE_SCORED = "Nice work - here's how your experience reads now.";
export const ENCOURAGE_STRONGER = "Nice - this part just got stronger.";
export const FIELD_HINT_TITLE = "For example: \"Product Manager\"";
export const FIELD_HINT_COMPANY = "For example: \"Acme\" or \"Freelance\"";
