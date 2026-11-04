/**
 * Phase 14 (spec §11) — theme guard tests (TDD: written BEFORE the warm
 * stylesheet lands). Enforces the mechanically checkable voice rules:
 * (a) no emoji codepoints in any user-facing message string (theme rule 1,
 * §11.1), and (b) the global stylesheet still defines the theme's key
 * tokens — the single token source must not silently drift (§11.2/§11.3).
 * Fonts are vendored (next/font/local), so the guard also asserts the font
 * CSS variables and that NO external font origin is referenced anywhere in
 * web/src (§11.4: zero runtime external font requests, P8).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import * as messages from "../../src/engine/messages";

// --- (a) emoji-free message strings (theme rule 1: text only, no emoji) ---

const EMOJI = /\p{Extended_Pictographic}/u;

test("messages.ts exports contain no emoji codepoints", () => {
  const offenders: string[] = [];
  for (const [name, value] of Object.entries(messages)) {
    if (typeof value === "string" && EMOJI.test(value)) {
      offenders.push(`${name}: ${JSON.stringify(value)}`);
    }
  }
  assert.deepEqual(offenders, []);
});

// --- (b) key tokens present in the single token source ---

const css = readFileSync(join(import.meta.dirname, "../../src/app/globals.css"), "utf8");

const REQUIRED_TOKENS = [
  "--primary:",
  "--primary-hover:",
  "--primary-foreground:",
  "--background:",
  "--card:",
  "--secondary:",
  "--foreground:",
  "--muted-foreground:",
  "--input:",
  "--ring:",
  "--accent:",
  "--destructive:",
  "--success:",
  "--radius:",
  "--content-width: 680px",
];

test("globals.css defines the warm theme's key color tokens", () => {
  const missing = REQUIRED_TOKENS.filter((t) => !css.includes(t));
  assert.deepEqual(missing, [], `missing tokens: ${missing.join(", ")}`);
});

test("globals.css maps the three font variables (vendored via next/font)", () => {
  for (const name of ["--font-sans", "--font-display", "--font-mono"]) {
    assert.ok(css.includes(name), `missing font variable: ${name}`);
  }
});

test("globals.css defines the message classes and warm component classes", () => {
  for (const cls of [".msg-error", ".msg-success", ".msg-info", ".btn-primary", ".text-input", ".card"]) {
    assert.ok(css.includes(cls), `missing class: ${cls}`);
  }
});

// --- (c) fonts are vendored; no external font origin anywhere in web/src ---

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      out.push(...listFiles(full));
    } else if (/\.(tsx?|css)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

test("no external font origin is referenced in web/src (P8: fonts are local)", () => {
  const srcDir = join(import.meta.dirname, "../../src");
  const offenders: string[] = [];
  for (const file of listFiles(srcDir)) {
    const content = readFileSync(file, "utf8");
    if (/fonts\.(googleapis|gstatic)\.com/.test(content)) {
      offenders.push(file);
    }
  }
  assert.deepEqual(offenders, []);
});

test("layout.tsx loads the three vendored font files", () => {
  const layout = readFileSync(join(import.meta.dirname, "../../src/app/layout.tsx"), "utf8");
  for (const font of ["SourceSans3[wght].ttf", "Fraunces[SOFT,WONK,opsz,wght].ttf", "JetBrainsMono[wght].ttf"]) {
    assert.ok(layout.includes(font), `layout.tsx does not load ${font}`);
  }
  assert.ok(!layout.includes("next/font/google"), "Inter/google font import must be removed");
});
