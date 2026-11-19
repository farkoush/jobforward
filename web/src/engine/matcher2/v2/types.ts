/**
 * Matcher v2 types (spec 002 v2, data-model.md). Web-only — the terminal
 * keeps the v1 matcher2 types. The model output is UNTRUSTED: everything
 * here is what the deterministic validator (validate.ts) accepts or
 * rejects whole; the model never produces rules_version.
 */

export type SkillType = "hard" | "soft";

export type SkillCategory = "technical" | "tool" | "experience" | "domain";

export type SkillSource = "explicit" | "implied";

export type Confidence = "high" | "medium" | "low";

export interface SkillItem {
  type: SkillType;
  name: string;
  /** Non-null only when type === "hard" (invariant V4). */
  category: SkillCategory | null;
  /** At least 1 witness sentence, verbatim in the cleaned posting (V1). */
  evidence: string[];
  /** Hard items are always "explicit"; implied only from the soft pass. */
  source: SkillSource;
  /** Non-null only for soft (invariant V4). */
  confidence: Confidence | null;
  /** Soft only: true when the name matched the taxonomy (canonicalized);
   *  false legal ONLY with source === "explicit" (V5). Hard items null. */
  in_taxonomy: boolean | null;
  /** Soft only: REQUIRED non-empty when in_taxonomy === false — the ad's
   *  original phrase, verbatim inside an evidence sentence (V9). */
  ad_wording: string | null;
}

export type RoleNature = "executive" | "analytical" | "managerial";

export interface SummaryV2 {
  job_title: string;
  seniority: string;
  work_type: string;
  domain: string;
  role_nature: RoleNature;
  problem_solved: string;
}

export type RedFlagKind =
  | "conflict"
  | "unrealistic"
  | "multi_role"
  | "vague"
  | "discriminatory";

export interface RedFlag {
  kind: RedFlagKind;
  text: string;
  /** At least 1 witness sentence, verbatim in the cleaned posting (V1). */
  evidence: string[];
}

export interface MatcherAnalysisV2 {
  summary: SummaryV2;
  must: SkillItem[];
  preferred: SkillItem[];
  bonus: SkillItem[];
  red_flags: RedFlag[];
  /** Stamped by code from MATCHER_RULES_V2 — never sent by the model. */
  rules_version: string;
}

/** Typed failure — the only failure shape the matcher v2 step surfaces. */
export interface MatchFailure {
  error:
    | "ERR_MATCHER_INPUT"
    | "ERR_MATCHER_ANALYSIS_FAILURE"
    | "ERR_MATCHER_ZERO_SKILLS"
    | "ERR_MATCHER_CONSISTENCY";
  failure_class: "TRANSIENT" | "NO_WAY_FORWARD" | "BROWSER_UNREACHABLE" | "OWN_KEY" | null;
  /** Dev-facing only; never fabricated into user text (P16). */
  detail: string;
}
