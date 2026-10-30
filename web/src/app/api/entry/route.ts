import { NextRequest, NextResponse } from "next/server";
import { AddEntryRequestSchema } from "@/lib/schemas";
import { isAuthorized, rateLimited, sessionIdOf } from "@/lib/serverAuth";
import { addEntry } from "@/engine/flow/pathService";

/** Entry recording with the terminal's server-side checks (VR-1 six-bullet
 * cap, VR-8 English boundary). Validation failures return the terminal's
 * error ids so the UI shows the exact same friendly texts and lets the
 * user retry. */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const sessionId = sessionIdOf(request);
  if (rateLimited(sessionId)) {
    return NextResponse.json({ ok: false, error: "RATE_LIMITED" }, { status: 429 });
  }
  const body = AddEntryRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ ok: false, error: "ERR_INVALID_CHOICE" }, { status: 400 });
  }
  const result = addEntry(body.data.type, body.data.title, body.data.bullets);
  if (result.error) {
    return NextResponse.json({ ok: false, error: result.error });
  }
  return NextResponse.json({
    ok: true,
    entry: result.entry,
    is_draft: result.is_draft,
  });
}
