# few-shot/ — The Model-Facing Prompt Package for Spec 001

**Goal (product owner, 2026-11-04)**: when job seekers choose different
models, the models' answers should converge to a very high degree. This
folder holds EVERYTHING a model is given (or must satisfy) for spec 001's
five-part framework and clarity score, in one place, so every model sees the
same rules and the same examples.

## Contents

| File | What it is | Source of truth? |
|---|---|---|
| `parser-prompt.md` | The complete parser prompt: governing goal, Scope of Execution, Section Identification Rules (Problems 1–6), Display Rules with the CLOSED connector variant set, acceptance Examples 1–6, test bullets T1–T10, answer key | YES — normative for any external model AND for the deterministic engine (spec 001 §2.1) |
| `parser-samples.json` (v1.3.0) | Machine-readable mirror: `acceptance_examples` E1–E6, `test_bullets` T1–T10, `display_frame` | YES (kept in lockstep with parser-prompt.md) |
| `model-rating-few-shots.md` | The 4 BYOK rating few-shots + result rules + runtime prompt shape | NO — documents the runtime source `web/src/lib/byok/prompts.ts`; update both together |

## How the two model surfaces differ (important)

1. **Parsing / display** — in the APP this NEVER comes from a model: the
   deterministic engine (`extractParts`, Python + TS twins) always computes
   the five parts, so the display is identical regardless of the chosen
   model. The parser prompt governs EXTERNAL model testing (the
   multi-model prompt the product owner pastes), and the engine must satisfy
   the same acceptance examples — one rule set, two consumers.
2. **Ratings (0/1/2)** — the ONLY model output the app uses (BYOK, opt-in).
   Convergence levers, all in place: explicit per-dimension rules (spec 001
   §3), 4 calibration few-shots, `temperature: 0`
   (`web/src/lib/byok/client.ts`), zod schema validation + one retry then
   refusal (BYOK §5), and deterministic arithmetic in code (constitution P4).

## How to test a new model (convergence measurement)

1. Paste `parser-prompt.md` from "Scope of Execution" down to the end of
   **Examples 1–6** as the system/user prompt.
2. Send ONE test bullet (T1–T10) at a time; compare with the **Answer key**
   (never paste the key to the model).
3. Score the model: examples passed / 16. Only models at or near 16/16
   converge with the engine and with each other; failures show exactly which
   Problem rule the model needs pushed on.
4. For RATING convergence, run the BYOK path with the candidate model and
   compare per-bullet ratings with the local engine on the same bullets
   (difference should be zero on clear-cut bullets; boundary bullets are
   where models vary — more few-shots there is the remedy).

## Rules for changing this folder

- One rule set: if a change here would make the ENGINE behave differently,
  it is a rubric change → bump the rubric version (one line per engine:
  `src/jobforward/rubric.py` + `web/src/engine/types.ts`), update
  `flow/parts.py` + `flow/parts.ts` + tests + parity edge bullets, THEN this
  folder. Never let the doc and the engine disagree.
- Doc-only changes (a new example that existing rules already produce):
  update `parser-prompt.md` + `parser-samples.json` (bump its version) and
  verify the engine already produces the documented output (parity gate).
- Rating few-shot changes: `web/src/lib/byok/prompts.ts` +
  `model-rating-few-shots.md` together, then `npm run test:byok`.
- Historical format demos are FORMAT DEMO ONLY, not normative (product-owner
  decision 2026-11-04); rules and Examples 1–6 are normative.
