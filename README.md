# boule

> **boule** *(Greek βουλή, "council")* — in classical Athens the *boule* was the citizens' council
> that deliberated on public business and prepared it for decision. This project is its software
> namesake: a council of LLMs deliberates on your question, then a **stake-free judge** — one that
> authored none of the answers — synthesizes the verdict.

**A lean multi-LLM council (Claude + Codex + Gemini) that treats the _judging_ step as a
measurable, debiased procedure — with position-swap, verbosity-normalization, and a stake-free
judge, each traceable to peer-reviewed work.**

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![status: v1, pre-release](https://img.shields.io/badge/status-v1%20pre--release-orange.svg)

> **Status — v1, pre-release.** Plugin scaffold, one `/boule` skill with three modes
> (default / consensus / adversarial), the three judge-bias controls, member isolation + a
> contamination gate, and a node-tested core (`node --test`) with an eval harness
> (`node eval/run.mjs --smoke`). Benchmark numbers are **not yet reported** — the full eval needs
> real MT-Bench labels (see [Eval](#eval)). Treat the controls as bias-_aware_ heuristics under
> measurement, not proven transfers.

## Contents

- [What it is](#what-it-is)
- [Quickstart](#quickstart)
- [Modes](#modes)
- [The three judging controls](#the-three-judging-controls)
- [Research grounding](#research-grounding)
- [How it compares](#how-it-compares)
- [Eval](#eval)
- [Limitations & roadmap](#limitations--roadmap)
- [Contributing](#contributing)
- [Security & isolation](#security--isolation)
- [License](#license)
- [Acknowledgements](#acknowledgements)

## What it is

"LLM council" tools — several models propose, peer-review, and a chairman synthesizes — are a
crowded open-source category as of mid-2026 (the canonical reference, `karpathy/llm-council`, has
20k+★; see [`docs/landscape.md`](docs/landscape.md)). Most share the same recipe **and** the same
blind spot: they inherit the well-documented biases of LLM-as-a-judge — position, verbosity,
self-preference — without correcting for them at the judging step.

boule's one idea: **the judging step should be a debiased procedure, not a single prompt.** It
applies three controls — each tied to a peer-reviewed paper — at the moment the judge decides,
and stays small while doing it: a few commands, no persona role-play.

## Quickstart

**Prerequisites.** boule's council members are **Claude** (the main loop) plus two external CLIs it
shells out to: **`codex`** (OpenAI) and **`gemini`** (Google). Install and sign in to both first —
follow each tool's own install/auth docs; boule reuses their existing local authentication and
never asks for keys itself.

```shell
/plugin marketplace add 7xuanlu/claude-plugins
/plugin install boule@7xuanlu
```

Then ask the council:

```shell
/boule Should we adopt event sourcing for the orders service?
```

`/boule` is **user-invoked only** — Claude never calls it automatically.

## Modes

```shell
/boule <proposal>               # default      — poll                       (~5 model calls)
/boule consensus <proposal>     # peer-ranked  — anonymized rank            (~8 model calls)
/boule adversarial <proposal>   # form → attack → defend → judge           (~14 model calls)
/boule help                     # print the mode/cost table
```

| Mode | ~Model calls | Flow |
|---|---|---|
| `default` | ~5 | 3 models answer in parallel → stake-free judge synthesizes (both orderings) |
| `consensus` | ~8 | 3 models propose → anonymized peer-rank → stake-free judge decides (both orderings) |
| `adversarial` | ~14 | form → attack (anonymized) → defend/concede → stake-free judge (both orderings) |

The three controls apply at the judging step in **every** mode. The judge call runs twice — once
per counterbalanced ordering — and the two decisions are reconciled (swap-and-average); that extra
judge call is why each count rose by one.

## The three judging controls

| Control | What boule does | Honest status |
|---|---|---|
| **Position-swap** | Judge evaluates **both** counterbalanced orderings; `reconcileSwap` reconciles them — agree → keep; disagree → flag `position_stable: false`, cap confidence low, take the conservative verdict. | Implemented (swap-and-average), matching MT-Bench's swap rule / Wang's Balanced Position Calibration. |
| **Verbosity-normalization** | Judge is instructed to ignore length/polish and score on substance. | **Prompt-level mitigation** — _not_ AlpacaEval's statistical length regression. Reduces, doesn't provably remove, the length confound. |
| **Stake-free judge** | The synthesizer authored none of the candidate answers — a structural non-participant. | Structural — holds by construction. PoLL/Wataoka motivate keeping the judge off the panel (cross-family, self-preference-aware), but the single-judge guarantee here is the design, not a transfer of PoLL's panel result. |

Implementation: [`lib/council-core.mjs`](lib/council-core.mjs). Rationale and prompts:
[`skills/boule/reference/bias-controls.md`](skills/boule/reference/bias-controls.md).

## Research grounding

Each control is adapted from peer-reviewed LLM-evaluation research. Every citation below was
checked against its arXiv primary source; the full annotated list (10 papers, with quotes) is in
[`docs/bibliography.md`](docs/bibliography.md).

**Position / order bias → position-swap**

- Zheng et al. (2023), *Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena*, NeurIPS D&B —
  [arXiv:2306.05685](https://arxiv.org/abs/2306.05685). Names position, verbosity, and
  self-enhancement bias; defines the swap rule (judge both orders; count a win only if consistent).
- Wang et al. (2023), *Large Language Models are not Fair Evaluators* —
  [arXiv:2305.17926](https://arxiv.org/abs/2305.17926). "The quality ranking … can be easily
  hacked by simply altering their order of appearance." Proposes **Balanced Position Calibration**
  (evaluate both orders and average) — the formal version of this control.
- Shi et al. (2024), *Judging the Judges: A Systematic Study of Position Bias in LLM-as-a-Judge* —
  [arXiv:2406.07791](https://arxiv.org/abs/2406.07791). Defines the **position-consistency** metric
  boule's eval targets.

**Verbosity / length bias → verbosity-normalization**

- Dubois et al. (2024), *Length-Controlled AlpacaEval: A Simple Way to Debias Automatic Evaluators*,
  COLM — [arXiv:2404.04475](https://arxiv.org/abs/2404.04475). "Even simple, known confounders such
  as preference for longer outputs remain." The statistical length-debias boule's eval targets.
- Feuer et al. (2024), *Style Outweighs Substance: Failure Modes of LLM Judges in Alignment
  Benchmarking* — [arXiv:2409.15268](https://arxiv.org/abs/2409.15268). "LLM-judges have powerful
  implicit biases, prioritizing style over factuality and safety."

**Self-preference / single-judge bias → stake-free judge**

- Verga et al. (2024), *Replacing Judges with Juries: Evaluating LLM Generations with a Panel of
  Diverse Models* (PoLL) — [arXiv:2404.18796](https://arxiv.org/abs/2404.18796). A panel of diverse
  models "outperforms a single large judge, exhibits less intra-model bias."
- Wataoka et al. (2024), *Self-Preference Bias in LLM-as-a-Judge* —
  [arXiv:2410.21819](https://arxiv.org/abs/2410.21819). Self-preference tracks familiarity (lower
  perplexity), not just literal self-recognition — motivates a cross-family panel.

## How it compares

We audited the source (README, skill/command scripts, prompt logic) of six relevant OSS councils,
then had an independent pass try to **refute** each finding. File:line receipts in
[`docs/findings.md`](docs/findings.md); category survey in [`docs/landscape.md`](docs/landscape.md).

| Control | Found in the 6 audited councils |
|---|---|
| Position-swap | **0 / 6** — several hard-code the *opposite* (fixed/alphabetical order) |
| Verbosity-normalization | **0 / 6** — one even scores *toward* length |
| Stake-free judge | **3 / 6** — but one only in its default config, and absent in both highest-starred tools we audited (pal-mcp-server 11.6k★, claude-octopus 3.6k★) |

We did not find a council among the six that ships all three together. **Scope: these six
projects, not the entire ecosystem.** Two distinctions the audit holds to: author/identity
*anonymization* (which three audited tools do) is **not** position-swap — hiding *who* wrote an
answer ≠ shuffling *where* it appears; and generation-side length caps are **not** judging-time
normalization. The *combination* is the contribution — each control on its own is small and
copyable.

## Eval

Controls are only credible if measured. [`eval/run.mjs`](eval/run.mjs) implements an off-vs-on
experiment over a reused MT-Bench label subset:

| Metric | What it measures |
|---|---|
| Position-consistency rate | Fraction of pairs whose verdict is stable across both orderings |
| Length-controlled win-rate | Win-rate after residualizing out the answer-length confound |
| Panel-vs-single bias delta | Single-model-judge bias minus panel-judge bias |
| Self-preference uplift | Win-rate uplift when the judge is also a council member |
| Human agreement | Fraction matching published MT-Bench human labels (target > 0.80) |

```shell
node eval/run.mjs --smoke   # smoke run → writes eval/results/smoke.md
node --test                 # test suite
```

**Open dependency:** the harness needs MT-Bench label files locally
([`eval/datasets/README.md`](eval/datasets/README.md)). Until they are present it cannot run
end-to-end — which is why no benchmark numbers are reported here yet. Plan:
[`docs/eval-plan.md`](docs/eval-plan.md).

## Limitations & roadmap

The three controls are **adapted** from LLM-eval research, where they were validated as large-N
statistical procedures over labelled benchmarks. A single-shot council is a different setting, so
today's implementations are bias-_aware_ heuristics whose efficacy here is exactly what the eval is
built to measure — not yet a proven transfer.

- **Position-swap — implemented (swap-and-average).** Order-debiases each recommendation at the
  cost of one extra judge call per mode. Whether order-instability is rare or common in this
  single-shot setting is an open question the eval answers.
- **Verbosity-normalization — prompt-level only.** Not the statistical length regression from
  Length-Controlled AlpacaEval; a stronger version is on the roadmap.
- **Stake-free judge — structural, holds by construction.**

Next: obtain MT-Bench labels → run the full eval → publish the three-control off-vs-on table.

## Contributing

Issues and PRs welcome. Before opening a PR:

```shell
node --test                 # all tests must pass
node eval/run.mjs --smoke   # eval smoke must stay green
```

Conventions: keep changes surgical and the footprint lean. The canonical bias-control functions
live in [`lib/council-core.mjs`](lib/council-core.mjs) and are embedded byte-for-byte into the mode
scripts; `test/embed-drift.test.mjs` enforces that the copies stay in sync — so edit the core and
re-sync rather than editing a copy.

## Security & isolation

- **Member isolation.** External members (`codex` / `gemini`) run in an isolated profile
  (auth-only `CODEX_HOME`, neutral cwd) so a council run cannot read or write your project state.
- **Contamination gate.** `isContaminated` (in [`lib/council-core.mjs`](lib/council-core.mjs))
  drops any verdict whose content doesn't track the proposal — too many foreign hyphenated terms, or
  too little shared vocabulary with the question — the signature of context-bleed from a prior
  session. (A deterministic content-derived nonce, `runNonce`, tags each run.) Dropped verdicts are
  reported; only clean verdicts reach the judge.
- Found a vulnerability? Please open a GitHub issue tagged `security`, or contact the maintainer
  before public disclosure.

## License

MIT — see [`LICENSE`](LICENSE). (Permissive on purpose: the canonical reference,
`karpathy/llm-council`, ships with **no license**, which makes it legally unsafe to depend on.)

## Acknowledgements

Built on the LLM-as-judge and multi-agent-evaluation literature cited above — especially MT-Bench
(Zheng et al.), Balanced Position Calibration (Wang et al.), and PoLL (Verga et al.) — and informed
by the open-source council projects surveyed in [`docs/landscape.md`](docs/landscape.md),
`karpathy/llm-council` chief among them.
