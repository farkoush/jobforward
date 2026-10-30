import { NextRequest, NextResponse } from "next/server";
import { AssembleRewriteRequestSchema } from "@/lib/schemas";
import { isAuthorized, rateLimited, sessionIdOf } from "@/lib/serverAuth";
import { ExtraClaimError, assembleRewrite } from "@/engine/flow/rewrite";
import { QuestionDimension } from "@/engine/types";

/**
 * Rewrite assembly from allowed sources only (FR-010, zero tolerance).
 * A refused assembly is never shown: the client receives
 * ERR_EVALUATOR_FAILURE exactly like the terminal's proposal flow.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const sessionId = sessionIdOf(request);
  if (rateLimited(sessionId)) {
    return NextResponse.json({ ok: false, error: "RATE_LIMITED" }, { status: 429 });
  }
  const body = AssembleRewriteRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ ok: false, error: "ERR_INVALID_CHOICE" }, { status: 400 });
  }
  const answers: Partial<Record<QuestionDimension, string>> = {};
  for (const { dimension, answer } of body.data.answers) {
    answers[dimension] = answer;
  }
  try {
    const proposal = assembleRewrite(body.data.bullet_text, answers);
    return NextResponse.json({ ok: true, proposal });
  } catch (exc) {
    if (exc instanceof ExtraClaimError) {
      return NextResponse.json({ ok: false, error: "ERR_EVALUATOR_FAILURE" });
    }
    return NextResponse.json({ ok: false, error: "ERR_EVALUATOR_FAILURE" });
  }
}
