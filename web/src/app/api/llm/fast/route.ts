import { NextRequest, NextResponse } from "next/server";
import { isAuthorized, sessionIdOf } from "@/lib/serverAuth";
import { runFastGateway } from "@/lib/llm/gateway";
import { parseMockScenario } from "@/lib/llm/client";
import { mockEnabled } from "@/lib/llm/config";
import { failure } from "@/lib/llm/types";

/**
 * FAST gateway route (contracts/llm-api.md): one-shot JSON in/out, typed
 * result on every outcome, never throws. The platform timeout is a hard
 * backstop the gateway's own deadline (20 s) always beats.
 */
export const maxDuration = 40;

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ...failure("UNAUTHORIZED") }, { status: 401 });
  }
  const body: unknown = await request.json().catch(() => null);
  const task =
    body && typeof body === "object" && typeof (body as { task?: unknown }).task === "string"
      ? (body as { task: string }).task
      : null;
  const input =
    body && typeof body === "object" && typeof (body as { input?: unknown }).input === "string"
      ? (body as { input: string }).input
      : null;
  const system =
    body && typeof body === "object"
      ? (body as { context?: { system?: unknown } }).context?.system
      : undefined;
  if (!task || input === null) {
    return NextResponse.json({ ...failure("INVALID_INPUT") });
  }
  const outcome = await runFastGateway(
    { task, input, system: typeof system === "string" ? system : undefined },
    {
      identity: sessionIdOf(request),
      byokKey: request.headers.get("x-byok-key"),
      byokModel: request.headers.get("x-byok-model"),
      // Dev-only (FR-38): read only when mock mode is enabled; always null
      // in production.
      mockError: mockEnabled()
        ? parseMockScenario(request.headers.get("x-mock-error"))
        : null,
    }
  );
  return NextResponse.json(outcome);
}
