"use client";

/**
 * Client helpers: authenticated fetch (gate token + session id headers) and
 * the sessionStorage/localStorage accessors. The gate token is a salted
 * hash returned by /api/gate — the shared password itself never touches the
 * browser.
 */

export const GATE_KEY = "jf_gate_token";
export const SESSION_KEY = "jf_session_v1";

export function getGateToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(GATE_KEY);
}

export function setGateToken(token: string): void {
  window.sessionStorage.setItem(GATE_KEY, token);
}

export interface ApiError {
  ok: false;
  error: string;
  stage?: string;
  params?: Record<string, string | number>;
  cleaning?: {
    script_blocks: number;
    style_blocks: number;
    html_tags: number;
    word_count: number;
  };
}

export type ApiResult<T> = ({ ok: true } & T) | ApiError;

export async function apiPost<T>(
  path: string,
  body: unknown
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-gate-token": getGateToken() ?? "",
        "x-session-id": getSession()?.sessionId ?? "anonymous",
      },
      body: JSON.stringify(body),
    });
    return (await response.json()) as ApiResult<T>;
  } catch {
    // Short friendly error; the user can retry. Never broken output.
    return { ok: false, error: "ERR_EVALUATOR_FAILURE" };
  }
}

// --- Session state (browser localStorage; no database) ---

export interface StoredQuestion {
  dimension: string;
  answer: string | null;
  skipped: boolean;
}

export interface StoredBullet {
  id: number;
  text: string;
  status: "new" | "analyzed" | "edited";
  ratings: { context: number; role_action_clarity: number; result: number } | null;
  rubric_version: string | null;
  user_need: string | null;
  product_feature: string | null;
  action: string | null;
  result: string | null;
  metric: string | null;
  part_present: Record<string, boolean> | null;
  questions: StoredQuestion[];
  proposals: { text: string; decision: string }[];
  merge_warned: boolean;
  history: { text: string; ratings: unknown; rubric_version: string | null; replaced_at: string }[];
}

export interface StoredEntry {
  id: number;
  type: string;
  title: string;
  bullets: StoredBullet[];
  draft_reason: string | null;
  entry_score: number | null;
  rubric_version: string | null;
}

export interface SessionState {
  sessionId: string;
  startedAt: string;
  consentAt: string | null;
  entry: StoredEntry | null;
}

export function getSession(): SessionState | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionState;
  } catch {
    return null;
  }
}

export function saveSession(state: SessionState): void {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(state));
}

export function newSession(): SessionState {
  const state: SessionState = {
    sessionId: `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    startedAt: new Date().toISOString(),
    consentAt: null,
    entry: null,
  };
  saveSession(state);
  return state;
}

export function clearSession(): void {
  window.localStorage.removeItem(SESSION_KEY);
}

export function updateSession(patch: (s: SessionState) => void): SessionState | null {
  const state = getSession();
  if (!state) return null;
  patch(state);
  saveSession(state);
  return state;
}
