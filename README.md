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

## Install

This repo is the plugin itself. Add the marketplace and install in one pass:

```shell
/plugin marketplace add 7xuanlu/council-rigor
/plugin install council@council-rigor
```

`/council` is a single user-invoked skill (not model-triggered). Claude will not call it automatically; you invoke it explicitly.

## Usage

```shell
/council <proposal>               # default poll  (~4 model calls)
/council consensus <proposal>     # peer-ranked   (~7 model calls)
/council adversarial <proposal>   # form-attack-defend-judge  (~13 model calls)
/council help                     # print the mode/cost table
```

**Modes:**

| Mode | ~Model calls | What it does |
|---|---|---|
| `default` | ~4 | 3 models answer in parallel, then a stake-free judge synthesizes. |
| `consensus` | ~7 | 3 models propose, anonymized peer-rank, stake-free judge decides. |
| `adversarial` | ~13 | Form → attack (anonymized) → defend/concede → stake-free judge. |

The three bias controls (position-swap, verbosity-normalization, stake-free judge) are applied at the judging step in every mode. See [`skills/council/reference/bias-controls.md`](skills/council/reference/bias-controls.md).

**Contamination gate:** external members (codex/gemini) run in an isolated profile (auth-only `CODEX_HOME` + neutral cwd) with a content-derived run nonce. A contamination gate (`isContaminated` in `lib/council-core.mjs`) drops any off-topic verdict — detected as context-bleed from a prior session — before tallying. Dropped verdicts are reported; only clean verdicts reach the judge.

## Eval

Controls are only credible if measured. `eval/run.mjs` implements a three-control off-vs-on experiment against a reused MT-Bench label subset:

| Metric | What is measured |
|---|---|
| Position-consistency rate | Fraction of pairs where verdict is stable across both counterbalanced orderings |
| Length-controlled win-rate | Win-rate after residualizing out answer-length confound |
| Panel-vs-single bias delta | Mean bias score under single-model judge minus panel judge |
| Self-preference uplift | Win-rate uplift when the judge is also a council member |
| Human-agreement | Fraction of judgments matching published MT-Bench human labels (bar: >0.80) |

Run the smoke test (writes `eval/results/smoke.md`):

```shell
node eval/run.mjs --smoke
```

Run the test suite:

```shell
node --test
```

**Open dependency:** the eval harness requires MT-Bench label files locally. Until the dataset is present, the harness cannot run end-to-end. See [`eval/datasets/README.md`](eval/datasets/README.md). Benchmark numbers are not reported here because the full eval has not been run on real data; see `eval/results/` after running.

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
