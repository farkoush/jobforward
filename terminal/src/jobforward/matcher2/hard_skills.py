"""Hard-skill extraction, step 1-a of the matcher v1 (002 T013).

Deterministic, rules-versioned (matcher-rules-1.0.0) per
contracts/matcher-pipeline.md §2 and research.md R-6:

- section detection: recognized headings set the section priority
  (Responsibilities / Requirements / Required Tools → must; Preferred
  Qualifications → should); any heading-looking line ends the section
- item extraction: bullet markers are stripped; when the posting has no
  recognized heading, non-empty non-heading lines are items (unstructured
  postings); with recognized headings only section items count
- priority cascade: explicit word on the item > section heading > must
  "(default)" (FR-010; an explicit word always overrides the section)
- alternative tools ("A, B, or C") merge into one row typed hard_tool
- same normalized skill merges into one row with the highest priority;
  genuinely different names stay separate rows
- evidence: first ≤ 12 words of the item, verified verbatim in the cleaned
  text; a row without verbatim evidence (or with an empty name) is dropped
  and counted (FR-012)
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .rules_version import MATCHER_RULES_VERSION

# --- Fixed vocabulary (spec FR-010; NEVER reorder the cascade) ---
MUST_HEADINGS = ("responsibilities", "requirements", "required tools")
SHOULD_HEADINGS = ("preferred qualifications",)
MUST_WORDS = ("must", "required", "mandatory", "essential", "at least", "minimum")
SHOULD_WORDS = ("preferred", "desirable", "ideally")
NICE_WORDS = ("plus", "nice to have", "bonus", "advantage")

PRIORITY_RANK = {"must": 0, "should": 1, "nice": 2}

BULLET_MARKERS = ("- ", "• ", "* ", "· ")
EVIDENCE_MAX_WORDS = 12

# Boilerplate reduced from item text to form the skill name (rules-versioned).
_BOILERPLATE_PREFIXES = (
    r"(?:(?:at\s+least|minimum(?:\s+of)?)\s+)?"
    r"\d+\+?\s*(?:years?|months?)\s+of\s+(?:experience|work)"
    r"(?:\s+(?:in|with|on|for))?\s*",
    r"(?:proven|strong|solid|good|hands-on|relevant|previous)\s+",
    r"(?:experience|expertise)\s+(?:of|with|in|working\s+(?:in|on|with))\b\s*",
    r"familiarity\s+with\b\s*",
    r"(?:strong\s+)?knowledge\s+of\b\s*",
    r"ability\s+to\b\s*",
    r"nice\s+to\s+have[:\s]+",
)
_TRAILING_PRIORITY_PHRASE = re.compile(
    r"\s*(?:is|would\s+be)?\s*(?:a|an)?\s*(?:plus|bonus|advantage|nice\s+to\s+have)\s*[.!]?\s*$",
    re.IGNORECASE,
)
_ONE_OF_SPLIT = re.compile(r",?\s+or\s+", re.IGNORECASE)


@dataclass
class HardSkillRow:
    """One hard-skill row (data-model.md HardSkillRow)."""

    name: str
    type: str  # "hard" | "hard_tool"
    priority: str  # "must" | "should" | "nice"
    default_priority: bool
    evidence: str
    order: int
    is_one_of: bool = False
    alternatives: list[str] | None = None


@dataclass
class _Item:
    text: str
    order: int
    section: str | None  # "must" | "should" | None when outside a section


def _heading_of(line: str) -> str | None:
    """Return 'must'/'should' for a recognized heading line, else None."""
    stripped = line.strip().rstrip(":").strip().lower()
    if stripped in MUST_HEADINGS:
        return "must"
    if stripped in SHOULD_HEADINGS:
        return "should"
    return None


_LABEL_LINE = re.compile(r"^[^:]{1,40}:\s")


def _is_heading_like(line: str) -> bool:
    """A short non-bullet line ending with ':' closes the current section
    even when the heading is not recognized; so does a labeled narrative
    line like 'What we offer: ...' (label part ≤ 5 words)."""
    text = line.strip()
    if not text or any(text.startswith(m) for m in BULLET_MARKERS):
        return False
    if text.endswith(":") and len(text.split()) <= 6:
        return True
    return bool(
        _LABEL_LINE.match(text) and len(text.split(":")[0].split()) <= 5
    )


def _strip_bullet(line: str) -> str:
    for marker in BULLET_MARKERS:
        if line.startswith(marker):
            return line[len(marker):].strip()
    return line.strip()


def _explicit_priority(text: str) -> str | None:
    """The first priority word occurring in the item decides (FR-010)."""
    lower = text.lower()
    candidates: list[tuple[int, str]] = []
    for words, priority in (
        (MUST_WORDS, "must"),
        (SHOULD_WORDS, "should"),
        (NICE_WORDS, "nice"),
    ):
        for word in words:
            match = re.search(rf"(?<![a-z]){re.escape(word)}(?![a-z])", lower)
            if match:
                candidates.append((match.start(), priority))
    if not candidates:
        return None
    return min(candidates)[1]


def _one_of_alternatives(text: str) -> list[str] | None:
    """'Power BI, Metabase, or Grafana' → [Power BI, Metabase, Grafana]."""
    parts = _ONE_OF_SPLIT.split(text.strip().rstrip(".!"), maxsplit=1)
    if len(parts) != 2:
        return None
    left, right = parts[0].strip(), parts[1].strip()
    if not left or not right:
        return None
    tokens = [t.strip() for t in left.split(",") if t.strip()] + [right]
    if len(tokens) < 2:
        return None
    if any(len(t.split()) > 3 for t in tokens):
        return None
    return tokens


def _normalize_name(item_text: str) -> str:
    """Reduce boilerplate and trailing priority phrases to the skill name."""
    name = item_text.strip().rstrip(".!?").strip()
    name = _TRAILING_PRIORITY_PHRASE.sub("", name).strip()
    changed = True
    while changed:
        changed = False
        lowered = name.lower()
        for pattern in _BOILERPLATE_PREFIXES:
            match = re.match(pattern, lowered)
            if match:
                name = name[match.end():].strip()
                changed = True
                break
    return name.strip(" -–—:,")


def _evidence_of(item_text: str) -> str:
    words = item_text.split()
    return " ".join(words[:EVIDENCE_MAX_WORDS])


def filter_verbatim(
    rows: list[HardSkillRow], cleaned_text: str
) -> tuple[list[HardSkillRow], int]:
    """Drop rows whose evidence does not appear verbatim (FR-012)."""
    kept, dropped = [], 0
    for row in rows:
        if row.evidence and row.evidence in cleaned_text:
            kept.append(row)
        else:
            dropped += 1
    return kept, dropped


def _items(cleaned_text: str) -> list[_Item]:
    lines = cleaned_text.split("\n")
    recognized = [ln for ln in lines if _heading_of(ln) is not None]
    items: list[_Item] = []
    if not recognized:
        # Unstructured posting: every non-empty non-heading line is an item.
        order = 0
        for line in lines:
            if not line.strip() or _is_heading_like(line):
                continue
            items.append(_Item(_strip_bullet(line), order, None))
            order += 1
        return items

    current: str | None = None
    order = 0
    for line in lines:
        if not line.strip():
            continue
        heading = _heading_of(line)
        if heading is not None:
            current = heading
            continue
        if _is_heading_like(line):
            current = None  # unrecognized heading closes the section
            continue
        if current is None:
            continue  # narrative outside sections is not an item
        items.append(_Item(_strip_bullet(line), order, current))
        order += 1
    return items


def _row_from_item(item: _Item) -> HardSkillRow | None:
    alternatives = _one_of_alternatives(item.text)
    explicit = _explicit_priority(item.text)
    if item.section is not None:
        priority = explicit or item.section
        default_priority = explicit is None
    else:
        priority = explicit or "must"
        default_priority = explicit is None
    if alternatives is not None:
        name = "One of: " + " / ".join(alternatives)
        row_type = "hard_tool"
    else:
        name = _normalize_name(item.text)
        row_type = "hard"
    if not name:
        return None
    return HardSkillRow(
        name=name,
        type=row_type,
        priority=priority,
        default_priority=default_priority,
        evidence=_evidence_of(item.text),
        order=item.order,
        is_one_of=alternatives is not None,
        alternatives=alternatives,
    )


def extract_hard_skills(cleaned_text: str) -> tuple[list[HardSkillRow], int]:
    """Extract hard-skill rows in posting order; returns (rows, dropped).

    Duplicates of the same normalized skill merge into one row keeping the
    highest priority (FR-011); rows without verbatim evidence are dropped
    and counted (FR-012).
    """
    candidate_rows: list[HardSkillRow] = []
    dropped = 0
    for item in _items(cleaned_text):
        row = _row_from_item(item)
        if row is None:
            dropped += 1  # boilerplate-only item yields no skill name
            continue
        candidate_rows.append(row)

    # Verbatim-evidence verification (defense in depth; FR-012).
    candidate_rows, verbatim_dropped = filter_verbatim(candidate_rows, cleaned_text)
    dropped += verbatim_dropped

    # Duplicate merge: same normalized name → one row, highest priority.
    merged: dict[str, HardSkillRow] = {}
    for row in candidate_rows:
        key = re.sub(r"\s+", " ", row.name.lower())
        existing = merged.get(key)
        if existing is None:
            merged[key] = row
        else:
            if PRIORITY_RANK[row.priority] < PRIORITY_RANK[existing.priority]:
                existing.priority = row.priority
                existing.default_priority = False
    rows = sorted(merged.values(), key=lambda r: r.order)
    return rows, dropped


def looks_like_posting(cleaned_text: str) -> bool:
    """Not-a-posting rule (matcher-rules-1.0.0): a text with no recognized
    section heading, fewer than 3 list items, and no priority words is not
    a job posting (FR-019)."""
    lines = cleaned_text.split("\n")
    headings = sum(1 for ln in lines if _heading_of(ln) is not None)
    list_items = sum(
        1 for ln in lines if any(ln.strip().startswith(m) for m in BULLET_MARKERS)
    )
    priority_words = sum(
        1
        for ln in lines
        if _explicit_priority(_strip_bullet(ln)) is not None
    )
    return headings >= 1 or list_items >= 3 or priority_words >= 1
