import { NextRequest, NextResponse } from "next/server";
import { AnalyzePostingRequestSchema, AnalysisReportSchema } from "@/lib/schemas";
import { isAuthorized, rateLimited, sessionIdOf } from "@/lib/serverAuth";
import {
  cleanPosting,
  languageRatio,
} from "@/engine/matcher2/posting";
import { extractHardSkills, looksLikePosting } from "@/engine/matcher2/hardSkills";
import {
  TaxonomyError,
  loadTaxonomy,
  matchSoftSkills,
} from "@/engine/matcher2/softSkills";
import { buildReport } from "@/engine/matcher2/report";

/**
 * The full deterministic matcher pipeline (posting -> cleaned -> report),
 * executed server-side exactly in the terminal's error order: language ->
 * length -> not-a-posting (review stage) -> extraction -> zero-skills ->
 * consistency. The UI walks the staged gates; error messages surface at the
 * same stage as the terminal.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  const sessionId = sessionIdOf(request);
  if (rateLimited(sessionId)) {
    return NextResponse.json({ ok: false, error: "RATE_LIMITED" }, { status: 429 });
  }

  const body = AnalyzePostingRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ ok: false, error: "ERR_INVALID_CHOICE" }, { status: 400 });
  }

  const posting = cleanPosting(body.data.posting_text);
  const cleaning = {
    script_blocks: posting.script_blocks_removed,
    style_blocks: posting.style_blocks_removed,
    html_tags: posting.html_tags_removed,
    word_count: posting.word_count,
  };

  if (!posting.language_ok) {
    return NextResponse.json({
      ok: false,
      stage: "paste",
      error: "MATCH_ERR_PERSIAN",
      ratio: Number(languageRatio(posting.cleaned_text).toFixed(4)),
    });
  }
  if (posting.word_count < 100) {
    return NextResponse.json({
      ok: false,
      stage: "paste",
      error: "MATCH_ERR_TOO_SHORT",
      params: { count: posting.word_count, limit: 100 },
      cleaning,
    });
  }
  if (posting.word_count > 1500) {
    return NextResponse.json({
      ok: false,
      stage: "paste",
      error: "MATCH_ERR_TOO_LONG",
      params: { count: posting.word_count, limit: 1500 },
      cleaning,
    });
  }
  if (!looksLikePosting(posting.cleaned_text)) {
    return NextResponse.json({
      ok: false,
      stage: "review",
      error: "MATCH_ERR_NOT_A_POSTING",
      cleaning,
    });
  }

  try {
    const taxonomy = loadTaxonomy();
    const [hardRows, dropped] = extractHardSkills(posting.cleaned_text);
    const [softRows, unmatched] = matchSoftSkills(posting.cleaned_text, taxonomy);
    if (hardRows.length === 0 && softRows.length === 0) {
      return NextResponse.json({
        ok: false,
        stage: "hard_skills",
        error: "MATCH_ERR_ZERO_SKILLS",
        cleaning,
      });
    }
    const report = buildReport(hardRows, softRows, unmatched, dropped);
    if (!report.consistency_ok) {
      return NextResponse.json({
        ok: false,
        stage: "hard_skills",
        error: "MATCH_ERR_CONSISTENCY",
        cleaning,
      });
    }
    const checked = AnalysisReportSchema.safeParse(report);
    if (!checked.success) {
      // Defense in depth: the ported engine must always produce a valid
      // report; if not, never show broken output.
      return NextResponse.json({
        ok: false,
        stage: "hard_skills",
        error: "ERR_MATCHER_FAILURE",
        cleaning,
      });
    }
    return NextResponse.json({
      ok: true,
      cleaning,
      report: checked.data,
    });
  } catch (exc) {
    if (exc instanceof TaxonomyError) {
      return NextResponse.json({
        ok: false,
        stage: "hard_skills",
        error: "MATCH_ERR_ZERO_SKILLS",
        cleaning,
      });
    }
    return NextResponse.json({
      ok: false,
      stage: "hard_skills",
      error: "ERR_MATCHER_FAILURE",
      cleaning,
    });
  }
}
