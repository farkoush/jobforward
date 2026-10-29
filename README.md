# JobForward — narrate your experience, match it, improve it

A text-based terminal prototype that helps an entry-level product-manager job
seeker narrate one experience entry, score it transparently, improve it
through a guided rewrite flow, and match it against a pasted job description.

- **Version 1 scope**: one complete improvement path for a single experience
  entry + one job-description match (see
  `specs/001-experience-improvement-flow/spec.md`).
- **Local-only promise (FR-018)**: all data stays in `data/` on this machine.
  No login, no upload, no network calls in the default run. PDF upload and
  email sign-in are deferred to a later version.
- **Language**: all tool text is English (B1 level); bullets and answers must
  be English. Pasted job postings must be English too (the JD Matcher rejects
  a posting with more than 10% Persian/Arabic-script letters).
- **Scoring**: three dimensions (Context, Role and Action Clarity, Result),
  each 0/1/2, under rubric version `rubric-2.0.0`. All arithmetic is
  deterministic code — never the language model.

## JD Matcher (v1)

Menu option 2 runs the JD Matcher (specs/002-jd-matcher): it analyzes one
pasted job posting and never touches your resume.

1. **Paste** the full posting in English, finished by a line containing only
   `END` (or Ctrl+D). The tool cleans it (control characters, line endings,
   `<script>`/`<style>` blocks and HTML tags — never executed), reports what
   it removed, and shows the word count (100–1,500 words accepted).
2. **Review** and confirm with `[Y]` / cancel with `[C]` at every stage.
   Cancel always returns to the paste prompt; cancel at the paste prompt
   exits.
3. **Hard skills** in three tables — Must / Should / Nice — with a fixed
   priority cascade, verbatim evidence for every row, real-total counts and
   a display limit of 5 rows per table.
4. **Soft skills** drawn strictly from the 56-skill taxonomy in
   `docs/soft-skills-taxonomy.json` (skill names shown exactly as
   `label_en`; ESCO ids stored, never shown), with Explicit/Inferred
   certainty and a "No taxonomy match" line for concepts without an
   equivalent.

There is no free-form "matches / does not match" verdict: the output is only
the tables, their counts, and stage messages. Analysis errors (not a job
posting, zero skills extracted) are reported with their own messages and are
never treated as a mismatch. The pipeline is deterministic under rules
version `matcher-rules-1.0.0`. This replaces the 001 per-entry matcher
output (Highlight / No change / Not relevant), which is retired as product
behavior.

## Run

Requires Python 3.12+.

```bash
pip install -e .            # once (src layout)
PYTHONUTF8=1 python -m jobforward
```

or without installing:

```bash
PYTHONUTF8=1 PYTHONPATH=src python -m jobforward
```

PowerShell: `$env:PYTHONUTF8="1"; python -m jobforward`

## Tests

```bash
PYTHONUTF8=1 python -m pytest -v
```

The permanent reference fixture: two bullets rated role_action_clarity (2,2),
result (2,1), context (2,1) → entry score 250/3 ≈ 83.33
(`tests/unit/test_metrics.py`).

## Where your data lives

| File | Content |
|---|---|
| `data/resume.json` | Your experience entries, bullets, histories, statuses, match actions (written atomically) |
| `data/events.log.jsonl` | Append-only event log with ISO-8601 timestamps (measurement requirement) |

Both are git-ignored. Delete the `data/` directory to reset to a fresh state.

## The improvement path

1. **Record** an experience (type, title, 1–6 free-text bullets). Zero
   bullets → the entry is a draft, excluded from the overall score.
2. **Score**: every bullet gets Context / Role and Action Clarity / Result
   ratings; the entry score and overall score are shown with the rubric
   version.
3. **Improve**: per bullet, the tool asks "Do you want me to rewrite this
   bullet?" (default Yes), then 0–3 skippable questions for dimensions
   scoring 0 or 1. Rewrites use only your bullet + your answers — the tool
   never invents numbers, impact, or claims. Nothing changes without your
   explicit approval; the previous bullet stays in history.
4. **Rerun**: only new or edited bullets are re-analyzed; approved rewrites
   show BEFORE/AFTER scores side by side.
5. **Match**: superseded by the JD Matcher (v1) above — the per-entry
   actions (Highlight / No change / Not relevant to this job) are retired;
   the matcher now analyzes the posting only and never changes any score.

## Design documents

- Spec: `specs/001-experience-improvement-flow/spec.md`
- Plan: `specs/001-experience-improvement-flow/plan.md`
- Validation scenarios: `specs/001-experience-improvement-flow/quickstart.md`
- JD Matcher (v1): `specs/002-jd-matcher/spec.md` (plan, contracts,
  quickstart, and regression fixtures alongside)
- Constitution: `.specify/memory/constitution.md` (v3.0.0)
