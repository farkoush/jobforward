import { NextRequest, NextResponse } from "next/server";
import { LogEventSchema } from "@/lib/schemas";
import { appendEvent } from "@/lib/logStore";
import { isAuthorized, rateLimited, sessionIdOf } from "@/lib/serverAuth";

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const sessionId = sessionIdOf(request);
  if (rateLimited(sessionId)) {
    return NextResponse.json({ ok: false, error: "RATE_LIMITED" }, { status: 429 });
  }
  const body = await request.json().catch(() => null);
  const parsed = LogEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  appendEvent(parsed.data);
  return NextResponse.json({ ok: true });
}
