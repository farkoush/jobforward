import { NextRequest, NextResponse } from "next/server";
import { GateRequestSchema } from "@/lib/schemas";
import { checkPassword, tokenFor } from "@/lib/serverAuth";

export async function POST(request: NextRequest) {
  const body = GateRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ ok: false, error: "ERR_INVALID_CHOICE" }, { status: 400 });
  }
  if (!checkPassword(body.data.password)) {
    return NextResponse.json({ ok: false, error: "WRONG_PASSWORD" }, { status: 401 });
  }
  // The token is a salted hash — the raw password never returns to the client.
  return NextResponse.json({ ok: true, token: tokenFor(body.data.password) });
}
