/**
 * Shows which model is running on screens that use one (BYOK §3 disclosure).
 * Rendered only where a model call can happen; hidden when scoring is the
 * deterministic engine, when BYOK is off, or when no key/model is set.
 */

import { useEffect, useState } from "react";
import { getByokState, onByokChange } from "@/lib/byok/client";
import { PROVIDERS } from "@/lib/byok/providers.config";

export function ModelBanner({ active }: { active: boolean }) {
  const [state, setState] = useState(getByokState());
  useEffect(() => {
    const off = onByokChange(() => setState(getByokState()));
    setState(getByokState());
    return off;
  }, []);
  const usesModel = active && state.useForScoring && state.hasKey && Boolean(state.model);
  if (!usesModel) return null;
  const model = `${PROVIDERS[state.providerId].displayName}: ${state.model}`;
  return (
    <div
      role="note"
      className="mb-6 rounded-lg border-2 border-amber-600 bg-amber-50 px-4 py-3 text-amber-900"
    >
      Model in use on this screen: {model}
    </div>
  );
}
