/**
 * Matcher v2 client analysis pipeline (spec 002 v2, contract §1/§4;
 * constitution اصل ۲۲ — the ONLY new model plumbing: one matcher_analysis
 * GEN call through the existing POST /api/llm/gen NDJSON route, BYOK via
 * the same route and headers).
 *
 * Pure and injectable (fetchImpl) so tests drive the full pipeline without
 * React or network: input → [retry-once on contract failure] → validated
 * MatcherAnalysisV2 | typed failure. Events mirror spec 002 v2 §7
 * (matcher_v2_requested / _result / _validation_retry / _refused); the
 * cancel token lets the UI discard a late result (P2: nothing is applied
 * after a cancel).
 */

import type { GatewayReason } from "@/lib/llm/types";
import {
  buildMatcherSystemPrompt,
  buildMatcherUserPrompt,
  buildMatcherFewShotBlock,
  selectFewShotExamples,
  extendMatcherUserPromptWithRetry,
} from "@/lib/byok/prompts";
import { taxonomyTableLines } from "@/engine/matcher2/v2/taxonomy";
import {
  finalFewShotExamples,
  derivePostingFeatures,
} from "@/engine/matcher2/v2/fewshotIndex";
import {
  validateMatcherAnalysisV2,
  orderBucketForDisplay,
} from "@/engine/matcher2/v2/validate";
import type { MatcherAnalysisV2 } from "@/engine/matcher2/v2/types";

export interface MatcherAnalysisOptions {
  cleanedText: string;
  useByok: boolean;
  /** The user's raw key (x-byok-key) — per-request, never persisted (P14). */
  byokKey: string | null;
  /** The user's chosen model id (x-byok-model). */
  byokModel: string;
  fetchImpl?: typeof fetch;
  /** Observability hook (P19) — the page wires logEvent here. */
  onEvent?: (name: string, detail: Record<string, unknown> | null) => void;
  /** Set true while in flight to discard the result (cancel at any time). */
  cancelToken?: { cancelled: boolean };
}

export type MatcherAnalysisOutcome =
  | {
      ok: true;
      analysis: MatcherAnalysisV2;
      usedFallback: boolean;
      modelUsed: string;
    }
  | { ok: false; kind: "gateway"; reason: GatewayReason }
  | { ok: false; kind: "refused"; failedChecks: string[] }
  | { ok: false; kind: "zero_skills" };

interface GenDoneEvent {
  type: "done";
  usedFallback?: boolean;
  modelUsed?: string;
}

/** Read an NDJSON stream body; returns the accumulated chunk text plus the
 *  terminal event. Non-NDJSON JSON failures (e.g. 401) surface as a gateway
 *  outcome via the `jsonFailure` branch in runMatcherAnalysis. */
async function readNdjson(
  res: Response
): Promise<{ text: string; done: GenDoneEvent | null; errorReason: GatewayReason | null; jsonFailure: { reason: GatewayReason } | null }> {
  const body = await res.text();
  let text = "";
  let done: GenDoneEvent | null = null;
  let errorReason: GatewayReason | null = null;
  let jsonFailure: { reason: GatewayReason } | null = null;
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let event: unknown;
    try {
      event = JSON.parse(trimmed);
    } catch {
      continue; // tolerate stray whitespace lines; typed events only
    }
    const obj = event as Record<string, unknown>;
    if (obj.type === "chunk" && typeof obj.text === "string") {
      text += obj.text;
    } else if (obj.type === "done") {
      done = obj as unknown as GenDoneEvent;
    } else if (obj.type === "error") {
      errorReason = (obj.reason ?? "ALL_MODELS_FAILED") as GatewayReason;
    } else if (obj.ok === false && typeof obj.reason === "string") {
      // Plain JSON failure shape (e.g. UNAUTHORIZED before any streaming).
      jsonFailure = { reason: obj.reason as GatewayReason };
    }
  }
  return { text, done, errorReason, jsonFailure };
}

