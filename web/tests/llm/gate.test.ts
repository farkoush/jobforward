import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  clearGatewayEnv,
  setGatewayTestEnv,
} from "./helpers";

describe("gate — signed cookie sessions (FR-18/36)", () => {
  beforeEach(() => {
    setGatewayTestEnv();
  });
  afterEach(() => {
    clearGatewayEnv();
    vi.useRealTimers();
    vi.resetModules();
  });

  async function gateModule() {
    return import("@/lib/llm/gate");
  }

  it("round-trips a signed cookie value and returns the anonymous id", async () => {
    const gate = await gateModule();
    const value = gate.signGateCookie("anon-1");
    expect(gate.verifyGateCookie(value)).toBe("anon-1");
  });

  it("rejects a tampered or expired cookie", async () => {
    const gate = await gateModule();
    const value = gate.signGateCookie("anon-1");
    const [id, expiry, mac] = value.split(".");
    expect(gate.verifyGateCookie(`${id}.${expiry}.${"0".repeat(64)}`)).toBeNull();
    expect(gate.verifyGateCookie(`${id}.1.${mac}`)).toBeNull();
    expect(gate.verifyGateCookie(undefined)).toBeNull();
    expect(gate.verifyGateCookie("garbage")).toBeNull();
  });

  it("isAuthorized accepts a valid cookie and rejects an invalid one", async () => {
    const gate = await gateModule();
    const serverAuth = await import("@/lib/serverAuth");
    const cookie = gate.signGateCookie("anon-42");
    const okReq = new NextRequest("http://localhost/api/llm/fast", {
      method: "POST",
      headers: { cookie: `${gate.GATE_COOKIE_NAME}=${cookie}` },
    });
    const badReq = new NextRequest("http://localhost/api/llm/fast", {
      method: "POST",
      headers: { cookie: `${gate.GATE_COOKIE_NAME}=nope` },
    });
    expect(serverAuth.isAuthorized(okReq)).toBe(true);
    expect(serverAuth.isAuthorized(badReq)).toBe(false);
  });

  it("limits failed logins to 5 per minute per IP", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T10:00:00Z"));
    const gate = await gateModule();
    const results: boolean[] = [];
    for (let i = 0; i < 7; i++) {
      results.push(await gate.loginLimited("1.2.3.4"));
    }
    // First 5 counted attempts are allowed, the 6th and 7th are limited.
    expect(results).toEqual([false, false, false, false, false, true, true]);
    // A different IP is unaffected.
    expect(await gate.loginLimited("5.6.7.8")).toBe(false);
    // Next minute: the window resets.
    vi.setSystemTime(new Date("2026-11-06T10:01:30Z"));
    expect(await gate.loginLimited("1.2.3.4")).toBe(false);
  });
});
