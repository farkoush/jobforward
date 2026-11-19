/**
 * Matcher v3 output validator (spec 002 v3, data-model.md invariants
 * V1–V9, contract §4). The model output is UNTRUSTED: this validator
 * accepts or rejects WHOLE — it never edits content and never re-derives
 * prioritization (research R5; prioritization quality is model judgment
 * verified by walkthrough). On ok, the analysis is returned with
 * rules_version stamped from MATCHER_RULES_V2 (never taken from the
 * model) and in-taxonomy soft names canonicalized to their label_en.
 *
 * Outcomes:
 * - ok                       → display the result screen.
 * - contract + failedChecks  → ONE retry with the check list, then refusal
 *                              (ERR_MATCHER_ANALYSIS_FAILURE, §15 UX).
 * - zero_skills              → the fixed extraction-failed message — never
 *                              a verdict (ERR_MATCHER_ZERO_SKILLS).
 *
 * v3 (Task 2, owner rulings 2026-11-16): trait retired (V3/V4/V6); V5 =
 * ambiguous-name precedence via matchSoftName (condition ب); NEW V9 =
 * semantic normalization bound with the versioned closed generalization
 * list + ad_wording verbatim containment (condition ج).
 */

import {
  MatcherAnalysisV2ModelSchema,
} from "../../../lib/schemas";
import { matchSoftName } from "./taxonomy";
import { MATCHER_RULES_V2 } from "./rulesVersion";
import type {
  MatcherAnalysisV2,
  RoleNature,
  SkillItem,
  SkillSource,
  SkillType,
} from "./types";

export type MatcherValidation =
  | { ok: true; analysis: MatcherAnalysisV2 }
  | { ok: false; reason: "contract"; failedChecks: string[] }
  | { ok: false; reason: "zero_skills" };

/** §14 normalization rule: whitespace differences are ignored, everything
 *  else must match character-for-character. */
function wsNormalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function fmtPath(path: Array<string | number>): string {
  let out = "";
  for (const part of path) {
    out += typeof part === "number" ? `[${part}]` : (out ? `.${part}` : part);
  }
  return out;
}

interface ItemLike {
  type: string;
  name: string;
  category: unknown;
  evidence: unknown;
  source: string;
  confidence: unknown;
  in_taxonomy: unknown;
  ad_wording: unknown;
}

const HARD_TYPES: ReadonlySet<string> = new Set(["hard"]);

/** V9 closed generalization list (owner ruling 2026-11-16 — a VERSIONED
 *  constant: adding a word requires owner approval and a rules bump). */
const CLOSED_GENERALIZATION: ReadonlySet<string> = new Set([
  "management",
  "communication",
  "collaboration",
  "coordination",
]);

function words(text: string): string[] {
  return text.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 1);
}

/** Singular-tolerant variants ("stakeholders" → stakeholder). */
function variants(word: string): string[] {
  const out = [word];
  if (word.endsWith("ies") && word.length > 4) out.push(word.slice(0, -3) + "y");
  if (word.endsWith("es") && word.length > 3) out.push(word.slice(0, -2));
  if (word.endsWith("s") && word.length > 2) out.push(word.slice(0, -1));
  return out;
}

