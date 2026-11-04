# Contract: External-Model Parser Prompt

**Feature**: `001-experience-improvement-flow (Phase 11)` | **Date**: 2026-11-04 (Phase 11 record)

## What this contract is

The normative interface between this product and ANY external model used to
parse and display resume bullets under rubric-3.1.0. The contract document is
maintained OUTSIDE the spec tree (it is a product deliverable, not a design
artifact):

- **Human/model-readable prompt**: `specs/001-experience-improvement-flow/few-shot/parser-prompt.md`
  — governing goal; Scope of Execution; Section Identification Rules
  (Problems 1–6); Display Rules with the CLOSED connector variant set;
  acceptance Examples 1–6 with exact expected outputs; test bullets T1–T10;
  answer key. The pasted format demo at the top of the document is FORMAT DEMO
  ONLY — not normative (product-owner decision 2026-11-04; a clarification
  note sits next to it).
- **Machine-readable samples**: `specs/001-experience-improvement-flow/few-shot/parser-samples.json` (v1.3.0)
  — `acceptance_examples` (E1–E6), `test_bullets` (T1–T10), `display_frame`.

## Contract rules (summary — the docs are normative)

1. Send the prompt (Scope of Execution → Examples) once, then ONE bullet's
   `original` per message; never reuse example content in answers.
2. Output shape: ONE continuous sentence; brackets hold only the job seeker's
   verbatim words; missing → `[label – missing]`; vague →
   `[label: words – vague]`; result segment ALWAYS ", resulting in [result …]".
3. Every part status must agree with the scoring stage (Problem 6):
   missing → 0, vague → 1, complete → 2; purpose phrases never 2.
4. Research/mapping verbs establish the need and never fill the action.
5. No word appears in two parts (single exception: feature-inside-action).
6. Ambiguity → ask the job seeker; rule conflicts → ask, never decide.

## Parity obligation

The deterministic engine (Python `src/jobforward/flow/parts.py` and its TS
twin `web/src/engine/flow/parts.ts`) MUST satisfy the same acceptance examples
(SC-001) — there is exactly ONE rule set, not one for models and one for the
engine. The engine's display layer additionally colors/statuses the brackets
(web-only presentation; the terminal keeps its list format).
