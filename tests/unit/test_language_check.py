"""Unit tests for the >10% Persian/Arabic-letter language rule (002 T006;
FR-006). The ratio counts LETTERS only: English [A-Za-z] versus the
Persian/Arabic-script ranges; digits and punctuation never affect it.
"""

from __future__ import annotations

import pytest

from src.jobforward.matcher2.posting import language_ratio, language_ok

PERSIAN_WORD = "سلام"  # 4 letters
PERSIAN_LETTERS = ["\u0605", "\u0755", "\u08a5", "\ufb55", "\ufe75"]


def test_ratio_counts_letters_only():
    # 4 Persian letters, 8 Latin letters; digits/punctuation ignored.
    ratio = language_ratio(f"{PERSIAN_WORD} 12345 abcdefgh!!")
    assert ratio == pytest.approx(4 / 12)


def test_english_only_text_passes():
    assert language_ratio("A plain English job posting for developers.") == 0
    assert language_ok("A plain English job posting for developers.")


def test_scattered_persian_names_inside_english_text_pass():
    text = (
        "We are looking for candidates like Ali or Reza to join our data team. "
        f"{PERSIAN_WORD} is just one name here. The rest of the posting is English "
        "and long enough that a single name stays far below ten percent."
    )
    assert language_ok(text)


def test_majority_persian_text_is_rejected():
    text = (
        f"{PERSIAN_WORD} {PERSIAN_WORD} "
        "این آگهی به زبان فارسی است و باید رد شود"
    )
    assert not language_ok(text)


def test_small_share_passes_large_share_is_rejected():
    # 40 Latin letters + 4 Persian letters ≈ 9.1% → allowed.
    assert language_ok("abcdefghij " * 4 + PERSIAN_WORD)
    # 30 Latin letters + 8 Persian letters ≈ 21% → rejected.
    assert not language_ok("abcdefghij " * 3 + PERSIAN_WORD + " " + PERSIAN_WORD)


def test_text_without_any_letters_has_zero_ratio_and_passes():
    assert language_ratio("12345 !!! ???") == 0.0
    assert language_ok("12345 !!! ???")


def test_all_five_arabic_script_ranges_count():
    # U+0600–U+06FF, U+0750–U+077F, U+08A0–U+08FF, U+FB50–U+FDFF, U+FE70–U+FEFF
    text = "abc " + " ".join(PERSIAN_LETTERS)  # 3 latin, 5 arabic
    codepoints = [hex(ord(c)) for c in PERSIAN_LETTERS]
    assert codepoints == ["0x605", "0x755", "0x8a5", "0xfb55", "0xfe75"]
    assert language_ratio(text) == pytest.approx(5 / 8)
