import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/serverAuth";
import { runConnectionCheck } from "@/lib/llm/validate-models";

/**
 * §15 FR-45/46/52 — the content-free connection check. The ONLY provider
 * contact outside analysis stages (owner-approved exception): fired once per
 * browser session from the menu screen and on explicit "Check again". The
 * response is ALWAYS typed JSON — no model names, no keys, no env values,
 * never HTML (P14, FR-52); the named cause stays in the server log (P19).
 */
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  try {
    const check = await runConnectionCheck();
    return NextResponse.json({ ok: true, ...check });
  } catch (exc) {
    // Unexpected crash (FR-23): still typed JSON, never an HTML error page.
    console.error("[llm] connection check crashed:", exc instanceof Error ? exc.message : exc);
    return NextResponse.json({ ok: false, error: "CONFIG_ERROR" }, { status: 500 });
  }
}
