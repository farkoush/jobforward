# few-shot

Finalized job-ad examples for spec-002 (jd-matcher). They teach the model how ad formats vary when it labels sentences (stage 2). They are examples, not rules.

## Rules of this folder

- An example becomes `status: final` only when the owner says «مثال نهایی شد». Examples under discussion stay `draft` and are never loaded into the prompt.
- The correct labels are decided by the owner, not by the model or by the tool's own output.
- Every example is one file named `EX-Jxxx.json` (JSON is the source of truth, imported directly — no sync) and follows the same fields as `EX-J001.json`.
- `split: eval` examples are only for tests and are never put into the prompt.
- When an example goes into the prompt, `why`, `rule` and `do_not_copy` go with it, not just the sentences and labels.
- Keep format variety: different headings, bullets vs paragraphs, with or without obligation words, other languages. Not many ads that look alike.
- Prompt wording: "These examples show how ad formats differ. Do not copy their labels and do not treat them as rules. Analyze each ad on its own structure."

## Fields

- `format_features`: used to pick the most similar examples (and a diverse set) at run time.
- `sentences`: one entry per sentence with `section`, `signal`, `content` (stage 2 labels only, no skill lists).
- `why`: why these labels. `rule`: which method rule the example shows. `do_not_copy`: surface features that must not be generalized.
- `near_miss`: id of a similar example with different labels (optional).

## Where candidates come from

The tool saves analyzed ads as `candidate` in the runtime store. After review, an approved candidate is exported to a new `EX-Jxxx.json` here and committed.
