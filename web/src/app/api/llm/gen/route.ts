import { NextRequest, NextResponse } from "next/server";
import { isAuthorized, sessionIdOf } from "@/lib/serverAuth";
import { runGenGateway } from "@/lib/llm/gateway";
import { failure } from "@/lib/llm/types";

/**
 * GEN gateway route (contracts/llm-api.md): NDJSON stream — chunk* → done |
 * error, always typed, never throws. The gateway's own 60 s deadline always
 * beats this 90 s platform backstop (no 504 endings, SC-009).
 */
export const maxDuration = 90;

function ndjsonEvent(event: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

function errorStream(event: unknown): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(ndjsonEvent(event));
      controller.close();
    },
  }), { headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } });
}

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
    return errorStream({ type: "error", ...failure("INVALID_INPUT") });
  }
  const events = runGenGateway(
    { task, input, system: typeof system === "string" ? system : undefined },
    {
      identity: sessionIdOf(request),
      byokKey: request.headers.get("x-byok-key"),
      byokModel: request.headers.get("x-byok-model"),
    }
  );
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of events) {
          controller.enqueue(ndjsonEvent(event));
        }
      } catch {
        // Belt and braces — the generator never throws, but the stream must
        // always end with a typed event (FR-23).
        controller.enqueue(
          ndjsonEvent({ type: "error", ...failure("NETWORK", { retryable: true }) })
        );
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
