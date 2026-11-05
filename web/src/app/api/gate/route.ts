import { NextRequest, NextResponse } from "next/server";
import { GateRequestSchema } from "@/lib/schemas";
import { checkPassword, tokenFor } from "@/lib/serverAuth";
import {
  gateCookieHeader,
  ipOf,
  loginLimited,
  newAnonymousId,
  signGateCookie,
} from "@/lib/llm/gate";

/**
 * Shared-password entry gate (FR-36). On success the server sets the signed,
 * httpOnly, persistent anonymous-identity cookie (FR-18) — no token is
 * returned to the client and the raw password never leaves the request body.
 * Wrong attempts are limited to 5/minute/IP (platform metadata only).
 */
export async function POST(request: NextRequest) {
  const body = GateRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ ok: false, error: "ERR_INVALID_CHOICE" }, { status: 400 });
  }
  if (!checkPassword(body.data.password)) {
    const limited = await loginLimited(ipOf(request));
    // Identical body either way — the UI shows one Persian message and no
    // rate-limit internals are revealed.
    return NextResponse.json(
      { ok: false, error: "WRONG_PASSWORD" },
      { status: limited ? 429 : 401 }
    );
  }
  // The body keeps the legacy token field during the client transition
  // (T011); authorization itself now rides on the httpOnly cookie.
  const response = NextResponse.json({ ok: true, token: tokenFor(body.data.password) });
  response.headers.append("Set-Cookie", gateCookieHeader(signGateCookie(newAnonymousId())));
  return response;
}
