/**
 * Matcher v3 shared fixtures (T034/T043/T055/T057/T058 — spec 002 v3): the
 * two draft example postings stay the fixed regression INPUTS (as
 * validator fixtures; the EX-J001 ad is reconstructed from the json
 * sentences for the SC-008 acceptance test). Expected outputs are
 * hand-written valid/invalid v3 JSON documents (with in_taxonomy and
 * ad_wording) checked against the validator — the web flow has NO
 * byte-goldens (FR-022 superseded on web).
 */

export const POSTING_A = `Senior Product Manager
We are looking for a senior product manager with at least 5 years of experience.
You will lead the payments team and work closely with design and engineering.
Requirements:
- Must have strong stakeholder management skills.
- Experience with SQL is required.
- Familiarity with data visualization tools is a plus.
We offer a collaborative environment.
We want a young and energetic candidate.
About us:
We are a payments company serving online retailers across Europe.
The product team owns checkout, payouts, and merchant reporting.
Benefits:
- Private health insurance and a yearly learning budget.
- Flexible hours and a hybrid home-office setup.`;

export const POSTING_B = `Marketing Operations Lead
Brightpath Analytics builds reporting tools for online retailers.
About the role:
We need a marketing operations lead to own our campaign reporting pipeline.
Duties:
- Build and maintain dashboards the marketing team relies on every day.
- Coordinate with sales, design, and data teams across three time zones.
- Present campaign results to stakeholders in weekly reviews.
Requirements:
- Two or more years of experience with SQL and a BI tool.
- Strong attention to detail; you notice broken numbers before anyone else.
- Experience managing stakeholder expectations is preferred.
Nice to have:
- Familiarity with Python scripting is a plus.
We move fast and expect comfort with ambiguity and tight deadlines.`;

export type FixtureDoc = Record<string, unknown>;

export function validDocA(): FixtureDoc {
  return {
    summary: {
      job_title: "Senior Product Manager",
      seniority: "senior",
      work_type: "full-time",
      domain: "payments",
      role_nature: "managerial",
      problem_solved:
        "The team needs an experienced owner for its payments product work.",
    },
    must: [
      {
        type: "hard",
        name: "SQL",
        category: "technical",
        evidence: ["Experience with SQL is required."],
        source: "explicit",
        confidence: null,
        in_taxonomy: null,
        ad_wording: null,
      },
      {
        type: "soft",
        name: "work in teams",
        category: null,
        evidence: [
          "You will lead the payments team and work closely with design and engineering.",
        ],
        source: "implied",
        confidence: "high",
        in_taxonomy: true,
        ad_wording: null,
      },
    ],
    preferred: [
      {
        type: "soft",
        name: "build networks",
        category: null,
        evidence: ["We offer a collaborative environment."],
        source: "implied",
        confidence: "medium",
        in_taxonomy: true,
        ad_wording: null,
      },
    ],
    bonus: [
      {
        type: "hard",
        name: "data visualization",
        category: "tool",
        evidence: ["Familiarity with data visualization tools is a plus."],
        source: "explicit",
        confidence: null,
        in_taxonomy: null,
        ad_wording: null,
      },
      {
        type: "soft",
        name: "cope with stress",
        category: null,
        evidence: ["We offer a collaborative environment."],
        source: "implied",
        confidence: "low",
        in_taxonomy: true,
        ad_wording: null,
      },
    ],
    red_flags: [
      {
        kind: "discriminatory",
        text: "The ad asks for a young and energetic candidate.",
        evidence: ["We want a young and energetic candidate."],
      },
    ],
  };
}

export function validDocB(): FixtureDoc {
  return {
    summary: {
      job_title: "Marketing Operations Lead",
      seniority: "mid-level",
      work_type: "full-time",
      domain: "marketing analytics",
      role_nature: "analytical",
      problem_solved: "The campaign reporting pipeline needs a single owner.",
    },
    must: [
      {
        type: "hard",
        name: "SQL",
        category: "technical",
        evidence: ["Two or more years of experience with SQL and a BI tool."],
        source: "explicit",
        confidence: null,
        in_taxonomy: null,
        ad_wording: null,
      },
      {
        type: "soft",
        name: "attend to detail",
        category: null,
        evidence: [
          "Strong attention to detail; you notice broken numbers before anyone else.",
        ],
        source: "explicit",
        confidence: "high",
        in_taxonomy: true,
        ad_wording: null,
      },
    ],
    preferred: [
      {
        type: "hard",
        name: "BI tool",
        category: "tool",
        evidence: ["Two or more years of experience with SQL and a BI tool."],
        source: "explicit",
        confidence: null,
        in_taxonomy: null,
        ad_wording: null,
      },
    ],
    bonus: [
      {
        type: "hard",
        name: "Python scripting",
        category: "technical",
        evidence: ["Familiarity with Python scripting is a plus."],
        source: "explicit",
        confidence: null,
        in_taxonomy: null,
        ad_wording: null,
      },
    ],
    red_flags: [
      {
        kind: "vague",
        text: "The duties do not say what success in the role looks like.",
        evidence: ["We move fast and expect comfort with ambiguity and tight deadlines."],
      },
    ],
  };
}

/** T043/T055 invalid fixture for posting B: a low-confidence soft item in
 *  must (V3) whose name is out of the taxonomy (fine per se) but with a
 *  MISSING ad_wording (V4/V9) — three distinct failures naming must[1]. */
export function invalidDocB(): FixtureDoc {
  const doc = validDocB();
  const must = doc.must as Array<Record<string, unknown>>;
  must[1] = {
    type: "soft",
    name: "excellent communication",
    category: null,
    evidence: [
      "Strong attention to detail; you notice broken numbers before anyone else.",
    ],
    source: "explicit",
    confidence: "low",
    in_taxonomy: false,
    ad_wording: null,
  };
  return doc;
}

/** T055 V9 accept fixture: "stakeholder management" — the ad names it with
 *  an intensity word; the name keeps the subject noun (in the witness) and
 *  "management" (in the closed list); ad_wording is the ad's own phrase,
 *  verbatim inside the witness. */
export function stakeholderManagementDoc(): FixtureDoc {
  const doc = validDocA();
  (doc.must as unknown as Array<Record<string, unknown>>).push({
    type: "soft",
    name: "stakeholder management",
    category: null,
    evidence: ["Must have strong stakeholder management skills."],
    source: "explicit",
    confidence: "high",
    in_taxonomy: false,
    ad_wording: "Must have strong stakeholder management skills.",
  });
  return doc;
}

/** T055 V9 reject fixture: "leadership" — the concept is absent from the
 *  ownership sentence (fabrication). */
export function fabricatedLeadershipDoc(): FixtureDoc {
  const doc = validDocA();
  (doc.must as unknown as Array<Record<string, unknown>>).push({
    type: "soft",
    name: "leadership",
    category: null,
    evidence: [
      "A strong sense of ownership, effective follow-up, and a results-oriented approach.",
    ],
    source: "explicit",
    confidence: "high",
    in_taxonomy: false,
    ad_wording: "A strong sense of ownership, effective follow-up, and a results-oriented approach.",
  });
  return doc;
}

export function withPatch(
  doc: FixtureDoc,
  patch: (d: FixtureDoc) => void
): FixtureDoc {
  const clone = JSON.parse(JSON.stringify(doc)) as FixtureDoc;
  patch(clone);
  return clone;
}