export function validateMatcherAnalysisV2(
  input: unknown,
  cleanedPosting: string
): MatcherValidation {
  const checks: string[] = [];

  // Parse failure counts as a failed check (contract §4).
  let value: unknown = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input);
    } catch (exc) {
      return {
        ok: false,
        reason: "contract",
        failedChecks: [
          `output is not valid JSON: ${exc instanceof Error ? exc.message : String(exc)}`,
        ],
      };
    }
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {
      ok: false,
      reason: "contract",
      failedChecks: ["output is not a JSON object"],
    };
  }

  // Shape + enum gate (V6): zod issues map to item-addressed checks.
  const parsed = MatcherAnalysisV2ModelSchema.safeParse(value);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      checks.push(`${fmtPath(issue.path as Array<string | number>)}: ${issue.message}`);
    }
    return { ok: false, reason: "contract", failedChecks: checks };
  }
  const doc = parsed.data;

  const postingNorm = wsNormalize(cleanedPosting);
  const verbatim = (sentence: string): boolean =>
    postingNorm.includes(wsNormalize(sentence));

  // V7 — summary fields present and non-empty (zod covers presence of the
  // six keys and the role_nature enum; emptiness is checked here).
  const summaryFields: Array<[string, string]> = [
    ["job_title", doc.summary.job_title],
    ["seniority", doc.summary.seniority],
    ["work_type", doc.summary.work_type],
    ["domain", doc.summary.domain],
    ["problem_solved", doc.summary.problem_solved],
  ];
  for (const [field, val] of summaryFields) {
    if (!val.trim()) checks.push(`summary.${field} must not be empty`);
  }

  // V1 — evidence verbatim + non-empty (zod already rejects empty arrays).
  const checkItemEvidence = (bucket: string, index: number, evidence: string[]) => {
    evidence.forEach((sentence, i) => {
      if (!verbatim(sentence)) {
        checks.push(
          `${bucket}[${index}].evidence[${i}] is not verbatim in the posting`
        );
      }
    });
  };
  doc.must.forEach((item, i) => checkItemEvidence("must", i, item.evidence));
  doc.preferred.forEach((item, i) => checkItemEvidence("preferred", i, item.evidence));
  doc.bonus.forEach((item, i) => checkItemEvidence("bonus", i, item.evidence));
  doc.red_flags.forEach((flag, i) => {
    flag.evidence.forEach((sentence, j) => {
      if (!verbatim(sentence)) {
        checks.push(
          `red_flags[${i}].evidence[${j}] is not verbatim in the posting`
        );
      }
    });
    if (!flag.text.trim()) {
      checks.push(`red_flags[${i}].text must not be empty`);
    }
  });

  // V4 field rules + V5 taxonomy precedence + V9 normalization bound.
  const canonicalize = (bucket: string, index: number, item: ItemLike) => {
    if (item.type === "soft") {
      if (item.category !== null) {
        checks.push(`${bucket}[${index}].category must be null for soft items`);
      }
      if (item.confidence === null) {
        checks.push(`${bucket}[${index}].confidence must be set for soft items`);
      }
      if (item.in_taxonomy === null) {
        checks.push(`${bucket}[${index}].in_taxonomy must be set for soft items`);
      }
      const match = matchSoftName(item.name);
      if (match.kind === "exact" || match.kind === "single") {
        if (item.in_taxonomy !== true) {
          checks.push(
            `${bucket}[${index}].in_taxonomy must be true — "${item.name}" matches the taxonomy`
          );
        }
        item.name = match.entry.label_en;
        if (item.ad_wording !== null) {
          checks.push(
            `${bucket}[${index}].ad_wording must be null when in_taxonomy is true`
          );
        }
      } else if (match.kind === "ambiguous") {
        checks.push(
          `${bucket}[${index}].name "${item.name}" is an ambiguous taxonomy name — matches multiple skills: ${match.candidates.join(", ")}; use one candidate's exact label_en or set in_taxonomy false with ad_wording`
        );
      } else {
        // no match
        if (item.in_taxonomy !== false) {
          checks.push(
            `${bucket}[${index}].in_taxonomy must be false — "${item.name}" is not in the taxonomy`
          );
        }
        if (item.source !== "explicit") {
          checks.push(
            `${bucket}[${index}]: an implied out-of-taxonomy soft skill must be dropped (source must be "explicit")`
          );
        }
        const adWording = typeof item.ad_wording === "string" ? item.ad_wording : null;
        if (!adWording || !adWording.trim()) {
          checks.push(
            `${bucket}[${index}].ad_wording is required when in_taxonomy is false`
          );
        } else {
          const inEvidence = (item.evidence as string[]).some((s) =>
            wsNormalize(s).includes(wsNormalize(adWording))
          );
          if (!inEvidence) {
            checks.push(
              `${bucket}[${index}].ad_wording is not verbatim inside any evidence sentence`
            );
          }
          // V9 word coverage: every significant name word ∈ witness words
          // ∪ the closed generalization list (singular-tolerant).
          const witnessWords = new Set<string>();
          for (const sentence of item.evidence as string[]) {
            for (const w of words(sentence)) {
              for (const v of variants(w)) witnessWords.add(v);
            }
          }
          for (const w of words(item.name)) {
            const covered = variants(w).some(
              (v) => witnessWords.has(v) || CLOSED_GENERALIZATION.has(v)
            );
            if (!covered) {
              checks.push(
                `${bucket}[${index}].name word "${w}" is neither in the witness sentence nor in the closed generalization list`
              );
            }
          }
        }
      }
    }
    if (item.type === "hard") {
      if (item.category === null) {
        checks.push(`${bucket}[${index}].category must be set for hard items`);
      }
      if (item.confidence !== null) {
        checks.push(`${bucket}[${index}].confidence must be null for hard items`);
      }
      if (item.in_taxonomy !== null) {
        checks.push(`${bucket}[${index}].in_taxonomy must be null for hard items`);
      }
      if (item.ad_wording !== null) {
        checks.push(`${bucket}[${index}].ad_wording must be null for hard items`);
      }
      if (item.source !== "explicit") {
        checks.push(`${bucket}[${index}].source must be "explicit" for hard items`);
      }
    }
  };
  doc.must.forEach((item, i) => canonicalize("must", i, item as unknown as ItemLike));
  doc.preferred.forEach((item, i) =>
    canonicalize("preferred", i, item as unknown as ItemLike)
  );
  doc.bonus.forEach((item, i) => canonicalize("bonus", i, item as unknown as ItemLike));

  // V3 must-gate: a soft item in must requires confidence "high".
  doc.must.forEach((item, i) => {
    if (item.type === "soft" && item.confidence !== "high") {
      checks.push(
        `must[${i}]: soft in must requires confidence "high" (got ${item.confidence})`
      );
    }
  });

  // V2 — no name in two buckets; no name with two types.
  const bucketOf = new Map<string, string>();
  const typeOf = new Map<string, string>();
  const scanName = (bucket: string, items: Array<{ type: string; name: string }>) => {
    items.forEach((item, i) => {
      const key = item.name.toLowerCase();
      const prevBucket = bucketOf.get(key);
      if (prevBucket && prevBucket !== bucket) {
        checks.push(
          `name "${item.name}" appears in two buckets (${prevBucket}, ${bucket}) — cross-bucket duplicates are invalid`
        );
      } else {
        bucketOf.set(key, bucket);
      }
      const prevType = typeOf.get(key);
      if (prevType && prevType !== item.type) {
        checks.push(
          `name "${item.name}" appears with two types (${prevType}, ${item.type})`
        );
      } else {
        typeOf.set(key, item.type);
      }
    });
  };
  scanName("must", doc.must);
  scanName("preferred", doc.preferred);
  scanName("bonus", doc.bonus);

  if (checks.length > 0) {
    return { ok: false, reason: "contract", failedChecks: checks };
  }

  // V8 — a valid contract with all three buckets empty is the zero-skills
  // extraction failure, NOT a contract failure (no retry).
  if (doc.must.length === 0 && doc.preferred.length === 0 && doc.bonus.length === 0) {
    return { ok: false, reason: "zero_skills" };
  }

  const analysis: MatcherAnalysisV2 = {
    summary: {
      job_title: doc.summary.job_title,
      seniority: doc.summary.seniority,
      work_type: doc.summary.work_type,
      domain: doc.summary.domain,
      role_nature: doc.summary.role_nature as RoleNature,
      problem_solved: doc.summary.problem_solved,
    },
    must: doc.must as unknown as SkillItem[],
    preferred: doc.preferred as unknown as SkillItem[],
    bonus: doc.bonus as unknown as SkillItem[],
    red_flags: doc.red_flags,
    rules_version: MATCHER_RULES_V2,
  };
  return { ok: true, analysis };
}

/** Display order inside a bucket (contract §3, R8): hard → soft, explicit
 *  before implied, posting order otherwise (stable sort). */
const TYPE_RANK: Record<SkillType, number> = { hard: 0, soft: 1 };
const SOURCE_RANK: Record<SkillSource, number> = { explicit: 0, implied: 1 };

export function orderBucketForDisplay(items: SkillItem[]): SkillItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        TYPE_RANK[a.item.type] - TYPE_RANK[b.item.type] ||
        SOURCE_RANK[a.item.source] - SOURCE_RANK[b.item.source] ||
        a.index - b.index
    )
    .map(({ item }) => item);
}
