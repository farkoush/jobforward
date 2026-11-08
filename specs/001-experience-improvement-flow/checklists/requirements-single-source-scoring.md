# Specification Quality Checklist: Single-Source Scoring Output (§14, amendment 2026-11-08)

**Purpose**: Validate the §14 amendment's completeness before/after implementation
**Created**: 2026-11-08
**Feature**: [spec.md](../spec.md) — amendment record in the Status header and §14

## Content Quality

- [x] No implementation details beyond the output contract the owner delegated (field shape of the structured rating output)
- [x] Focused on the owner decision: one judgment, the template is its completion
- [x] All mandatory sections of the amendment are in §14.1–§14.6

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — the four delegated decisions are recorded: output shape (§14.1), validation & invalid-output behavior (§14.2), re-score after answers (§14.4), rubric_version (§14.5)
- [x] Requirements are testable and unambiguous (each §14.2 invariant has a contract test on both editions)
- [x] Success criteria measurable (§9 criteria added for the invariant, provenance, and byte-identical deterministic outputs)
- [x] Edge cases identified (metric free-but-verbatim; whitespace-normalized verbatim; legacy no-quote responses; 0-with-a-quoted-need)
- [x] Scope clearly bounded (§14.6 unchanged list; §10 known-residual note for the deterministic raw-text fallback)

## Feature Readiness

- [x] All acceptance criteria verifiable without knowing internals (score+quote invariants, retry-then-refuse, provenance of the five fields)
- [x] User scenarios cover the owner's reported failure (context 2/2 next to a missing feature/action) — the invariant makes it structurally impossible on the model path
- [x] Implementation gated 2026-11-08: pytest 224 (11 new), test:engine 43/43 (10 new), tsc clean, build exit 0, PARITY OK, test:byok 24/24, test:llm 114/114

## Notes

- Governance: constitution P4 sentence amended (v4.1.0 → v4.2.0, MINOR) — the model output now names the verbatim quotes alongside the ratings; no score arithmetic moved to the model.
- The deterministic engine's scores are frozen; its quotes are its extraction results (byte-identical outputs, locked by the parity oracle's new quotes/quotes_edge comparison).
