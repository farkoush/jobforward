/**
 * Shows which model is running on screens that use one (BYOK §3 disclosure,
 * extended by 004-llm-gateway): the answering source — free gateway path or
 * the user's own key (byok) — alongside the model name. Rendered only where
 * a model call can happen.
 */

import { useEffect, useState } from "react";
import { getByokState, onByokChange } from "@/lib/byok/client";

export function ModelBanner({ active }: { active: boolean }) {
  const [state, setState] = useState(getByokState());
  useEffect(() => {
    const off = onByokChange(() => setState(getByokState()));
    setState(getByokState());
    return off;
  }, []);
  if (!active) return null;
  const sourceLabel = state.useForScoring && state.hasKey && state.model
    ? "your model (BYOK)"
    : "free gateway path";
  const model = state.useForScoring && state.hasKey && state.model
    ? state.model
    : "NVIDIA free combo";
  return (
    <div
      role="note"
      className="mb-6 rounded-lg border-2 border-amber-600 bg-amber-50 px-4 py-3 text-amber-900"
    >
      Model in use on this screen: {sourceLabel} — {model}
    </div>
  );
}
