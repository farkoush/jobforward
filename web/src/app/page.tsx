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
  Bullet,
  PART_NAMES,
  QuestionDimension,
  Ratings,
} from "@/engine/types";
import { containsNonEnglish } from "@/engine/flow/pathService";
import { QUESTION_TEXT, buildQuestions } from "@/engine/flow/questions";
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

type Screen =
  | "gate"
  | "welcome"
  | "menu"
  | "entry_type"
  | "entry_title"
  | "entry_bullets"
  | "score"
  | "bullet_list"
  | "bullet_gate"
  | "question"
  | "draft_or_approve"
  | "proposal"
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

const PART_QUESTION_NAMES: Record<QuestionDimension, string> = {
  context: msg.PART_NAME_NEED,
  feature: msg.PART_NAME_FEATURE,
  role_action_clarity: msg.PART_NAME_ACTION,
  result: msg.PART_NAME_RESULT,
  metric: msg.PART_NAME_METRIC,
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

  // Entry collection
  const [entryType, setEntryType] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [draftBullets, setDraftBullets] = useState<string[]>([]);
  const [bulletInput, setBulletInput] = useState<string>("");

  // Bullet improvement flow
  const [askedThisRun, setAskedThisRun] = useState<Set<number>>(new Set());
  const [currentBulletId, setCurrentBulletId] = useState<number | null>(null);
  const [questionQueue, setQuestionQueue] = useState<QuestionDimension[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Partial<Record<QuestionDimension, string>>>({});
  const [answerInput, setAnswerInput] = useState<string>("");
  const [proposalText, setProposalText] = useState<string | null>(null);
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
    setDraftBullets([]);
    setEntryType("");
    setTitle("");
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
      if (bullet.status === "new" || bullet.status === "edited") {
        bullet.status = "analyzed"; // new/edited -> analyzed (status machine)
      }
    });
    entryData.entry_score = result.entry_score;
    entryData.rubric_version = result.rubric_version;
  }

  /** Score the stored entry on the server and persist the ratings into the
   * session (applied inside updateSession so mutations are not lost). */
  async function scoreAndPersist(onlyBulletId?: number) {
    const stored = getSession();
    if (!stored?.entry) return null;
    const result = await scoreAllTexts(stored.entry.bullets.map((b) => b.text));
    if (!result.ok) {
      setError(msg.ERR_EVALUATOR_FAILURE);
      return null;
    }
    updateSession((s) => {
      if (s.entry) applyScoreToEntry(s.entry, result, onlyBulletId);
    });
    setSession(getSession());
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
    go("entry_title");
  }

  function submitTitle() {
    const trimmed = title.trim();
    if (!trimmed) {
      setError(msg.ERR_INVALID_TITLE);
      return;
    }
    logEvent("entry_title", null, { title: trimmed });
    go("entry_bullets");
  }

  async function addBulletLine() {
    const line = bulletInput.trim();
    setBulletInput("");
    if (!line) {
      // Empty input finishes the list (terminal: Enter on empty line).
      await finishBullets();
      return;
    }
    if (containsNonEnglish(line)) {
      setError(msg.ERR_NON_ENGLISH_INPUT);
      return;
    }
    if (draftBullets.length >= 6) {
      setError(msg.ERR_TOO_MANY_BULLETS);
      return;
    }
    setError(null);
    const next = [...draftBullets, line];
    setDraftBullets(next);
    logEvent("bullet_added", null, { n: next.length });
    if (next.length === 6) await finishBullets();
  }

  async function finishBullets() {
    if (draftBullets.length === 0) {
      // Terminal: an empty first line saves the entry as a draft (FR-003).
      setBusy(true);
      const draft = await apiPost<{ entry: StoredEntry; is_draft: boolean }>(
        "/api/entry",
        { type: entryType, title: title.trim(), bullets: [] }
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
    setBusy(true);
    const result = await apiPost<{ entry: StoredEntry; is_draft: boolean }>("/api/entry", {
      type: entryType,
      title: title.trim(),
      bullets: draftBullets,
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

  function gateAnswer(accepted: boolean) {
    const bullet = currentBullet();
    if (!bullet) return;
    logEvent("rewrite_gate", accepted ? "accepted" : "rejected", {
      bullet_id: bullet.id,
    });
    if (!accepted) {
      markAsked();
      setMessage(msg.NO_REWRITE);
      go("bullet_list");
      return;
    }
    const ratings = bullet.ratings;
    if (!ratings) return;
    // Question selection mirrors flow/questions.py exactly; the bullet here
    // only contributes the feature/metric fields and the run's round number.
    const bulletLike = {
      status: bullet.status,
      questions: [],
      product_feature: bullet.product_feature,
      metric: bullet.metric,
    } as unknown as Bullet;
    const questions = buildQuestions(bulletLike, ratings as Ratings, "accepted", 1);
    markAsked();
    if (questions.length === 0) {
      go("confirm_complete");
      return;
    }
    setQuestionQueue(questions.map((q) => q.dimension));
    setQuestionIndex(0);
    setAnswers({});
    setAnswerInput("");
    go("question");
  }

  function markAsked() {
    if (currentBulletId !== null) {
      setAskedThisRun((prev) => new Set(prev).add(currentBulletId));
    }
  }

  // ---------- question screens (one per screen, Answer/Skip) ----------

  function submitAnswer() {
    const answer = answerInput.trim();
    if (!answer) {
      skipQuestion(); // an empty answer is a skip (terminal behavior)
      return;
    }
    if (containsNonEnglish(answer)) {
      setError(msg.ERR_NON_ENGLISH_INPUT);
      return;
    }
    const dimension = questionQueue[questionIndex];
    const nextAnswers = { ...answers, [dimension]: answer };
    setAnswers(nextAnswers);
    logEvent("question_answered", "answer", {
      bullet_id: currentBulletId,
      dimension,
    });
    setAnswerInput("");
    setError(null);
    advanceQuestion(nextAnswers);
  }

  function skipQuestion() {
    const dimension = questionQueue[questionIndex];
    logEvent("question_skipped", "skip", {
      bullet_id: currentBulletId,
      dimension,
    });
    setAnswerInput("");
    setError(null);
    advanceQuestion(answers);
  }

  function advanceQuestion(currentAnswers: Partial<Record<QuestionDimension, string>>) {
    if (questionIndex + 1 < questionQueue.length) {
      setQuestionIndex(questionIndex + 1);
      return;
    }
    const answered = Object.values(currentAnswers).filter(Boolean).length;
    const total = questionQueue.length;
    if (answered === 0) {
      setMessage(msg.NO_REWRITE);
      go("bullet_list");
      return;
    }
    if (answered < total) {
      go("draft_or_approve");
      return;
    }
    void makeProposal();
  }

  // ---------- draft-or-approve + proposal ----------

  function saveDraft() {
    updateSession((s) => {
      if (s.entry) s.entry.draft_reason = "user_saved";
    });
    setSession(getSession());
    logEvent("entry_saved_as_draft", "user_saved", null);
    setMessage(msg.ENTRY_SAVED_AS_DRAFT);
    go("menu");
  }

  async function makeProposal() {
    const bullet = currentBullet();
    if (!bullet) return;
    setBusy(true);
    const result = await apiPost<{ proposal: string }>("/api/rewrite", {
      bullet_text: bullet.text,
      answers: Object.entries(answers)
        .filter(([, v]) => Boolean(v))
        .map(([dimension, answer]) => ({ dimension, answer })),
    });
    setBusy(false);
    if (!result.ok) {
      // Zero tolerance: a refused assembly is never shown (FR-010).
      setError(msg.ERR_EVALUATOR_FAILURE);
      go("bullet_list");
      return;
    }
    setProposalText(result.proposal);
    go("proposal");
  }

  async function proposalDecision(approved: boolean) {
    const bullet = currentBullet();
    if (!bullet) return;
    logEvent(approved ? "proposal_accepted" : "proposal_rejected", approved ? "approved" : "rejected", {
      bullet_id: bullet.id,
    });
    if (!approved) {
      setMessage(msg.PROPOSAL_REJECTED);
      go("bullet_list");
      return;
    }
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
      b.text = proposalText ?? b.text;
      b.status = "edited";
      b.proposals.push({ text: proposalText ?? "", decision: "approved" });
    });
    setSession(getSession());
    const result = await scoreAndPersist(bullet.id);
    if (!result) return;
    const current = getSession();
    setMessage(
      fmt(msg.SCORE_BEFORE_AFTER, {
        before: before === null ? "None" : round2(before),
        after:
          current?.entry?.entry_score === null || current?.entry?.entry_score === undefined
            ? "None"
            : round2(current.entry.entry_score),
        rubric: DEFAULT_RUBRIC_VERSION,
      }) + " " + msg.PROPOSAL_ACCEPTED
    );
    go("bullet_list");
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
    return [
      {
        key: "user_need",
        label: PART_LABELS.user_need,
        words: (bullet.user_need ?? "").trim(),
        vague: ratings !== null && ratings.context < 2,
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
        words: (bullet.action ?? "").trim(),
        vague: ratings !== null && ratings.role_action_clarity < 2,
      },
      {
        key: "result",
        label: PART_LABELS.result,
        words: (bullet.result ?? "").trim(),
        vague: ratings !== null && ratings.result < 2,
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
          <div
            role="status"
            className="mb-6 rounded-lg border border-neutral-300 bg-neutral-100 px-4 py-3 text-neutral-700"
          >
            Working…
          </div>
        )}
        {error && errorText(error, matchParams) && (
          <div
            role="alert"
            className="mb-6 rounded-lg border-2 border-red-700 bg-red-50 px-4 py-3 text-red-900"
          >
            {errorText(error, matchParams)}
          </div>
        )}
        {message && (
          <div className="mb-6 rounded-lg border-2 border-emerald-700 bg-emerald-50 px-4 py-3 text-emerald-900">
            {message}
          </div>
        )}

        {needsGate && (
          <div>
            <h1 className="mb-2 text-2xl font-semibold">Access code</h1>
            <p className="mb-4 text-neutral-700">
              Please enter the shared password to start the session.
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
              Continue
            </button>
          </div>
        )}

        {!needsGate && screen === "welcome" && <Welcome onAccept={acceptConsent} />}
        {screen === "menu" && (
          <Menu
            entry={entry}
            onAdd={() => {
              logEvent("menu_choice", "add_experience");
              setDraftBullets([]);
              setEntryType("");
              setTitle("");
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
          />
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
          />
        )}
        {screen === "entry_title" && (
          <div>
            <h1 className="mb-4 text-2xl font-semibold">{msg.ADD_TITLE}</h1>
            <input
              className="text-input mb-6"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
            <button className="btn-primary" onClick={submitTitle}>
              Continue
            </button>
          </div>
        )}
        {screen === "entry_bullets" && (
          <div>
            <h1 className="mb-2 text-2xl font-semibold">{msg.ADD_BULLET_PROMPT}</h1>
            <p className="mb-4 text-neutral-700">
              {fmt(msg.ADD_BULLET_INPUT, { n: draftBullets.length + 1 })}
            </p>
            <ul className="mb-4 space-y-2">
              {draftBullets.map((b, i) => (
                <li key={i} className="card text-[16px]">
                  {b}
                </li>
              ))}
            </ul>
            <textarea
              className="text-input mb-4"
              rows={3}
              value={bulletInput}
              onChange={(e) => setBulletInput(e.target.value)}
              placeholder="Write in English"
              autoFocus
            />
            <div className="flex flex-wrap gap-3">
              <button className="btn-primary" onClick={() => void addBulletLine()}>
                Add bullet
              </button>
              <button
                className="btn-secondary"
                onClick={() => void finishBullets()}
              >
                Finish bullets
              </button>
            </div>
          </div>
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
          />
        )}
        {screen === "question" && entry && currentBullet() && (
          <QuestionScreen
            title={entry.title}
            n={bulletIndex.n}
            total={bulletIndex.total}
            part={PART_QUESTION_NAMES[questionQueue[questionIndex]]}
            question={QUESTION_TEXT[questionQueue[questionIndex]]}
            value={answerInput}
            setValue={setAnswerInput}
            onAnswer={submitAnswer}
            onSkip={skipQuestion}
          />
        )}
        {screen === "draft_or_approve" && (
          <ChoiceScreen
            title={msg.DRAFT_OR_APPROVE}
            options={[
              ["draft", "Save this experience as a draft"],
              ["approve", "Approve a rewrite using your answers so far"],
            ]}
            onPick={(pick) => {
              if (pick === "draft") saveDraft();
              else void makeProposal();
            }}
          />
        )}
        {screen === "proposal" && proposalText && (
          <div>
            <h1 className="mb-4 text-2xl font-semibold">
              {msg.PROPOSAL_SHOW.split("\n")[0]}
            </h1>
            <pre className="card mb-6 whitespace-pre-wrap font-mono text-[16px]">
              {proposalText}
            </pre>
            <div className="flex flex-wrap gap-3">
              <button className="btn-primary" onClick={() => void proposalDecision(true)}>
                Approve and replace
              </button>
              <button className="btn-secondary" onClick={() => void proposalDecision(false)}>
                Reject and keep unchanged
              </button>
            </div>
          </div>
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
                            {row.name}
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
                    <td className="py-2 pr-3 font-medium">{row.label_en}</td>
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
      <h1 className="mb-4 text-3xl font-semibold">Welcome to Job Forward</h1>
      <div className="card mb-6 text-[16px]">
        <p className="mb-3">
          This tool helps you improve one experience entry for your resume and
          see the skills in a job posting.
        </p>
        <p className="mb-3">
          Before we start, please agree to these points:
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
        I agree — Start
      </button>
    </div>
  );
}

function Menu({
  entry,
  onAdd,
  onMatch,
  onExit,
}: {
  entry: StoredEntry | null;
  onAdd: () => void;
  onMatch: () => void;
  onExit: () => void;
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
          3) Exit
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
        {entry.entry_score !== null && !isDraft
          ? ` — ${fmt(msg.SCORE_EXPERIENCE, {
              value: round2(entry.entry_score),
              rubric: DEFAULT_RUBRIC_VERSION,
            })}`
          : ""}
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
            <ul className="mb-2 text-[16px] text-neutral-800">
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
        <p className="mb-2 font-medium">
          {fmt(msg.SCORE_EXPERIENCE, {
            value: round2(entry.entry_score),
            rubric: DEFAULT_RUBRIC_VERSION,
          })}
        </p>
      )}
      {entry.bullets.length > 0 && !entry.draft_reason ? (
        <p className="mb-6 font-medium">
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

function BulletGate({
  entry,
  bullet,
  n,
  rows,
  onAnswer,
}: {
  entry: StoredEntry;
  bullet: StoredBullet;
  n: number;
  rows: FrameworkRow[];
  onAnswer: (accepted: boolean) => void;
}) {
  const filled = rows.filter((r) => r.words);
  const needs = rows.filter((r) => !r.words);
  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">
        {fmt(msg.FRAMEWORK_HEADER, {
          title: entry.title,
          n,
          total: entry.bullets.length,
        })}
      </h1>
      <p className="mb-4 text-[17px]">
        {fmt(msg.FRAMEWORK_ORIGINAL, { text: bullet.text })}
      </p>
      <ul className="mb-4 space-y-1 text-[16px]">
        {rows.map((row) =>
          !row.words ? (
            <li key={row.key}>{fmt(msg.FRAMEWORK_PART_MISSING, { label: row.label })}</li>
          ) : row.vague ? (
            <li key={row.key}>{fmt(msg.FRAMEWORK_PART_VAGUE, { label: row.label, words: row.words })}</li>
          ) : (
            <li key={row.key}>{fmt(msg.FRAMEWORK_PART_OK, { label: row.label, words: row.words })}</li>
          )
        )}
      </ul>
      {filled.length > 0 && (
        <div className="mb-2">
          <p className="font-medium">{msg.FRAMEWORK_FILLED}</p>
          {filled.map((row) => (
            <p key={row.key} className="pl-4 text-[16px]">
              {fmt(msg.FRAMEWORK_FILLED_LINE, { label: row.label, words: row.words })}
            </p>
          ))}
        </div>
      )}
      {needs.length > 0 && (
        <div className="mb-6">
          <p className="font-medium">{msg.FRAMEWORK_NEEDS}</p>
          {needs.map((row) => (
            <p key={row.key} className="pl-4 text-[16px]">
              {fmt(msg.FRAMEWORK_NEEDS_LINE, { label: row.label })}
            </p>
          ))}
        </div>
      )}
      <p className="mb-4 font-medium">{msg.ASK_REWRITE_GATE}</p>
      <div className="flex flex-wrap gap-3">
        <button className="btn-primary" onClick={() => onAnswer(true)}>
          1) Yes (default)
        </button>
        <button className="btn-secondary" onClick={() => onAnswer(false)}>
          2) No
        </button>
      </div>
    </div>
  );
}

function QuestionScreen({
  title,
  n,
  total,
  part,
  question,
  value,
  setValue,
  onAnswer,
  onSkip,
}: {
  title: string;
  n: number;
  total: number;
  part: string;
  question: string;
  value: string;
  setValue: (v: string) => void;
  onAnswer: () => void;
  onSkip: () => void;
}) {
  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">
        {fmt(msg.ASK_PART_INTRO, { title, n, total, part })}
      </h1>
      <p className="mb-6 text-[18px] font-medium">{question}</p>
      <textarea
        className="text-input mb-4"
        rows={3}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Write your answer in English"
        autoFocus
      />
      <div className="flex flex-wrap gap-3">
        <button className="btn-primary" onClick={onAnswer}>
          1) Answer
        </button>
        <button className="btn-secondary" onClick={onSkip}>
          2) Skip
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
