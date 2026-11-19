/**
 * Matcher v2 UI strings (spec 002 v2, contract §6 — English B1, pinned).
 * WEB-ONLY module, deliberately OUTSIDE engine/messages.ts: that file is
 * py+ts parity-locked with the FROZEN terminal (matcher-rules-1.0.0), and
 * v2 has no terminal twin. Exact strings per the analyze A1 remediation —
 * no "-style" discretion left to the implementer.
 */

export const MATCH_V2_SUMMARY_HEADING = "Summary";
export const MATCH_V2_LABEL_JOB_TITLE = "Job title";
export const MATCH_V2_LABEL_SENIORITY = "Seniority";
export const MATCH_V2_LABEL_WORK_TYPE = "Work type";
export const MATCH_V2_LABEL_DOMAIN = "Domain";
export const MATCH_V2_LABEL_ROLE_NATURE = "Role nature";
export const MATCH_V2_LABEL_PROBLEM = "Problem this role solves";

export const MATCH_V2_BUCKET_MUST = "Must have";
export const MATCH_V2_BUCKET_PREFERRED = "Preferred";
export const MATCH_V2_BUCKET_BONUS = "Bonus";

export const MATCH_V2_TYPE_HARD = "Hard";
export const MATCH_V2_TYPE_SOFT = "Soft";
export const MATCH_V2_NOT_IN_TAXONOMY = "not in the 56-skill list";
export const MATCH_V2_AD_WORDING_LABEL = "Ad wording";

export const MATCH_V2_SOURCE_EXPLICIT = "Explicit";
export const MATCH_V2_SOURCE_IMPLIED = "Implied";
export const MATCH_V2_CONFIDENCE_HIGH = "High confidence";
export const MATCH_V2_CONFIDENCE_MEDIUM = "Medium confidence";
export const MATCH_V2_CONFIDENCE_LOW = "Low confidence";

export const MATCH_V2_RED_FLAGS_HEADING = "Red flags";
export const MATCH_V2_REDFLAG_CONFLICT = "Conflict";
export const MATCH_V2_REDFLAG_UNREALISTIC = "Unrealistic";
export const MATCH_V2_REDFLAG_MULTI_ROLE = "Several roles in one posting";
export const MATCH_V2_REDFLAG_VAGUE = "Vague duties";
export const MATCH_V2_REDFLAG_DISCRIMINATORY = "Discriminatory phrasing";

/** §5 refusal — rendered ONLY inside the §15 NO_WAY_FORWARD UX (GuidanceBox
 *  with the ALL_MODELS_FAILED class), never as a result or verdict. */
export const MATCH_V2_ERR_ANALYSIS_FAILURE =
  "The posting analysis failed the output quality check after one retry. Nothing was changed — you can retry, or use your own key.";

/** FIX-2 (spec 002 Task 1, owner OK 2026-11-16): the distinct taxonomy-
 *  failure message for error id ERR_MATCHER_TAXONOMY. Lives in this web-only
 *  module because engine/messages.ts is py+ts parity-locked with the FROZEN
 *  terminal and this error exists on the web surface only. */
export const MATCH_V2_ERR_TAXONOMY =
  "The skill list could not be loaded. Please try again — the problem is on our side.";
