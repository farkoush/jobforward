import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearGatewayEnv, setGatewayTestEnv } from "./helpers";

/**
 * §15 FR-45/46/52 connection check: POST /api/llm/check is content-free,
 * always typed JSON (never HTML, no model names, no keys), and classifies
 * config errors vs provider unreachability. The client maps one failure to
 * needs-retry and repeated failures to unavailable (R14).
 *
 * All stateful modules are imported DYNAMICALLY inside each test — vi.reset
 * Modules() in afterEach creates fresh instances, and static bindings would
 * silently point at the stale registry.
 */

type RouteModule = typeof import("@/app/api/llm/check/route");
type GateModule = typeof import("@/lib/llm/gate");
type ValidateModule = typeof import("@/lib/llm/validate-models");

function modelsResponse(ids: string[]) {
  return new Response(JSON.stringify({ data: ids.map((id) => ({ id })) }), {
    status: 200,
  });
}

describe("POST /api/llm/check (§15)", () => {
  beforeEach(() => {
    setGatewayTestEnv();
  });
  afterEach(() => {
    clearGatewayEnv();
    delete process.env.LLM_MOCK;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function modules(): Promise<[RouteModule, GateModule, ValidateModule]> {
    return [
      await import("@/app/api/llm/check/route"),
      await import("@/lib/llm/gate"),
      await import("@/lib/llm/validate-models"),
    ];
  }

  function request(cookie: string | null): NextRequest {
    return new NextRequest("http://localhost/api/llm/check", {
      method: "POST",
      headers:
        cookie === null
          ? { "content-type": "application/json" }
          : { "content-type": "application/json", cookie },
    });
  }

  function authedCookie(gate: GateModule): string {
    return `${gate.GATE_COOKIE_NAME}=${gate.signGateCookie("anon-1")}`;
  }

  it("rejects an unauthorized request with typed JSON 401", async () => {
    const [route] = await modules();
    const response = await route.POST(request(null));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ ok: false, error: "UNAUTHORIZED" });
  });

  it("reports available when the provider list answers and chains stay valid", async () => {
    const [route, gate, vm] = await modules();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        modelsResponse(["test-gen-primary", "test-fast-primary"])
      )
    );
    const response = await route.POST(request(authedCookie(gate)));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      state: "available",
      configOk: true,
      chains: { GEN: 1, FAST: 1 },
    });
    expect(typeof body.checkedAt).toBe("string");
    expect(body.consecutiveFailures).toBe(0);
    // Applied chains updated for the first analysis action (FR-46).
    expect(vm.getAppliedChains()).toEqual({
      GEN: ["test-gen-primary"],
      FAST: ["test-fast-primary"],
    });
  });

  it("reports unavailable (configOk:true) when the provider is unreachable", async () => {
    const [route, gate] = await modules();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      })
    );
    const response = await route.POST(request(authedCookie(gate)));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      state: "unavailable",
      configOk: true,
      chains: { GEN: 0, FAST: 0 },
    });
    expect(body.consecutiveFailures).toBe(1);
  });

  it("reports unavailable (configOk:false) when the free-path config is broken", async () => {
    const [route, gate] = await modules();
    for (const key of [
      "NVIDIA_API_KEY",
      "NVIDIA_BASE_URL",
      "GEN_MODEL",
      "GEN_FALLBACKS",
      "FAST_MODEL",
      "FAST_FALLBACKS",
    ]) {
      delete process.env[key];
    }
    const response = await route.POST(request(authedCookie(gate)));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      state: "unavailable",
      configOk: false,
      chains: { GEN: 0, FAST: 0 },
    });
  });

  it("response is content-free: no model names, no keys, no env values (P14)", async () => {
    const [route, gate] = await modules();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        modelsResponse(["test-gen-primary", "test-fast-primary"])
      )
    );
    const response = await route.POST(request(authedCookie(gate)));
    const raw = JSON.stringify(await response.json());
    expect(raw).not.toContain("test-gen-primary");
    expect(raw).not.toContain("test-fast-primary");
    expect(raw).not.toContain("nvapi-test-key-not-real");
    expect(raw).not.toContain("NVIDIA");
  });

  it("LLM_MOCK=true answers available without contacting the provider", async () => {
    const [route, gate] = await modules();
    process.env.LLM_MOCK = "true";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const response = await route.POST(request(authedCookie(gate)));
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      state: "available",
      configOk: true,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("never throws HTML: an unexpected crash inside the check returns typed JSON 500", async () => {
    const [, gate] = await modules();
    vi.doMock("@/lib/llm/validate-models", async (importOriginal) => {
      const actual =
        await importOriginal<typeof import("@/lib/llm/validate-models")>();
      return {
        ...actual,
        runConnectionCheck: async () => {
          throw new Error("unexpected crash");
        },
      };
    });
    vi.resetModules();
    const [route] = await modules();
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const response = await route.POST(request(authedCookie(gate)));
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ ok: false, error: "CONFIG_ERROR" });
    } finally {
      spy.mockRestore();
    }
  });
});
