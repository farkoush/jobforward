import { NextRequest, NextResponse } from "next/server";
import { ScoreRequestSchema, ScoreResponseSchema } from "@/lib/schemas";
import { isAuthorized, rateLimited, sessionIdOf } from "@/lib/serverAuth";
import { extractParts } from "@/engine/flow/parts";
import { localEvaluate } from "@/engine/scoring/local";
import {
  EvaluatorOutputError,
  toRatings,
  validateResponse,
} from "@/engine/scoring/evaluator";
import { entryScoreFromRatings } from "@/engine/scoring/metrics";
import { DEFAULT_RUBRIC_VERSION } from "@/engine/types";

/**
 * Deterministic scoring: five-part extraction + local heuristic ratings +
 * entry score. The rating response passes the terminal's shared validity
 * check (validate_response port) before it is returned; on any failure the
 * client gets ERR_EVALUATOR_FAILURE and the data stays intact (FR-014).
 */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const sessionId = sessionIdOf(request);
  if (rateLimited(sessionId)) {
    return NextResponse.json({ ok: false, error: "RATE_LIMITED" }, { status: 429 });
  }
  const body = ScoreRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ ok: false, error: "ERR_INVALID_CHOICE" }, { status: 400 });
  }

  const texts = body.data.texts;
  const parts = texts.map((t) => extractParts(t));
  try {
    const ratings = localEvaluate({
      texts,
      parts,
      rubric_version: DEFAULT_RUBRIC_VERSION,
    });
    // Shared validity check: one rating per bullet, values in {0,1,2}.
    validateResponse(ratings, texts.length);
    const stored = ratings.map(toRatings);
    const score = entryScoreFromRatings(stored);
    const response = ScoreResponseSchema.safeParse({
      ok: true,
      ratings,
      parts,
      entry_score: score,
      rubric_version: DEFAULT_RUBRIC_VERSION,
    });
    if (!response.success) {
      return NextResponse.json({ ok: false, error: "ERR_EVALUATOR_FAILURE" });
    }
    return NextResponse.json(response.data);
  } catch (exc) {
    if (exc instanceof EvaluatorOutputError) {
      return NextResponse.json({ ok: false, error: "ERR_EVALUATOR_FAILURE" });
    }
    return NextResponse.json({ ok: false, error: "ERR_EVALUATOR_FAILURE" });
  }
}
