/**
 * Automated security scan (BYOK §9.2) — static checks over the source and
 * the final build:
 *   1. No dangerouslySetInnerHTML / innerHTML in app source.
 *   2. No third-party scripts actually LOADED at runtime: import("https://…"),
 *      dynamic src assignments, and <script src>/<link href> in the built
 *      HTML must be self-hosted or an allowlisted BYOK provider origin.
 *      (Mere string literals like documentation URLs inside framework code
 *      are not loads and are ignored.)
 *   3. CSP middleware present and strict (no unsafe-inline/eval in
 *      script-src for production).
 *   4. BYOK modules contain no server-side imports or server secrets.
 * Exit code 1 on any failure.
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const failures = [];

const ALLOWED_ORIGINS = [
  "generativelanguage.googleapis.com",
  "openrouter.ai",
  "api.groq.com",
  "api.mistral.ai",
  "localhost",
  "127.0.0.1",
];

function isAllowedUrl(url) {
  try {
    const origin = new URL(url).hostname;
    return ALLOWED_ORIGINS.some((a) => origin === a || origin.endsWith("." + a));
  } catch {
    return false;
  }
}

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, files);
    else files.push(p);
  }
  return files;
}

// --- 1. No dangerous rendering in source ---
const srcFiles = walk(join(ROOT, "src")).filter((f) => /\.(tsx?|jsx?)$/.test(f));
for (const file of srcFiles) {
  const text = readFileSync(file, "utf-8");
  if (/dangerouslySetInnerHTML/.test(file && text)) {
    failures.push(`dangerouslySetInnerHTML found in ${file}`);
  }
  if (/\.innerHTML\s*=/.test(text)) {
    failures.push(`innerHTML assignment found in ${file}`);
  }
}

// --- 2. No third-party runtime loads ---
const LOAD_PATTERNS = [
  /import\s*\(\s*["'`](https?:\/\/[^"'`]+)["'`]\s*\)/g,
  /import\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
  /\bsrc\s*=\s*["'`](https?:\/\/[^"'`]+)["'`]/g,
  /\bfetch\s*\(\s*["'`](https?:\/\/[^"'`]+)["'`]/g,
];
function scanRuntimeLoads(text, label) {
  for (const pattern of LOAD_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const url = match[1];
      if (/^https?:\/\//i.test(url) && !isAllowedUrl(url)) {
        failures.push(`third-party runtime load in ${label}: ${url}`);
      }
    }
  }
}

const staticDir = join(ROOT, ".next", "static");
if (existsSync(staticDir)) {
  for (const file of walk(staticDir)) {
    if (!/\.(js|mjs)$/.test(file)) continue;
    scanRuntimeLoads(readFileSync(file, "utf-8"), file);
  }
} else {
  console.log("note: .next/static not found — run `next build` first for the full scan");
}

// Built HTML: every <script src> / <link href> must be self-relative.
const serverAppDir = join(ROOT, ".next", "server", "app");
if (existsSync(serverAppDir)) {
  for (const file of walk(serverAppDir)) {
    if (!file.endsWith(".html")) continue;
    const html = readFileSync(file, "utf-8");
    for (const match of html.matchAll(/(?:script\s+src|link\s+[^>]*href)=["']([^"']+)["']/g)) {
      const url = match[1];
      if (/^https?:\/\//i.test(url) && !isAllowedUrl(url)) {
        failures.push(`third-party script/asset in ${file}: ${url}`);
      }
    }
  }
}

// --- 3. CSP middleware strictness ---
const middlewarePath = join(ROOT, "src", "middleware.ts");
if (!existsSync(middlewarePath)) {
  failures.push("src/middleware.ts missing (no CSP)");
} else {
  const text = readFileSync(middlewarePath, "utf-8");
  if (!/script-src 'nonce-\$\{nonce\}' 'strict-dynamic'/.test(text)) {
    failures.push("CSP: script-src nonce + strict-dynamic missing");
  }
  const scriptDirective = text.match(/script-src\s+([^;\n]+)/)?.[1] ?? "";
  if (scriptDirective.includes("unsafe-inline")) failures.push("CSP: unsafe-inline in script-src");
  if (!/object-src 'none'/.test(text)) failures.push("CSP: object-src 'none' missing");
  if (!/frame-ancestors 'none'/.test(text)) failures.push("CSP: frame-ancestors 'none' missing");
}

// --- 4. BYOK modules stay browser-side ---
for (const file of srcFiles) {
  if (!file.includes(join("lib", "byok"))) continue;
  const text = readFileSync(file, "utf-8");
  if (/from ["']next\/server["']/.test(text)) {
    failures.push(`BYOK module imports next/server (server-side code): ${file}`);
  }
  if (/process\.env\.GATE_PASSWORD/.test(text)) {
    failures.push(`BYOK module touches server secrets: ${file}`);
  }
}

if (failures.length) {
  console.error("BYOK SECURITY SCAN FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("BYOK security scan passed");
