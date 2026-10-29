"""Soft-skill matching against the 56-skill taxonomy (matcher v1 step 1-b).

Taxonomy loader per contracts/matcher-pipeline.md §3: fields used verbatim
``label_en`` / ``alt_labels_en`` / ``group_code`` / ``group_label`` / ``id``;
a malformed or missing file raises TaxonomyError, which the CLI surfaces as
an extraction failure — never a partial report (FR-014).

Matching (FR-015/FR-016, research R-7): Explicit = whole-word,
case-insensitive occurrence of ``label_en`` or any ``alt_labels_en``
variant. Inferred = only via the curated inference table below (versioned
with matcher-rules-1.0.0), matched against section items only — never from
company/industry/title lines. The removal test holds structurally: every
row's evidence alone leads to the skill.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .hard_skills import (
    MUST_HEADINGS,
    SHOULD_HEADINGS,
    PRIORITY_RANK,
    _explicit_priority,
    _is_heading_like,
)
from .rules_version import MATCHER_RULES_VERSION

TAXONOMY_RECORD_COUNT = 56

REQUIRED_KEYS = {
    "id",
    "label_en",
    "label_fa",
    "category_code",
    "category_label",
    "group_code",
    "group_label",
    "alt_labels_en",
    "description_en",
    "resume_eligible",
}


class TaxonomyError(Exception):
    """The taxonomy file is missing or has the wrong shape."""


def load_taxonomy(
    path: str | Path = Path("docs/soft-skills-taxonomy.json"),
) -> list[dict[str, Any]]:
    """Load and validate the 56-skill taxonomy; raise TaxonomyError on any
    shape problem so the caller can report an extraction failure."""
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise TaxonomyError(f"cannot read taxonomy file: {exc}") from exc
    if not isinstance(data, dict) or not isinstance(data.get("skills"), list):
        raise TaxonomyError("taxonomy file must be an object with a 'skills' list")
    records = data["skills"]
    if len(records) != TAXONOMY_RECORD_COUNT:
        raise TaxonomyError(
            f"expected {TAXONOMY_RECORD_COUNT} skills, found {len(records)}"
        )
    for record in records:
        if not isinstance(record, dict) or REQUIRED_KEYS - set(record):
            raise TaxonomyError(f"taxonomy record misses required keys: {record!r}")
        if not isinstance(record["alt_labels_en"], list):
            raise TaxonomyError(f"alt_labels_en must be a list: {record['label_en']!r}")
    return records


# Curated inference table (plan.md Complexity Tracking; versioned with
# matcher-rules-1.0.0). phrase → (label_en, fixed one-sentence reason).
INFERENCE_TABLE: tuple[tuple[str, str, str], ...] = (
    (
        "manage stakeholders",
        "build networks",
        "Stakeholder management has no direct equivalent and this is the "
        "closest option.",
    ),
)

# Skill-ish phrases with no taxonomy equivalent land on the "No taxonomy
# match" line instead of becoming rows (FR-016).
UNMATCHED_SKILLISH_PHRASES = (
    "communication skills",
    "leadership skills",
    "interpersonal skills",
    "presentation skills",
    "negotiation skills",
    "organizational skills",
    "problem-solving skills",
    "teamwork skills",
    "soft skills",
)


@dataclass
class SoftSkillRow:
    """One soft-skill row (data-model.md SoftSkillRow)."""

    label_en: str
    group_code: str
    id: str
    evidence: str
    reason: str | None
    priority: str  # "must" | "should" | "nice"
    certainty: str  # "explicit" | "inferred"
    order: int


@dataclass
class UnmatchedConcept:
    """A posting concept with no close taxonomy equivalent."""

    text: str
    note: str


def _section_items(cleaned_text: str) -> list[tuple[str, str]]:
    """(item_text, section) pairs for recognized sections only. Narrative
    lines outside sections are never matched — company/industry/title lines
    cannot produce evidence (FR-015)."""
    items: list[tuple[str, str]] = []
    current: str | None = None
    for line in cleaned_text.split("\n"):
        stripped = line.strip()
        if not stripped:
            continue
        lowered = stripped.rstrip(":").strip().lower()
        if lowered in MUST_HEADINGS:
            current = "must"
            continue
        if lowered in SHOULD_HEADINGS:
            current = "should"
            continue
        if _is_heading_like(stripped):
            current = None
            continue
        if current is None:
            continue
        for marker in ("- ", "• ", "* ", "· "):
            if stripped.startswith(marker):
                stripped = stripped[len(marker):].strip()
                break
        items.append((stripped, current))
    return items


def _phrase_pattern(phrase: str) -> re.Pattern:
    return re.compile(
        r"(?<![A-Za-z])" + re.escape(phrase) + r"(?![A-Za-z])", re.IGNORECASE
    )


def _priority_of(evidence_line: str, section: str) -> str:
    """Priority cascade on where the evidence appears (FR-015): explicit
    priority word on the evidence item > section heading > must."""
    explicit = _explicit_priority(evidence_line)
    return explicit or section


def _find_phrase(phrase: str, cleaned_text: str) -> tuple[int, str] | None:
    """First whole-word occurrence of phrase → (line index, evidence line).
    The evidence line is bullet-stripped so it stays a verbatim substring of
    the cleaned text and matches the section item text."""
    pattern = _phrase_pattern(phrase)
    position = 0
    for line in cleaned_text.split("\n"):
        match = pattern.search(line)
        if match:
            stripped = line.strip()
            for marker in ("- ", "• ", "* ", "· "):
                if stripped.startswith(marker):
                    stripped = stripped[len(marker):].strip()
                    break
            return position, stripped
        position += 1
    return None


def match_soft_skills(
    cleaned_text: str, skills: list[dict[str, Any]]
) -> tuple[list[SoftSkillRow], list[UnmatchedConcept]]:
    """Match soft skills; returns (rows, unmatched concepts)."""
    section_items = _section_items(cleaned_text)
    candidates: dict[str, SoftSkillRow] = {}
    unmatched: list[UnmatchedConcept] = []
    matched_labels: set[str] = set()

    order = 0
    # Explicit: whole-word match on label_en / alt_labels_en.
    for record in skills:
        hit = _find_phrase(record["label_en"], cleaned_text)
        if hit is None:
            for alt in record["alt_labels_en"]:
                hit = _find_phrase(alt, cleaned_text)
                if hit is not None:
                    break
        if hit is None:
            continue
        line_index, evidence_line = hit
        section = next(
            (s for text, s in section_items if text == evidence_line), None
        )
        priority = _priority_of(evidence_line, section or "must")
        candidates[record["id"]] = SoftSkillRow(
            label_en=record["label_en"],
            group_code=record["group_code"],
            id=record["id"],
            evidence=evidence_line,
            reason=None,
            priority=priority,
            certainty="explicit",
            order=line_index,
        )
        matched_labels.add(record["label_en"].lower())
        order += 1

    # Inferred: only via the curated inference table, on section items.
    for text, section in section_items:
        for phrase, label, reason in INFERENCE_TABLE:
            if _phrase_pattern(phrase).search(text):
                record = next(
                    (r for r in skills if r["label_en"] == label), None
                )
                if record is None:
                    continue
                existing = candidates.get(record["id"])
                row = SoftSkillRow(
                    label_en=record["label_en"],
                    group_code=record["group_code"],
                    id=record["id"],
                    evidence=text,
                    reason=reason,
                    priority=_priority_of(text, section),
                    certainty="inferred",
                    order=order,
                )
                order += 1
                if existing is None:
                    candidates[record["id"]] = row
                elif PRIORITY_RANK[row.priority] < PRIORITY_RANK[existing.priority]:
                    candidates[record["id"]] = row
                matched_labels.add(record["label_en"].lower())

    # Unmatched skill-ish concepts (FR-016): never become rows.
    seen_unmatched: set[str] = set()
    for text, _section in section_items:
        for phrase in UNMATCHED_SKILLISH_PHRASES:
            if _phrase_pattern(phrase).search(text.lower()):
                concept = text.rstrip(".!?").strip()
                if concept.lower() not in matched_labels and concept not in seen_unmatched:
                    unmatched.append(
                        UnmatchedConcept(
                            text=concept,
                            note="The taxonomy has no general equivalent for this.",
                        )
                    )
                    seen_unmatched.add(concept)
                break

    rows = sorted(
        candidates.values(),
        key=lambda r: (r.order),
    )
    return rows, unmatched

