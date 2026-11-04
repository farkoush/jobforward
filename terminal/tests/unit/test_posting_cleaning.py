"""Unit tests for the posting cleaning pipeline (002 T005; FR-003–FR-005).

Ordered steps per contracts/matcher-pipeline.md §2: control characters
(keep \n, \t) → line endings → script/style blocks with content → remaining
HTML tags keeping inner text. Word count is len(cleaned.split()).
"""

from __future__ import annotations

from src.jobforward.matcher2.posting import clean_posting


def test_control_characters_removed_but_newline_and_tab_kept():
    cleaned = clean_posting("line one\x00line two\x07\tstill here\nnext")
    assert "\x00" not in cleaned.cleaned_text
    assert "\x07" not in cleaned.cleaned_text
    assert "\t" in cleaned.cleaned_text
    assert "\n" in cleaned.cleaned_text
    assert "line two\tstill here" in cleaned.cleaned_text


def test_line_endings_normalized_to_unix():
    cleaned = clean_posting("a\r\nb\rc\nd")
    assert cleaned.cleaned_text == "a\nb\nc\nd"


def test_script_block_removed_with_content_and_counted():
    cleaned = clean_posting("Before <script>alert(1)</script> After")
    assert "alert" not in cleaned.cleaned_text
    assert "<script>" not in cleaned.cleaned_text
    assert cleaned.script_blocks_removed == 1
    assert "Before" in cleaned.cleaned_text and "After" in cleaned.cleaned_text


def test_style_block_removed_with_content_and_counted():
    cleaned = clean_posting("A <style>p { color: red }</style> B")
    assert "color" not in cleaned.cleaned_text
    assert cleaned.style_blocks_removed == 1


def test_script_removal_is_case_insensitive():
    cleaned = clean_posting("x <SCRIPT>bad()</SCRIPT> y")
    assert "bad()" not in cleaned.cleaned_text
    assert cleaned.script_blocks_removed == 1


def test_block_removal_precedes_tag_stripping_so_content_cannot_leak():
    cleaned = clean_posting("keep <script>secret()</script> end")
    assert "secret" not in cleaned.cleaned_text
    assert cleaned.html_tags_removed == 0


def test_plain_tags_removed_keeping_inner_text_and_counted():
    cleaned = clean_posting("<p>Senior developer</p> with <b>SQL</b> skills")
    assert "<p>" not in cleaned.cleaned_text and "</p>" not in cleaned.cleaned_text
    assert "Senior developer" in cleaned.cleaned_text
    assert "SQL" in cleaned.cleaned_text
    assert cleaned.html_tags_removed == 4


def test_word_count_is_counted_on_the_cleaned_text():
    cleaned = clean_posting("<b>Experienced</b> python developer\r\nwith SQL")
    assert cleaned.word_count == len(cleaned.cleaned_text.split())
    assert cleaned.word_count == 5


def test_no_removals_when_input_is_already_clean():
    cleaned = clean_posting("Plain English posting text with no markup.")
    assert cleaned.script_blocks_removed == 0
    assert cleaned.style_blocks_removed == 0
    assert cleaned.html_tags_removed == 0
