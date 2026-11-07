/**
 * §16 FR-58 — pure duplicate-variable detector for env file CONTENT.
 * Kept separate from the startup hook so it is unit-testable without
 * touching the real `.env.local` (owner-owned data — never rewritten by
 * tests; see docs/llm-gateway-runbook.md, "Env file hygiene").
 */

export interface DuplicateEnvVar {
  name: string;
  lines: number[];
}

/** Line numbers (1-based) of every variable defined more than once. */
export function duplicatedEnvVars(content: string): DuplicateEnvVar[] {
  const byName = new Map<string, number[]>();
  content.split(/\r?\n/).forEach((line, index) => {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line);
    if (match) {
      byName.set(match[1], [...(byName.get(match[1]) ?? []), index + 1]);
    }
  });
  const duplicates: DuplicateEnvVar[] = [];
  for (const [name, lines] of byName) {
    if (lines.length > 1) duplicates.push({ name, lines });
  }
  return duplicates;
}
