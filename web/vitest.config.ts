import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest config for the LLM gateway suites (tests/llm). Node environment:
 * the gateway is server-side code (node:crypto, fetch mocking). The legacy
 * suites (tests/engine, tests/byok) keep running on tsx --test untouched.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/llm/**/*.test.ts"],
    testTimeout: 20_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
