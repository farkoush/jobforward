/**
 * Central redaction (BYOK §4): applied in the logging/error layer so a key
 * can never reach logs, console output, error messages, or analytics.
 * Patterns cover each provider's key shapes and, generally, long
 * base64/hex strings.
 */

const KEY_PATTERNS: Array<{ name: string; re: RegExp; sample: string }> = [
  { name: "google", re: /AIza[0-9A-Za-z\-_]{20,}/g, sample: "AIzaSyA1234567890abcdefghijklmnopqrstuv" },
  { name: "openai_like", re: /sk-[0-9A-Za-z\-_]{16,}/g, sample: "sk-or-v1-0123456789abcdef0123456789abcdef" },
  { name: "groq", re: /gsk_[0-9A-Za-z]{16,}/g, sample: "gsk_0123456789abcdefghijklmnop" },
  {
    name: "long_token",
    // Long base64/hex-ish tokens (>= 32 chars) that look like secrets.
    re: /\b[A-Za-z0-9+/_-]{32,}={0,2}\b/g,
    sample: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
  },
];

export function isLikelyKey(text: string): boolean {
  return KEY_PATTERNS.some(({ re }) => {
    re.lastIndex = 0;
    return re.test(text);
  });
}

/** Mask every key-like substring in an arbitrary string: abcd…wxyz. */
export function redactString(text: string): string {
  let out = text;
  for (const { re } of KEY_PATTERNS) {
    out = out.replace(re, (match) =>
      match.length > 12 ? `${match.slice(0, 4)}…${match.slice(-4)}` : "…"
    );
  }
  return out;
}

function redactValue(value: unknown, depth: number): unknown {
  if (depth > 8) return "…";
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (value instanceof Error) return redactString(String(value.stack ?? value.message));
  if (Array.isArray(value)) return value.map((v) => redactValue(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      // Secret-named fields never survive redaction, even in summary form.
      if (/^(api[_-]?key|key|password|token|authorization)$/i.test(key)) {
        out[key] = "…";
        continue;
      }
      out[key] = redactValue(val, depth + 1);
    }
    return out;
  }
  return "…";
}

/** Redact strings, nested objects, and Error messages. */
export function redact<T>(value: T): unknown {
  return redactValue(value, 0);
}
