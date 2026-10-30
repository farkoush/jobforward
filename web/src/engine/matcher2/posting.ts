/**
 * Cleaning pipeline for a pasted job posting (matcher v1 step 0).
 * Verbatim port of src/jobforward/matcher2/posting.py — ordered steps
 * (order matters — script removal precedes tag stripping so block content
 * cannot leak):
 *   1. remove control characters (keep \n, \t)
 *   2. normalize line endings (\r\n, \r -> \n)
 *   3. remove <script>/<style> blocks with all content (counted)
 *   4. remove remaining HTML tags keeping inner text (counted)
 */

// Persian/Arabic-script letter ranges (letters only; digits and punctuation
// never affect the ratio).
const ARABIC_RANGES: Array<[number, number]> = [
  [0x0600, 0x06ff],
  [0x0750, 0x077f],
  [0x08a0, 0x08ff],
  [0xfb50, 0xfdff],
  [0xfe70, 0xfeff],
];

// Python's unicodedata category "Cc" = C0 controls + C1 controls (\x7f-\x9f).
const CONTROL_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g;
const SCRIPT_RE = /<script\b[^>]*>.*?<\/script\s*>/gis;
const STYLE_RE = /<style\b[^>]*>.*?<\/style\s*>/gis;
const TAG_RE = /<[^>]*>/g;

export interface CleanedPosting {
  raw_text: string;
  cleaned_text: string;
  script_blocks_removed: number;
  style_blocks_removed: number;
  html_tags_removed: number;
  word_count: number;
  language_ok: boolean;
}

/** Python str.split(): splits on whitespace runs, [] for empty/whitespace. */
export function pySplit(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return trimmed.split(/\s+/);
}

export function cleanPosting(raw: string): CleanedPosting {
  let text = raw.replace(CONTROL_RE, "");
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const scriptBlocks = (text.match(SCRIPT_RE) ?? []).length;
  text = text.replace(SCRIPT_RE, "");
  const styleBlocks = (text.match(STYLE_RE) ?? []).length;
  text = text.replace(STYLE_RE, "");
  const htmlTags = (text.match(TAG_RE) ?? []).length;
  text = text.replace(TAG_RE, "");
  return {
    raw_text: raw,
    cleaned_text: text,
    script_blocks_removed: scriptBlocks,
    style_blocks_removed: styleBlocks,
    html_tags_removed: htmlTags,
    word_count: pySplit(text).length,
    language_ok: languageOk(text),
  };
}

/** Persian/Arabic-script letters divided by all letters (0 when none). */
export function languageRatio(text: string): number {
  let latin = 0;
  let arabic = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if ((code >= 0x61 && code <= 0x7a) || (code >= 0x41 && code <= 0x5a)) latin += 1;
    else if (ARABIC_RANGES.some(([lo, hi]) => code >= lo && code <= hi)) arabic += 1;
  }
  const total = latin + arabic;
  if (total === 0) return 0;
  return arabic / total;
}

/** False when more than 10% of the letters are Persian/Arabic script. */
export function languageOk(text: string): boolean {
  return languageRatio(text) <= 0.1;
}
