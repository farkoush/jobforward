import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Spec 002 v3 (analyze I-1, owner-approved 2026-11-16): the few-shot
  // examples live OUTSIDE the web project root (specs/002-jd-matcher/
  // few-shot/EX-Jxxx.json — R17 JSON source of truth, direct imports, no
  // sync) and must be bundleable by the webpack build.
  experimental: {
    externalDir: true,
  },
};

export default nextConfig;
