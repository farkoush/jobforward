"use client";

/**
 * Job Forward — web prototype of the tested terminal tool (same logic, new
 * skin). One screen = one terminal step, same order, same texts (B1 English
 * from engine/messages.ts). The deterministic engine runs in server API
 * routes; this client only orchestrates screens and renders results.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import * as msg from "@/engine/messages";
import { fmt } from "@/engine/messages";
import {
  DEFAULT_RUBRIC_VERSION,
  PART_NAMES,
  QuestionDimension,
  Ratings,
} from "@/engine/types";
import { containsNonEnglish } from "@/engine/flow/pathService";
import { isComplete } from "@/engine/flow/questions";
import {
  clearSession,
  getGateToken,
  getSession,
  newSession,
  saveSession,
  setGateToken,
  StoredBullet,
  StoredEntry,
  updateSession,
  apiPost,
} from "@/lib/client";
import { logEvent } from "@/lib/logger";
import { ByokSettings } from "@/components/ByokSettings";
import { ModelBanner, type ConnStatus } from "@/components/ModelBanner";
import { GuidanceBox } from "@/components/GuidanceBox";
import { LlmSettingsSection } from "@/components/settings/LlmSettingsSection";
import { ByokQuickModal } from "@/components/byok/ByokQuickModal";
import {
  getRawKeyForGateway,
  getByokState,
  initByok,
  setUseForScoring,
} from "@/lib/byok/client";
import {
  BYOK_EVALUATOR_SYSTEM_PROMPT,
  buildEvaluatorUserPrompt,
} from "@/lib/byok/prompts";
import {
  GATEWAY_MESSAGES,
  GATE_SERVICE_UNAVAILABLE,
  RETRY_ASK,
  TRANSFER_EXPLANATION,
} from "@/lib/llm/messages";
import { failureClass } from "@/lib/llm/failure-class";
import {
  autoCheckPolicy,
  loadStoredCheck,
  nextStatusAfterFailure,
  saveCheckResult,
  statusFromOutcome,
} from "@/lib/llm/connection-client";
import type { GatewayReason } from "@/lib/llm/types";
import { clearDraft, loadDraft, saveDraftDebounced } from "@/lib/draft";
import { buildCoverage, extractParts } from "@/engine/flow/parts";
import { type SplitCandidate } from "@/engine/flow/entry_split";
import {
  matchDatePattern,
  parsePastedExperience,
} from "@/engine/flow/entry_parse";
import { partStates, questionOrder } from "@/engine/flow/display";
import {
  EvaluatorOutputError,
  validateResponse,
} from "@/engine/scoring/evaluator";
import { entryScoreFromRatings } from "@/engine/scoring/metrics";
import { redact } from "@/lib/byok/redact";

type Screen =
  | "gate"
  | "welcome"
  | "menu"
  | "llm_settings"
  | "entry_type"
  | "entry_paste"
  | "entry_review"
  | "bullet_list"
  | "bullet_gate"
  | "confirm_complete"
  | "merge"
  | "copy"
  | "survey"
  | "done"
  | "match_paste"
  | "match_review"
  | "match_hard"
  | "match_soft";

interface MatchReport {
  hard_tables: Record<
    string,
    { name: string; type: string; default_priority: boolean; evidence: string; is_one_of: boolean }[]
  >;
  soft_rows: {
    label_en: string;
    group_code: string;
    evidence: string;
    priority: string;
    certainty: string;
  }[];
  unmatched: { text: string; note: string }[];
  dropped_count: number;
  rules_version: string;
  hard_totals: Record<string, number>;
  soft_total: number;
}

interface MatchResult {
  cleaning: {
    script_blocks: number;
    style_blocks: number;
    html_tags: number;
    word_count: number;
  };
  report?: MatchReport;
}

const PART_LABELS: Record<string, string> = {
  user_need: msg.PART_LABEL_NEED,
  product_feature: msg.PART_LABEL_FEATURE,
  action: msg.PART_LABEL_ACTION,
  result: msg.PART_LABEL_RESULT,
  metric: msg.PART_LABEL_METRIC,
};

// Phase 18 (spec §13.1): the structured date fields accept YYYY-MM only.
const MONTH_FIELD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/* W3 (owner look-and-feel 2026-11-05): top-of-page stage bar. Pure mapping
   from the screen state to the active flow + step index; screens outside a
   flow (gate/welcome/menu/settings) render no bar. Segments + caption only —
   no icons (§11.1 rule 1). Phase 18 (§13): entry_paste + entry_review
   replace entry_details + entry_split, the score screen is merged into
   bullet_list, and bullet_gate sits at the SAME index as bullet_list (the
   old mapping regressed the bar one step when a bullet opened). */
type FlowStage = { flow: "add" | "match"; index: number };

const STAGE_INDEX: Partial<Record<Screen, FlowStage>> = {
  entry_type: { flow: "add", index: 0 },
  entry_paste: { flow: "add", index: 0 },
  entry_review: { flow: "add", index: 1 },
  bullet_list: { flow: "add", index: 2 },
  bullet_gate: { flow: "add", index: 2 },
  confirm_complete: { flow: "add", index: 3 },
  merge: { flow: "add", index: 3 },
  copy: { flow: "add", index: 3 },
  done: { flow: "add", index: 3 },
  match_paste: { flow: "match", index: 0 },
  match_review: { flow: "match", index: 1 },
  match_hard: { flow: "match", index: 2 },
  match_soft: { flow: "match", index: 3 },
};

const FLOW_LABELS: Record<"add" | "match", string[]> = {
  add: [
    msg.STAGE_EXPERIENCE,
    msg.STAGE_REVIEW,
    msg.STAGE_ACHIEVEMENTS,
    msg.STAGE_RESULT,
  ],
  match: ["Paste", "Review", "Hard skills", "Soft skills"],
};

function StageProgress({ flow, index }: { flow: "add" | "match"; index: number }) {
  const labels = FLOW_LABELS[flow];
  return (
    <div className="mb-6">
      <div aria-hidden="true" className="flex gap-1.5">
        {labels.map((label, i) => (
          <div
            key={label}
            className={`h-1.5 flex-1 rounded-full ${i <= index ? "bg-primary" : "bg-neutral-200"}`}
          />
        ))}
      </div>
      <p className="mt-2 text-[13px] font-medium uppercase tracking-wide text-neutral-500">
        Step {index + 1} of {labels.length} — {labels[index]}
      </p>
    </div>
  );
}


type Rating = { context: number; role_action_clarity: number; result: number };

type FrameworkRow = {
  key: string;
  label: string;
  words: string;
  vague: boolean;
};

