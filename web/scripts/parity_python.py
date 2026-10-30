"""Parity harness (Python side): run the terminal engine on fixed inputs and
print JSON. The Node side (parity.mjs) runs the TS port on the same inputs
and compares. Any difference is a port bug."""

import json
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent  # web/scripts -> repo root
sys.path.insert(0, str(REPO / "src"))
os.chdir(REPO)  # load_taxonomy() resolves docs/ relative to the repo root

from jobforward.matcher2.posting import clean_posting, language_ratio
from jobforward.matcher2.hard_skills import extract_hard_skills, looks_like_posting
from jobforward.matcher2.soft_skills import load_taxonomy, match_soft_skills
from jobforward.matcher2.report import build_report
from jobforward.flow.parts import extract_parts
from jobforward.scoring.adapters.local import LocalHeuristicAdapter
from jobforward.flow.rewrite import assemble_rewrite
from jobforward.scoring.overlap import find_overlaps
from jobforward.scoring.metrics import entry_score_from_ratings
from jobforward.models.entities import Ratings

POSTING = """Senior Product Manager - Growth

We are looking for a product manager to join our growth team.

Responsibilities:
- Own the onboarding funnel and improve conversion
- Must have 3+ years of experience in product management
- Run A/B tests and analyze the results
- Manage stakeholders across teams

Requirements:
- Experience with SQL and dashboards
- Strong communication skills
- Bonus: familiarity with Figma

Preferred Qualifications:
- Experience in a startup environment
- Ideally you have led a growth team before
"""

POSTING2 = """<html><head><style>.x{color:red}</style></head>
<body><script>var evil = 1;</script><p>Analytics Engineer</p>
<p>We use data tools every day. The team enjoys hard problems. Everyone helps.</p>
<ul><li>Knowledge of SQL is required</li>
<li>Experience with Python, Power BI, Metabase, or Grafana</li>
<li>Experience with dbt</li>
<li>Minimum 5 years of experience in analytics</li>
<li>Communication skills are a plus</li></ul>
<p>رشد و توسعه محصولات</p>
</body></html>
"""

UNSTRUCTURED = """Growth PM needed for our fintech app.
Must own the activation funnel.
Required: 2 years of product experience.
Nice to have: SQL knowledge.
"""

EDGE_BULLETS = [
    "20% growth",
    "I built a checkout page so that users could pay faster",
    "Ran the beta program; the team of 3 shipped 12 user interviews",
    "Owned pricing",
]

EXTRA_ANSWERS = {"context": "candidates dropped off", "action": "rebuilt the form"}

BULLETS = [
    "Built a dashboard",
    "Improved performance of the app",
    "Led redesign of the onboarding funnel which resulted in 20% more signups",
    "Worked on user research because users were confused by the checkout",
    "Learned how data analysis works",
    "Grew conversion from 2% to 5% in 3 months by redesigning the pricing page",
]

ANSWERS = {"context": "users could not finish checkout", "result": "more users finished checkout"}


def row_to_dict(row):
    return {
        "name": row.name,
        "type": row.type,
        "priority": row.priority,
        "default_priority": row.default_priority,
        "evidence": row.evidence,
        "order": row.order,
        "is_one_of": row.is_one_of,
        "alternatives": row.alternatives,
    }


