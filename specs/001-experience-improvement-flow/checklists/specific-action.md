# Specific Action — Scoring Checklist (rubric-3.0.0)

**Feature**: 001-experience-improvement-flow (Phase 9) | **Date**: 2026-10-29
**Status**: Accepted design for T046/T047

## Purpose

Defines the exact 0/1/2 scoring levels for the **Specific Action** dimension,
which replaces the old **Role & Action Clarity** dimension (rubric-2.0.0).
The storage/contract key stays `role_action_clarity` for data compatibility;
`rubric_version = "rubric-3.0.0"` distinguishes the new semantics. Prior
scores stored with rubric-2.0.0 keep their original meaning and version.

The dimension answers one question: **can the reader tell WHAT the candidate
actually did?** It rates the action on its own — not the context and not the
result.

## Levels

### 2 — Specific action

The bullet contains a real action verb AND the action has a concrete object
or scope. A concrete object is a named artifact, output, product area, or
data/tool surface (e.g. dashboard, roadmap, survey, prototype, PRD, backlog,
onboarding, checkout, pricing, A/B test, funnel, churn, SQL, Figma). A
concrete scope is a quantified extent (e.g. "team of 3", "12 users",
"4-week beta"). Reading it, you can name the thing that was done and what it
was done to.

### 1 — Generic action

The candidate did something, but the action stays vague:

- an action verb whose object is generic or absent ("Led meetings",
  "Analyzed data", "Improved processes"), or
- generic-involvement phrasing with no real action verb ("Worked on the
  search feature", "Responsible for the team backlog", "Helped with
  testing", "Involved in the launch", "Did research").

### 0 — No action

No action verb and no generic-involvement phrase: noun phrases, job-title
lines ("Product Manager on the payments team"), states of being, personal
learning ("Learned how the data pipeline works"), or empty text.

## Decision rules (ordered, deterministic)

1. If the text is empty, OR contains neither an action verb nor a
   generic-involvement phrase → **0**.
2. Else if it contains an action verb AND a concrete object or scope → **2**.
3. Else → **1** (verb without a concrete object, or generic phrasing
   without a real verb).

A real action verb overrides generic phrasing when a concrete object is also
present: "Worked with the data team and built a churn dashboard" → 2 (verb
"built" + "churn dashboard"). The verb no longer needs to lead the sentence
(the rubric-2 leading-verb requirement is dropped); specificity, not
position, earns the 2.

## Marker lists (heuristic implementation, `scoring/adapters/local.py`)

- **Action verbs** (unchanged from rubric-2.0.0): led, built, designed,
  created, managed, launched, ran, owned, organized, coordinated, analyzed,
  improved, developed, delivered, wrote, planned, tested, researched,
  prototyped, automated, negotiated.
- **Generic-involvement phrases**: worked on / working on / worked with,
  helped with / helping with, responsible for, in charge of, involved in,
  part of, assisted with, tasked with, did research, made improvements,
  did analysis.
- **Concrete objects**: dashboard, roadmap, survey, prototype, PRD, spec,
  user stories, backlog, report, deck, presentation, pricing, onboarding,
  funnel, checkout, signup, retention, activation, churn, conversion, A/B
  test, beta, pilot, launch plan, test plan, database, query, SQL, Figma.
- **Concrete scopes (quantified)**: "team/group of N"; "N users / customers
  / people / interviews / participants / teams / analysts / weeks / sprints
  / sessions".

"Meetings", "data", "processes", and "tasks" are deliberately NOT concrete
objects — they name activity, not an artifact.

## Changes vs rubric-2.0.0 (impact on existing bullets)

| Bullet | v2 | v3 | Why |
|---|---|---|---|
| "Led a team of 3 analysts to build a sales dashboard for the Q3 launch" | 2 | 2 | verb + dashboard + team of 3 |
| "Improved onboarding, raising activation by 15%" | 2 | 2 | verb + onboarding |
| "Learned how the data pipeline works" | 0 | 0 | learning is not an action |
| "Led meetings" | 2 | **1** | verb with generic object |
| "Worked on the search feature" | 0 | **1** | involvement asserted, but vague |

The 0→1 rise for involvement phrasing follows spec §6: a vague action
deserves the follow-up question ("What exactly did you do? What was your
role?"), not silence. The constitution 83.33 reference fixture uses explicit
ratings and is unaffected.

## Governance

Any change to these levels, marker lists, or decision rules is a rubric
change and requires a new `rubric_version` (constitution P4 / quality gate
5). Dimension weights remain equal; the entry score stays the simple mean
of the three dimensions.
