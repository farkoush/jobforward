import { describe, expect, it } from "vitest";
import { ACTION_USE_MY_OWN_KEY, BANNER_FREE_SERVICE, BANNER_YOUR_KEY, BYOK_QUICK_SAVE, BYOK_QUICK_TITLE, GATEWAY_MESSAGES, GATE_SERVICE_UNAVAILABLE, GUIDANCE_BY_CLASS, RESEND_WITH_DEFAULT, RETRY_ASK, STATUS_AVAILABLE, STATUS_CHECKING, STATUS_NEEDS_RETRY, STATUS_UNAVAILABLE, TRANSFER_EXPLANATION } from "@/lib/llm/messages";
import { FAILURE_CLASSES, failureClass } from "@/lib/llm/failure-class";
import { GATEWAY_REASONS } from "@/lib/llm/types";

/**
 * §15 guard tests (T071): the gate text NEVER mentions AI (FR-47); every
 * failure class has a guidance line; every classified reason's gateway
 * message and its class guidance exist and stay icon-free (§11 rule 1).
 */

const EMOJI = /\p{Extended_Pictographic}/u;

describe("§15 guidance guards", () => {
  it("the gate failure text never mentions AI (FR-47)", () => {
    expect(GATE_SERVICE_UNAVAILABLE).not.toMatch(/\bAI\b/i);
    expect(GATE_SERVICE_UNAVAILABLE).not.toMatch(/model|provider|NVIDIA|OpenRouter/i);
  });

  it("every failure class has a non-empty guidance line (FR-49)", () => {
    for (const cls of FAILURE_CLASSES) {
      const line = GUIDANCE_BY_CLASS[cls];
      expect(typeof line).toBe("string");
      expect(line.length).toBeGreaterThan(10);
      expect(EMOJI.test(line)).toBe(false);
    }
  });

  it("VPN wording exists ONLY in the browser-unreachable guidance (FR-49)", () => {
    for (const cls of FAILURE_CLASSES) {
      const mentionsVpn = /VPN/i.test(GUIDANCE_BY_CLASS[cls]);
      if (cls === "BROWSER_UNREACHABLE") expect(mentionsVpn).toBe(true);
      else expect(mentionsVpn).toBe(false);
    }
  });

  it("every classified reason has both its gateway message and class guidance", () => {
    for (const reason of GATEWAY_REASONS) {
      const cls = failureClass(reason);
      if (cls === null) continue;
      expect(GATEWAY_MESSAGES[reason].length).toBeGreaterThan(5);
      expect(GUIDANCE_BY_CLASS[cls].length).toBeGreaterThan(10);
    }
  });

  it("§16 label supersession: header labels are the owner wording (FR-61)", () => {
    expect(BANNER_FREE_SERVICE).toBe("Default free");
    expect(BANNER_YOUR_KEY).toBe("My key");
    expect(RESEND_WITH_DEFAULT).toMatch(/Resend with the default free combo/);
    expect(ACTION_USE_MY_OWN_KEY).toBe("Use my own API key");
    for (const text of [BYOK_QUICK_TITLE, BYOK_QUICK_SAVE]) {
      expect(text.length).toBeGreaterThan(3);
      expect(EMOJI.test(text)).toBe(false);
    }
  });

  it("status and transfer texts are present and icon-free", () => {
    for (const text of [
      STATUS_CHECKING,
      STATUS_AVAILABLE,
      STATUS_NEEDS_RETRY,
      STATUS_UNAVAILABLE,
      TRANSFER_EXPLANATION,
      RETRY_ASK,
    ]) {
      expect(text.length).toBeGreaterThan(3);
      expect(EMOJI.test(text)).toBe(false);
    }
    // The unavailable status points at the own-key way out (FR-52).
    expect(STATUS_UNAVAILABLE).toMatch(/own API key/i);
  });
});
