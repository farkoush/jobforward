# JobForward — Terminal Edition (v1, FROZEN)

**The original rule/test baseline.** This folder is the Terminal v1 edition
of the product: the interactive Python CLI where the five-part framework,
the scoring rubric (rubric-3.1.0), the JD Matcher (matcher-rules-1.0.0), and
the permanent test fixtures were first built.

**Status: FROZEN** — product updates continue on the **web edition**
(`../web/`). This edition stays exactly as it is: the reference engine the
web's TS port was verbatim-copied from, and the origin of the parity gate
(`web/scripts/parity.mts` compares the two engines byte-for-byte — see the
`terminal/src` oracle).

## Run

Requires Python 3.12+. Run everything FROM THIS FOLDER:

```bash
PYTHONUTF8=1 python -m pytest -q      # tests (213 green at the layout move)
PYTHONUTF8=1 python -m jobforward     # the CLI
```

or without pytest config: `PYTHONUTF8=1 python -m pytest tests/`.

## Layout

- `src/jobforward/` — the package (cli, flow/, scoring/, matcher2/,
  models/, storage/, rubric.py). The deterministic five-part extraction and
  scoring here are the reference the web port mirrors.
- `tests/` — the pytest suite (unit / contract / integration).
- `data/` — YOUR local runtime data (resume document + event log +
  `soft-skills-taxonomy.json`, this edition's own copy). Git-ignored;
  delete the folder to reset. The `resume.json.bak` file is the owner's
  preserved backup — never delete it.

## Notes

- All data stays local (constitution P8): no login, no upload, no network
  calls in the default run.
- Terminal DISPLAY and FLOW are frozen by product-owner decision (spec
  §11 preamble and Phases 11–16 records) — web-only changes since v1.
- Governance lives at the repository root and is shared by both editions:
  `../specs/` (spec-001, spec-002), `../.specify/` (constitution),
  `../docs/` (prd, spec-original, taxonomy source-of-record).
