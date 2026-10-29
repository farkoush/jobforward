"""Contract test for the soft-skills taxonomy data source (002 T004).

Pins docs/soft-skills-taxonomy.json per contracts/matcher-pipeline.md §3:
56 records, uniform keys, unique label_en, group_code shape. The matcher's
soft-skill names may come from this file only (FR-014); a loading failure
must surface as an extraction failure, never a partial report.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from src.jobforward.matcher2.soft_skills import TaxonomyError, load_taxonomy

TAXONOMY_PATH = Path("docs/soft-skills-taxonomy.json")

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

FIELDS_USED_VERBATIM = {"label_en", "alt_labels_en", "group_code", "group_label", "id"}


def test_taxonomy_file_exists_and_has_56_records():
    data = json.loads(TAXONOMY_PATH.read_text(encoding="utf-8"))
    assert isinstance(data, dict)
    assert isinstance(data.get("skills"), list)
    assert len(data["skills"]) == 56


def test_every_record_has_the_pinned_keys():
    data = json.loads(TAXONOMY_PATH.read_text(encoding="utf-8"))
    for record in data["skills"]:
        missing = REQUIRED_KEYS - set(record)
        assert not missing, f"record {record.get('id')!r} misses {missing}"


def test_label_en_values_are_unique():
    data = json.loads(TAXONOMY_PATH.read_text(encoding="utf-8"))
    labels = [r["label_en"] for r in data["skills"]]
    assert len(labels) == len(set(labels))


def test_group_code_shape_and_alt_labels_are_lists():
    data = json.loads(TAXONOMY_PATH.read_text(encoding="utf-8"))
    for record in data["skills"]:
        assert re.fullmatch(r"T\d+\.\d+", record["group_code"]), record["label_en"]
        assert isinstance(record["alt_labels_en"], list)
        assert all(isinstance(a, str) for a in record["alt_labels_en"])


def test_loader_returns_56_records_with_fields_used_verbatim():
    skills = load_taxonomy(TAXONOMY_PATH)
    assert len(skills) == 56
    for skill in skills:
        assert FIELDS_USED_VERBATIM <= set(skill)


def test_loader_surfaces_a_broken_file_as_taxonomy_error(tmp_path):
    bad = tmp_path / "taxonomy.json"
    bad.write_text('{"skills": [{"id": "x"}]}', encoding="utf-8")
    with pytest.raises(TaxonomyError):
        load_taxonomy(bad)


def test_loader_surfaces_a_missing_file_as_taxonomy_error(tmp_path):
    with pytest.raises(TaxonomyError):
        load_taxonomy(tmp_path / "missing.json")
