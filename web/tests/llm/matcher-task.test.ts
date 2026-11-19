import { describe, expect, it } from "vitest";
import { categoryForTask, knownTaskNames } from "@/lib/llm/tasks";

/**
 * Spec 002 v2 T031 — the matcher_analysis task registration (constitution
 * اصل ۲۲: the ONLY model plumbing the matcher v2 adds). The registry is
 * the single place a task name maps to a category; unknown task names stay
 * rejected (INVALID_TASK).
 */

describe("matcher_analysis task registration", () => {
  it("maps matcher_analysis to GEN (documented reason in the registry)", () => {
    expect(categoryForTask("matcher_analysis")).toBe("GEN");
  });

  it("keeps the existing tasks untouched", () => {
    expect(categoryForTask("scoring_ratings")).toBe("FAST");
    expect(categoryForTask("gen_display")).toBe("GEN");
  });

  it("still rejects unknown task names", () => {
    expect(categoryForTask("matcher_analysis_v9")).toBeNull();
    expect(categoryForTask("")).toBeNull();
  });

  it("registers exactly one matcher_analysis entry", () => {
    expect(knownTaskNames().filter((t) => t.startsWith("matcher"))).toEqual([
      "matcher_analysis",
    ]);
  });
});
