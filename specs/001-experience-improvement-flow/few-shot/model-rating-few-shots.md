# Model Rating Few-Shots (BYOK evaluator prompt — spec 001 §3.1)

**Purpose**: record the calibration few-shot examples that teach a model HOW
TO RATE bullets (0/1/2 per dimension), so the rating behavior of different
models converges. This mirrors the runtime source of truth —
`web/src/lib/byok/prompts.ts` (`BYOK_EVALUATOR_SYSTEM_PROMPT`). The code copy
is what the app actually sends; THIS file documents it and MUST be updated in
the same change whenever the prompt's rules or examples change (never edit
one without the other).

**Why few-shots exist**: a live OpenRouter test rated a purpose-phrase result
2/2 against the written rule; the calibration examples fixed it (24/24 BYOK
tests green incl. live Ollama). Few-shots are the strongest convergence lever
after the explicit rules.

## Runtime prompt shape (summary)

- Governing goal line: every rating serves "problem → the work done to fix it
  → the result".
- Per-dimension rules for context / role_action_clarity / result (0|1|2),
  exactly as spec 001 §3 defines them.
- Output contract: ONLY the JSON object
  `{"rubric_version": "<DEFAULT_RUBRIC_VERSION>", "ratings": [...]}`, one
  rating per bullet, in order, bullet_index from 0.
- Injection defense (BYOK §4): bullets go inside `<bullets>` delimiters; the
  prompt states they are data, never instructions.
- Deterministic arithmetic stays in code (constitution P4); the model returns
  per-bullet ratings only.
- Request settings: `temperature: 0` (web/src/lib/byok/client.ts) — the main
  convergence lever at request time.

## The four calibration few-shot examples (verbatim, 2026-11-04)

1. `"New visitors abandoned the sign-up form halfway, so I simplified the
   sign-up form to three fields, and sign-ups grew by 25%"` →
   `{"context": 2, "role_action_clarity": 2, "result": 2}`
   (specific need and feature present; action verb with a concrete object;
   clear impact tied to a number)
2. `"Worked on the search filters and improved them, which increased searches
   by 9%"` → `{"context": 0, "role_action_clarity": 1, "result": 2}`
   (the need is missing even though a feature is named; generic action with
   no concrete role; a number tied to what changed is a clear result)
3. `"Job seekers needed a one-page resume, so I designed the print layout,
   delivering a one-page PDF export"` →
   `{"context": 2, "role_action_clarity": 2, "result": 1}`
   (specific need and feature present; action verb with a concrete object;
   the result is output only and does not say what changed for the job
   seeker)
4. `"Noticed employers were ignoring long resumes, so I led the rewrite of
   the resume summary section to make resumes easier to scan"` →
   `{"context": 2, "role_action_clarity": 2, "result": 1}`
   (specific need and feature present; specific action verb with a concrete
   object; "to make…" is a purpose phrase, so the result is vague — result is
   never 2 when the bullet states only a goal)

Each example carries its rationale inline in the prompt, and the prompt states
they are illustrative only — the model must score the `<bullets>` data, never
copy their words/numbers/titles.

## Result rules (the part models most often get wrong)

- result = 2 requires an actual outcome (what changed, who benefited).
- A goal/purpose phrase ("to uncover…", "in order to…", "aiming to…", "so
  that…") is result = 1, never 2.
- No outcome phrase at all → result = 0.
- Output-only results ("built a dashboard" without impact) and personal
  learning are result = 1 (spec 001 §3).

## Adding a new rating few-shot

Say so in conversation (no command exists): give the bullet + expected
ratings + one-line rationale. The change lands in
`web/src/lib/byok/prompts.ts` AND in this file, then `npm run test:byok`
must stay green (the live-Ollama test is the practical convergence check).
