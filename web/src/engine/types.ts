/**
 * Data-model entities — verbatim port of src/jobforward/models/entities.py
 * (rubric-3.0.0). Invariants enforced here match the Python dataclasses.
 */

export type ExperienceEntryType = "job" | "project" | "course" | "side_work";
export const EXPERIENCE_ENTRY_TYPES: ExperienceEntryType[] = [
  "job",
  "project",
  "course",
  "side_work",
];

export type BulletStatus = "new" | "analyzed" | "edited";

export type ProposalDecision = "approved" | "rejected" | "awaiting";
export type GateDecision = "accepted" | "rejected";

export type QuestionDimension =
  | "context"
  | "feature"
  | "role_action_clarity"
  | "result"
  | "metric";

export type DraftReason = "no_bullets" | "user_saved";

export type EntrySource = "manual";

export const DEFAULT_RUBRIC_VERSION = "rubric-3.0.0";

/** Three per-dimension scores, each int in {0,1,2} (rubric-3.0.0). */
export interface Ratings {
  context: number;
  role_action_clarity: number;
  result: number;
}

export function assertRatings(r: Ratings): void {
  for (const name of ["context", "role_action_clarity", "result"] as const) {
    const value = r[name];
    if (![0, 1, 2].includes(value)) {
      throw new Error(`Ratings.${name} must be in {0, 1, 2}, got ${value}`);
    }
  }
}

export const PART_NAMES = [
  "user_need",
  "product_feature",
  "action",
  "result",
  "metric",
] as const;
export type PartName = (typeof PART_NAMES)[number];

/** The five framework parts extracted from one bullet (verbatim substrings). */
export interface BulletParts {
  user_need: string;
  product_feature: string;
  action: string;
  result: string;
  metric: string;
}

export function partsPresent(p: BulletParts): Record<PartName, boolean> {
  const out = {} as Record<PartName, boolean>;
  for (const name of PART_NAMES) out[name] = Boolean(p[name].trim());
  return out;
}

export interface QuestionRecord {
  dimension: QuestionDimension;
  text: string;
  round: number;
  gate_answer: GateDecision;
  answer: string | null;
  skipped: boolean;
  answered_at: string | null;
  skipped_at: string | null;
}

export interface ProposalRecord {
  text: string;
  decision: ProposalDecision;
  decided_at: string | null;
}

export interface BulletHistory {
  text: string;
  ratings: Ratings | null;
  rubric_version: string | null;
  replaced_at: string;
}

export interface Bullet {
  id: number;
  text: string;
  status: BulletStatus;
  ratings: Ratings | null;
  rubric_version: string | null;
  history: BulletHistory[];
  questions: QuestionRecord[];
  proposals: ProposalRecord[];
  merge_warned: boolean;
  user_need: string | null;
  product_feature: string | null;
  action: string | null;
  result: string | null;
  metric: string | null;
  part_present: Record<PartName, boolean> | null;
}

/** Stored parts, or a fresh extraction for pre-Phase-10 bullets. */
export function partsOrExtract(bullet: Bullet, extract: (t: string) => BulletParts): BulletParts {
  if (bullet.part_present !== null && bullet.user_need !== null) {
    return {
      user_need: bullet.user_need || "",
      product_feature: bullet.product_feature || "",
      action: bullet.action || "",
      result: bullet.result || "",
      metric: bullet.metric || "",
    };
  }
  return extract(bullet.text);
}

export interface ExperienceEntry {
  id: number;
  type: ExperienceEntryType;
  title: string;
  bullets: Bullet[];
  draft_reason: DraftReason | null;
  source: EntrySource;
  entry_score: number | null;
  rubric_version: string | null;
  deleted: boolean;
}

/** Draft iff no bullets (FR-003) or the user saved it as a draft. */
export function isDraft(entry: ExperienceEntry): boolean {
  return entry.bullets.length === 0 || entry.draft_reason === "user_saved";
}

export function saveAsDraft(entry: ExperienceEntry): void {
  entry.draft_reason = "user_saved";
}

export function addHistory(bullet: Bullet, replacedAt: string): void {
  bullet.history.push({
    text: bullet.text,
    ratings: bullet.ratings,
    rubric_version: bullet.rubric_version,
    replaced_at: replacedAt,
  });
}

/** VR-2: overall-score eligibility (storage/schema.py is_eligible_for_overall). */
export function isEligibleForOverall(entry: ExperienceEntry): boolean {
  if (entry.deleted || isDraft(entry)) return false;
  return entry.bullets.length > 0 && entry.bullets.every((b) => b.ratings !== null);
}

export function nowIso8601(): string {
  return new Date().toISOString();
}
