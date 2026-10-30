/**
 * Zod schemas for every API boundary — the web equivalents of the terminal's
 * validation code (models/entities.py dataclass invariants, evaluator
 * validate_response, matcher gates). Every request and every engine result
 * passes through these before use; on failure the client gets a short
 * friendly error and can retry (Rule 3).
 */

import { z } from "zod";

export const RATING_VALUES = [0, 1, 2] as const;

export const RatingsSchema = z.object({
  context: z.number().int().refine((v) => (RATING_VALUES as readonly number[]).includes(v)),
  role_action_clarity: z
    .number()
    .int()
    .refine((v) => (RATING_VALUES as readonly number[]).includes(v)),
  result: z.number().int().refine((v) => (RATING_VALUES as readonly number[]).includes(v)),
});

export const ExperienceEntryTypeSchema = z.enum([
  "job",
  "project",
  "course",
  "side_work",
]);

export const QuestionDimensionSchema = z.enum([
  "context",
  "feature",
  "role_action_clarity",
  "result",
  "metric",
]);

// --- /api/entry (VR-1 fires below via the engine port; zod accepts more
// than 6 only so the specific ERR_TOO_MANY_BULLETS message can be returned) ---
export const AddEntryRequestSchema = z.object({
  type: ExperienceEntryTypeSchema,
  title: z.string(),
  bullets: z.array(z.string()).max(60),
});

// --- /api/score ---
export const ScoreRequestSchema = z.object({
  texts: z.array(z.string()).min(1).max(6),
});

export const BulletPartsSchema = z.object({
  user_need: z.string(),
  product_feature: z.string(),
  action: z.string(),
  result: z.string(),
  metric: z.string(),
});

export const BulletRatingSchema = z.object({
  bullet_index: z.number().int().nonnegative(),
  context: z.number().int().refine((v) => (RATING_VALUES as readonly number[]).includes(v)),
  role_action_clarity: z
    .number()
    .int()
    .refine((v) => (RATING_VALUES as readonly number[]).includes(v)),
  result: z.number().int().refine((v) => (RATING_VALUES as readonly number[]).includes(v)),
});

export const ScoreResponseSchema = z.object({
  ok: z.literal(true),
  ratings: z.array(BulletRatingSchema),
  parts: z.array(BulletPartsSchema),
  entry_score: z.number().nullable(),
  rubric_version: z.string(),
});

// --- /api/rewrite ---
export const AssembleRewriteRequestSchema = z.object({
  bullet_text: z.string(),
  answers: z.array(
    z.object({
      dimension: QuestionDimensionSchema,
      answer: z.string().min(1),
    })
  ),
});

// --- /api/matcher ---
export const AnalyzePostingRequestSchema = z.object({
  posting_text: z.string().min(1),
});

export const HardSkillRowSchema = z.object({
  name: z.string(),
  type: z.enum(["hard", "hard_tool"]),
  priority: z.enum(["must", "should", "nice"]),
  default_priority: z.boolean(),
  evidence: z.string(),
  order: z.number().int(),
  is_one_of: z.boolean(),
  alternatives: z.array(z.string()).nullable(),
});

export const SoftSkillRowSchema = z.object({
  label_en: z.string(),
  group_code: z.string(),
  id: z.string(),
  evidence: z.string(),
  reason: z.string().nullable(),
  priority: z.enum(["must", "should", "nice"]),
  certainty: z.enum(["explicit", "inferred"]),
  order: z.number().int(),
});

export const UnmatchedConceptSchema = z.object({
  text: z.string(),
  note: z.string(),
});

export const AnalysisReportSchema = z.object({
  hard_tables: z.record(z.array(HardSkillRowSchema)),
  soft_rows: z.array(SoftSkillRowSchema),
  unmatched: z.array(UnmatchedConceptSchema),
  dropped_count: z.number().int().nonnegative(),
  rules_version: z.string(),
  hard_totals: z.record(z.number().int()),
  soft_total: z.number().int(),
  consistency_ok: z.boolean(),
});

// --- /api/log (additive instrumentation; never any secret) ---
export const LogEventSchema = z.object({
  session_id: z.string().min(1),
  step: z.string().min(1),
  timestamp: z.string(),
  ms_since_last: z.number().nullable(),
  choice: z.string().nullable(),
  detail: z.record(z.unknown()).nullable(),
});

// --- gate ---
export const GateRequestSchema = z.object({
  password: z.string(),
});