def main():
    out = {}

    cleaned = clean_posting(POSTING)
    out["cleaning"] = {
        "cleaned_text": cleaned.cleaned_text,
        "script_blocks_removed": cleaned.script_blocks_removed,
        "style_blocks_removed": cleaned.style_blocks_removed,
        "html_tags_removed": cleaned.html_tags_removed,
        "word_count": cleaned.word_count,
        "language_ok": cleaned.language_ok,
        "ratio": language_ratio(cleaned.cleaned_text),
    }
    out["looks_like_posting"] = looks_like_posting(cleaned.cleaned_text)
    out["looks_like_plain_text"] = looks_like_posting("Hello there friend. How are you today. I like cheese.")

    taxonomy = load_taxonomy()
    hard_rows, dropped = extract_hard_skills(cleaned.cleaned_text)
    soft_rows, unmatched = match_soft_skills(cleaned.cleaned_text, taxonomy)
    report = build_report(hard_rows, soft_rows, unmatched, dropped)
    out["hard_rows"] = [row_to_dict(r) for r in hard_rows]
    out["dropped"] = dropped
    out["soft_rows"] = [
        {
            "label_en": r.label_en,
            "group_code": r.group_code,
            "id": r.id,
            "evidence": r.evidence,
            "reason": r.reason,
            "priority": r.priority,
            "certainty": r.certainty,
            "order": r.order,
        }
        for r in soft_rows
    ]
    out["unmatched"] = [{"text": u.text, "note": u.note} for u in unmatched]
    out["hard_totals"] = report.hard_totals
    out["soft_total"] = report.soft_total
    out["consistency_ok"] = report.consistency_ok

    parts = [extract_parts(b) for b in BULLETS]
    out["parts"] = [
        {
            "user_need": p.user_need,
            "product_feature": p.product_feature,
            "action": p.action,
            "result": p.result,
            "metric": p.metric,
        }
        for p in parts
    ]

    adapter = LocalHeuristicAdapter()
    response = adapter.evaluate(
        type(
            "Req",
            (),
            {"texts": BULLETS, "parts": parts, "answers": None, "rubric_version": "rubric-3.0.0"},
        )()
    )
    out["ratings"] = [
        {"bullet_index": r.bullet_index, "context": r.context,
         "role_action_clarity": r.role_action_clarity, "result": r.result}
        for r in response.ratings
    ]

    out["rewrite"] = assemble_rewrite(BULLETS[3], ANSWERS)
    try:
        assemble_rewrite(BULLETS[3], {"result": "clicks doubled 3x"})
        out["extra_claims_error"] = False
    except Exception:
        out["extra_claims_error"] = True

    out["overlaps"] = [
        {"bullet_a": p.bullet_a, "bullet_b": p.bullet_b, "score": p.score}
        for p in find_overlaps(BULLETS)
    ]

    out["entry_score_fixture"] = entry_score_from_ratings(
        [Ratings(context=2, role_action_clarity=2, result=2),
         Ratings(context=1, role_action_clarity=2, result=1)]
    )

    # --- edge cases ---
    cleaned2 = clean_posting(POSTING2)
    out["cleaning2"] = {
        "cleaned_text": cleaned2.cleaned_text,
        "script_blocks_removed": cleaned2.script_blocks_removed,
        "style_blocks_removed": cleaned2.style_blocks_removed,
        "html_tags_removed": cleaned2.html_tags_removed,
        "word_count": cleaned2.word_count,
        "language_ok": cleaned2.language_ok,
    }
    taxonomy2 = load_taxonomy()
    hard2, dropped2 = extract_hard_skills(cleaned2.cleaned_text)
    soft2, unmatched2 = match_soft_skills(cleaned2.cleaned_text, taxonomy2)
    out["hard2"] = [row_to_dict(r) for r in hard2]
    out["dropped2"] = dropped2
    out["soft2"] = [
        {"label_en": r.label_en, "evidence": r.evidence, "priority": r.priority,
         "certainty": r.certainty}
        for r in soft2
    ]
    out["unmatched2"] = [{"text": u.text, "note": u.note} for u in unmatched2]

    cleaned_u = clean_posting(UNSTRUCTURED)
    hard_u, dropped_u = extract_hard_skills(cleaned_u.cleaned_text)
    out["hard_u"] = [row_to_dict(r) for r in hard_u]

    parts_e = [extract_parts(b) for b in EDGE_BULLETS]
    out["parts_edge"] = [
        {
            "user_need": p.user_need,
            "product_feature": p.product_feature,
            "action": p.action,
            "result": p.result,
            "metric": p.metric,
        }
        for p in parts_e
    ]
    response_e = adapter.evaluate(
        type(
            "Req",
            (),
            {"texts": EDGE_BULLETS, "parts": parts_e, "answers": None, "rubric_version": "rubric-3.0.0"},
        )()
    )
    out["ratings_edge"] = [
        {"bullet_index": r.bullet_index, "context": r.context,
         "role_action_clarity": r.role_action_clarity, "result": r.result}
        for r in response_e.ratings
    ]
    out["rewrite2"] = assemble_rewrite(BULLETS[0], EXTRA_ANSWERS)

    print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
