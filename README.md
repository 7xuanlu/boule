# council-rigor

**A lean, research-backed multi-LLM council with the judge-bias controls that no other open-source council implements.**

> Status: **design / docs-first** (pre-implementation). This repo currently holds the
> competitive landscape, an adversarially-verified gap analysis, a verified research
> bibliography, and an evaluation plan. Implementation follows the spec in `docs/`.
>
> Name (`council-rigor`) is an **ad-hoc placeholder** — rename freely. It appears only in
> this title, the GitHub repo name, and the folder name; all prose refers to "this project".

## Why this exists

"LLM council" tools — several models propose, peer-review, and a chairman synthesizes —
are now a crowded open-source category (see [`docs/landscape.md`](docs/landscape.md);
the largest has 11.6k★). Almost all of them share the *same* recipe and the *same blind
spots*: they inherit the well-documented biases of LLM-as-a-judge without correcting for
them.

We audited the source of the six most relevant councils. Two judge-bias controls are
**absent in 6 of 6** — including the two highest-starred tools — and several projects
hard-code the *opposite*. Full receipts in [`docs/findings.md`](docs/findings.md).

| Judge-bias control | Implemented by the field | Research backing |
|---|---|---|
| **Position-swap** (randomize/counterbalance answer order shown to the judge) | **0 of 6** | Zheng 2023; Wang 2023; Shi 2024 |
| **Verbosity normalization** (de-bias for answer length at judging time) | **0 of 6** | Dubois 2024; Feuer 2024 |
| **Stake-free judge** (synthesizer is a structural non-participant) | 3 of 6 (both giants fail it) | Verga 2024 (PoLL); Wataoka 2024 |

Citations: [`docs/bibliography.md`](docs/bibliography.md).

## The thesis

> Category novelty is gone — *correctness of judging* is wide open.

This project is **not** "another council." It is the council that treats the judging
step as a measurable, debiased procedure rather than a single prompt. Two design pillars:

1. **Rigorous judging** — position-counterbalanced + length-normalized + stake-free panel,
   each control traceable to a peer-reviewed paper.
2. **Lean by default** — the "rigorous" axis is the wedge; leanness is table-stakes we
   match. The heaviest competitor ships ~190k LOC / 49 commands; the marketed maximal
   path runs ~73 model calls per question. We stay minimal: few commands, low token
   footprint, no persona theater. See the footprint analysis in `docs/findings.md`.

Leanness alone is not a differentiator (a lean tier already exists). The defensible
position is **lean + the three verified bias controls as the headline feature.**

## What proves it

Bias controls are only credible if measured. `docs/eval-plan.md` specifies a
benchmark — borrowed directly from the papers above — to demonstrate each control helps:
position-consistency rate, length-controlled win-rate, panel-vs-single-judge bias delta,
and human-agreement %.

## Docs

| Doc | What it covers |
|---|---|
| [`docs/landscape.md`](docs/landscape.md) | The OSS council category — verified stars, licenses, mechanisms |
| [`docs/findings.md`](docs/findings.md) | Source-level bias-control audit + footprint analysis (file:line receipts) |
| [`docs/bibliography.md`](docs/bibliography.md) | Verified, primary-source-checked research bibliography |
| [`docs/eval-plan.md`](docs/eval-plan.md) | The benchmark that proves the three controls help |

## License

MIT — see [`LICENSE`](LICENSE). (Permissive on purpose: the canonical reference,
`karpathy/llm-council`, ships with no license, which makes it legally unsafe to depend on.)
