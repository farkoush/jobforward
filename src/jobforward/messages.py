"""Single source of truth for all user-facing Persian strings (constitution Principle 10).

No other module may contain user-facing Persian strings. The CLI imports prompts
from here and never hardcodes Persian. Every prompt id is printed alongside its
interaction so logs and tests stay comparable (research R-5).

Prompt-id categories (contracts/interface-contracts.md):
  ADD_*        - entry field collection (type, title, org, start, end, bullets)
  Q_RESULT_HINT- text shown next to the result field (FR-004)
  ASK_*        - question prompt + numbered answer/reject/skip choices (FR-009)
  PROPOSAL_*   - proposed rewrite + numbered approve/reject (FR-011)
  MERGE_WARN   - overlap warning + numbered merge/no-merge (FR-013)
  CONFIRM_DELETE_* - deletion confirmation (Clarification Q3)
  SCORE_*      - per-dimension per-bullet, experience, overall display (FR-005/FR-008)
  ERR_*        - explicit Persian error prompts; data survives every error (FR-014)
"""

# --- Entry collection (ADD_*) ---
ADD_TYPE = "نوع تجربه را انتخاب کنید: ۱) شغلی ۲) پروژه‌ای ۳) دوره ۴) کارهای جانبی"
ADD_TITLE = "عنوان تجربه را وارد کنید:"
ADD_ORG = "نام سازمان (اختیاری، می‌توانید خالی بگذارید):"
ADD_START = "تاریخ شروع (نوشتهٔ دقیق شما، اختیاری):"
ADD_END = "تاریخ پایان (نوشتهٔ دقیق شما، اختیاری):"
ADD_BULLET_PROMPT = "یک نقشه برای این تجربه بنویسید (حداکثر ۶ مورد):"
ADD_BULLET_DONE = "اتمام وارد کردن نقشه‌ها و ادامه به نمرات."

# --- Result field hint (Q_RESULT_HINT, FR-004) ---
Q_RESULT_HINT = "اگر عدد واقعی داری، همان را اضافه کن"

# --- Questions (ASK_*, FR-009, Clarification Q1) ---
ASK_RESULT_IMPACT = "آیا این پروژه/کار تغییر ایجاد کرد؟ (۱) پاسخ و ادامه ۲) رد سوال ۳) رد و استمرار"
ASK_SKILL_RELEVANCE = "چه مهارتی در این مورد نشان داده می‌شود؟ (۱) پاسخ و ادامه ۲) رد سوال ۳) رد و استمرار"

# --- Proposal (PROPOSAL_*, FR-011) ---
PROPOSAL_SHOW = "تغییر پیشنهادی برای نقشه‌ی بالا:\n{proposal}\n(۱) تایید و جایگزینی ۲) رد و عدم تغییر"
PROPOSAL_ACCEPTED = "تغییر تایید شد؛ متن قبلی در تاریخچه حفظ شد."
PROPOSAL_REJECTED = "تغییر رد شد؛ متن و نمرات بدون تغییر باقی مانده‌اند."

# --- Merge warning (MERGE_WARN, FR-013) ---
MERGE_WARN = "دو یا بیشتر نقشه با هم هم‌پوشانی دارند. نمرات تحت تاثیر قرار نمی‌گیرند. (۱) ادغام ۲) عدم ادغام و ادامه"

# --- Delete confirmation (CONFIRM_DELETE_*, Clarification Q3) ---
CONFIRM_DELETE_BULLET = "آیا از حذف این نقشه اطمینان دارید؟ (۱) بله، حذف شود ۲) خیر"
CONFIRM_DELETE_ENTRY = "تمام نقشه‌های این تجربه حذف شدند. تجربه به حالت پیش‌نویس بازمی‌گردد."

# --- Scores (SCORE_*, FR-005/FR-008) ---
SCORE_BULLET_HEADER = "نمرات نقشه «{text}» (نوسخه {rubric}):"
SCORE_DIMENSION = "  {dimension}: {value}/۲"
SCORE_EXPERIENCE = "نمره تجربه: {value}/۱۰۰"
SCORE_OVERALL = "نمره کلی: {value}/۱۰۰"
SCORE_BEFORE_AFTER = "قبلاً: {before}  →  بعداً: {after}"

# --- Errors (ERR_*, FR-014) ---
ERR_TOO_MANY_BULLETS = "حداکثر ۶ نقشه مجاز است. لطفاً لیست را کوتاه‌تر کنید."
ERR_INVALID_EVALUATOR = "پاسخ ارزیاب نامعتبر است؛ یک بار دوباره تلاش می‌شود، سپس خطا گزارش می‌گردد. داده‌های شما تغییر نمی‌کنند."
ERR_EVALUATOR_FAILURE = "ارزیاب بعد از یک تلاش ناموفق ماند؛ خطا به کاربر گزارش شد و سند ذخیره شده تغییر نمی‌کند."
ERR_ENV = "خطای محیط (مثلاً PYTHONUTF8 غیرفعال است)."
