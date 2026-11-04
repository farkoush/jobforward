"use client";

/**
 * Job Forward — web prototype of the tested terminal tool (same logic, new
 * skin). One screen = one terminal step, same order, same texts (B1 English
 * from engine/messages.ts). The deterministic engine runs in server API
 * routes; this client only orchestrates screens and renders results.
 */

import { useEffect, useMemo, useState } from "react";
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
import { ModelBanner } from "@/components/ModelBanner";
import {
  getByokState,
  initByok,
  rateBulletsWithModel,
} from "@/lib/byok/client";
import {
  BYOK_EVALUATOR_SYSTEM_PROMPT,
  buildEvaluatorUserPrompt,
} from "@/lib/byok/prompts";
import { buildCoverage, extractParts } from "@/engine/flow/parts";
import { splitBullets, type SplitCandidate } from "@/engine/flow/entry_split";
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
  | "byok_settings"
  | "entry_type"
  | "entry_details"
  | "entry_split"
  | "score"
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Entry collection (Phase 13 hybrid: paste-and-split, spec §4.2)
  const [entryType, setEntryType] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [company, setCompany] = useState<string>("");
  const [dates, setDates] = useState<string>("");
  const [domain, setDomain] = useState<string>("");
  const [pasted, setPasted] = useState<string>("");
  const [splitList, setSplitList] = useState<SplitCandidate[]>([]);
  const [splitInputFor, setSplitInputFor] = useState<number | null>(null);
  const [splitInputValue, setSplitInputValue] = useState<string>("");

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
    setReady(true);
  }, []);

  const entry = session?.entry ?? null;

  function go(next: Screen) {
    setError(null);
    setScreen(next);
  }

  // ---------- access gate (shared password; token only, never the password) ----------

  const [gatePassword, setGatePassword] = useState("");

  async function submitGate() {
    setBusy(true);
    const result = await fetch("/api/gate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: gatePassword }),
    }).then((r) => r.json());
    setBusy(false);
    if (!result.ok) {
      setError("WRONG_PASSWORD");
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
    setSplitInputFor(null);
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
   * BYOK path (advanced, opt-in): the model produces ONLY the 0/1/2 bullet
   * ratings, browser -> provider directly (the key never reaches our
   * server). Output is untrusted: zod + the shared validity check gate it,
   * and ALL arithmetic stays in the engine (metrics.ts) — mirroring the
   * terminal's opt-in LLM evaluator design.
   */
  async function scoreWithByok(texts: string[]) {
    const parts = texts.map((t) => extractParts(t));
    const outcome = await rateBulletsWithModel(texts, (bullets) => [
      { role: "system" as const, content: BYOK_EVALUATOR_SYSTEM_PROMPT },
      { role: "user" as const, content: buildEvaluatorUserPrompt(bullets) },
    ]);
    if (!outcome.ok || !outcome.ratings) {
      return {
        ok: false as const,
        error: outcome.error?.userMessage ?? msg.ERR_EVALUATOR_FAILURE,
      };
    }
    try {
      const normalized = outcome.ratings.map((r, i) => ({
        bullet_index: i,
        context: r.context,
        role_action_clarity: r.role_action_clarity,
        result: r.result,
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
        ok: true as const,
        ratings: normalized,
        parts,
        entry_score: entryScore,
        rubric_version: DEFAULT_RUBRIC_VERSION,
      };
    } catch {
      return { ok: false as const, error: msg.ERR_EVALUATOR_FAILURE };
    }
  }

  /** Score the stored entry (server engine by default, or the user's model
   * when BYOK is enabled) and persist the ratings into the session (applied
   * inside updateSession so mutations are not lost). */
  async function scoreAndPersist(onlyBulletId?: number) {
    const stored = getSession();
    if (!stored?.entry) return null;
    const byok = getByokState();
    const useByok = byok.useForScoring && byok.hasKey && Boolean(byok.model);
    let result:
      | Awaited<ReturnType<typeof scoreAllTexts>>
      | Awaited<ReturnType<typeof scoreWithByok>>;
    if (useByok) {
      setBusy(true);
      result = await scoreWithByok(stored.entry.bullets.map((b) => b.text));
      setBusy(false);
    } else {
      result = await scoreAllTexts(stored.entry.bullets.map((b) => b.text));
    }
    if (!result.ok) {
      setError("error" in result && result.error ? result.error : msg.ERR_EVALUATOR_FAILURE);
      return null;
    }
    updateSession((s) => {
      if (s.entry) applyScoreToEntry(s.entry, result, onlyBulletId);
    });
    setSession(getSession());
    logEvent(
      "analysis_backend",
      null,
      redact({ backend: useByok ? "byok" : "deterministic", model: byok.model }) as Record<string, unknown>
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
    go("entry_details");
  }

  /** Phase 13 (spec §4.2): run the deterministic split on the pasted
   * experience and move to the list-editing screen. Text is never rewritten
   * (P1); the per-candidate English boundary fires here (analyze F4). */
  function splitPaste() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError(msg.ERR_INVALID_TITLE);
      return;
    }
    const text = pasted.trim();
    if (!text) {
      setError(msg.ADD_PASTE_EMPTY);
      return;
    }
    logEvent("entry_title", null, { title: trimmedTitle });
    const candidates = splitBullets(text);
    if (candidates.some((c) => containsNonEnglish(c.text))) {
      setError(msg.ERR_NON_ENGLISH_INPUT);
      return;
    }
    setError(null);
    setSplitList(candidates);
    setSplitInputFor(null);
    setSplitInputValue("");
    go("entry_split");
  }

  function updateCandidateAt(i: number, patch: Partial<SplitCandidate>) {
    setSplitList((list) =>
      list.map((c, idx) => (idx === i ? { ...c, ...patch } : c))
    );
  }

  function removeCandidateAt(i: number) {
    setSplitList((list) => list.filter((_, idx) => idx !== i));
    setSplitInputFor(null);
  }

  function mergeWithNext(i: number) {
    setSplitList((list) => {
      if (i >= list.length - 1) return list;
      const joinedText = `${list[i].text} ${list[i + 1].text}`;
      const joined: SplitCandidate = {
        ...list[i],
        text: joinedText,
        splitSuggested: /\band also\b/i.test(joinedText),
      };
      return [...list.slice(0, i), joined, ...list.slice(i + 2)];
    });
  }

  /** Split ONE candidate into TWO at a verbatim point (spec §4.2 step 5):
   * the user types the first words of the second achievement; the words are
   * only moved, never rewritten (P2). */
  function splitCandidateAt(i: number) {
    const target = splitList[i];
    const needle = splitInputValue.trim();
    if (!target || !needle) return;
    const idx = target.text.indexOf(needle);
    if (idx <= 0) {
      setError(msg.SPLIT_NOT_FOUND);
      return;
    }
    const first = target.text.slice(0, idx).trim();
    const second = target.text.slice(idx).trim();
    if (!first || !second) return;
    setSplitList((list) => [
      ...list.slice(0, i),
      { text: first, flagged: false, splitSuggested: /\band also\b/i.test(first) },
      { text: second, flagged: false, splitSuggested: /\band also\b/i.test(second) },
      ...list.slice(i + 1),
    ]);
    setSplitInputFor(null);
    setSplitInputValue("");
    setError(null);
  }

  /** Split at the suggested " and also " connector (the connector itself is
   * dropped as a join word — segmentation, not rewriting). */
  function splitAtAlso(i: number) {
    const target = splitList[i];
    if (!target) return;
    const m = target.text.match(/\s*and also\s*/i);
    if (!m || m.index === undefined) return;
    const first = target.text.slice(0, m.index).trim();
    const second = target.text.slice(m.index + m[0].length).trim();
    if (!first || !second) return;
    setSplitList((list) => [
      ...list.slice(0, i),
      { text: first, flagged: false, splitSuggested: false },
      { text: second, flagged: false, splitSuggested: /\band also\b/i.test(second) },
      ...list.slice(i + 1),
    ]);
  }

  async function confirmSplit() {
    const bullets = splitList.map((c) => c.text);
    const trimmedTitle = title.trim();
    if (bullets.length > 6) {
      // VR-1 stays (research D17): the confirmed list caps at six — the user
      // decides what to keep; the textarea itself is never blocked.
      setError(msg.SPLIT_TOO_MANY);
      return;
    }
    if (bullets.length === 0) {
      // Existing draft path: an entry with no bullets is a draft (FR-003).
      setBusy(true);
      const draft = await apiPost<{ entry: StoredEntry; is_draft: boolean }>(
        "/api/entry",
        {
          type: entryType,
          title: trimmedTitle,
          bullets: [],
          company: company.trim() || undefined,
          dates: dates.trim() || undefined,
          product_domain: domain.trim() || undefined,
        }
      );
      setBusy(false);
      if (draft.ok) {
        updateSession((s) => {
          s.entry = draft.entry;
        });
        setSession(getSession());
      }
      setMessage(msg.DRAFT_NOTICE + " " + msg.DRAFT_SUGGESTION);
      logEvent("entry_saved_as_draft", "no_bullets", null);
      go("menu");
      return;
    }
    if (bullets.some((b) => containsNonEnglish(b))) {
      setError(msg.ERR_NON_ENGLISH_INPUT);
      return;
    }
    setBusy(true);
    const result = await apiPost<{ entry: StoredEntry; is_draft: boolean }>("/api/entry", {
      type: entryType,
      title: trimmedTitle,
      bullets,
      company: company.trim() || undefined,
      dates: dates.trim() || undefined,
      product_domain: domain.trim() || undefined,
    });
    setBusy(false);
    if (!result.ok) {
      setError(
        result.error === "ERR_TOO_MANY_BULLETS"
          ? msg.ERR_TOO_MANY_BULLETS
          : result.error === "ERR_NON_ENGLISH_INPUT"
            ? msg.ERR_NON_ENGLISH_INPUT
            : msg.ERR_INVALID_CHOICE
      );
      return;
    }
    const stored = result.entry;
    updateSession((s) => {
      s.entry = stored;
      s.sourceText = pasted.trim();
    });
    setSession(getSession());
    logEvent("entry_saved", null, { bullets: stored.bullets.length, draft: result.is_draft });
    await showScores();
  }

  // ---------- score view ----------

  async function showScores() {
    const result = await scoreAndPersist();
    if (!result) return;
    logEvent("analysis_completed", null, {
      entry_score: result.entry_score,
      rubric_version: result.rubric_version,
    });
    go("score");
  }

  // ---------- bullet list ----------

  function openBullet(bullet: StoredBullet) {
    if (!entry || askedThisRun.has(bullet.id)) return;
    setCurrentBulletId(bullet.id);
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
        fmt(msg.SCORE_BEFORE_AFTER, {
          before: before === null ? "None" : round2(before),
          after:
            current?.entry?.entry_score === null || current?.entry?.entry_score === undefined
              ? "None"
              : round2(current.entry.entry_score),
          rubric: DEFAULT_RUBRIC_VERSION,
        })
      );
      go("score");
      return;
    }
    // Nothing changed (all answers matched the original words): show the
    // re-scored state without a before/after line.
    await scoreAndPersist(bullet.id);
    go("score");
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
    go("score");
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
    go("score");
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
        {message && (
          <div className="msg-success mb-6">{message}</div>
        )}

        {/* Screens where a model call can happen (scoring flows): announce
            the model in use on the same screen; hidden when the deterministic
            engine runs or BYOK is off. */}
        <ModelBanner
          active={["entry_split", "score", "bullet_list", "merge"].includes(
            screen
          )}
        />

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
              setSplitInputFor(null);
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
              logEvent("menu_choice", "byok_settings");
              go("byok_settings");
            }}
          />
        )}
        {screen === "byok_settings" && <ByokSettings onBack={() => go("menu")} />}
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
          />
        )}
        {screen === "entry_details" && (
          <div>
            <h1 className="mb-4 text-2xl font-semibold">{msg.ADD_FIELDS_TITLE}</h1>
            <label className="mb-3 block">
              <span className="mb-1 block text-[14px] font-medium text-neutral-800">
                {msg.ADD_TITLE}
              </span>
              <input
                className="text-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
            </label>
            <label className="mb-3 block">
              <span className="mb-1 block text-[14px] font-medium text-neutral-800">
                {msg.ADD_FIELD_COMPANY}
              </span>
              <input
                className="text-input"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </label>
            <label className="mb-3 block">
              <span className="mb-1 block text-[14px] font-medium text-neutral-800">
                {msg.ADD_FIELD_DATES}
              </span>
              <input
                className="text-input"
                value={dates}
                onChange={(e) => setDates(e.target.value)}
              />
            </label>
            <label className="mb-6 block">
              <span className="mb-1 block text-[14px] font-medium text-neutral-800">
                {msg.ADD_FIELD_DOMAIN}
              </span>
              <input
                className="text-input"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
              />
            </label>
            <label className="mb-2 block">
              <span className="mb-1 block text-[14px] font-medium text-neutral-800">
                {msg.ADD_PASTE_LABEL}
              </span>
              <p className="mb-2 text-[14px] text-neutral-700">
                {msg.ADD_PASTE_INSTRUCTION}
              </p>
              <textarea
                className="text-input"
                rows={10}
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder="Paste in English"
              />
              <p className="mt-2 text-[13px] text-neutral-600">
                {msg.ADD_PASTE_EXAMPLE}
              </p>
              {pasted.split("\n").filter((l) => l.trim().length > 0).length > 8 && (
                <p className="mt-2 text-[14px] font-medium text-amber-700">
                  {msg.SOFT_LIMIT_NOTE}
                </p>
              )}
            </label>
            <button className="btn-primary" onClick={splitPaste}>
              {msg.ADD_PASTE_SPLIT}
            </button>
          </div>
        )}
        {screen === "entry_split" && (
          <div>
            <h1 className="mb-4 text-2xl font-semibold">
              {fmt(msg.SPLIT_FOUND, { n: splitList.length })}
            </h1>
            {splitList.length > 6 && (
              <p className="mb-4 text-[14px] font-medium text-amber-700">
                {msg.SPLIT_TOO_MANY}
              </p>
            )}
            <ol className="mb-6 space-y-3">
              {splitList.map((c, i) => (
                <li key={i} className="card">
                  <p className="text-[16px]">{c.text}</p>
                  {c.flagged && (
                    <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2">
                      <p className="text-[14px] text-neutral-800">
                        {msg.SPLIT_FLAG_PROMPT}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          className="btn-secondary"
                          onClick={() => updateCandidateAt(i, { flagged: false })}
                        >
                          {msg.SPLIT_KEEP}
                        </button>
                        <button
                          className="btn-secondary"
                          onClick={() => removeCandidateAt(i)}
                        >
                          {msg.SPLIT_DISCARD}
                        </button>
                      </div>
                    </div>
                  )}
                  {c.splitSuggested && (
                    <div className="mt-2 rounded-md border border-sky-300 bg-sky-50 p-2">
                      <p className="text-[14px] text-neutral-800">
                        {msg.SPLIT_SUGGESTION}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          className="btn-secondary"
                          onClick={() => splitAtAlso(i)}
                        >
                          {msg.SPLIT_ACCEPT}
                        </button>
                        <button
                          className="btn-secondary"
                          onClick={() => updateCandidateAt(i, { splitSuggested: false })}
                        >
                          {msg.SPLIT_KEEP_ONE}
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {i < splitList.length - 1 && (
                      <button
                        className="btn-secondary"
                        onClick={() => mergeWithNext(i)}
                      >
                        {msg.SPLIT_MERGE}
                      </button>
                    )}
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        setSplitInputFor(i);
                        setSplitInputValue("");
                      }}
                    >
                      {msg.SPLIT_ACCEPT}
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => removeCandidateAt(i)}
                    >
                      {msg.SPLIT_DELETE}
                    </button>
                  </div>
                  {splitInputFor === i && (
                    <div className="mt-2">
                      <p className="text-[14px] text-neutral-800">{msg.SPLIT_WHERE}</p>
                      <input
                        className="text-input mt-1"
                        value={splitInputValue}
                        onChange={(e) => setSplitInputValue(e.target.value)}
                        autoFocus
                      />
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          className="btn-primary"
                          onClick={() => splitCandidateAt(i)}
                        >
                          {msg.SPLIT_ACCEPT}
                        </button>
                        <button
                          className="btn-secondary"
                          onClick={() => setSplitInputFor(null)}
                        >
                          {msg.SPLIT_KEEP_ONE}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ol>
            <button className="btn-primary" onClick={() => void confirmSplit()}>
              {msg.SPLIT_CONFIRM}
            </button>
          </div>
        )}
        {(screen === "score" || screen === "bullet_list" || screen === "bullet_gate") &&
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
        {screen === "score" && entry && (
          <ScoreView entry={entry} onContinue={() => go("bullet_list")} />
        )}
        {screen === "bullet_list" && entry && (
          <BulletList
            entry={entry}
            asked={askedThisRun}
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
            </div>
          </div>
        )}
        {screen === "survey" && (
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
          Model settings (advanced — use your own API key)
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
            {` — ${fmt(msg.SCORE_EXPERIENCE, {
              value: round2(entry.entry_score),
              rubric: DEFAULT_RUBRIC_VERSION,
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
}: {
  title: string;
  options: Array<[string, string]>;
  onPick: (pick: string) => void;
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
    </div>
  );
}

function ScoreView({ entry, onContinue }: { entry: StoredEntry; onContinue: () => void }) {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">
        {fmt(msg.SCORE_BULLET_HEADER, { text: entry.title, rubric: DEFAULT_RUBRIC_VERSION })}
      </h1>
      {entry.bullets.map((bullet, i) => (
        <div key={bullet.id} className="card mb-3">
          <p className="mb-2 font-medium">
            {fmt(msg.SCORE_BULLET_LINE, { n: i + 1, text: bullet.text })}
          </p>
          {bullet.ratings && (
            <ul className="mb-2 font-mono text-[15px] text-neutral-800">
              <li>{fmt(msg.SCORE_DIMENSION, { dimension: msg.SCORE_DIMENSION_CONTEXT, value: bullet.ratings.context })}</li>
              <li>{fmt(msg.SCORE_DIMENSION, { dimension: msg.SCORE_DIMENSION_ACTION, value: bullet.ratings.role_action_clarity })}</li>
              <li>{fmt(msg.SCORE_DIMENSION, { dimension: msg.SCORE_DIMENSION_RESULT, value: bullet.ratings.result })}</li>
            </ul>
          )}
          <p className="text-sm text-neutral-600">
            {fmt(msg.SCORE_STATUS, { status: bullet.status })}
          </p>
        </div>
      ))}
      {entry.entry_score !== null && (
        <p className="mb-2 font-mono font-medium">
          {fmt(msg.SCORE_EXPERIENCE, {
            value: round2(entry.entry_score),
            rubric: DEFAULT_RUBRIC_VERSION,
          })}
        </p>
      )}
      {entry.bullets.length > 0 && !entry.draft_reason ? (
        <p className="mb-6 font-mono font-medium">
          {fmt(msg.SCORE_OVERALL, {
            value: entry.entry_score === null ? 0 : round2(entry.entry_score),
            rubric: DEFAULT_RUBRIC_VERSION,
          })}
        </p>
      ) : (
        <p className="mb-6 font-medium">
          {msg.SCORE_OVERALL_HIDDEN} {msg.SCORE_DRAFT_LINE}
        </p>
      )}
      <button className="btn-primary" onClick={onContinue}>
        Continue
      </button>
    </div>
  );
}

function BulletList({
  entry,
  asked,
  onPick,
  onEdit,
  editingId,
  editText,
  setEditText,
  onEditCancel,
  onEditSubmit,
  onFinish,
}: {
  entry: StoredEntry;
  asked: Set<number>;
  onPick: (bullet: StoredBullet) => void;
  onEdit: (id: number) => void;
  editingId: number | null;
  editText: string;
  setEditText: (v: string) => void;
  onEditCancel: () => void;
  onEditSubmit: () => void;
  onFinish: () => void;
}) {
  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">{entry.title}</h1>
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
}: {
  entry: StoredEntry;
  bullet: StoredBullet;
  n: number;
  rows: FrameworkRow[];
  onAnswer: (accepted: boolean) => void;
  onSubmitAnswers: (answers: Partial<Record<QuestionDimension, string>>) => void;
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
            className="btn-secondary !min-h-9 text-sm"
            onClick={copyImproved}
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
