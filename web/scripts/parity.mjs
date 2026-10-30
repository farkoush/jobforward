/**
 * Parity harness (Node side): run the TS port on the same fixed inputs and
 * compare with the Python engine output. Usage:
 *   npx tsx scripts/parity.mts   (or: node --import tsx scripts/parity.mjs
 *   after `npm i -D tsx`)
 * This .mjs version spawns the .mts runner; see parity.mts.
 */
import { spawnSync } from "node:child_process";

const result = spawnSync("npx", ["tsx", "scripts/parity.mts"], {
  stdio: "inherit",
  shell: true,
});
process.exit(result.status ?? 1);
