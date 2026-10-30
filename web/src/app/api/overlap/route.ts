import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthorized, rateLimited, sessionIdOf } from "@/lib/serverAuth";
import { findOverlaps } from "@/engine/scoring/overlap";

const OverlapRequestSchema = z.object({
  texts: z.array(z.string()).min(1).max(6),
});

/** Bullet overlap detection for the merge warning (FR-013). */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const sessionId = sessionIdOf(request);
  if (rateLimited(sessionId)) {
    return NextResponse.json({ ok: false, error: "RATE_LIMITED" }, { status: 429 });
  }
  const body = OverlapRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ ok: false, error: "ERR_INVALID_CHOICE" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, pairs: findOverlaps(body.data.texts) });
}
