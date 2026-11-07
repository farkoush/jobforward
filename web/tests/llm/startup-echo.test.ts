import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearGatewayEnv, setGatewayTestEnv } from "./helpers";
import { duplicatedEnvVars } from "@/lib/llm/env-duplicates";

/**
 * §16 FR-58 startup configuration echo: the resolved chains are logged
 * (ids only, ZERO key material) and duplicated env variables are reported
 * WITH line numbers. The hook is contact-free (FR-45). The duplicate
 * detector is exercised as a PURE function — tests never touch the real
 * `.env.local` (owner-owned data).
 */

type NodeEcho = typeof import("@/instrumentation-node");

describe("§16 FR-58 startup echo", () => {
  beforeEach(() => {
    setGatewayTestEnv();
  });
  afterEach(() => {
    clearGatewayEnv();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("logs the resolved chains with ids only — never keys or secrets", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const mod: NodeEcho = await import("@/instrumentation-node");
    await mod.startupEcho();
    const line = log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(line).toContain("GEN=[test-gen-primary, test-gen-fallback-1, test-gen-fallback-2]");
    expect(line).toContain("FAST=[test-fast-primary, test-fast-fallback-1]");
    expect(line).not.toContain("nvapi-");
    expect(line).not.toContain("test-cookie-secret");
    expect(line).not.toContain("test-pass-123");
  });

  it("warns with line numbers for duplicated variables (pure detector)", () => {
    const duplicates = duplicatedEnvVars(
      [
        "# comment",
        "GEN_MODEL=a/first",
        "NVIDIA_API_KEY=nvapi-x",
        "",
        "GEN_MODEL=a/second",
      ].join("\n")
    );
    expect(duplicates).toEqual([{ name: "GEN_MODEL", lines: [2, 5] }]);
  });

  it("returns nothing when every variable is defined once", () => {
    expect(
      duplicatedEnvVars("A=1\nB=2\n# c\nC=3\n")
    ).toEqual([]);
  });

  it("surface a broken config as the named error without throwing", async () => {
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
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const mod: NodeEcho = await import("@/instrumentation-node");
    await expect(mod.startupEcho()).resolves.toBeUndefined();
    expect(error.mock.calls.map((c) => String(c[0])).join("\n")).toContain(
      "config incomplete"
    );
  });
});