function stripFences(text: string): string {
  return text
    .replace(/^```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

/** P19 (T063 local-test finding): a refused analysis must leave a trace of
 *  WHICH invariant failed, not just the count. The check strings contain
 *  ad-derived names (P14: never logged), so only the SANITIZED kind is
 *  logged: the item path plus the invariant keyword. */
export function sanitizeFailedCheck(check: string): string {
  // The path is the leading dotted/index token ONLY — quoted ad-derived
  // names and prose must never leak into the log.
  const pathMatch = check.match(
    /^[a-z_]+(?:\[\d+\])?(?:\.[a-z_]+(?:\[\d+\])?)*/i
  );
  const path = pathMatch ? pathMatch[0] : "";
  const kind = /not valid JSON|not a JSON object/i.test(check)
    ? "json-parse"
    : /not verbatim/i.test(check)
      ? "verbatim-evidence"
      : /ambiguous/i.test(check)
        ? "ambiguous-taxonomy-name"
        : /not in the soft-skill taxonomy|not in the taxonomy/i.test(check)
          ? "taxonomy-membership"
          : /ad_wording/i.test(check)
            ? "ad-wording"
            : /in_taxonomy/i.test(check)
              ? "in-taxonomy-flag"
              : /neither in the witness|closed generalization/i.test(check)
                ? "normalization-bound"
                : /confidence/i.test(check)
                  ? "confidence-rule"
                  : /source/i.test(check)
                    ? "source-rule"
                    : /category/i.test(check)
                      ? "category-rule"
                      : /must not be empty/i.test(check)
                        ? "empty-field"
                        : /two buckets/i.test(check)
                          ? "cross-bucket-duplicate"
                          : /two types/i.test(check)
                            ? "cross-type-duplicate"
                            : "other";
  return `${path}: ${kind}`;
}

export async function runMatcherAnalysis(
  opts: MatcherAnalysisOptions
): Promise<MatcherAnalysisOutcome> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const onEvent = opts.onEvent ?? (() => {});
  // Stage-2 few-shot (R17/R18): deterministic selection from the bundled
  // bank against the current posting's features; zero finals ⇒ "" (SC-010).
  const fewShotBlock = buildMatcherFewShotBlock(
    selectFewShotExamples(
      finalFewShotExamples(),
      derivePostingFeatures(opts.cleanedText)
    )
  );
  const system = buildMatcherSystemPrompt(taxonomyTableLines(), fewShotBlock);
  const emit = (name: string, detail: Record<string, unknown> | null = null) => {
    if (!opts.cancelToken?.cancelled) onEvent(name, detail);
  };

  emit("matcher_v2_requested", { byok: opts.useByok });

  let failedChecks: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    if (opts.cancelToken?.cancelled) {
      return { ok: false, kind: "gateway", reason: "NETWORK" };
    }
    if (attempt === 1) {
      emit("matcher_v2_validation_retry", {
        failed_check_count: failedChecks.length,
        failed_check_kinds: failedChecks.map(sanitizeFailedCheck),
      });
    }
    const input =
      attempt === 0
        ? buildMatcherUserPrompt(opts.cleanedText)
        : extendMatcherUserPromptWithRetry(opts.cleanedText, failedChecks);

    let res: Response;
    try {
      res = await fetchImpl("/api/llm/gen", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(opts.useByok && opts.byokKey
            ? {
                "x-byok-key": opts.byokKey,
                "x-byok-model": opts.byokModel ?? "",
              }
            : {}),
        },
        body: JSON.stringify({
          task: "matcher_analysis",
          input,
          context: { system },
        }),
      });
    } catch {
      return { ok: false, kind: "gateway", reason: "NETWORK" };
    }
    if (!res.ok && res.headers.get("content-type")?.includes("json")) {
      // Typed non-stream failure (e.g. 401) — reason rides in the body.
      const body = (await res.json().catch(() => null)) as
        | { ok: false; reason: GatewayReason }
        | null;
      return {
        ok: false,
        kind: "gateway",
        reason: body?.reason ?? "NETWORK",
      };
    }

    const stream = await readNdjson(res);
    if (stream.jsonFailure) {
      return { ok: false, kind: "gateway", reason: stream.jsonFailure.reason };
    }
    if (stream.errorReason) {
      return { ok: false, kind: "gateway", reason: stream.errorReason };
    }
    if (!stream.done) {
      return { ok: false, kind: "gateway", reason: "NETWORK" };
    }

    const validation = validateMatcherAnalysisV2(
      stripFences(stream.text),
      opts.cleanedText
    );
    if (validation.ok) {
      const analysis: MatcherAnalysisV2 = {
        ...validation.analysis,
        must: orderBucketForDisplay(validation.analysis.must),
        preferred: orderBucketForDisplay(validation.analysis.preferred),
        bonus: orderBucketForDisplay(validation.analysis.bonus),
      };
      emit("matcher_v2_result", {
        must: analysis.must.length,
        preferred: analysis.preferred.length,
        bonus: analysis.bonus.length,
        red_flags: analysis.red_flags.length,
      });
      return {
        ok: true,
        analysis,
        usedFallback: stream.done.usedFallback === true,
        modelUsed: stream.done.modelUsed ?? "",
      };
    }
    if (validation.reason === "zero_skills") {
      return { ok: false, kind: "zero_skills" };
    }
    failedChecks = validation.failedChecks;
  }

  emit("matcher_v2_refused", {
    failed_check_count: failedChecks.length,
    failed_check_kinds: failedChecks.map(sanitizeFailedCheck),
  });
  return { ok: false, kind: "refused", failedChecks };
}
