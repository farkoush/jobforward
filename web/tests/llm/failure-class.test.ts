import { describe, expect, it } from "vitest";
import {
  FAILURE_CLASSES,
  failureClass,
  type FailureClass,
} from "@/lib/llm/failure-class";
import { GATEWAY_REASONS } from "@/lib/llm/types";

/**
 * §15 FR-48 failure-class taxonomy: the single source the UI consults.
 * Every GatewayReason maps to exactly one class (or none for the reasons
 * that keep their own handling); ALL_MODELS_FAILED is NO_WAY_FORWARD with
 * Retry kept visible (clarify 2026-11-07).
 */

describe("§15 FR-48 failure-class map", () => {
  it("maps the transient reasons", () => {
    expect(failureClass("SERVICE_BUSY")).toBe("TRANSIENT");
    expect(failureClass("MINUTE_LIMIT")).toBe("TRANSIENT");
    expect(failureClass("RATE_LIMITED")).toBe("TRANSIENT");
    // FR-48 names only INVALID_INPUT/INVALID_TASK/UNAUTHORIZED as classless —
    // INPUT_TOO_LONG is retryable once the user shortens the text.
    expect(failureClass("INPUT_TOO_LONG")).toBe("TRANSIENT");
  });

  it("maps the no-way-forward reasons", () => {
    expect(failureClass("QUOTA_USER")).toBe("NO_WAY_FORWARD");
    expect(failureClass("QUOTA_GLOBAL")).toBe("NO_WAY_FORWARD");
    expect(failureClass("ALL_MODELS_FAILED")).toBe("NO_WAY_FORWARD");
    expect(failureClass("CONFIG_ERROR")).toBe("NO_WAY_FORWARD");
  });

  it("maps the browser-unreachable and own-key reasons", () => {
    expect(failureClass("NETWORK")).toBe("BROWSER_UNREACHABLE");
    expect(failureClass("BYOK_FAILED")).toBe("OWN_KEY");
    expect(failureClass("BYOK_LIMIT")).toBe("OWN_KEY");
  });

  it("leaves input/task/auth reasons without a class (own handling)", () => {
    expect(failureClass("INVALID_INPUT")).toBeNull();
    expect(failureClass("INVALID_TASK")).toBeNull();
    expect(failureClass("UNAUTHORIZED")).toBeNull();
  });

  it("covers the whole GatewayReason union — no reason is forgotten", () => {
    const classes: Array<FailureClass | null> = GATEWAY_REASONS.map(
      (reason) => failureClass(reason)
    );
    expect(classes).toHaveLength(GATEWAY_REASONS.length);
    const classified = GATEWAY_REASONS.filter(
      (reason) => failureClass(reason) !== null
    );
    // INVALID_INPUT/INVALID_TASK/UNAUTHORIZED are the only classless ones.
    expect(classified).toHaveLength(GATEWAY_REASONS.length - 3);
    for (const cls of classes) {
      if (cls !== null) expect(FAILURE_CLASSES).toContain(cls);
    }
  });

  it("exposes exactly the four classes", () => {
    expect(FAILURE_CLASSES).toEqual([
      "TRANSIENT",
      "NO_WAY_FORWARD",
      "BROWSER_UNREACHABLE",
      "OWN_KEY",
    ]);
  });
});