export default function Home() {
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>("welcome");
  const stage = STAGE_INDEX[screen]; // W3 stage bar; null outside a flow
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Gateway end-state (US2): Persian message + Retry (+ explicit free-path
  // confirmation after a BYOK failure, SC-008). Kept separate from the
  // engine's `error` code path so the Persian text renders verbatim.
  const [gatewayError, setGatewayError] = useState<string | null>(null);
  const [gatewayReason, setGatewayReason] = useState<GatewayReason | null>(null);
  const [byokDowngradeOffer, setByokDowngradeOffer] = useState(false);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const retryActionRef = useRef<(() => void) | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // §15 FR-45/46/52: the content-free connection check (once per session
  // from the menu screen) + the truthful 4-state status. Purely informational
  // — the check NEVER gates navigation (FR-52).
  const [connStatus, setConnStatus] = useState<ConnStatus>("checking");
  const [checkBusy, setCheckBusy] = useState(false);
  const checkStartedRef = useRef(false);
  const clientCheckFailuresRef = useRef(0);
  // §15 FR-50/51: transfer to the LLM settings on no-way-forward failures —
  // ALWAYS preceded by the explanation (never a silent jump), origin stage
  // remembered, and the one-tap retry ask on a saved return.
  const [transferNotice, setTransferNotice] = useState<string | null>(null);
  const [settingsMode, setSettingsMode] = useState<"menu" | "failure">("menu");
  const [originScreen, setOriginScreen] = useState<Screen | null>(null);
  const [retryAsk, setRetryAsk] = useState(false);
  // §16 FR-61: the quick BYOK modal, openable from the header on ANY page.
  const [quickByokOpen, setQuickByokOpen] = useState(false);

  // Entry collection (Phase 18 hybrid: paste-first with a drag-and-drop
  // review, spec §13)
  const [entryType, setEntryType] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [company, setCompany] = useState<string>("");
  const [dates, setDates] = useState<string>("");
  const [domain, setDomain] = useState<string>("");
  const [pasted, setPasted] = useState<string>("");
  const [splitList, setSplitList] = useState<SplitCandidate[]>([]);
  // Phase 18 (§13.1): structured dates + the review-screen state.
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [ongoing, setOngoing] = useState<boolean>(false);
  const [reviewType, setReviewType] = useState<string>("");
  // Phase 18 (§13.3/§13.4): the encouragement line shows only right after a
  // fresh scoring; the snapshot + entry id power the no-change skip and the
  // update-in-place re-confirm.
  const [justScored, setJustScored] = useState<boolean>(false);
  const [confirmedSnapshot, setConfirmedSnapshot] = useState<string | null>(null);
  const [entryIdForUpdate, setEntryIdForUpdate] = useState<number | null>(null);

  // Bullet improvement flow
  const [askedThisRun, setAskedThisRun] = useState<Set<number>>(new Set());
  const [currentBulletId, setCurrentBulletId] = useState<number | null>(null);
  const [editText, setEditText] = useState<string>("");
  const [editingBulletId, setEditingBulletId] = useState<number | null>(null);

  // Matcher
  const [postingText, setPostingText] = useState<string>("");
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [matchParams, setMatchParams] = useState<Record<string, string | number>>({});

  // Survey
  const [surveyEase, setSurveyEase] = useState<number | null>(null);
  const [surveyUseful, setSurveyUseful] = useState<string>("");
  const [surveyComment, setSurveyComment] = useState<string>("");

  const [session, setSession] = useState<ReturnType<typeof getSession>>(null);

  useEffect(() => {
    const existing = getSession();
    setSession(existing);
    initByok();
    if (!getGateToken()) setScreen("gate");
    else if (existing && existing.consentAt) setScreen("menu");
    // Draft recovery (FR-22): restore unsaved paste input after a reload.
    const savedPaste = loadDraft("paste");
    if (savedPaste) setPasted(savedPaste);
    setReady(true);
  }, []);

  const entry = session?.entry ?? null;

  function go(next: Screen) {
    setError(null);
    setGatewayError(null);
    setGatewayReason(null);
    setByokDowngradeOffer(false);
    setFallbackNotice(null);
    setScreen(next);
  }

  // ---------- §15 connection check (FR-45/46/52) ----------

  /** The ONE content-free check per browser session, fired from the menu
   * screen; explicit re-checks pass force=true. The status NEVER blocks
   * navigation (FR-52). After a reload the SAVED status is restored —
   * no extra provider contact and no stuck "Checking…" (owner bug report
   * 2026-11-07; logic pinned in connection-client.test.ts). */
  async function runConnectionCheckOnce(force = false) {
    if (!force) {
      // §16 FR-64B: restore a saved status ONLY when it was "available";
      // a bad (or missing) status runs ONE fresh check per page load so
      // the banner recovers by itself when the network returns.
      const stored = loadStoredCheck(window.sessionStorage);
      if (autoCheckPolicy(stored) === "restore") {
        setConnStatus(stored!.status);
        return;
      }
      if (checkStartedRef.current) return;
      checkStartedRef.current = true;
    }
    setCheckBusy(true);
    setConnStatus("checking");
    try {
      const response = await fetch("/api/llm/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        // §16 FR-64A: the client can never hang on "Checking…" — a stale
        // request aborts at 20 s and lands in the failure path below.
        signal: AbortSignal.timeout(20_000),
      });
      const body = (await response.json().catch(() => null)) as
        | { ok: boolean; state?: unknown }
        | null;
      if (statusFromOutcome(body?.state) === "available") {
        clientCheckFailuresRef.current = 0;
        setConnStatus("available");
        saveCheckResult(window.sessionStorage, "available");
      } else {
        clientCheckFailuresRef.current += 1;
        const next = nextStatusAfterFailure(connStatus);
        setConnStatus(next);
        saveCheckResult(window.sessionStorage, next);
      }
    } catch {
      // Browser↔platform link failed — status hint only (FR-52; the VPN
      // guidance belongs to the failure box, never to a blocking state).
      clientCheckFailuresRef.current += 1;
      const next = nextStatusAfterFailure(connStatus);
      setConnStatus(next);
      saveCheckResult(window.sessionStorage, next);
    }
    setCheckBusy(false);
  }

  useEffect(() => {
    if (screen === "menu") void runConnectionCheckOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  // ---------- §15 transfer / origin / one-tap retry (FR-50/51) ----------

  function startTransfer() {
    // NEVER a silent jump: the explanation shows first; the transfer then
    // proceeds after 5 s or on a single tap, whichever comes first.
    setTransferNotice(TRANSFER_EXPLANATION);
  }

  function doTransfer() {
    setTransferNotice(null);
    setOriginScreen(screen);
    setSettingsMode("failure");
    go("llm_settings");
  }

  useEffect(() => {
    if (!transferNotice) return;
    const timer = setTimeout(() => doTransfer(), 5000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => clearTimeout(timer);
  }, [transferNotice]);

  /** Back from the settings: to the menu after a menu-initiated visit; to
   * the exact origin stage after a failure-initiated one (input intact —
   * the draft never moved). saved=true (failure mode) shows the one-tap
   * ask once; cancel returns with no ask (FR-51). */
  function returnToOrigin(saved: boolean) {
    const origin = originScreen ?? "menu";
    setOriginScreen(null);
    setSettingsMode("menu");
    setTransferNotice(null);
    go(origin);
    if (saved && settingsMode === "failure") setRetryAsk(true);
  }

  /** "Use my own key" on a failure (FR-008): a saved key is offered
   * immediately (no pointless detour); otherwise the explained transfer. */
  function handleOwnKey() {
    const byok = getByokState();
    if (byok.hasKey && byok.model) {
      setUseForScoring(true);
      setGatewayError(null);
      setGatewayReason(null);
      setByokDowngradeOffer(false);
      retryActionRef.current?.();
      return;
    }
    startTransfer();
  }

  // ---------- access gate (shared password; token only, never the password) ----------

  const [gatePassword, setGatePassword] = useState("");

  async function submitGate() {
    setBusy(true);
    const result = (await fetch("/api/gate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: gatePassword }),
    })
      .then((r) => r.json())
      .catch(() => null)) as { ok: boolean; error?: string; token?: string } | null;
    setBusy(false);
    if (!result) {
      // Empty/non-JSON response: the server itself failed (FR-23). §15
      // FR-47: a gate failure NEVER claims an AI outage — gate-specific
      // text only; the named cause stays in the server log (P19).
      setGatewayError(GATE_SERVICE_UNAVAILABLE);
      return;
    }
    if (!result.ok) {
      if (result.error === "CONFIG_ERROR") {
        setGatewayError(GATE_SERVICE_UNAVAILABLE);
      } else {
        setError("WRONG_PASSWORD");
      }
      return;
    }
    setGateToken(result.token as string);
    setGatePassword("");
    logEvent("gate_passed", null, null);
    go("welcome");
  }

  function restart() {
    logEvent("session_restart", null, null);
    clearSession();
    setSession(null);
    setEntryType("");
    setTitle("");
    setCompany("");
    setDates("");
    setDomain("");
    setPasted("");
    setSplitList([]);
    setStartDate("");
    setEndDate("");
    setOngoing(false);
    setReviewType("");
    setJustScored(false);
    setConfirmedSnapshot(null);
    setEntryIdForUpdate(null);
    setAskedThisRun(new Set());
    setMatch(null);
    setPostingText("");
    go("welcome");
  }

  // ---------- shared server calls ----------

  async function scoreAllTexts(texts: string[]) {
    setBusy(true);
    const result = await apiPost<{
      ratings: Rating[];
      parts: {
        user_need: string;
        product_feature: string;
        action: string;
        result: string;
        metric: string;
      }[];
      entry_score: number | null;
      rubric_version: string;
    }>("/api/score", { texts });
    setBusy(false);
    return result;
  }

  function applyScoreToEntry(
    entryData: StoredEntry,
    result: {
      ratings: Rating[];
      parts: {
        user_need: string;
        product_feature: string;
        action: string;
        result: string;
        metric: string;
      }[];
      entry_score: number | null;
      rubric_version: string;
    },
    onlyBulletId?: number
  ) {
    entryData.bullets.forEach((bullet, i) => {
      if (onlyBulletId !== undefined && bullet.id !== onlyBulletId) return;
      bullet.ratings = result.ratings[i];
      bullet.rubric_version = result.rubric_version;
      bullet.user_need = result.parts[i].user_need;
      bullet.product_feature = result.parts[i].product_feature;
      bullet.action = result.parts[i].action;
      bullet.result = result.parts[i].result;
      bullet.metric = result.parts[i].metric;
      bullet.part_present = Object.fromEntries(
        PART_NAMES.map((name) => [name, Boolean(result.parts[i][name].trim())])
      );
      // Phase 12 (spec §2.2): the diagnostic coverage record rides on every
      // analysis; it never affects ratings or statuses (research D11).
      bullet.coverage = buildCoverage(bullet.text, result.parts[i], result.ratings[i]);
      if (bullet.status === "new" || bullet.status === "edited") {
        bullet.status = "analyzed"; // new/edited -> analyzed (status machine)
      }
    });
    entryData.entry_score = result.entry_score;
    entryData.rubric_version = result.rubric_version;
  }

  /**
   * Gateway path (004-llm-gateway, P12): the model produces ONLY the 0/1/2
   * bullet ratings, reached through /api/llm/fast — the free NVIDIA chain by
   * default, or the user's OpenRouter key via the x-byok-key header
   * (per-request, never persisted, FR-29). Output is untrusted: fence-
   * stripping + the shared validity check gate it, and ALL arithmetic stays
   * in the engine (metrics.ts) — mirroring the terminal's opt-in LLM
   * evaluator design. Invalid output is retried once, then refused (FR-014).
   */
  async function scoreWithGateway(
    texts: string[],
    useByok: boolean
  ): Promise<
    | {
        ok: true;
        ratings: Array<{
          bullet_index: number;
          context: number;
          role_action_clarity: number;
          result: number;
        }>;
        parts: ReturnType<typeof extractParts>[];
        entry_score: number;
        rubric_version: string;
        usedFallback: boolean;
        modelUsed: string;
      }
    | { ok: false; reason: GatewayReason; error: string }
  > {
    const parts = texts.map((t) => extractParts(t));
    const byok = getByokState();
    for (let attempt = 0; attempt < 2; attempt++) {
      const outcome = (await fetch("/api/llm/fast", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(useByok && getRawKeyForGateway()
            ? {
                "x-byok-key": getRawKeyForGateway() as string,
                "x-byok-model": byok.model ?? "",
              }
            : {}),
        },
        body: JSON.stringify({
          task: "scoring_ratings",
          input: buildEvaluatorUserPrompt(texts),
          context: { system: BYOK_EVALUATOR_SYSTEM_PROMPT },
        }),
      }).then((r) => r.json())) as
        | { ok: true; text: string; usedFallback?: boolean; modelUsed?: string }
        | { ok: false; reason: GatewayReason }
        | null;
      if (!outcome) {
        return {
          ok: false,
          reason: "NETWORK",
          error: GATEWAY_MESSAGES.NETWORK,
        };
      }
      if (outcome.ok !== true) {
        const reason = outcome.reason ?? "ALL_MODELS_FAILED";
        return {
          ok: false,
          reason,
          error: GATEWAY_MESSAGES[reason] ?? msg.ERR_EVALUATOR_FAILURE,
        };
      }
      // Untrusted model output: strip fences, parse, shared validity check.
      const cleaned = String(outcome.text ?? "")
        .replace(/^```(?:json)?/i, "")
        .replace(/```\s*$/, "")
        .trim();
      try {
        const parsed = JSON.parse(cleaned) as {
          ratings?: Array<{
            bullet_index?: unknown;
            context?: unknown;
            role_action_clarity?: unknown;
            result?: unknown;
          }>;
        };
        const raw = parsed.ratings;
        if (!Array.isArray(raw)) throw new Error("no ratings array");
        const normalized = raw.map((r, i) => ({
          bullet_index: i,
          context: Number(r.context),
          role_action_clarity: Number(r.role_action_clarity),
          result: Number(r.result),
        }));
        // Shared validity check (values in {0,1,2}, one rating per bullet).
        validateResponse(normalized, texts.length);
        const entryScore = entryScoreFromRatings(
          normalized.map((r) => ({
            context: r.context,
            role_action_clarity: r.role_action_clarity,
            result: r.result,
          }))
        );
        return {
          ok: true,
          ratings: normalized,
          parts,
          entry_score: entryScore,
          rubric_version: DEFAULT_RUBRIC_VERSION,
          usedFallback: outcome.usedFallback === true,
          modelUsed: outcome.modelUsed ?? "",
        };
      } catch {
        continue; // invalid output → one more gateway attempt (retry-once)
      }
    }
    return {
      ok: false,
      reason: "ALL_MODELS_FAILED",
      error: GATEWAY_MESSAGES.ALL_MODELS_FAILED,
    };
  }

  /** Score the stored entry through the gateway (free path by default,
   * the user's key when BYOK is on) and persist the ratings into the
   * session (applied inside updateSession so mutations are not lost).
   * A BYOK failure NEVER falls back automatically (SC-008): the user sees a
   * dedicated Persian message and explicitly confirms the free path. */
  async function scoreAndPersist(onlyBulletId?: number) {
    const stored = getSession();
    if (!stored?.entry) return null;
    const byok = getByokState();
    const useByok = byok.useForScoring && byok.hasKey && Boolean(byok.model);
    setGatewayError(null);
    setGatewayReason(null);
    setByokDowngradeOffer(false);
    retryActionRef.current = () => void scoreAndPersist(onlyBulletId);
    setBusy(true);
    const result = await scoreWithGateway(
      stored.entry.bullets.map((b) => b.text),
      useByok
    );
    setBusy(false);
    if (!result.ok) {
      // §16 FR-57: dev-only sanitized browser-console summary — the typed
      // outcome carries no keys and no user text (P14); production stays
      // silent.
      if (process.env.NODE_ENV !== "production") {
        console.warn("[llm] request failed:", {
          class: failureClass(result.reason),
          reason: result.reason,
          byok: useByok,
        });
      }
      setGatewayError(result.error);
      setGatewayReason(result.reason);
      if (useByok) setByokDowngradeOffer(true);
      // §15 FR-52 (R14): a no-way-forward analysis failure is the honest
      // "unavailable" signal — the banner goes red immediately.
      if (failureClass(result.reason) === "NO_WAY_FORWARD") {
        setConnStatus("unavailable");
      }
      return null;
    }
    setFallbackNotice(result.usedFallback ? "Served by fallback model" : null);
    updateSession((s) => {
      if (s.entry) applyScoreToEntry(s.entry, result, onlyBulletId);
    });
    setSession(getSession());
    logEvent(
      "analysis_backend",
      null,
      redact({
        backend: useByok ? "byok" : "gateway-free",
        model: useByok ? byok.model : null,
      }) as Record<string, unknown>
    );
    return result;
  }

  // ---------- welcome / consent ----------

  function acceptConsent() {
    const fresh = newSession();
    fresh.consentAt = new Date().toISOString();
    saveSession(fresh);
    setSession(fresh);
    logEvent("consent_accepted", "yes", null);
    go("menu");
  }

  // ---------- entry collection (ADD_* steps) ----------

  function chooseType(t: string) {
    setEntryType(t);
    logEvent("entry_type", t, null);
    go("entry_paste");
  }

  /** Phase 18 (spec §13.1): paste-first entry — ONE paste box replaces the
   * detail fields; the deterministic parser segments the paste and
   * auto-places ONLY the first non-marker line into Title (D36: no
   * automatic attribution). Text is never rewritten (P1); the segment
   * English boundary fires here. */
  function splitPaste() {
    const text = pasted.trim();
    if (!text) {
      setError(msg.ADD_PASTE_EMPTY);
      return;
    }
    const parsed = parsePastedExperience(text);
    if (parsed.segments.some((c) => containsNonEnglish(c.text))) {
      setError(msg.ERR_NON_ENGLISH_INPUT);
      return;
    }
    setError(null);
    const auto = parsed.autoTitleIndex;
    const rest =
      auto !== null
        ? parsed.segments.filter((_, i) => i !== auto)
        : parsed.segments;
    if (auto !== null) setTitle(parsed.segments[auto].text);
    setSplitList(rest);
    setReviewType(entryType);
    setEntryIdForUpdate(null);
    setConfirmedSnapshot(null);
    go("entry_review");
  }

  function updateCandidateAt(i: number, patch: Partial<SplitCandidate>) {
    setSplitList((list) =>
      list.map((c, idx) => (idx === i ? { ...c, ...patch } : c))
    );
  }

  // Phase 18 drag-and-drop (§13.1): segments move into the single-value
  // sections; a displaced value returns to Achievements — nothing is ever
  // lost (P1). The Dates section fills the structured fields only on an
  // exact month-precision match and consumes the segment (§13.5); anything
  // else becomes the legacy free-text dates value.
  const dragIndexRef = useRef<number | null>(null);

  function takeDragged(): SplitCandidate | null {
    const i = dragIndexRef.current;
    dragIndexRef.current = null;
    if (i === null) return null;
    return splitList[i] ?? null;
  }

  function dropOnTitle() {
    const seg = takeDragged();
    if (!seg) return;
    const displaced = title.trim();
    setSplitList((list) => {
      const rest = list.filter((c) => c !== seg);
      return displaced
        ? [...rest, { text: displaced, flagged: false, splitSuggested: false }]
        : rest;
    });
    setTitle(seg.text);
  }

  function dropOnOrg() {
    const seg = takeDragged();
    if (!seg) return;
    const displaced = company.trim();
    setSplitList((list) => {
      const rest = list.filter((c) => c !== seg);
      return displaced
        ? [...rest, { text: displaced, flagged: false, splitSuggested: false }]
        : rest;
    });
    setCompany(seg.text);
  }

  function dropOnDates() {
    const seg = takeDragged();
    if (!seg) return;
    const match = matchDatePattern(seg.text);
    if (match) {
      if (match.startDate) setStartDate(match.startDate);
      if (match.endDate) setEndDate(match.endDate);
      if (match.ongoing) setOngoing(true);
    } else {
      setDates(seg.text);
    }
    setSplitList((list) => list.filter((c) => c !== seg));
  }

  /** Per-type organization label (§13.1: one unified form, labels follow
   * the selected type). */
  function orgLabel(type: string): string {
    if (type === "project") return msg.ORG_LABEL_PROJECT;
    if (type === "course") return msg.ORG_LABEL_COURSE;
    if (type === "side_work") return msg.ORG_LABEL_SIDE_WORK;
    return msg.ORG_LABEL_JOB;
  }

  /** Phase 18 (spec §13.1/§13.4): confirm the review. Zero achievements →
   * draft; one or more → the entry (NO upper cap on the web). A changed
   * re-confirm UPDATES the same stored entry (the id is re-stamped — no
   * duplicate); a NO-change re-confirm skips re-analysis (P5) and returns
   * to the review page directly. */
  async function confirmSplit() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError(msg.ERR_INVALID_TITLE);
      return;
    }
    const bullets = splitList
      .map((c) => c.text.trim())
      .filter((t) => t.length > 0);
    if (
      (startDate && !MONTH_FIELD_RE.test(startDate)) ||
      (!ongoing && endDate && !MONTH_FIELD_RE.test(endDate))
    ) {
      setError(msg.ERR_DATE_FORMAT);
      return;
    }
    const payload = {
      type: reviewType || entryType,
      title: trimmedTitle,
      bullets,
      company: company.trim() || undefined,
      dates: dates.trim() || undefined,
      product_domain: domain.trim() || undefined,
      start_date: startDate || undefined,
      end_date: ongoing ? undefined : endDate || undefined,
      ongoing: ongoing || undefined,
      entry_id: entryIdForUpdate ?? undefined,
    };
    // Phase 18 (§13.4): a NO-change re-confirm skips re-analysis (P5) — but
    // ONLY when the previous confirm's analysis actually completed. After a
    // failed scoring the snapshot is never saved, so the next confirm
    // re-runs the whole pipeline (no stale unanalyzed state is ever shown).
    const snapshot = JSON.stringify(payload);
    const sessionEntry = getSession()?.entry ?? null;
    const analyzed = sessionEntry !== null && sessionEntry.entry_score !== null;
    if (entryIdForUpdate !== null && snapshot === confirmedSnapshot && analyzed) {
      setJustScored(false);
      go("bullet_list");
      return;
    }
    if (
      bullets.some((b) => containsNonEnglish(b)) ||
      [trimmedTitle, company, dates, domain].some(
        (t) => t && containsNonEnglish(t)
      )
    ) {
      setError(msg.ERR_NON_ENGLISH_INPUT);
      return;
    }
    setBusy(true);
    const result = await apiPost<{ entry: StoredEntry; is_draft: boolean }>(
      "/api/entry",
      payload
    );
    setBusy(false);
    if (!result.ok) {
      setError(
        result.error === "ERR_NON_ENGLISH_INPUT"
          ? msg.ERR_NON_ENGLISH_INPUT
          : msg.ERR_INVALID_CHOICE
      );
      return;
    }
    const stored = result.entry;
    if (entryIdForUpdate !== null) stored.id = entryIdForUpdate; // §13.4
    updateSession((s) => {
      s.entry = stored;
      s.sourceText = pasted.trim();
    });
    setSession(getSession());
    setConfirmedSnapshot(snapshot);
    setEntryIdForUpdate(stored.id);
    clearDraft("paste"); // the paste is now stored in the session (FR-20)
    logEvent("entry_saved", null, {
      bullets: stored.bullets.length,
      draft: result.is_draft,
      updated: entryIdForUpdate !== null,
    });
    if (result.is_draft) {
      setMessage(msg.DRAFT_NOTICE + " " + msg.DRAFT_SUGGESTION);
      logEvent("entry_saved_as_draft", "no_bullets", null);
      setConfirmedSnapshot(snapshot); // drafts need no analysis — final state
      go("menu");
      return;
    }
    // The snapshot is saved ONLY after the analysis pipeline succeeds — a
    // failed scoring leaves it unset so the next confirm re-runs everything.
    const scored = await showScores();
    if (scored) setConfirmedSnapshot(snapshot);
  }

  // ---------- score view ----------

  async function showScores(): Promise<boolean> {
    const result = await scoreAndPersist();
    if (!result) return false;
    logEvent("analysis_completed", null, {
      entry_score: result.entry_score,
      rubric_version: result.rubric_version,
    });
    // Phase 18 (§13.3): the separate score screen is gone — the review
    // page (bullet list + panel) follows the analysis directly.
    setJustScored(true);
    go("bullet_list");
    return true;
  }

  // ---------- bullet list ----------

  function openBullet(bullet: StoredBullet) {
    if (!entry || askedThisRun.has(bullet.id)) return;
    setCurrentBulletId(bullet.id);
    // §13.3: the encouragement line belongs to the moment right after a
    // fresh scoring — opening a bullet ends that moment.
    setJustScored(false);
    logEvent("bullet_selected", null, { bullet_id: bullet.id });
    go("bullet_gate");
  }

  // ---------- rewrite gate ----------

  function currentBullet(): StoredBullet | null {
    if (!entry || currentBulletId === null) return null;
    return entry.bullets.find((b) => b.id === currentBulletId) ?? null;
  }

  /** Inline improvement (user decision 2026-11-03): the answers typed on the
   * bullet-gate screen replace the per-screen question flow. 0 answers ->
   * confirmation for a complete bullet, otherwise no rewrite; any answers ->
   * the confirmed improvements replace the bullet's weak parts and the
   * improved text is RE-SCORED through the full first-time pipeline (fresh
   * extraction + rubric ratings) before the rewrite is offered. */
  async function submitInlineAnswers(inline: Partial<Record<QuestionDimension, string>>) {
    const bullet = currentBullet();
    if (!bullet) return;
    for (const [, value] of Object.entries(inline)) {
      if (value && containsNonEnglish(value)) {
        setError(msg.ERR_NON_ENGLISH_INPUT);
        return;
      }
    }
    logEvent("rewrite_gate", "accepted", { bullet_id: bullet.id, inline: true });
    markAsked();
    setError(null);
    const answered = Object.values(inline).filter((v) => v && v.trim()).length;
    if (answered === 0) {
      const ratings = bullet.ratings;
      // A complete bullet (all three dimensions 2) gets only the final
      // confirmation, never questions (spec §6).
      if (ratings && isComplete(ratings as Ratings)) {
        go("confirm_complete");
        return;
      }
      setMessage(msg.NO_REWRITE);
      go("bullet_list");
      return;
    }
    // Apply the confirmed improvements to the bullet text, then re-score the
    // improved text exactly like the first analysis (rubric-3.1.0 pipeline):
    // fresh five-part extraction + fresh rubric ratings, and the before/
    // after experience score is shown on the score screen.
    const improved = improvedBullet(frameworkRows(bullet), inline) || bullet.text;
    if (improved !== bullet.text) {
      const before = entry?.entry_score ?? null;
      updateSession((s) => {
        if (!s.entry) return;
        const b = s.entry.bullets.find((x) => x.id === bullet.id);
        if (!b) return;
        b.history.push({
          text: b.text,
          ratings: b.ratings,
          rubric_version: b.rubric_version,
          replaced_at: new Date().toISOString(),
        });
        b.text = improved;
        b.status = "edited";
        b.proposals.push({ text: improved, decision: "approved" });
      });
      setSession(getSession());
      logEvent("bullet_improved_inline", null, { bullet_id: bullet.id });
      const scored = await scoreAndPersist(bullet.id);
      if (!scored) return;
      const current = getSession();
      setMessage(
        msg.ENCOURAGE_STRONGER +
          " " +
          fmt(msg.SCORE_BEFORE_AFTER, {
            before: before === null ? "None" : round2(before),
            after:
              current?.entry?.entry_score === null || current?.entry?.entry_score === undefined
                ? "None"
                : round2(current.entry.entry_score),
            rubric: DEFAULT_RUBRIC_VERSION,
          })
      );
      go("bullet_list");
      return;
    }
    // Nothing changed (all answers matched the original words): show the
    // re-scored state without a before/after line.
    await scoreAndPersist(bullet.id);
    go("bullet_list");
  }

  /** "2) No" on the bullet gate: no rewrite, no questions. */
  function gateAnswer() {
    const bullet = currentBullet();
    if (!bullet) return;
    logEvent("rewrite_gate", "rejected", { bullet_id: bullet.id });
    markAsked();
    setMessage(msg.NO_REWRITE);
    go("bullet_list");
  }

  function markAsked() {
    if (currentBulletId !== null) {
      setAskedThisRun((prev) => new Set(prev).add(currentBulletId));
    }
  }


  // ---------- complete-bullet confirmation + direct edit ----------

  async function confirmComplete(keep: boolean) {
    const bullet = currentBullet();
    if (!bullet) return;
    logEvent("complete_bullet_confirmed", keep ? "keep" : "edit", { bullet_id: bullet.id });
    if (keep) {
      go("bullet_list");
      return;
    }
    setEditingBulletId(bullet.id);
    setEditText(bullet.text);
    go("bullet_list");
    // Editing happens from the list; preselect the bullet via edit state.
  }

  async function submitEdit() {
    const id = editingBulletId;
    if (id === null) return;
    const text = editText.trim();
    if (!text) return;
    if (containsNonEnglish(text)) {
      setError(msg.ERR_NON_ENGLISH_INPUT);
      return;
    }
    updateSession((s) => {
      const b = s.entry?.bullets.find((x) => x.id === id);
      if (b) {
        b.text = text;
        b.status = "edited";
      }
    });
    setSession(getSession());
    setEditingBulletId(null);
    logEvent("bullet_edited", null, { bullet_id: id });
    const result = await scoreAndPersist();
    if (!result) return;
    setMessage(msg.EDIT_BULLET_DONE);
    go("bullet_list");
  }

  // ---------- merge warning + copy + survey ----------

  async function finishExperience() {
    if (!entry) return;
    setBusy(true);
    const result = await apiPost<{ pairs: { bullet_a: number; bullet_b: number }[] }>(
      "/api/overlap",
      { texts: entry.bullets.map((b) => b.text) }
    );
    setBusy(false);
    if (!result.ok) {
      setError(msg.ERR_EVALUATOR_FAILURE);
      return;
    }
    if (result.pairs.length === 0) {
      go("copy");
      return;
    }
    go("merge");
  }

  async function mergeDecision(merge: boolean) {
    logEvent("merge_decision", merge ? "merge" : "no_merge", null);
    if (!merge || !entry) {
      setMessage(msg.MERGE_DECLINED);
      go("copy");
      return;
    }
    setBusy(true);
    const result = await apiPost<{ pairs: { bullet_a: number; bullet_b: number }[] }>(
      "/api/overlap",
      { texts: entry.bullets.map((b) => b.text) }
    );
    setBusy(false);
    if (!result.ok || result.pairs.length === 0) {
      go("copy");
      return;
    }
    const pair = result.pairs[0];
    updateSession((s) => {
      if (!s.entry) return;
      const first = s.entry.bullets.find((b) => b.id === pair.bullet_a);
      const second = s.entry.bullets.find((b) => b.id === pair.bullet_b);
      if (!first || !second) return;
      // Verbatim join of the two user texts; nothing is invented.
      first.text = `${first.text} ${second.text}`;
      first.status = "edited";
      s.entry.bullets = s.entry.bullets.filter((b) => b.id !== second.id);
    });
    setSession(getSession());
    const scored = await scoreAndPersist();
    if (!scored) return;
    go("bullet_list");
  }

  function finalText(): string {
    if (!entry) return "";
    const lines = [entry.title];
    for (const b of entry.bullets) lines.push(`- ${b.text}`);
    return lines.join("\n");
  }

  function copyFinal() {
    void navigator.clipboard?.writeText(finalText());
    logEvent("copy_clicked", null, null);
  }

  function submitSurvey() {
    logEvent("survey_submitted", null, {
      ease: surveyEase,
      useful: surveyUseful,
      comment: surveyComment,
    });
    go("done");
  }

  // ---------- JD Matcher (staged, posting-only) ----------

  async function analyzePosting() {
    let text = postingText;
    // Terminal: a line containing only END terminates the paste.
    const lines = text.split("\n");
    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
    if (lines.length && lines[lines.length - 1].trim() === "END") lines.pop();
    text = lines.join("\n");
    if (!text.trim()) return;
    setBusy(true);
    const result = await apiPost<MatchResult>("/api/matcher", { posting_text: text });
    setBusy(false);
    logEvent("posting_received", null, { word_count: text.trim().split(/\s+/).length });
    if (!result.ok) {
      logEvent(`matcher_${result.error}`, null, { stage: result.stage ?? null });
      setMatchParams(result.params ?? {});
      setMatch({ cleaning: result.cleaning ?? {
        script_blocks: 0, style_blocks: 0, html_tags: 0, word_count: 0,
      } });
      if (result.stage === "paste") {
        go("match_paste");
      } else {
        // Extraction-stage errors surface after the review gate, like the
        // terminal; we keep the cleaning data for the review screen.
        go("match_review");
      }
      setError(result.error);
      return;
    }
    logEvent("posting_cleaned", null, { ...result.cleaning });
    setMatch(result);
    go("match_review");
  }

  function matchStageConfirmed(stage: string) {
    logEvent("stage_confirmed", "Y", { stage });
    // Web-prototype order requested by the product owner: soft skills are
    // shown BEFORE hard skills (the terminal order was hard -> soft).
    if (stage === "review") go("match_soft");
    else if (stage === "soft_skills") go("match_hard");
    else go("menu"); // hard_skills confirmed -> flow complete
  }

  function matchStageCancelled(stage: string) {
    logEvent("stage_cancelled", "C", { stage });
    setMatch(null);
    setError(null);
    setMessage(msg.MATCH_CANCELLED);
    go("match_paste");
  }

  function matcherErrorText(): string | null {
    if (!error) return null;
    switch (error) {
      case "MATCH_ERR_PERSIAN":
        return msg.MATCH_ERR_PERSIAN;
      case "MATCH_ERR_TOO_SHORT":
        return fmt(msg.MATCH_ERR_TOO_SHORT, { count: matchParams.count ?? 0, limit: 100 });
      case "MATCH_ERR_TOO_LONG":
        return fmt(msg.MATCH_ERR_TOO_LONG, { count: matchParams.count ?? 0, limit: 1500 });
      case "MATCH_ERR_NOT_A_POSTING":
        return msg.MATCH_ERR_NOT_A_POSTING;
      case "MATCH_ERR_ZERO_SKILLS":
        return msg.MATCH_ERR_ZERO_SKILLS;
      case "MATCH_ERR_CONSISTENCY":
        return msg.MATCH_ERR_CONSISTENCY;
      case "ERR_MATCHER_FAILURE":
        return msg.ERR_MATCHER_FAILURE;
      default:
        return null;
    }
  }

  // ---------- rendering helpers ----------

  function frameworkRows(bullet: StoredBullet) {
    const ratings = bullet.ratings;
    // "vague" needs words — an empty part is always "missing", never vague.
    const vague = (words: string, low: boolean) =>
      words !== "" && ratings !== null && low;
    const needWords = (bullet.user_need ?? "").trim();
    const actionWords = (bullet.action ?? "").trim();
    const resultWords = (bullet.result ?? "").trim();
    return [
      {
        key: "user_need",
        label: PART_LABELS.user_need,
        words: needWords,
        vague: vague(needWords, ratings !== null && ratings.context < 2),
      },
      {
        key: "product_feature",
        label: PART_LABELS.product_feature,
        words: (bullet.product_feature ?? "").trim(),
        vague: false,
      },
      {
        key: "action",
        label: PART_LABELS.action,
        words: actionWords,
        vague: vague(actionWords, ratings !== null && ratings.role_action_clarity < 2),
      },
      {
        key: "result",
        label: PART_LABELS.result,
        words: resultWords,
        vague: vague(resultWords, ratings !== null && ratings.result < 2),
      },
      {
        key: "metric",
        label: PART_LABELS.metric,
        words: (bullet.metric ?? "").trim(),
        vague: false,
      },
    ];
  }

  const bulletIndex = useMemo(() => {
    if (!entry || currentBulletId === null) return { n: 0, total: 0 };
    const i = entry.bullets.findIndex((b) => b.id === currentBulletId);
    return { n: i + 1, total: entry.bullets.length };
  }, [entry, currentBulletId]);

  if (!ready) return null;

  const needsGate = screen === "gate";

  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-[680px] px-5 py-8">
        <header className="mb-8 flex items-center justify-between">
          <span className="text-sm font-semibold tracking-wide text-neutral-500">
            Job Forward
          </span>
          {session && screen !== "welcome" && screen !== "gate" && (
            <button onClick={restart} className="btn-secondary !min-h-10 !py-2 text-sm">
              Restart session
            </button>
          )}
        </header>

        {stage && <StageProgress flow={stage.flow} index={stage.index} />}

        {busy && (
          <div role="status" className="msg-info mb-6 flex items-center gap-2">
            <span className="pulse-dot" aria-hidden="true" />
            Analyzing…
          </div>
        )}
        {error && errorText(error, matchParams) && (
          <div role="alert" className="msg-error mb-6">
            {errorText(error, matchParams)}
          </div>
        )}
        {/* §15 FR-49: the class-matched guidance box replaces the bare error
            text — advice + actions at the failing stage, never console-only. */}
        {gatewayError && gatewayReason && (
          <GuidanceBox
            reason={gatewayReason}
            showDowngradeOffer={byokDowngradeOffer}
            onRetry={() => {
              setGatewayError(null);
              setGatewayReason(null);
              setByokDowngradeOffer(false);
              retryActionRef.current?.();
            }}
            onOwnKey={handleOwnKey}
            onFreePath={() => {
              // Explicit user confirmation (FR-28): switch scoring to the
              // free gateway path and retry the same input.
              setUseForScoring(false);
              setByokDowngradeOffer(false);
              setGatewayError(null);
              setGatewayReason(null);
              retryActionRef.current?.();
            }}
            onOpenSettings={() => {
              setSettingsMode("menu");
              go("llm_settings");
            }}
          />
        )}
        {gatewayError && !gatewayReason && (
          <div role="alert" className="msg-error mb-6">
            <p>{gatewayError}</p>
          </div>
        )}
        {/* §15 FR-50: the transfer explanation — NEVER a silent jump; the
            transfer proceeds after 5 s or on a single tap. */}
        {transferNotice && (
          <div role="alert" className="msg-error mb-6">
            <p>{transferNotice}</p>
            <button className="btn-primary mt-3" onClick={doTransfer}>
              Continue
            </button>
          </div>
        )}
        {/* §15 FR-51: the one-tap ask shown once after a saved return from a
            failure-initiated settings visit. */}
        {retryAsk && (
          <div role="note" className="card mb-6 p-4">
            <p className="font-medium">{RETRY_ASK}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                className="btn-primary"
                onClick={() => {
                  setRetryAsk(false);
                  retryActionRef.current?.();
                }}
              >
                Retry now
              </button>
              <button className="btn-secondary" onClick={() => setRetryAsk(false)}>
                Not now
              </button>
            </div>
          </div>
        )}
        {message && (
          <div className="msg-success mb-6">{message}</div>
        )}

        {/* §15 FR-52/53: the persistent banner — every screen from the menu
            onward, source + connection color state + in-place switching.
            Purely informational; it never gates navigation. */}
        {/* §16 FR-61: the persistent header on EVERY page (gate/welcome
            included) — source label, status, in-place switching, and the
            quick BYOK entry. */}
        <ModelBanner
          visible={true}
          status={connStatus}
          checkBusy={checkBusy}
          onCheckAgain={() => void runConnectionCheckOnce(true)}
          onOpenSettings={() => {
            setSettingsMode("menu");
            go("llm_settings");
          }}
          onQuickByok={() => setQuickByokOpen(true)}
        />
        <ByokQuickModal
          open={quickByokOpen}
          onClose={() => setQuickByokOpen(false)}
          onOpenFullSettings={() => {
            setSettingsMode("menu");
            go("llm_settings");
          }}
        />
        {fallbackNotice && (
          <div role="note" className="mb-6 text-[14px] text-neutral-600">
            {fallbackNotice} — scores came from a non-primary model (see the
            server log for details).
          </div>
        )}

        {needsGate && (
          <div>
            <h1 className="mb-2 text-2xl font-semibold">Hi there!</h1>
            <p className="mb-4 text-neutral-700">
              Enter the access code you were given, and we'll get started.
            </p>
            <input
              className="text-input mb-4"
              type="password"
              value={gatePassword}
              onChange={(e) => setGatePassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitGate();
              }}
              autoFocus
            />
            <button className="btn-primary" onClick={() => void submitGate()}>
              Let's go
            </button>
          </div>
        )}

        {!needsGate && screen === "welcome" && <Welcome onAccept={acceptConsent} />}
        {screen === "menu" && (
          <Menu
            entry={entry}
            onAdd={() => {
              logEvent("menu_choice", "add_experience");
              setEntryType("");
              setTitle("");
              setCompany("");
              setDates("");
              setDomain("");
              setPasted("");
              setSplitList([]);
              setStartDate("");
              setEndDate("");
              setOngoing(false);
              setReviewType("");
              setJustScored(false);
              setConfirmedSnapshot(null);
              setEntryIdForUpdate(null);
              go("entry_type");
            }}
            onMatch={() => {
              logEvent("menu_choice", "match_posting");
              go("match_paste");
            }}
            onExit={() => {
              logEvent("menu_choice", "exit");
              go("done");
            }}
            onByok={() => {
              logEvent("menu_choice", "llm_settings");
              setSettingsMode("menu");
              go("llm_settings");
            }}
          />
        )}
        {/* §15 FR-54: the independent LLM settings section — status card +
            BYOK card; menu visits return to the menu, failure visits to the
            origin stage (FR-50/51). */}
        {screen === "llm_settings" && (
          <LlmSettingsSection
            onBack={() => returnToOrigin(false)}
            status={connStatus}
            checkBusy={checkBusy}
            onCheckAgain={() => void runConnectionCheckOnce(true)}
          >
            <ByokSettings
              failureMode={settingsMode === "failure"}
              onSaved={() => returnToOrigin(true)}
              onBack={() => returnToOrigin(false)}
            />
          </LlmSettingsSection>
        )}
        {screen === "entry_type" && (
          <ChoiceScreen
            title={msg.ADD_TYPE}
            options={[
              ["job", "Job"],
              ["project", "Project"],
              ["course", "Course"],
              ["side_work", "Side work"],
            ]}
            onPick={chooseType}
            onBack={() => go("menu")}
          />
        )}
        {screen === "entry_paste" && (
          <div>
            <h1 className="mb-4 text-2xl font-semibold">{msg.ADD_PASTE_HEADING}</h1>
            <label className="mb-2 block">
              <span className="mb-1 block text-[14px] font-medium text-neutral-800">
                {msg.ADD_PASTE_LABEL}
              </span>
              <p className="mb-2 text-[14px] text-neutral-700">
                {msg.ADD_PASTE_INSTRUCTION}
              </p>
              <textarea
                className="text-input"
                rows={12}
                value={pasted}
                onChange={(e) => {
                  setPasted(e.target.value);
                  saveDraftDebounced("paste", e.target.value);
                }}
                placeholder="Paste in English"
                autoFocus
              />
              <p className="mt-2 text-[13px] text-neutral-600">{msg.ADD_PASTE_EXAMPLE}</p>
              {pasted.split("\n").filter((l) => l.trim().length > 0).length > 8 && (
                <p className="mt-2 text-[14px] font-medium text-amber-700">
                  {msg.SOFT_LIMIT_NOTE}
                </p>
              )}
            </label>
            <div className="mt-4 flex flex-wrap gap-3">
              <button className="btn-primary" onClick={splitPaste}>
                {msg.ADD_PASTE_SPLIT}
              </button>
              <button className="btn-secondary" onClick={() => go("entry_type")}>
                {msg.BACK}
              </button>
            </div>
          </div>
        )}
        {screen === "entry_review" && (
          <div>
            <h1 className="mb-4 text-2xl font-semibold">{msg.REVIEW_HEADING}</h1>
            <label className="mb-4 block">
              <span className="mb-1 block text-[14px] font-medium text-neutral-800">
                {msg.REVIEW_TYPE_LABEL}
              </span>
              <select
                className="text-input"
                value={reviewType}
                onChange={(e) => {
                  setReviewType(e.target.value);
                  setEntryType(e.target.value);
                }}
              >
                <option value="job">Job</option>
                <option value="project">Project</option>
                <option value="course">Course</option>
                <option value="side_work">Side work</option>
              </select>
            </label>
            {/* Single-value sections are drop targets: dropping REPLACES the
                value and the displaced text returns to Achievements (§13.1 —
                nothing is ever lost). */}
            <div className="mb-3 grid gap-3 sm:grid-cols-2">
              <div
                className="card"
                onDragOver={(e) => e.preventDefault()}
                onDrop={dropOnTitle}
              >
                <span className="mb-1 block text-[14px] font-medium text-neutral-800">
                  {msg.REVIEW_SECTION_TITLE}
                </span>
                <input
                  className="text-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <p className="mt-1 text-[13px] text-neutral-600">{msg.FIELD_HINT_TITLE}</p>
              </div>
              <div
                className="card"
                onDragOver={(e) => e.preventDefault()}
                onDrop={dropOnOrg}
              >
                <span className="mb-1 block text-[14px] font-medium text-neutral-800">
                  {orgLabel(reviewType)}
                </span>
                <input
                  className="text-input"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </div>
            </div>
            <div
              className="card mb-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={dropOnDates}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[14px] font-medium text-neutral-800">
                    {msg.FIELD_START_DATE}
                  </span>
                  <input
                    className="text-input"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    placeholder="2022-04"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[14px] font-medium text-neutral-800">
                    {msg.FIELD_END_DATE}
                  </span>
                  <input
                    className="text-input"
                    value={endDate}
                    disabled={ongoing}
                    onChange={(e) => setEndDate(e.target.value)}
                    placeholder={ongoing ? "—" : "2024-08"}
                  />
                </label>
              </div>
              <label className="mt-2 flex items-center gap-2 text-[15px]">
                <input
                  type="checkbox"
                  checked={ongoing}
                  onChange={(e) => {
                    setOngoing(e.target.checked);
                    if (e.target.checked) setEndDate("");
                  }}
                />
                {msg.FIELD_ONGOING}
              </label>
              {(startDate && !MONTH_FIELD_RE.test(startDate)) ||
              (!ongoing && endDate && !MONTH_FIELD_RE.test(endDate)) ? (
                <p className="msg-error mt-2 text-[14px]">{msg.ERR_DATE_FORMAT}</p>
              ) : null}
            </div>
            <label className="mb-4 block">
              <span className="mb-1 block text-[14px] font-medium text-neutral-800">
                {msg.ADD_FIELD_DOMAIN}
              </span>
              <input
                className="text-input"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
              />
            </label>
            <h2 className="mb-3 text-xl font-semibold">
              {fmt(msg.SPLIT_FOUND, { n: splitList.length })}
            </h2>
            <ol className="mb-6 space-y-3">
              {splitList.map((c, i) => (
                <li
                  key={i}
                  className="card"
                  draggable
                  onDragStart={() => {
                    dragIndexRef.current = i;
                  }}
                  onDragEnd={() => {
                    dragIndexRef.current = null;
                  }}
                >
                  <input
                    className="text-input"
                    value={c.text}
                    onChange={(e) => updateCandidateAt(i, { text: e.target.value })}
                    aria-label={msg.REVIEW_SECTION_ACHIEVEMENTS}
                  />
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-3">
              <button className="btn-primary" onClick={() => void confirmSplit()}>
                {msg.SPLIT_CONFIRM}
              </button>
              <button className="btn-secondary" onClick={() => go("entry_paste")}>
                {msg.BACK}
              </button>
            </div>
          </div>
        )}
        {(screen === "bullet_list" || screen === "bullet_gate") &&
          session?.sourceText && (
            <details className="mb-4 rounded-md border border-neutral-200 bg-neutral-50 p-3">
              <summary className="cursor-pointer text-[13px] font-medium text-neutral-600">
                {msg.SOURCE_PASTE_TITLE}
              </summary>
              <pre className="mt-2 whitespace-pre-wrap text-[13px] text-neutral-700">
                {session.sourceText}
              </pre>
            </details>
          )}
        {screen === "bullet_list" && entry && (
          <BulletList
            entry={entry}
            asked={askedThisRun}
            justScored={justScored}
            onPick={openBullet}
            onEdit={(id) => {
              setEditingBulletId(id);
              setEditText(entry.bullets.find((b) => b.id === id)?.text ?? "");
            }}
            editingId={editingBulletId}
            editText={editText}
            setEditText={setEditText}
            onEditCancel={() => setEditingBulletId(null)}
            onEditSubmit={() => void submitEdit()}
            onFinish={() => void finishExperience()}
            onBack={() => go("entry_review")}
          />
        )}
        {screen === "bullet_gate" && entry && currentBullet() && (
          <BulletGate
            entry={entry}
            bullet={currentBullet()!}
            n={bulletIndex.n}
            rows={frameworkRows(currentBullet()!)}
            onAnswer={gateAnswer}
            onSubmitAnswers={submitInlineAnswers}
            onBack={() => go("bullet_list")}
          />
        )}
        {screen === "confirm_complete" && (
          <ChoiceScreen
            title={msg.BULLET_CONFIRM}
            options={[
              ["keep", "Keep"],
              ["edit", "I will edit it myself"],
            ]}
            onPick={(pick) => void confirmComplete(pick === "keep")}
            onBack={() => go("bullet_list")}
          />
        )}
        {screen === "merge" && (
          <ChoiceScreen
            title={msg.MERGE_WARN}
            options={[
              ["merge", "Merge"],
              ["no", "Do not merge and continue"],
            ]}
            onPick={(pick) => void mergeDecision(pick === "merge")}
            onBack={() => go("bullet_list")}
          />
        )}
        {screen === "copy" && (
          <div>
            <h1 className="mb-4 text-2xl font-semibold">Your text</h1>
            <pre className="card mb-2 whitespace-pre-wrap font-mono text-[16px]">
              {finalText()}
            </pre>
            <p className="mb-6 text-neutral-700">{msg.COPY_NOTICE}</p>
            <div className="flex flex-wrap gap-3">
              <button className="btn-primary" onClick={copyFinal}>
                Copy
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  logEvent("copy_done", null, null);
                  go("survey");
                }}
              >
                Continue
              </button>
              <button className="btn-secondary" onClick={() => go("bullet_list")}>
                {msg.BACK}
              </button>
            </div>
          </div>
        )}
        {screen === "survey" && (
          <div>
            <Survey
              ease={surveyEase}
              setEase={(v) => {
                setSurveyEase(v);
                logEvent("survey_ease", String(v));
              }}
              useful={surveyUseful}
              setUseful={(v) => {
                setSurveyUseful(v);
                logEvent("survey_useful", v);
              }}
              comment={surveyComment}
              setComment={setSurveyComment}
              onSubmit={submitSurvey}
            />
            <button className="btn-secondary mt-4" onClick={() => go("copy")}>
              {msg.BACK}
            </button>
          </div>
        )}
        {screen === "done" && (
          <div>
            <h1 className="mb-4 text-2xl font-semibold">{msg.GOODBYE}</h1>
            <button className="btn-primary" onClick={restart}>
              Restart session
            </button>
          </div>
        )}

        {/* ---- JD Matcher stages ---- */}
        {screen === "match_paste" && (
          <div>
            <h1 className="mb-4 text-2xl font-semibold">{msg.MATCH_PROMPT_PASTE}</h1>
            {matcherErrorText() && (
              <div role="alert" className="card mb-6 border-red-700 text-red-900">
                {matcherErrorText()}
              </div>
            )}
            <textarea
              className="text-input mb-4"
              rows={12}
              value={postingText}
              onChange={(e) => setPostingText(e.target.value)}
              placeholder="Paste the job posting here (English)"
            />
            <div className="flex flex-wrap gap-3">
              <button className="btn-primary" onClick={() => void analyzePosting()}>
                Analyze
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  logEvent("matcher_exit", "C", { stage: "paste" });
                  setMessage(msg.MATCH_CANCELLED_EXIT);
                  go("menu");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {screen === "match_review" && match && (
          <div>
            <h1 className="mb-4 text-2xl font-semibold">Check the cleaned posting</h1>
            {match.cleaning.script_blocks === 1 && match.cleaning.style_blocks === 0 && (
              <p className="mb-2">{msg.MATCH_CLEAN_SCRIPT_ONE}</p>
            )}
            {(match.cleaning.script_blocks > 0 || match.cleaning.style_blocks > 0) &&
              !(match.cleaning.script_blocks === 1 && match.cleaning.style_blocks === 0) && (
                <p className="mb-2">
                  {fmt(msg.MATCH_CLEAN_BLOCKS, {
                    scripts: match.cleaning.script_blocks,
                    styles: match.cleaning.style_blocks,
                  })}
                </p>
              )}
            {match.cleaning.html_tags > 0 && (
              <p className="mb-2">{msg.MATCH_CLEAN_TAGS}</p>
            )}
            <p className="mb-6 font-medium">
              {fmt(msg.MATCH_WORD_COUNT, { count: match.cleaning.word_count })}
            </p>
            {matcherErrorText() && (
              <div role="alert" className="card mb-6 border-red-700 text-red-900">
                {matcherErrorText()}
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              <button
                className="btn-primary"
                onClick={() => matchStageConfirmed("review")}
                disabled={!match.report}
              >
                Continue
              </button>
              <button className="btn-secondary" onClick={() => matchStageCancelled("review")}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {screen === "match_hard" && match?.report && (
          <div>
            <h1 className="mb-4 text-2xl font-semibold">Hard skills</h1>
            {(["must", "should", "nice"] as const).map((priority) => {
              const rows = match.report!.hard_tables[priority] ?? [];
              return (
                <section key={priority} className="mb-6">
                  <h2 className="mb-2 text-lg font-semibold">{priorityLabel(priority)}</h2>
                  <table className="w-full border-collapse text-left text-[15px]">
                    <thead>
                      <tr className="border-b-2 border-neutral-400 text-neutral-700">
                        <th className="py-2 pr-3">Skill</th>
                        <th className="py-2 pr-3">Type</th>
                        <th className="py-2">Evidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 && (
                        <tr>
                          <td className="py-2 text-neutral-500" colSpan={3}>
                            {msg.MATCH_EMPTY_GROUP}
                          </td>
                        </tr>
                      )}
                      {rows.map((row, i) => (
                        <tr key={i} className="border-b border-neutral-200 align-top">
                          <td className="py-2 pr-3 font-medium">
                            <span className="tech-tag">{row.name}</span>
                            {row.default_priority && !row.is_one_of ? " (default)" : ""}
                          </td>
                          <td className="py-2 pr-3">
                            {row.type === "hard_tool" ? msg.MATCH_TYPE_HARD_TOOL : msg.MATCH_TYPE_HARD}
                          </td>
                          <td className="py-2 text-neutral-700">{row.evidence}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rows.length > 5 && (
                    <p className="mt-2 text-sm text-neutral-600">
                      {fmt(msg.MATCH_LIMIT_HARD, {
                        priority: priorityLabel(priority),
                        shown: 5,
                        total: rows.length,
                      })}
                    </p>
                  )}
                </section>
              );
            })}
            <p className="mb-2 font-medium">
              {fmt(msg.MATCH_COUNTS, {
                must: match.report.hard_totals.must ?? 0,
                should: match.report.hard_totals.should ?? 0,
                nice: match.report.hard_totals.nice ?? 0,
              })}
            </p>
            {match.report.dropped_count > 0 && (
              <p className="mb-6 text-neutral-700">
                {fmt(msg.MATCH_DROPPED, { count: match.report.dropped_count })}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <button className="btn-primary" onClick={() => matchStageConfirmed("hard_skills")}>
                Continue
              </button>
              <button className="btn-secondary" onClick={() => matchStageCancelled("hard_skills")}>
                Cancel
              </button>
              <button className="btn-secondary" onClick={() => go("match_review")}>
                {msg.BACK}
              </button>
            </div>
          </div>
        )}
        {screen === "match_soft" && match?.report && (
          <div>
            <h1 className="mb-4 text-2xl font-semibold">Soft skills</h1>
            <table className="mb-4 w-full border-collapse text-left text-[15px]">
              <thead>
                <tr className="border-b-2 border-neutral-400 text-neutral-700">
                  <th className="py-2 pr-3">Skill</th>
                  <th className="py-2 pr-3">Group</th>
                  <th className="py-2 pr-3">Evidence</th>
                  <th className="py-2 pr-3">Priority</th>
                  <th className="py-2">Certainty</th>
                </tr>
              </thead>
              <tbody>
                {match.report.soft_rows.length === 0 && (
                  <tr>
                    <td className="py-2 text-neutral-500" colSpan={5}>
                      {msg.MATCH_EMPTY_GROUP}
                    </td>
                  </tr>
                )}
                {match.report.soft_rows.map((row, i) => (
                  <tr key={i} className="border-b border-neutral-200 align-top">
                    <td className="py-2 pr-3 font-medium">
                      <span className="tech-tag">{row.label_en}</span>
                    </td>
                    <td className="py-2 pr-3">{row.group_code}</td>
                    <td className="py-2 pr-3 text-neutral-700">{row.evidence}</td>
                    <td className="py-2 pr-3">{priorityLabel(row.priority)}</td>
                    <td className="py-2">{capitalize(row.certainty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {match.report.soft_rows.length > 5 && (
              <p className="mb-4 text-sm text-neutral-600">
                {fmt(msg.MATCH_LIMIT_SOFT, {
                  shown: 5,
                  total: match.report.soft_rows.length,
                })}
              </p>
            )}
            {match.report.unmatched.map((concept, i) => (
              <p key={i} className="mb-2 text-neutral-700">
                {fmt(msg.MATCH_NO_TAXONOMY_MATCH, { text: concept.text })}
              </p>
            ))}
            <div className="flex flex-wrap gap-3">
              <button className="btn-primary" onClick={() => matchStageConfirmed("soft_skills")}>
                Continue
              </button>
              <button className="btn-secondary" onClick={() => matchStageCancelled("soft_skills")}>
                Cancel
              </button>
              <button className="btn-secondary" onClick={() => go("match_hard")}>
                {msg.BACK}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

// ---------- screen components ----------

function priorityLabel(priority: string): string {
  return { must: "Must", should: "Should", nice: "Nice" }[priority] ?? priority;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function round2(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function errorText(
  error: string,
  params: Record<string, string | number>
): string | null {
  switch (error) {
    case "ERR_TOO_MANY_BULLETS":
      return msg.ERR_TOO_MANY_BULLETS;
    case "ERR_NON_ENGLISH_INPUT":
      return msg.ERR_NON_ENGLISH_INPUT;
    case "ERR_INVALID_TITLE":
      return msg.ERR_INVALID_TITLE;
    case "ERR_EVALUATOR_FAILURE":
      return msg.ERR_EVALUATOR_FAILURE;
    case "ERR_INVALID_CHOICE":
      return msg.ERR_INVALID_CHOICE;
    case "WRONG_PASSWORD":
      return "Wrong password. Please try again.";
    case "RATE_LIMITED":
      return "Too many requests. Please wait a moment and try again.";
    default:
      // Matcher error ids (MATCH_ERR_*, ERR_MATCHER_FAILURE) are rendered
      // inline on the matcher screens, not in the global banner.
      return null;
  }
}

function Welcome({ onAccept }: { onAccept: () => void }) {
  return (
    <div>
      <h1 className="mb-4 text-3xl font-semibold">Let's make your experience shine.</h1>
      <div className="card mb-6 text-[16px]">
        <p className="mb-3">
          I'll help you turn one of your experiences into clear, strong resume bullets — and show you which skills a job posting is really asking for.
        </p>
        <p className="mb-3">
          Before we begin, a quick heads-up:
        </p>
        <ul className="mb-3 list-disc space-y-2 pl-5">
          <li>I take part in a usability test of this tool.</li>
          <li>My inputs and choices can be saved as test notes (no name is required).</li>
          <li>All data stays in this session and on this computer.</li>
        </ul>
        <p>
          Everything is in English, and you can stop at any time.
        </p>
      </div>
      <button className="btn-primary" onClick={onAccept}>
        Sounds good — Let's Start
      </button>
    </div>
  );
}

function Menu({
  entry,
  onAdd,
  onMatch,
  onExit,
  onByok,
}: {
  entry: StoredEntry | null;
  onAdd: () => void;
  onMatch: () => void;
  onExit: () => void;
  onByok: () => void;
}) {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">
        {msg.MENU_IDLE.split("?")[0]}?
      </h1>
      {entry && <EntryPanel entry={entry} />}
      <div className="flex flex-col gap-3">
        <button className="btn-primary" onClick={onAdd}>
          1) Add an experience
        </button>
        <button className="btn-secondary" onClick={onMatch}>
          2) Match a job posting
        </button>
        <button className="btn-secondary" onClick={onExit}>
          3) Finish for now
        </button>
        <button className="btn-secondary !border-neutral-400 text-[15px] text-neutral-600" onClick={onByok}>
          LLM settings (use your own API key)
        </button>
      </div>
    </div>
  );
}

function EntryPanel({ entry }: { entry: StoredEntry }) {
  const isDraft = entry.bullets.length === 0 || entry.draft_reason === "user_saved";
  return (
    <div className="card mb-6">
      <p className="mb-1 text-sm font-semibold text-neutral-500">
        Saved in this session
      </p>
      <p className="mb-1 font-medium">
        {entry.title || "(no title)"} — {entry.bullets.length} bullet
        {entry.bullets.length === 1 ? "" : "s"}
        {entry.entry_score !== null && !isDraft && (
          <span className="font-mono">
            {` — ${fmt(msg.PANEL_SCORE, {
              value: round2(entry.entry_score),
            })}`}
          </span>
        )}
      </p>
      {isDraft && (
        <p className="text-[15px] text-neutral-700">
          {msg.SCORE_DRAFT_LINE} {msg.DRAFT_SUGGESTION}
        </p>
      )}
      <p className="mt-1 text-sm text-neutral-600">
        Adding a new experience replaces this entry in the session.
      </p>
    </div>
  );
}

function ChoiceScreen({
  title,
  options,
  onPick,
  onBack,
}: {
  title: string;
  options: Array<[string, string]>;
  onPick: (pick: string) => void;
  onBack?: () => void;
}) {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">{title}</h1>
      <div className="flex flex-col gap-3">
        {options.map(([value, label]) => (
          <button
            key={value}
            className={options[0][0] === value ? "btn-primary" : "btn-secondary"}
            onClick={() => onPick(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {onBack && (
        <button className="btn-secondary mt-6" onClick={onBack}>
          {msg.BACK}
        </button>
      )}
    </div>
  );
}

/* W3 (owner look-and-feel 2026-11-05): the overall score as a progress ring
   with the number in JetBrains Mono — not a dry bare number. Brand red stroke
   (emphasis use, §11.1 rule 2) on a warm neutral track. */
function ScoreRing({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const shown = Math.round(clamped);
  const r = 34;
  const circ = 2 * Math.PI * r;
  return (
    <div className="mb-6 flex items-center gap-4">
      <svg width="88" height="88" viewBox="0 0 88 88" aria-hidden="true">
        <circle cx="44" cy="44" r={r} fill="none" strokeWidth="8" stroke="var(--color-neutral-200)" />
        {clamped > 0 && (
          <circle
            cx="44"
            cy="44"
            r={r}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            stroke="var(--primary)"
            strokeDasharray={`${(clamped / 100) * circ} ${circ}`}
            transform="rotate(-90 44 44)"
          />
        )}
        <text
          x="44"
          y="50"
          textAnchor="middle"
          fill="var(--foreground)"
          className="font-mono text-[20px] font-semibold"
        >
          {shown}
        </text>
      </svg>
      <p className="font-mono font-medium">
        {fmt(msg.PANEL_SCORE, {
          value: round2(clamped),
        })}
      </p>
    </div>
  );
}

function BulletList({
  entry,
  asked,
  justScored,
  onPick,
  onEdit,
  editingId,
  editText,
  setEditText,
  onEditCancel,
  onEditSubmit,
  onFinish,
  onBack,
}: {
  entry: StoredEntry;
  asked: Set<number>;
  justScored: boolean;
  onPick: (bullet: StoredBullet) => void;
  onEdit: (id: number) => void;
  editingId: number | null;
  editText: string;
  setEditText: (v: string) => void;
  onEditCancel: () => void;
  onEditSubmit: () => void;
  onFinish: () => void;
  onBack: () => void;
}) {
  const draftState =
    entry.bullets.length === 0 || entry.draft_reason !== null;
  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">{entry.title}</h1>
      {justScored && (
        <p className="mb-4 text-[15px] text-neutral-700">{msg.ENCOURAGE_SCORED}</p>
      )}
      <p className="mb-4 text-neutral-700">
        Pick a bullet to improve it. Bullets you already worked on in this run
        are done.
      </p>
      {entry.bullets.map((bullet, i) => {
        const done = asked.has(bullet.id);
        return (
          <div key={bullet.id} className="card mb-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="mb-1 text-sm text-neutral-600">
                  {fmt(msg.FRAMEWORK_HEADER, {
                    title: entry.title,
                    n: i + 1,
                    total: entry.bullets.length,
                  })}
                </p>
                <p className="mb-2 font-medium">{bullet.text}</p>
                {/* Phase 18 amendment (owner decision 2026-11-07): the
                    per-bullet 0/1/2 dimension ratings are displayed again —
                    they were computed and stored all along (§13.3 note). */}
                {bullet.ratings && (
                  <p className="text-[15px] text-neutral-800">
                    {fmt(msg.SCORE_DIMENSION, { dimension: msg.SCORE_DIMENSION_CONTEXT, value: bullet.ratings.context })}{" "}
                    ·{" "}
                    {fmt(msg.SCORE_DIMENSION, { dimension: msg.SCORE_DIMENSION_ACTION, value: bullet.ratings.role_action_clarity })}{" "}
                    ·{" "}
                    {fmt(msg.SCORE_DIMENSION, { dimension: msg.SCORE_DIMENSION_RESULT, value: bullet.ratings.result })}
                  </p>
                )}
              </div>
              <button
                className="btn-secondary !min-h-10 shrink-0 !px-4 !py-2 text-sm"
                onClick={() => onPick(bullet)}
                disabled={done}
              >
                {done ? "Done" : "Improve"}
              </button>
            </div>
            {editingId === bullet.id && (
              <div className="mt-4 border-t border-neutral-200 pt-4">
                <p className="mb-2">{msg.EDIT_BULLET_TEXT}</p>
                <textarea
                  className="text-input mb-3"
                  rows={3}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                />
                <div className="flex gap-3">
                  <button className="btn-primary" onClick={onEditSubmit}>
                    Save edit
                  </button>
                  <button className="btn-secondary" onClick={onEditCancel}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {!done && editingId !== bullet.id && (
              <button
                className="mt-2 text-sm text-neutral-600 underline"
                onClick={() => onEdit(bullet.id)}
              >
                Edit this bullet myself
              </button>
            )}
          </div>
        );
      })}
      <button className="btn-primary" onClick={onFinish}>
        4) Copy this experience
      </button>
      <p className="mt-3 text-sm text-neutral-600">
        Finishing checks for overlapping bullets and shows your final text.
      </p>
      {/* Phase 18 (spec §13.3): the score panel lives at the BOTTOM of the
          review page — the Experience score with its progress ring beside it
          (no "Overall score" label, no rubric-version header). Drafts keep
          the no-number state. */}
      <div className="mt-6 border-t border-neutral-200 pt-4">
        {!draftState && entry.entry_score !== null ? (
          <ScoreRing value={entry.entry_score} />
        ) : (
          <p className="font-medium">
            {msg.SCORE_OVERALL_HIDDEN} {msg.SCORE_DRAFT_LINE}
          </p>
        )}
      </div>
      <button className="btn-secondary mt-4" onClick={onBack}>
        {msg.BACK}
      </button>
    </div>
  );
}

/** One in-sentence bracket for the five-part display: the job seeker's
 * words only, lowercase label, "missing" when empty, "vague" when the
 * rating is below 2. Colors (user decision 2026-11-03): filled = green,
 * vague = yellow, missing = red — dark shades for readable text on white. */
const PART_COLOR_OK = "text-emerald-700";
const PART_COLOR_VAGUE = "text-amber-700";
const PART_COLOR_MISSING = "text-red-700";

/** Phase 15 (spec §5.2): ONE span per part in the live sentence —
 * filled/vague words carry a soft underline in the KEPT status colors
 * (themed emerald/amber/red); a missing part renders a dotted placeholder
 * slot carrying its muted label (NO brackets). Clicking any fragment (or
 * slot) opens that part's question (§6.2); the active fragment is
 * highlighted (bg-accent — highlight, not a status color). */
function frameworkSpan(
  row: FrameworkRow,
  states: Record<string, string>,
  activeKey: string | null,
  onOpen: (key: string) => void
) {
  const st = states[row.key] ?? "missing";
  const activeCls = row.key === activeKey ? " rounded bg-accent" : "";
  if (st === "missing") {
    return (
      <span
        key={row.key}
        onClick={() => onOpen(row.key)}
        className={`cursor-pointer border-b-2 border-dotted border-neutral-400 px-2 text-neutral-500${activeCls}`}
      >
        {row.label}
      </span>
    );
  }
  const color = row.vague ? PART_COLOR_VAGUE : PART_COLOR_OK;
  return (
    <span
      key={row.key}
      onClick={() => onOpen(row.key)}
      className={`cursor-pointer underline decoration-2 underline-offset-4 ${color}${activeCls}`}
    >
      {row.words}
    </span>
  );
}

// Defined-creativity connectors (specs/001-experience-improvement-flow/few-shot/parser-prompt.md, Display
// Rules): the words outside the brackets are predicted from THIS bullet's
// content via this closed variant set — never copied from an example.
const RESEARCH_START =
  /^(analyzed|researched|identified|noticed|found|benchmarked|mapped|surveyed|audited|compared|evaluated)\b/i;
const COLLAB_MARKER = /\b(collaborated|worked with|partnered|coordinated)\b/i;
const COLLAB_WITH =
  /\bwith (the|a|one|our|my) [a-z-]+ ?(team|engineer|designer|developer|analyst)s?\b/i;
const DELIVERY_VERB =
  /\b(led|built|designed|created|managed|launched|wrote|defined|rebuilt|redesigned|implemented|developed|delivered|shipped|introduced|established|fixed|simplified|automated|planned|tested|migrated|spearheaded|organized|owned|ran|prototyped|negotiated|scoped)\b/i;

/** Framework row key -> question dimension (engine question order). */
const PART_KEY_TO_DIM: Record<string, QuestionDimension> = {
  user_need: "context",
  product_feature: "feature",
  action: "role_action_clarity",
  result: "result",
  metric: "metric",
};

/** Clean inline question text for one framework part (no 1) 2) suffix). */
function inlineQuestion(key: string): string {
  switch (PART_KEY_TO_DIM[key]) {
    case "context":
      return msg.INLINE_Q_CONTEXT;
    case "feature":
      return msg.INLINE_Q_FEATURE;
    case "role_action_clarity":
      return msg.INLINE_Q_ACTION;
    case "result":
      return msg.INLINE_Q_RESULT;
    case "metric":
      return msg.INLINE_Q_METRIC;
    default:
      return "";
  }
}

/** The problem-area phrase predicted from the ORIGINAL bullet: the vague
 * result's words without the "to <verb>" intention prefix ("to uncover
 * friction in hiring flows" -> "friction in hiring flows"). */
function resultCore(resultWords: string): string | null {
  let w = resultWords.trim().replace(/[.…]+$/, "");
  w = w.replace(/^to\s+\w+\s+/i, "");
  return w ? w : null;
}

function capFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Two editable fill-in starters per part. Each is a REAL answer to the
 * part's question (user decision 2026-11-03), predicted from the original
 * bullet's own words via the problem-area core; generic starters are the
 * fallback when no core can be derived. Metric starters keep the "x"
 * number placeholder. */
function answerStarters(row: FrameworkRow, core: string | null): string[] {
  // "friction in X" -> "X" for feature/action phrasing.
  const area = core ? core.replace(/^friction (in|around|with)\s+/i, "") : null;
  switch (row.key) {
    case "user_need":
      if (core)
        return [
          fmt(msg.STARTER_GROUND_NEED_1, { core }),
          fmt(msg.STARTER_GROUND_NEED_2, { core }),
        ];
      return row.vague
        ? [msg.STARTER_NEED_VAGUE_1, msg.STARTER_NEED_VAGUE_2]
        : [msg.STARTER_NEED_MISSING_1, msg.STARTER_NEED_MISSING_2];
    case "product_feature":
      if (area)
        return [
          fmt(msg.STARTER_GROUND_FEATURE_1, { core: area }),
          fmt(msg.STARTER_GROUND_FEATURE_2, { core: area }),
        ];
      return [msg.STARTER_FEATURE_1, msg.STARTER_FEATURE_2];
    case "action":
      if (area)
        return [
          fmt(msg.STARTER_GROUND_ACTION_1, { core: area }),
          fmt(msg.STARTER_GROUND_ACTION_2, { core: area }),
        ];
      return row.vague
        ? [msg.STARTER_ACTION_VAGUE_1, msg.STARTER_ACTION_VAGUE_2]
        : [msg.STARTER_ACTION_MISSING_1, msg.STARTER_ACTION_MISSING_2];
    case "result":
      if (core)
        return [
          fmt(msg.STARTER_GROUND_RESULT_1, { Core: capFirst(core), core }),
          fmt(msg.STARTER_GROUND_RESULT_2, { core }),
        ];
      return row.vague
        ? [msg.STARTER_RESULT_VAGUE_1, msg.STARTER_RESULT_VAGUE_2]
        : [msg.STARTER_RESULT_MISSING_1, msg.STARTER_RESULT_MISSING_2];
    case "metric":
      return [msg.STARTER_METRIC_1, msg.STARTER_METRIC_2];
    default:
      return [];
  }
}

/** Assemble the five-part display sentence with content-predicted
 * connecting words; each bracket span takes its status color. */
function frameworkSentence(
  rows: FrameworkRow[],
  states: Record<string, string>,
  activeKey: string | null,
  onOpen: (key: string) => void
) {
  const [need, feature, action, result, metric] = rows;
  const openConn = need.words && RESEARCH_START.test(need.words)
    ? msg.FRAMEWORK_CONN_RESEARCH
    : msg.FRAMEWORK_CONN_ANALYSIS;
  let featureConn: string;
  if (action.words && (COLLAB_MARKER.test(action.words) || COLLAB_WITH.test(action.words))) {
    featureConn = msg.FRAMEWORK_CONN_COLLAB;
  } else if (action.words && DELIVERY_VERB.test(action.words)) {
    featureConn = msg.FRAMEWORK_CONN_BUILD;
  } else if (action.words) {
    featureConn = msg.FRAMEWORK_CONN_WORK;
  } else if (need.words && RESEARCH_START.test(need.words)) {
    featureConn = msg.FRAMEWORK_CONN_RESEARCH_SEG;
  } else {
    featureConn = msg.FRAMEWORK_CONN_WORK;
  }
  return (
    <>
      {openConn} {frameworkSpan(need, states, activeKey, onOpen)} {featureConn} {frameworkSpan(feature, states, activeKey, onOpen)}{" "}
      {msg.FRAMEWORK_CONN_THROUGH} {frameworkSpan(action, states, activeKey, onOpen)}
      {msg.FRAMEWORK_CONN_RESULTING} {frameworkSpan(result, states, activeKey, onOpen)} {msg.FRAMEWORK_CONN_AND}{" "}
      {frameworkSpan(metric, states, activeKey, onOpen)}.
    </>
  );
}

/** Ambiguity reason for a vague part (Problem 5 of the parser prompt). */
function needReason(row: FrameworkRow): string | null {
  if (!row.vague) return null;
  switch (row.key) {
    case "user_need":
      return fmt(msg.NEEDS_REASON_NEED_VAGUE, { words: row.words });
    case "action":
      return fmt(msg.NEEDS_REASON_ACTION_VAGUE, { words: row.words });
    case "result":
      return fmt(msg.NEEDS_REASON_RESULT_VAGUE, { words: row.words });
    default:
      return null;
  }
}

/** Two medium-creativity suggestions per unfilled or vague part; metric
 * suggestions use "x" as the number placeholder (a real number matters). */
function needSuggestions(row: FrameworkRow): string[] {
  switch (row.key) {
    case "user_need":
      return row.vague
        ? [msg.SUGGEST_NEED_VAGUE_1, msg.SUGGEST_NEED_VAGUE_2]
        : [msg.SUGGEST_NEED_MISSING_1, msg.SUGGEST_NEED_MISSING_2];
    case "product_feature":
      return [msg.SUGGEST_FEATURE_MISSING_1, msg.SUGGEST_FEATURE_MISSING_2];
    case "action":
      return row.vague
        ? [msg.SUGGEST_ACTION_VAGUE_1, msg.SUGGEST_ACTION_VAGUE_2]
        : [msg.SUGGEST_ACTION_MISSING_1, msg.SUGGEST_ACTION_MISSING_2];
    case "result":
      return row.vague
        ? [msg.SUGGEST_RESULT_VAGUE_1, msg.SUGGEST_RESULT_VAGUE_2]
        : [msg.SUGGEST_RESULT_MISSING_1, msg.SUGGEST_RESULT_MISSING_2];
    case "metric":
      return [msg.SUGGEST_METRIC_MISSING_1, msg.SUGGEST_METRIC_MISSING_2];
    default:
      return [];
  }
}

/** Light phrasing repair for a confirmed answer (user decision
 * 2026-11-03): collapse spaces, capitalize, and give action answers their
 * "I" subject when it is missing. The improved form is shown back to the
 * job seeker whenever it differs from what they typed. */
function improveAnswer(key: string, raw: string): string {
  let t = raw.trim().replace(/\s+/g, " ");
  if (!t) return t;
  if (key === "user_need" || key === "result" || key === "action") {
    t = capFirst(t);
  }
  if (key === "action") {
    const hasSubjectOrVerb =
      /^(i|we|led|built|designed|created|wrote|defined|rebuilt|launched|managed|ran|owned|organized|coordinated|improved|developed|delivered|planned|tested|researched|prototyped|automated|negotiated|redesigned|implemented|introduced|shipped|migrated|established|spearheaded|fixed|simplified|scoped)\b/i;
    if (!hasSubjectOrVerb.test(t)) {
      t = "I " + t.charAt(0).toLowerCase() + t.slice(1);
    }
  }
  if (key === "product_feature") {
    t = t.replace(/^the\s+the\s+/i, "the ");
  }
  return t;
}

/** The improved bullet as PLAIN prose (user decision 2026-11-03): each part
 * is the confirmed answer or the original extracted words; brackets, labels,
 * missing/vague notes and template punctuation are dropped. Parts join as
 * "need, so action, and result metric." with light mid-sentence casing. */
function improvedBullet(rows: FrameworkRow[], confirmed: Record<string, string>): string {
  const rowWords = (rowKey: string) => {
    const row = rows.find((r) => r.key === rowKey);
    return row ? row.words : "";
  };
  const pick = (dim: string, rowKey: string) => {
    const conf = (confirmed[dim] ?? "").trim();
    return conf || rowWords(rowKey);
  };
  const clean = (s: string) =>
    s.replace(/\s+/g, " ").trim().replace(/[.…]+$/, "").trim();
  // Mid-sentence parts start lowercase unless they begin with "I".
  const lower = (s: string) =>
    /^i\b/i.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1);
  const segments: string[] = [];
  const need = clean(pick("context", "user_need"));
  const feature = clean(pick("feature", "product_feature"));
  const action = clean(pick("role_action_clarity", "action"));
  const result = clean(pick("result", "result"));
  const metric = clean(pick("metric", "metric"));
  if (need) segments.push(need);
  if (action) segments.push(lower(action));
  else if (feature) segments.push(lower("I built " + feature));
  if (result) segments.push(lower(result));
  if (metric) {
    if (result && segments.length > 0) segments[segments.length - 1] += " " + lower(metric);
    else segments.push(lower(metric));
  }
  if (segments.length === 0) return "";
  let out = segments[0];
  for (let i = 1; i < segments.length; i++) {
    out += (i === 1 ? ", so " : ", and ") + segments[i];
  }
  return out + ".";
}

function BulletGate({
  entry,
  bullet,
  n,
  rows,
  onAnswer,
  onSubmitAnswers,
  onBack,
}: {
  entry: StoredEntry;
  bullet: StoredBullet;
  n: number;
  rows: FrameworkRow[];
  onAnswer: (accepted: boolean) => void;
  onSubmitAnswers: (answers: Partial<Record<QuestionDimension, string>>) => void;
  onBack: () => void;
}) {
  // Inline answers per part. The sentence replaces a part only when the
  // user presses Confirm; until then the extracted display stays.
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState<Record<string, string>>({});
  const [improvedShown, setImprovedShown] = useState<Record<string, boolean>>({});
  // Grounding core for suggestions: predicted once from the ORIGINAL
  // extracted result (stable while the user types).
  const core = resultCore((rows.find((r) => r.key === "result") ?? { words: "" }).words);
  // Copy button state: the improved bullet goes to the clipboard; "Copied"
  // shows next to the button for a moment. Fallback to a hidden textarea +
  // execCommand because some embedded browsers reject the async clipboard
  // API (the silent failure the user hit).
  const [copied, setCopied] = useState(false);
  const copyText = improvedBullet(rows, confirmed) || bullet.text;
  const copyImproved = () => {
    const done = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };
    const legacyCopy = (text: string) => {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        // nothing else we can do; the tooltip still confirms the attempt
      }
      document.body.removeChild(ta);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(copyText).then(done).catch(() => {
        legacyCopy(copyText);
        done();
      });
    } else {
      legacyCopy(copyText);
      done();
    }
  };
  // Phase 15 (spec §5.2/§6.2): the glance row + focused loop. partStates
  // mirrors PartDisplayState; the loop order is stable from the bullet's
  // ORIGINAL extracted state (typing/confirming never reshuffles it).
  const loopOrder = questionOrder(rows);
  const [activeIdx, setActiveIdx] = useState(0);
  const activeKey = loopOrder[activeIdx] ?? null;
  const openPart = (key: string) => {
    const idx = loopOrder.indexOf(key);
    if (idx >= 0) setActiveIdx(idx);
  };
  const displayRows = rows.map((r) => {
    const dim = PART_KEY_TO_DIM[r.key];
    // Phase 15 (§6.2): the sentence updates LIVE — the confirmed value OR
    // the active question's current typing shows in the sentence at once.
    const val =
      (confirmed[dim] ?? "").trim() ||
      (activeKey === r.key ? (inputs[dim] ?? "").trim() : "");
    return val ? { ...r, words: val, vague: false } : r;
  });
  const states = partStates(displayRows);
  // Phase 12 (spec §2.2): the diagnostic coverage record — gray rows for
  // the bullet's orphaned spans (maximal unclaimed runs). Data comes from
  // the engine's buildCoverage twin; it never affects statuses or scores.
  const orphans = (bullet.coverage ?? []).filter((e) => e.part === "orphaned");
  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">
        {fmt(msg.FRAMEWORK_HEADER, {
          title: entry.title,
          n,
          total: entry.bullets.length,
        })}
      </h1>
      <div className="mb-4 flex items-start justify-between gap-3">
        <p className="text-[17px]">
          {fmt(msg.FRAMEWORK_ORIGINAL, { text: bullet.text })}
        </p>
        <div className="relative shrink-0">
          <button
            aria-label={msg.COPY_BUTTON}
            title={msg.COPY_BUTTON}
            className="btn-secondary !min-h-9 text-sm"            onClick={copyImproved}
          >
            {msg.COPY_BUTTON}
          </button>
          {copied && (
            <span
              role="status"
              className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded bg-foreground px-2 py-1 text-[12px] text-background"
            >
              {msg.COPY_TOOLTIP}
            </span>
          )}
        </div>
      </div>
      {/* Phase 18 (§13.4): Back to the review page — never wipes state. */}
      <button className="btn-secondary mb-4" onClick={onBack}>
        {msg.BACK}
      </button>
      <p className="mb-2 text-[16px]">
        {frameworkSentence(displayRows, states, activeKey, openPart)}
      </p>
      {/* Phase 15 (§5.2): the five-cell glance row — one cell per part,
          three states by TEXT and weight only (no icons, no row colors,
          §11.1 rule 1). Cells are clickable too: they open that part's
          question. */}
      <div className="mb-4 grid grid-cols-5 gap-2">
        {rows.map((r) => {
          const st = states[r.key] ?? "missing";
          const weight =
            st === "missing" ? "font-bold" : st === "vague" ? "font-semibold" : "font-normal";
          const stateText =
            st === "missing"
              ? msg.STATUS_MISSING
              : st === "vague"
                ? msg.STATUS_VAGUE
                : msg.STATUS_COMPLETE;
          // Phase 18 amendment (owner decision 2026-11-07): the stored 0/1/2
          // rating rides beside the state label. Need and Feature share the
          // Context rating; Metric is optional and carries no number (§6).
          const dimKey = PART_KEY_TO_DIM[r.key];
          const cellRating =
            bullet.ratings === null || dimKey === "metric"
              ? null
              : dimKey === "feature"
                ? bullet.ratings.context
                : bullet.ratings[dimKey];
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => openPart(r.key)}
              className={`rounded-lg border border-border bg-card px-2 py-1 text-center text-[13px] text-foreground ${weight}`}
            >
              <span className="block text-[11px] font-normal text-muted-foreground">
                {r.label}
              </span>
              {stateText}
              {cellRating !== null && (
                <span className="font-mono text-[11px] font-normal">
                  {fmt(msg.RATING_CELL, { value: cellRating })}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {orphans.length > 0 && (
        <div className="mb-4 rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-[13px] font-medium uppercase tracking-wide text-neutral-500">
            {msg.COVERAGE_TITLE}
          </p>
          {orphans.map((entry, index) => (
            <p
              key={`orphan-${index}`}
              className="mt-1 pl-2 text-[14px] text-neutral-600"
            >
              {entry.reason}
            </p>
          ))}
        </div>
      )}
      {/* Phase 15 (§6.2): the FOCUSED loop — exactly ONE question expanded
          at a time (order: missing parts first, then vague, metric last via
          questionOrder); the rest are one-line collapsed summaries. Next
          advances; a fragment click or a row cell opens that part. The
          "Filled correctly" / "Still needs to be filled" lists are
          SUPERSEDED by the row + this loop (product-owner answer
          2026-11-05); the ambiguity reason now lives inside the open
          question. Every §6.1 decision is unchanged. */}
      {loopOrder.length > 0 && (
        <div className="mb-6">
          <p className="mb-3 font-medium">
            {fmt(msg.QUESTION_COUNTER, { n: activeIdx + 1, total: loopOrder.length })}
          </p>
          {loopOrder.map((key, idx) => {
            const row = rows.find((r) => r.key === key)!;
            const dim = PART_KEY_TO_DIM[key];
            const conf = (confirmed[dim] ?? "").trim();
            const isActive = idx === activeIdx;
            const headlineState = conf
              ? msg.STATUS_COMPLETE
              : row.vague
                ? msg.STATUS_VAGUE
                : msg.STATUS_MISSING;
            if (!isActive) {
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveIdx(idx)}
                  className="mb-2 flex w-full items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-left text-[15px] text-foreground"
                >
                  <span>{fmt(msg.QUESTION_COLLAPSED, { label: row.label, state: headlineState })}</span>
                  <span className="text-muted-foreground">{msg.QUESTION_OPEN ?? ""}</span>
                </button>
              );
            }
            const reason = conf ? null : needReason(row);
            return (
              <div key={key} className="rounded-lg border border-border bg-card p-4">
                <p
                  className={`text-[16px] font-semibold ${
                    conf
                      ? PART_COLOR_OK
                      : row.vague
                        ? PART_COLOR_VAGUE
                        : PART_COLOR_MISSING
                  }`}
                >
                  {row.label} — {headlineState}
                </p>
                {reason && (
                  <div className="mt-1">
                    <p className="text-[15px] font-semibold text-neutral-800">
                      {msg.NEEDS_WHY_TITLE}
                    </p>
                    <p className="text-[15px] text-neutral-700">{reason}</p>
                  </div>
                )}
                <p className="mt-2 text-lg font-semibold text-neutral-900">
                  {inlineQuestion(row.key)}
                </p>
                {row.key === "metric" && (
                  <p className="text-[15px] text-neutral-700">{msg.METRIC_REAL_NUMBER_NOTE}</p>
                )}
                <select
                  aria-label={`Suggestions for ${row.label}`}
                  className="text-input mt-2"
                  value=""
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) setInputs((prev) => ({ ...prev, [dim]: v }));
                  }}
                >
                  <option value="">{msg.STARTER_PLACEHOLDER}</option>
                  {answerStarters(row, core).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={`Your answer for ${row.label}`}
                  className="text-input mt-2"
                  value={inputs[dim] ?? ""}
                  placeholder={msg.STARTER_INPUT_PLACEHOLDER}
                  onChange={(e) =>
                    setInputs((prev) => ({ ...prev, [dim]: e.target.value }))
                  }
                />
                <div className="mt-2 flex items-center gap-3">
                  <button
                    className="btn-secondary !min-h-10 !py-2 text-sm"
                    onClick={() => {
                      const raw = inputs[dim] ?? "";
                      const better = improveAnswer(row.key, raw);
                      if (better !== raw) {
                        setImprovedShown((prev) => ({ ...prev, [dim]: true }));
                      }
                      setInputs((prev) => ({ ...prev, [dim]: better }));
                      setConfirmed((prev) => ({ ...prev, [dim]: better }));
                    }}
                  >
                    {msg.STARTER_CONFIRM}
                  </button>
                  <button
                    className="btn-secondary !min-h-10 !py-2 text-sm"
                    onClick={() =>
                      setActiveIdx(Math.min(activeIdx + 1, loopOrder.length - 1))
                    }
                    disabled={activeIdx >= loopOrder.length - 1}
                  >
                    {msg.QUESTION_NEXT}
                  </button>
                  {improvedShown[dim] && (
                    <p className="text-[14px] text-neutral-600">
                      {msg.NEEDS_IMPROVED_NOTE} “{confirmed[dim]}”
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="mb-4 font-medium">{msg.ASK_REWRITE_GATE}</p>
      <div className="flex flex-wrap gap-3">
        <button
          className="btn-primary"
          onClick={() => {
            const DIM_TO_KEY: Record<string, string> = {
              context: "user_need",
              feature: "product_feature",
              role_action_clarity: "action",
              result: "result",
              metric: "metric",
            };
            const collected: Partial<Record<QuestionDimension, string>> = {};
            for (const [key, value] of Object.entries(inputs)) {
              const v = improveAnswer(DIM_TO_KEY[key] ?? key, (value ?? "").trim());
              if (v) collected[key as QuestionDimension] = v;
            }
            onSubmitAnswers(collected);
          }}
        >
          1) Yes (default)
        </button>
        <button className="btn-secondary" onClick={() => onAnswer(false)}>
          2) No
        </button>
      </div>
    </div>
  );
}

function Survey({
  ease,
  setEase,
  useful,
  setUseful,
  comment,
  setComment,
  onSubmit,
}: {
  ease: number | null;
  setEase: (v: number) => void;
  useful: string;
  setUseful: (v: string) => void;
  comment: string;
  setComment: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Short survey</h1>
      <div className="card mb-4">
        <p className="mb-3 font-medium">1. How easy was this tool to use?</p>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((v) => (
            <button
              key={v}
              className={ease === v ? "btn-primary !min-h-11 !w-12 !px-0" : "btn-secondary !min-h-11 !w-12 !px-0"}
              onClick={() => setEase(v)}
            >
              {v}
            </button>
          ))}
        </div>
        <p className="mt-2 text-sm text-neutral-600">1 = very hard, 5 = very easy</p>
      </div>
      <div className="card mb-4">
        <p className="mb-3 font-medium">2. Did the suggestions feel useful?</p>
        <div className="flex flex-col gap-2">
          {["Yes", "Partly", "No"].map((v) => (
            <button
              key={v}
              className={useful === v ? "btn-primary" : "btn-secondary"}
              onClick={() => setUseful(v)}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="card mb-6">
        <p className="mb-3 font-medium">3. Anything you want to tell us?</p>
        <textarea
          className="text-input"
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Optional"
        />
      </div>
      <button className="btn-primary" onClick={onSubmit}>
        Send answers
      </button>
    </div>
  );
}
