/**
 * SC-008 acceptance-shape test (T058 — spec 002 v3): the EX-J001 ad is
 * RECONSTRUCTED from the json sentences (no standalone ad fixture — owner
 * ruling R19); the input gates pass on it, and a hand-written EXPECTED
 * document embodying the owner acceptance PASSES the validator:
 * Communication + Stakeholder management as soft with in_taxonomy:false in
 * must (with ad_wording), Agile/Scrum preferred (weakening only lowers),
 * fintech + product-analytics tools bonus (bonus_zone wins over weak).
 * The model-judgment part (~20+ skills live) stays the owner walkthrough
 * (T063, SC-008 final judge).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { runMatcherInputGates } from "../../../src/engine/matcher2/v2/inputGates";
import { validateMatcherAnalysisV2 } from "../../../src/engine/matcher2/v2/validate";
import { buildMatcherUserPrompt } from "../../../src/lib/byok/prompts";

const EX_J001 = JSON.parse(
  readFileSync(
    join(
      process.cwd(),
      "..",
      "specs",
      "002-jd-matcher",
      "few-shot",
      "EX-J001.json"
    ),
    "utf8"
  )
) as {
  format_features: { headings: string[] };
  sentences: Array<{
    id: string;
    section: string;
    signal: string;
    content: string;
    text: string;
  }>;
};

const SECTION_TO_HEADING: Record<string, string> = {
  title: "Job Description and Responsibilities",
  about: "About the Role",
  duties: "Key Responsibilities",
  requirements: "Requirements",
  preferred: "Preferred Qualifications",
  benefits: "Benefits",
  details: "Job Details",
};

function reconstructAd(): string {
  const parts: string[] = [];
  let currentSection = "";
  for (const s of EX_J001.sentences) {
    if (s.section !== currentSection) {
      currentSection = s.section;
      parts.push(SECTION_TO_HEADING[s.section] ?? s.section);
    }
    parts.push(`- ${s.text}`);
  }
  return parts.join("\n");
}

const AD = reconstructAd();

test("SC-008 — the reconstructed EX-J001 ad passes the deterministic input gates", () => {
  const gates = runMatcherInputGates(AD);
  assert.equal(gates.ok, true, JSON.stringify(gates.ok ? "" : gates.error));
  if (gates.ok) {
    assert.ok(gates.cleaned.word_count >= 100, `words: ${gates.cleaned.word_count}`);
  }
});

test("SC-008 — the user prompt carries the reconstructed sentences", () => {
  const prompt = buildMatcherUserPrompt(AD);
  for (const s of EX_J001.sentences) {
    assert.ok(prompt.includes(s.text), `missing ${s.id}`);
  }
});

test("SC-008 — the owner's expected acceptance shape PASSES the validator", () => {
  const s14 =
    "Strong communication and negotiation skills, with the ability to interact effectively with different stakeholders.";
  const s9 =
    "Ensure alignment among stakeholders and follow up on activities to keep product development on track and aligned with product goals.";
  const expected = {
    summary: {
      job_title: "Product Manager",
      seniority: "mid-level (at least 2 years)",
      work_type: "full-time",
      domain: "fintech / credit services",
      role_nature: "analytical",
      problem_solved:
        "The financial technology and credit products need an experienced owner to turn customer and market needs into shipped product improvements.",
    },
    must: [
      {
        type: "hard",
        name: "product roadmaps",
        category: "experience",
        evidence: [
          "Experience in developing product roadmaps and managing development priorities.",
        ],
        source: "explicit",
        confidence: null,
        in_taxonomy: null,
        ad_wording: null,
      },
      {
        type: "soft",
        name: "communication",
        category: null,
        evidence: [s14],
        source: "explicit",
        confidence: "high",
        in_taxonomy: false,
        ad_wording: "Strong communication and negotiation skills",
      },
      {
        type: "soft",
        name: "stakeholder management",
        category: null,
        evidence: [s14, s9],
        source: "explicit",
        confidence: "high",
        in_taxonomy: false,
        ad_wording: "interact effectively with different stakeholders",
      },
    ],
    preferred: [
      {
        type: "hard",
        name: "Agile/Scrum methodologies",
        category: "technical",
        evidence: [
          "Familiarity with Agile/Scrum methodologies and product development processes.",
        ],
        source: "explicit",
        confidence: null,
        in_taxonomy: null,
        ad_wording: null,
      },
    ],
    bonus: [
      {
        type: "hard",
        name: "fintech",
        category: "domain",
        evidence: [
          "Experience in fintech, lendtech, financial services, or credit products.",
        ],
        source: "explicit",
        confidence: null,
        in_taxonomy: null,
        ad_wording: null,
      },
      {
        type: "hard",
        name: "product analytics tools",
        category: "tool",
        evidence: [
          "Familiarity with product analytics and user behavior analysis tools.",
        ],
        source: "explicit",
        confidence: null,
        in_taxonomy: null,
        ad_wording: null,
      },
    ],
    red_flags: [],
  };
  const result = validateMatcherAnalysisV2(expected, AD);
  assert.equal(result.ok, true, JSON.stringify(result));
  if (result.ok) {
    // Weakening only lowers: "Familiarity with Agile/Scrum" sits in
    // Requirements (strong base would be must) — the weak word lands it at
    // preferred, never must.
    assert.equal(result.analysis.preferred[0].name, "Agile/Scrum methodologies");
    // The out-of-taxonomy explicit soft rows carry the ad's phrase.
    const communication = result.analysis.must.find((i) => i.name === "communication");
    assert.ok(communication);
    assert.equal(communication.in_taxonomy, false);
    assert.equal(communication.source, "explicit");
    const stakeholder = result.analysis.must.find(
      (i) => i.name === "stakeholder management"
    );
    assert.ok(stakeholder);
    assert.equal(stakeholder.in_taxonomy, false);
    // Bonus zone + weak word: the zone wins — product analytics stays bonus.
    assert.equal(result.analysis.bonus[1].name, "product analytics tools");
  }
});
