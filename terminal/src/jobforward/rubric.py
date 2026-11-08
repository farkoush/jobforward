"""Single source of truth for the rubric version (constitution P4).

``RUBRIC_VERSION`` is the ONLY place the rubric version is written. Every
consumer — scoring defaults (evaluator, adapters), storage defaults, tests,
parity harnesses — imports it, so a rubric change is a one-line edit here.

Historic comments/docstrings that name a specific rubric version describe
what CHANGED in that version; they are a record, not a default, and stay.
"""

RUBRIC_VERSION = "rubric-3.2.0"
